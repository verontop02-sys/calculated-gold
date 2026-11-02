# Биллинг и алерты (чтобы снова не «легло само»)

## Обязательный автоплатёж / баланс

| Сервис | Что проверить | Действие |
|--------|---------------|----------|
| Timeweb VPS A | Баланс + автоплатёж | Порог алерта в ЛК, карта привязана |
| VPS B (новый) | Баланс + автоплатёж | То же |
| SMS.ru | Баланс + дневной лимит | Пополнение заранее; алерт в кабинете |
| Supabase | Billing / card | Paid plan не должен уходить в pause |
| Render | **Не боевой** | Suspend ок; не держать на нём API. Можно freeze/suspend после миграции |
| Masterhost DNS | Оплата домена/DNS `reaktivo.ru` | Продление домена |
| Reg.ru | `reaktivo.pro` | Продление |

## Telegram

Используйте того же бота, что для лидов (`TELEGRAM_BOT_TOKEN` + чат ops/support):

- Падение сайта/API — `scripts/ops/health-monitor.sh` (cron `*/2`)
- Раз в неделю вручную: баланс SMS.ru и хостеров (или напоминание в календаре)

## Чеклист раз в месяц

- [ ] SMS.ru баланс > запаса на пик заявок
- [ ] Timeweb / VPS B хватает на >30 дней
- [ ] `systemctl is-active reaktivo-api nginx` на A и B
- [ ] Деплой на B свежий (`deploy-to-vps.sh --only b`)
- [ ] Certbot renew dry-run на A: `certbot renew --dry-run`
