#!/bin/bash
# Установить cron health-monitor на ЭТОЙ машине (лучше не только на primary).
# USAGE:
#   export REAKTIVO_TG_BOT_TOKEN=...
#   export REAKTIVO_TG_CHAT_ID=...
#   export MONITOR_VPS_B_IP=x.x.x.x   # опционально
#   bash scripts/ops/install-monitor-cron.sh
set -euo pipefail
REPO="${REPO:-/opt/reaktivo/src}"
SCRIPT="$REPO/scripts/ops/health-monitor.sh"
chmod +x "$SCRIPT"

ENV_FILE=/etc/reaktivo-monitor.env
cat >"$ENV_FILE" <<EOF
REAKTIVO_TG_BOT_TOKEN=${REAKTIVO_TG_BOT_TOKEN:-}
REAKTIVO_TG_CHAT_ID=${REAKTIVO_TG_CHAT_ID:-}
MONITOR_VPS_B_IP=${MONITOR_VPS_B_IP:-}
EOF
chmod 600 "$ENV_FILE"

CRON_LINE="*/2 * * * * set -a; . ${ENV_FILE}; set +a; ${SCRIPT} >>/var/log/reaktivo-monitor.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'health-monitor.sh' || true; echo "$CRON_LINE" ) | crontab -
echo "cron installed:"
crontab -l | grep health-monitor || true
echo "test run:"
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
bash "$SCRIPT" || true
