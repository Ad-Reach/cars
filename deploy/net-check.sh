#!/usr/bin/env bash
# Только чтение сетевой конфигурации (через sudo).
echo "== интерфейсы и адреса"; ip -4 addr show scope global
echo "== маршруты"; ip route
echo "== netplan файлы"; ls -la /etc/netplan 2>/dev/null
for f in /etc/netplan/*.yaml /etc/netplan/*.yml; do [ -f "$f" ] && { echo "--- $f"; cat "$f"; }; done
echo "== cloud-init сеть (если есть)"; ls /etc/cloud/cloud.cfg.d 2>/dev/null; cat /etc/cloud/cloud.cfg.d/*network* 2>/dev/null | head -40
echo "== есть ли уже 147.45.149.95"; ip addr | grep -q '147.45.149.95' && echo "ДА, уже на интерфейсе" || echo "нет, не привязан"
