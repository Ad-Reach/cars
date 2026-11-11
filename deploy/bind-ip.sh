#!/usr/bin/env bash
# Привязывает дополнительный IP 147.45.149.95 к eth0 (через sudo).
# Сначала временно (ip addr add) — чтобы проверить маршрутизацию провайдера, это обратимо.
# Если ответит снаружи — закрепим в netplan отдельным файлом.
set -uo pipefail
IP=147.45.149.95
DEV=eth0
if ip addr show "$DEV" | grep -q "$IP"; then
  echo "$IP уже на $DEV"
else
  ip addr add "$IP/32" dev "$DEV" && echo "добавил $IP/32 на $DEV (временно)" || echo "не удалось добавить"
fi
echo "== адреса сейчас"; ip -4 addr show "$DEV" | grep inet
echo "== Caddy слушает на всех адресах?"; ss -ltnH 'sport = :443' | awk '{print $4}'
