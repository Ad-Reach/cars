#!/usr/bin/env bash
# Закрепляет дополнительный IP 147.45.149.95 на eth0 в netplan (переживает перезагрузку).
# Безопасно: netplan apply НЕ вызываем (адрес уже поднят в рантайме), только пишем и валидируем,
# чтобы не было разрыва связи на живом проде. Применится на следующей перезагрузке.
set -uo pipefail
F=/etc/netplan/99-extra-ip.yaml
cat > "$F" <<'YAML'
network:
  version: 2
  ethernets:
    eth0:
      addresses:
        - 147.45.149.95/32
YAML
chmod 600 "$F"
echo "== записан $F"; cat "$F"
echo "== валидация netplan generate"
if netplan generate 2>/tmp/ng.log; then
  echo "netplan: конфиг валиден"
else
  echo "netplan generate ошибка:"; cat /tmp/ng.log; rm -f "$F"; echo "файл удалён, живая сеть не тронута"; exit 1
fi
echo "== сгенерированный адрес для eth0 (проверка, что /32 попал в конфиг)"
grep -r 147.45.149.95 /run/systemd/network/ 2>/dev/null || echo "(в systemd-networkd появится после apply/reboot)"
echo "== текущие адреса (рантайм)"; ip -4 addr show eth0 | grep inet
