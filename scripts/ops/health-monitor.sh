#!/bin/bash
# Простой мониторинг: curl health/сайта → Telegram при падении/восстановлении.
# Ставить на любой хост с cron (можно на VPS B или домашний сервер):
#   */2 * * * * REAKTIVO_TG_BOT_TOKEN=... REAKTIVO_TG_CHAT_ID=... /opt/reaktivo/src/scripts/ops/health-monitor.sh
set -euo pipefail

BOT_TOKEN="${REAKTIVO_TG_BOT_TOKEN:-${TELEGRAM_BOT_TOKEN:-}}"
CHAT_ID="${REAKTIVO_TG_CHAT_ID:-${TELEGRAM_SUPPORT_CHAT_ID:-}}"
STATE_DIR="${REAKTIVO_MONITOR_STATE:-/var/tmp/reaktivo-monitor}"
mkdir -p "$STATE_DIR"

TARGETS=(
  "site_ru|https://reaktivo.ru/|200"
  "api_pro|https://pro.reaktivo.ru/api/health|200"
  "api_ru|https://reaktivo.ru/api/health|200"
)

# Опционально прямые IP standby (обход DNS) — задайте MONITOR_VPS_B_IP
if [[ -n "${MONITOR_VPS_B_IP:-}" ]]; then
  TARGETS+=("standby_b_api|https://${MONITOR_VPS_B_IP}/api/health|200|--resolve pro.reaktivo.ru:443:${MONITOR_VPS_B_IP}")
fi

tg() {
  local text="$1"
  [[ -n "$BOT_TOKEN" && -n "$CHAT_ID" ]] || { echo "tg skip: $text"; return 0; }
  curl -fsS -m 15 -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${CHAT_ID}" \
    --data-urlencode "text=${text}" >/dev/null || true
}

check_one() {
  local id="$1" url="$2" expect="$3" extra="${4:-}"
  local code
  # shellcheck disable=SC2086
  code="$(curl -sk -m 20 -o /dev/null -w '%{http_code}' $extra "$url" || echo 000)"
  local state_file="$STATE_DIR/${id}.state"
  local prev="unknown"
  [[ -f "$state_file" ]] && prev="$(cat "$state_file")"
  if [[ "$code" == "$expect" ]]; then
    echo ok >"$state_file"
    if [[ "$prev" == "down" ]]; then
      tg "✅ Reaktivo ${id} снова OK (${code}) — ${url}"
    fi
    echo "$id OK $code"
  else
    echo down >"$state_file"
    if [[ "$prev" != "down" ]]; then
      tg "🔴 Reaktivo ${id} DOWN (got ${code}, want ${expect}) — ${url}"
    fi
    echo "$id DOWN $code"
    return 1
  fi
}

rc=0
for row in "${TARGETS[@]}"; do
  IFS='|' read -r id url expect extra <<<"$row"
  check_one "$id" "$url" "$expect" "${extra:-}" || rc=1
done
exit "$rc"
