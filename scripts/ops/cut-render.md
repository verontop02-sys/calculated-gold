# Убрать Render из горячего пути

После успешной миграции VPS A (`migrate-vps-a-to-local-api.sh`):

1. Проверить 24–48ч: вход сотрудников, кабинет SMS, заявки, договоры.
2. В [dashboard.render.com](https://dashboard.render.com) у сервиса `calculated-gold` / `gold-calculated-api`:
   - **Suspend** или отключить Auto-Deploy
   - Не удалять сразу — cold backup 2–4 недели
3. Webhook'и ЮKassa / внешних систем должны смотреть на `https://reaktivo.ru/...` или `https://pro.reaktivo.ru/...`, **не** на `*.onrender.com`.
4. Откат (авария): в nginx временно вернуть `snippets/render-proxy.conf` вместо `local-api-proxy.conf`, Resume Render, reload nginx. Файл cold backup: [../nginx/render-proxy.conf](../nginx/render-proxy.conf).
