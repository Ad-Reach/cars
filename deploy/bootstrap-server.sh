#!/usr/bin/env bash
# Разовая настройка чистого сервера (Ubuntu/Debian) от root:
# Caddy, Node 22, пользователь deploy без sudo, службы сайта rangauto.ru и CMS,
# каталог для centro-plus.ru. Повторный запуск безопасен.
# Необязательные переменные окружения: DEPLOY_PUBKEYS (ключи для deploy, по одному в строке),
# TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_IDS, TELEGRAM_ADMIN_IDS, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Запустите от root"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

U=deploy
SITE=/srv/rangauto
CMS=$SITE/cms
POTOLKI=/srv/centro-plus
SITE_ENV=/etc/rangauto.env
CMS_ENV=/etc/rangauto-cms.env

echo "== система"; head -2 /etc/os-release; uname -m

echo "== пакеты"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg rsync openssl python3 debian-keyring debian-archive-keyring apt-transport-https >/dev/null

if ! command -v node >/dev/null || ! node -v | grep -q '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "node $(node -v)"

if ! command -v caddy >/dev/null; then
  if curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
     && curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list; then
    apt-get update -qq
  fi
  apt-get install -y -qq caddy >/dev/null
fi
echo "$(caddy version)"

echo "== подкачка"
if ! swapon --show | grep -q .; then
  [ -f /swapfile ] || fallocate -l 2G /swapfile
  chmod 600 /swapfile; mkswap /swapfile >/dev/null; swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon --show

echo "== пользователь $U"
id "$U" >/dev/null 2>&1 || useradd -m -s /bin/bash "$U"
passwd -l "$U" >/dev/null   # вход только по ключу, sudo нет
install -d -m 700 -o "$U" -g "$U" "/home/$U/.ssh"
AK="/home/$U/.ssh/authorized_keys"
touch "$AK"
printf '%s\n' "${DEPLOY_PUBKEYS:-}" | while read -r key; do
  [ -n "$key" ] && ! grep -qF "$key" "$AK" && echo "$key" >> "$AK"
done
chown "$U:$U" "$AK"; chmod 600 "$AK"
echo "ключей в authorized_keys: $(grep -c . "$AK" || true)"

echo "== каталоги"
install -d -m 755 -o "$U" -g "$U" "$SITE" "$SITE/releases" "$CMS" "$CMS/releases" "$CMS/uploads" "$POTOLKI" "$POTOLKI/releases"
install -d -m 750 -o "$U" -g "$U" "$CMS/data"

echo "== секреты CMS"
secret() { openssl rand -base64 32 | tr -d '\n'; }
if [ ! -f "$CMS_ENV" ]; then
  ADMIN_EMAIL=admin@rangauto.ru
  ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=\n')A1!"
  cat > "$CMS_ENV" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=1337
PUBLIC_URL=https://rangauto.ru/cms
IS_PROXIED=true
ADMIN_COOKIE_PATH=/cms/admin
APP_KEYS=$(secret),$(secret)
API_TOKEN_SALT=$(secret)
ADMIN_JWT_SECRET=$(secret)
JWT_SECRET=$(secret)
TRANSFER_TOKEN_SALT=$(secret)
ENCRYPTION_KEY=$(secret)
DATABASE_CLIENT=sqlite
DATABASE_FILENAME=$CMS/data/data.db
SITE_REVALIDATE_URL=http://127.0.0.1:3000/api/revalidate
REVALIDATE_SECRET=$(openssl rand -hex 32)
INITIAL_ADMIN_EMAIL=$ADMIN_EMAIL
INITIAL_ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF
  chmod 600 "$CMS_ENV"
  (umask 077; printf 'Админка: https://rangauto.ru/cms/admin\nЛогин: %s\nПароль: %s\n' "$ADMIN_EMAIL" "$ADMIN_PASSWORD" > /root/rangauto-cms-admin.txt)
  echo "доступ в админку: /root/rangauto-cms-admin.txt"
