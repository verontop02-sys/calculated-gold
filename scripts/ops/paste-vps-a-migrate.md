# Консоль VPS A — перенос API с Render на localhost

Вставь по шагам от root.

## 1) Код на машине

```bash
mkdir -p /opt/reaktivo
if [[ ! -d /opt/reaktivo/src/.git ]]; then
  git clone https://github.com/Twinklingsun/calculated_gold.git /opt/reaktivo/src \
    || git clone https://github.com/Twinklingsun/calculated-gold.git /opt/reaktivo/src
fi
cd /opt/reaktivo/src && git pull --ff-only || true
```

(Если репо приватное — `git clone` по SSH-ключу или залей архив в `/opt/reaktivo/src`.)

## 2) Секреты

Скопируй Environment с Render в файл:

```bash
nano /opt/reaktivo/src/server/.env
chmod 600 /opt/reaktivo/src/server/.env
```

Минимум: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SMSRU_API_ID`, `TELEGRAM_BOT_TOKEN`, chat id, `FIELD_DEAL_CODE_PEPPER` / pepper, `PUBLIC_APP_ORIGIN=https://pro.reaktivo.ru`, `PORT=8787`, `NODE_ENV=production`.

## 3) Миграция

```bash
bash /opt/reaktivo/src/scripts/migrate-vps-a-to-local-api.sh
```

Ожидай `{"ok":true}` и `https_ru 200` / `https_pro 200`.

## 4) Мониторинг

```bash
export REAKTIVO_TG_BOT_TOKEN='...'   # тот же бот
export REAKTIVO_TG_CHAT_ID='...'     # чат ops
bash /opt/reaktivo/src/scripts/ops/install-monitor-cron.sh
```

## 5) Render

Через 1–2 дня стабильности — Suspend сервиса, см. `cut-render.md`.
