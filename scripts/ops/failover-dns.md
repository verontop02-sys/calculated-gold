# Failover DNS: VPS A → VPS B

TTL на A-записях держать **300–600 секунд** (Masterhost DNS для `reaktivo.ru`).

## Записи (боевые имена)

| Имя | Тип | Primary (A) | Standby (B) |
|-----|-----|-------------|-------------|
| `@` / `reaktivo.ru` | A | IP VPS A | IP VPS B |
| `www` | A | IP VPS A | IP VPS B |
| `pro` | A | IP VPS A | IP VPS B |
| `api` | A | IP VPS A | IP VPS B |

`reaktivo.pro` (Reg.ru) — по желанию тем же IP; сотрудникам рекомендуем `https://pro.reaktivo.ru`.

## Когда переключать

Telegram-алерт от `scripts/ops/health-monitor.sh` (site_ru / api_pro DOWN несколько циклов подряд) **и** VPS A не отвечает по SSH/консоли, а standby B отвечает:

```bash
curl -sk --resolve pro.reaktivo.ru:443:IP_B https://pro.reaktivo.ru/api/health
curl -sk --resolve reaktivo.ru:443:IP_B https://reaktivo.ru/
```

Оба должны дать `200`.

## Шаги failover (5–10 минут)

1. Masterhost → DNS-редактор `reaktivo.ru`.
2. Поменять A для `@`, `www`, `pro`, `api` на **IP VPS B**.
3. TTL уже короткий — подождать 5–15 минут.
4. Проверить с телефона/VPN: `https://reaktivo.ru`, `https://pro.reaktivo.ru`.
5. В Telegram написать команде: «временно на резерве B».

## Возврат на A

1. Убедиться: A снова `200` по IP (`--resolve`).
2. Вернуть A-записи на IP A.
3. Сообщить команде.

## Не делать

- Не выпускать один сертификат на `reaktivo.pro` + `pro.reaktivo.ru` в одном certbot-блоке.
- Не переключать DNS, пока на B нет свежего деплоя (`deploy-to-vps.sh --only b`).