fi

echo "== окружение сайта"
touch "$SITE_ENV"; chmod 600 "$SITE_ENV"
set_env() {
  [ -n "$2" ] || return 0
  sed -i "/^$1=/d" "$SITE_ENV"
  printf '%s=%s\n' "$1" "$2" >> "$SITE_ENV"
}
set_env CMS_URL http://127.0.0.1:1337
set_env CMS_PUBLIC_URL https://rangauto.ru/cms
set_env REVALIDATE_SECRET "$(grep '^REVALIDATE_SECRET=' "$CMS_ENV" | cut -d= -f2-)"
set_env TELEGRAM_CHATS_FILE "$SITE/telegram-chats.json"
for v in TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_IDS TELEGRAM_ADMIN_IDS SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM; do
  set_env "$v" "${!v:-}"
done
echo "заданы: $(cut -d= -f1 "$SITE_ENV" | tr '\n' ' ')"

echo "== systemd"
cat > /etc/systemd/system/rangauto.service <<EOF
[Unit]
Description=Rang Auto website (Next.js)
After=network.target
ConditionPathExists=$SITE/current

[Service]
User=$U
WorkingDirectory=$SITE/current
EnvironmentFile=$SITE_ENV
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/rangauto-cms.service <<EOF
[Unit]
Description=Rang Auto CMS (Strapi)
After=network.target
ConditionPathExists=$CMS/current

[Service]
User=$U
WorkingDirectory=$CMS/current
EnvironmentFile=$CMS_ENV
Environment=NODE_OPTIONS=--max-old-space-size=640
ExecStart=/usr/bin/node node_modules/@strapi/strapi/bin/strapi.js start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# деплой без sudo: workflow меняет файл deployed, systemd перезапускает службу
for name in rangauto rangauto-cms; do
  dir=$SITE; [ "$name" = rangauto-cms ] && dir=$CMS
  cat > /etc/systemd/system/$name-restart.service <<EOF
[Unit]
Description=Restart $name after deploy

[Service]
Type=oneshot
ExecStart=/usr/bin/systemctl restart $name.service
EOF
  cat > /etc/systemd/system/$name-restart.path <<EOF
[Unit]
Description=Watch $name deploy marker

[Path]
PathChanged=$dir/deployed

[Install]
WantedBy=multi-user.target
EOF
done
systemctl daemon-reload
systemctl enable -q --now rangauto-restart.path rangauto-cms-restart.path
systemctl enable -q rangauto.service rangauto-cms.service
[ -e "$SITE/current" ] && systemctl restart rangauto.service
[ -e "$CMS/current" ] && systemctl restart rangauto-cms.service

echo "== Caddy"
cat > /etc/caddy/Caddyfile <<EOF
{
	email admin@rangauto.ru
	# только Let's Encrypt: ZeroSSL не выдаёт сертификаты на домены .ru
	cert_issuer acme
}

rangauto.ru {
	encode zstd gzip
	redir /cms /cms/admin
	handle_path /cms/* {
		reverse_proxy 127.0.0.1:1337
	}
	handle {
		reverse_proxy 127.0.0.1:3000
	}
}

www.rangauto.ru {
	redir https://rangauto.ru{uri} permanent
}

centro-plus.ru {
	root * $POTOLKI/current
	encode zstd gzip
	file_server
	@assets path /img/* /css/* /js/*
	header @assets Cache-Control "public, max-age=2592000"
	handle_errors {
		@notfound expression {err.status_code} == 404
		rewrite @notfound /404.html
		file_server
	}
}

www.centro-plus.ru {
	redir https://centro-plus.ru{uri} permanent
}
EOF
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -1
systemctl enable -q caddy
systemctl reload caddy 2>/dev/null || systemctl restart caddy

if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then
  ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

echo "== итог"
systemctl is-active caddy
ss -ltn | grep -E ':(22|80|443|3000|1337) ' || true
echo "Готово."
