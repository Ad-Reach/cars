#!/usr/bin/env bash
# Стадия 1 на общем сервере (запуск от root через sudo).
# Чистит место, удаляет VPN pasarguard (освобождает 443), убирает сайты
# dashaanddima.w1thluv.ru и rsy.w1thluv.ru из Caddy. Обратимо: Caddyfile бэкапится.
# Чужие сайты fan.w1thluv.ru и проект polymarket-abuse НЕ трогаются.
set -uo pipefail
echo "== свободно до"; df -h / | tail -1

echo "== удаляю VPN pasarguard"
for c in pasarguard-pasarguard-1 node; do
  docker rm -f "$c" 2>/dev/null && echo "удалён контейнер $c" || echo "контейнера $c нет"
done
# образы и неиспользуемые тома VPN
docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep -i pasarguard | awk '{print $2}' | xargs -r docker rmi -f 2>/dev/null || true
docker volume ls -q | grep -i pasarguard | xargs -r docker volume rm 2>/dev/null || true

echo "== чистка Docker (только мусор, данные не трогаю)"
docker image prune -f >/dev/null 2>&1 || true
docker builder prune -f >/dev/null 2>&1 || true
docker volume prune -f >/dev/null 2>&1 || true   # удаляет только тома, не привязанные к контейнерам

echo "== чистка системы"
apt-get clean 2>/dev/null || true
journalctl --vacuum-size=200M 2>/dev/null | tail -1 || true
find /var/log -type f \( -name '*.gz' -o -name '*.[0-9]' -o -name '*.old' \) -delete 2>/dev/null || true

echo "== убираю сайты dashaanddima и rsy из Caddy"
CF=/etc/caddy/Caddyfile
if [ -f "$CF" ]; then
  cp -a "$CF" "$CF.bak.$(date +%s)"
  python3 - "$CF" <<'PY'
import sys, re
p = sys.argv[1]
s = open(p).read()
# вырезаем верхнеуровневые блоки нужных виртуалхостов вместе с содержимым
def drop(text, host):
    out, i, n = [], 0, len(text)
    while i < n:
        # начало блока: строка, начинающаяся с host (host[:port] {)
        m = re.match(r'(?m)^[ \t]*' + re.escape(host) + r'(:\d+)?\s*\{', text[i:])
        if m:
            depth, j = 0, i
            while j < n:
                if text[j] == '{': depth += 1
                elif text[j] == '}':
                    depth -= 1
                    if depth == 0:
                        j += 1
                        break
                j += 1
            # съесть завершающие пустые строки
            while j < n and text[j] in '\r\n': j += 1
            i = j
            continue
        nl = text.find('\n', i)
        if nl == -1: nl = n - 1
        out.append(text[i:nl+1]); i = nl + 1
    return ''.join(out)
for h in ('dashaanddima.w1thluv.ru', 'rsy.w1thluv.ru'):
    s = drop(s, h)
open(p, 'w').write(s)
print("Caddyfile после правки:")
print(open(p).read())
PY
  if caddy validate --config "$CF" --adapter caddyfile >/tmp/cv.log 2>&1; then
    systemctl reload caddy && echo "Caddy перезагружен"
  else
    echo "Caddy validate упал, откатываю:"; tail -5 /tmp/cv.log
    cp -a "$(ls -1t "$CF".bak.* | head -1)" "$CF"; exit 1
  fi
fi

echo "== порт 443 сейчас"; ss -ltnp | grep ':443 ' || echo "443 свободен"
echo "== свободно после"; df -h / | tail -1
echo "== контейнеры"; docker ps --format '{{.Names}} {{.Image}}'
