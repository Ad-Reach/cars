#!/usr/bin/env bash
# Только проверка (может идти через sudo). Статус сайтов и CMS. Секреты не печатаем.
echo "== службы"; systemctl is-active rangauto rangauto-cms caddy
echo "== сайт :3000"; curl -s -o /dev/null -w '%{http_code}\n' --max-time 8 http://127.0.0.1:3000/
echo "== CMS :1339 /_health"; curl -s -o /dev/null -w '%{http_code}\n' --max-time 8 http://127.0.0.1:1339/_health
echo "== CMS :1339 /cms/admin"; curl -s -o /dev/null -w '%{http_code}\n' --max-time 8 http://127.0.0.1:1339/cms/admin
echo "== centro-plus current"; ls /srv/centro-plus/current/ | head
echo "== журнал CMS (маскируем длинные токены)"
journalctl -u rangauto-cms --no-pager -n 25 | sed 's/[A-Za-z0-9+/=]\{40,\}/***/g'
echo "== файл с доступом в админку есть?"; test -f /root/rangauto-cms-admin.txt && echo "да, /root/rangauto-cms-admin.txt (в логи не вывожу)" || echo "нет"
