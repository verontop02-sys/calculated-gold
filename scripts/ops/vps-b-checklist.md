# VPS B — покупка и зеркало

## Спека (купить)

- Провайдер: **не тот же пул Москва-Timeweb**, лучше Selectel / AEZA / Timeweb СПб
- 2 vCPU, 4 GB RAM, 40–80 GB NVMe, Ubuntu 22.04/24.04
- Публичный IPv4
- Бюджет ориентир: 1500–3000 ₽/мес
- Сохранить IP в этот файл / парольный менеджер как `VPS_B`

## После создания

1. SSH по ключу, отключить парольный root если можно.
2. Клон и секреты:

```bash
mkdir -p /opt/reaktivo
git clone <URL_РЕПО> /opt/reaktivo/src
# скопировать server/.env с VPS A (scp), chmod 600
scp root@VPS_A:/opt/reaktivo/src/server/.env /opt/reaktivo/src/server/.env
bash /opt/reaktivo/src/scripts/bootstrap-vps-local-api.sh
```

3. С машины разработки:

```bash
export VPS_B=root@IP_B
export SSH_KEY=~/.ssh/reaktivo_vps
bash scripts/deploy-to-vps.sh --only b
```

4. Сертификаты (выбрать один путь):

**A) Скопировать с VPS A** (быстрее для standby):

```bash
# на A
tar czf /tmp/le.tgz -C /etc/letsencrypt .
# на B
scp root@VPS_A:/tmp/le.tgz /tmp/
tar xzf /tmp/le.tgz -C /etc/letsencrypt
bash /opt/reaktivo/src/scripts/apply-nginx-sites.sh
```

**B) DNS-01 / временный A на B** — только если копирование нельзя; не держать боевой DNS на B дольше теста.

5. Проверка без смены DNS:

```bash
curl -sk --resolve reaktivo.ru:443:IP_B https://reaktivo.ru/ -o /dev/null -w '%{http_code}\n'
curl -sk --resolve pro.reaktivo.ru:443:IP_B https://pro.reaktivo.ru/api/health
```

6. Вписать IP B в мониторинг: `MONITOR_VPS_B_IP=...` в cron health-monitor.
7. Masterhost: TTL A-записей `@/www/pro/api` → **300**.

Готово: B — горячий запас. Failover — [failover-dns.md](failover-dns.md).
