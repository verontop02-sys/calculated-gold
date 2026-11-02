# Reaktivo ops: два VPS, API у себя

## Быстрый путь

1. **VPS A сейчас:** скопировать env с Render → `/opt/reaktivo/src/server/.env`, затем  
   `bash scripts/migrate-vps-a-to-local-api.sh`
2. **Выключить Render из боя:** [cut-render.md](cut-render.md)
3. **Купить VPS B:** [vps-b-checklist.md](vps-b-checklist.md)
4. **Деплой на оба:** `VPS_A=... VPS_B=... bash scripts/deploy-to-vps.sh`
5. **Мониторинг:** cron на `scripts/ops/health-monitor.sh`
6. **Failover:** [failover-dns.md](failover-dns.md)
7. **Биллинг:** [billing-alerts.md](billing-alerts.md)

## После работ провайдера (как 31.10)

```bash
systemctl restart nginx reaktivo-api
curl -sS -m 10 http://127.0.0.1:8787/api/health
curl -sk -m 10 -o /dev/null -w '%{http_code}\n' https://reaktivo.ru/
```

## Важно по SSL

Не склеивать `reaktivo.pro` и `pro.reaktivo.ru` в один `server_name` / один certbot expand. Канон: [../nginx/reaktivo-sites.conf](../nginx/reaktivo-sites.conf).
