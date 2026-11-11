#!/usr/bin/env bash
# Стадия 1 на общем сервере (запуск от root через sudo).
# Чистит место, удаляет VPN pasarguard (освобождает 443), убирает сайты
# dashaanddima.w1thluv.ru и rsy.w1thluv.ru из Caddy. Обратимо: Caddyfile бэкапится.
# Чужие сайты fan.w1thluv.ru и проект polymarket-abuse НЕ трогаются.
set -uo pipefail
echo "== свободно до"; df -h / | tail -1

# Удаляю ТОЛЬКО перечисленные по имени контейнеры (pasarguard VPN и polymarket-abuse).
# Никаких массовых prune — объём удаления строго ограничен этими списками.
CONTAINERS="pasarguard-pasarguard-1 node app-telegram-bot-1 app-detector-1 app-clickhouse-1"
echo "== удаляю контейнеры: $CONTAINERS"
for c in $CONTAINERS; do
  docker rm -f "$c" 2>/dev/null && echo "удалён контейнер $c" || echo "контейнера $c нет"
done

# Тома этих двух compose-проектов: имена начинаются строго с 'app_' или 'pasarguard_'.
echo "== тома проектов app_/pasarguard_ (будут удалены поimenно):"
VOLS=$(docker volume ls -q | grep -E '^(app|pasarguard)_' || true)
echo "${VOLS:-нет}"
for v in $VOLS; do docker volume rm -f "$v" 2>/dev/null && echo "удалён том $v"; done

# Образы строго этих репозиториев (по точному имени, не по подстроке 'clickhouse' вообще).
echo "== образы проектов (поimenно):"
IMGS=$(docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' \
  | grep -E 'ghcr\.io/dmitryhudrich/polymarket-abuse/|^pasarguard/|^clickhouse/clickhouse-server' \
  | awk '{print $2}' | sort -u || true)
echo "${IMGS:-нет}"
for i in $IMGS; do docker rmi -f "$i" 2>/dev/null && echo "удалён образ $i"; done

echo "== чистка кэша apt и журналов (ограниченно)"
apt-get clean 2>/dev/null || true
journalctl --vacuum-size=200M 2>/dev/null | tail -1 || true

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
echo "== осталось контейнеров"; docker ps -a --format '{{.Names}} {{.Image}} {{.Status}}'
