#!/usr/bin/env bash
# Только чтение: firewall, fail2ban, лимиты, что слушает на 443 (через sudo).
echo "== nftables ruleset (кратко)"; nft list ruleset 2>/dev/null | grep -iE 'drop|reject|limit|synproxy|tcp dport (443|80)' | head -30 || echo "nft нет/пусто"
echo "== iptables -S"; iptables -S 2>/dev/null | grep -ivE '^-P (INPUT|FORWARD|OUTPUT) ACCEPT$' | head -40 || echo "нет"
echo "== ufw"; ufw status 2>/dev/null | head -20 || echo "ufw нет"
echo "== fail2ban"; command -v fail2ban-client >/dev/null && { systemctl is-active fail2ban; fail2ban-client status 2>/dev/null; } || echo "нет"
echo "== кто слушает 443 и на каких адресах"; ss -ltnp 'sport = :443'
echo "== conntrack/synflood настройки"; sysctl net.ipv4.tcp_syncookies net.netfilter.nf_conntrack_max 2>/dev/null
echo "== локальный доступ к 443 по новому IP"; curl -s -o /dev/null -w 'через 147.45.149.95: %{http_code}\n' --resolve rangauto.ru:443:147.45.149.95 -k --max-time 8 https://rangauto.ru/ 2>/dev/null || echo "локально тоже не ответил"
echo "== счётчики ошибок/дропов на eth0"; ip -s link show eth0 | sed -n '3,6p'
