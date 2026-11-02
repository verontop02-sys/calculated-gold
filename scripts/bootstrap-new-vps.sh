#!/bin/bash
# Устарело как «прокси на Render». Боевой bootstrap — local Node API:
#   bash scripts/bootstrap-vps-local-api.sh
# Миграция текущего Timeweb с Render → localhost:
#   bash scripts/migrate-vps-a-to-local-api.sh
# Документация: scripts/ops/README.md
set -euo pipefail
echo "Этот скрипт больше не поднимает прокси на Render."
echo "Используйте: bash scripts/bootstrap-vps-local-api.sh"
echo "или:         bash scripts/migrate-vps-a-to-local-api.sh"
exit 1
