#!/usr/bin/env bash
# Стадия 2a на общем сервере (запуск от root через sudo). Идемпотентно.
# Готовит сервер к сайтам rangauto.ru (Next.js :3000 + Strapi CMS :1339) и centro-plus.ru (статика).
# Службы работают под пользователем w1thluv. Caddy: добавляется наш файл-импорт,
# глобальный https_port 9998 убирается (443 теперь свободен). Чужой fan.w1thluv.ru не трогается.
set -euo pipefail
U=w1thluv
SITE=/srv/rangauto
CMS=$SITE/cms
POTOLKI=/srv/centro-plus
SITE_ENV=/etc/rangauto.env
CMS_ENV=/etc/rangauto-cms.env

echo "== swap (на сервере его нет, 1.9G RAM)"
if ! swapon --show | grep -q .; then
  [ -f /swapfile ] || fallocate -l 2G /swapfile
  chmod 600 /swapfile; mkswap /swapfile >/dev/null; swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "swap 2G включён"
fi

echo "== Node 22"
wait_apt() {
  for i in $(seq 1 60); do
    if fuser /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock >/dev/null 2>&1; then
      echo "apt занят, жду ($i)…"; sleep 5
    else return 0; fi
  done
}
if ! command -v node >/dev/null || ! node -v | grep -q '^v22\.'; then
  wait_apt
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  wait_apt
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs >/dev/null
fi
node -v
node -v | grep -q '^v22\.' || { echo "::warning::Node не 22, а $(node -v)"; }

echo "== каталоги (владелец $U)"
install -d -o "$U" -g "$U" "$SITE" "$SITE/releases" "$CMS" "$CMS/releases" "$CMS/uploads" "$POTOLKI" "$POTOLKI/releases"
install -d -o "$U" -g "$U" -m 750 "$CMS/data"

echo "== секреты CMS ($CMS_ENV) — порт 1339, чтобы не мешать fan.w1thluv.ru:1337"
secret() { openssl rand -base64 32 | tr -d '\n'; }
if [ ! -f "$CMS_ENV" ]; then
  ADMIN_EMAIL=admin@rangauto.ru
  ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=\n')A1!"
  cat > "$CMS_ENV" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=1339
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
  chmod 600 "$CMS_ENV"; chown "$U:$U" "$CMS_ENV"
  (umask 077; printf 'Админка: https://rangauto.ru/cms/admin\nЛогин: %s\nПароль: %s\n' "$ADMIN_EMAIL" "$ADMIN_PASSWORD" > /root/rangauto-cms-admin.txt)
  echo "создан $CMS_ENV; доступ в админку — /root/rangauto-cms-admin.txt"
else
  echo "$CMS_ENV уже есть, не трогаю"
fi

echo "== окружение сайта ($SITE_ENV)"
touch "$SITE_ENV"; chmod 600 "$SITE_ENV"; chown "$U:$U" "$SITE_ENV"
set_env() { sed -i "/^$1=/d" "$SITE_ENV"; printf '%s=%s\n' "$1" "$2" >> "$SITE_ENV"; }
set_env CMS_URL http://127.0.0.1:1339
set_env CMS_PUBLIC_URL https://rangauto.ru/cms
set_env REVALIDATE_SECRET "$(grep '^REVALIDATE_SECRET=' "$CMS_ENV" | cut -d= -f2-)"
set_env TELEGRAM_CHATS_FILE "$SITE/telegram-chats.json"

echo "== systemd службы (под $U)"
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
[ -e "$SITE/current" ] && systemctl restart rangauto.service || true
[ -e "$CMS/current" ] && systemctl restart rangauto-cms.service || true

echo "== Caddy: наш файл-импорт + освобождаем 443 (убираем https_port 9998)"
SITES=/etc/caddy/rangauto-sites.caddy
cat > "$SITES" <<EOF
rangauto.ru {
	encode zstd gzip
	redir /cms /cms/admin
	handle_path /cms/* {
		reverse_proxy 127.0.0.1:1339
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
chown "$U:$U" "$SITES"

CF=/etc/caddy/Caddyfile
cp -a "$CF" "$CF.bak.$(date +%s)"
# убираем строку https_port 9998 (443 теперь свободен), подключаем наш файл
sed -i '/^[[:space:]]*https_port[[:space:]]\+9998/d' "$CF"
grep -q 'import /etc/caddy/rangauto-sites.caddy' "$CF" || printf '\nimport /etc/caddy/rangauto-sites.caddy\n' >> "$CF"

if caddy validate --config "$CF" --adapter caddyfile >/tmp/cv.log 2>&1; then
  systemctl reload caddy && echo "Caddy перезагружен"
else
  echo "validate упал, откат:"; tail -8 /tmp/cv.log
  cp -a "$(ls -1t "$CF".bak.* | head -1)" "$CF"; exit 1
fi

echo "== итог"
node -v; swapon --show | tail -1
systemctl is-enabled rangauto rangauto-cms
echo "порты:"; ss -ltn | grep -E ':(80|443|1337|3000|1339) ' || true
echo "Готово. Теперь нужен деплой кода (отдельный шаг)."
