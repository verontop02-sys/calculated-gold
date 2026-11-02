#!/bin/bash
# Единый деплой сайта + API на один или оба VPS.
# Собирает клиент локально (или на CI), заливает dist + server, рестартит API.
#
# USAGE (с машины разработчика / CI):
#   export VPS_A=root@46.149.68.107
#   export VPS_B=root@X.X.X.X          # опционально
#   export SSH_KEY=~/.ssh/reaktivo_vps
#   bash scripts/deploy-to-vps.sh              # оба, если заданы
#   bash scripts/deploy-to-vps.sh --only a
#   bash scripts/deploy-to-vps.sh --only b
#   bash scripts/deploy-to-vps.sh --host local # уже на сервере: только sync из REPO
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ONLY=""
HOST_MODE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --only) ONLY="${2:-}"; shift 2 ;;
    --host) HOST_MODE="${2:-}"; shift 2 ;;
    *) echo "unknown arg $1"; exit 1 ;;
  esac
done

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30)
if [[ -n "${SSH_KEY:-}" ]]; then
  SSH_OPTS+=(-i "$SSH_KEY")
fi

remote_deploy() {
  local target="$1"
  echo "==== deploy → $target ===="
  ssh "${SSH_OPTS[@]}" "$target" 'mkdir -p /opt/reaktivo/src /var/www/reaktivo-pro /var/www/reaktivo-ru'

  # код (без тяжёлого мусора)
  rsync -az --delete \
    -e "ssh ${SSH_OPTS[*]}" \
    --exclude node_modules \
    --exclude .git \
    --exclude 'client/dist' \
    --exclude 'client/dist-ru' \
    --exclude 'scripts/_shots' \
    --exclude 'Новая папка' \
    --exclude 'клауд фото' \
    --exclude '*.pdf' \
    "$ROOT/" "$target:/opt/reaktivo/src/"

  # статика (если собрана)
  if [[ -d "$ROOT/client/dist" ]]; then
    rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
      "$ROOT/client/dist/" "$target:/var/www/reaktivo-pro/"
  else
    echo "WARN: нет client/dist — панель не обновлена"
  fi
  if [[ -d "$ROOT/client/dist-ru" ]]; then
    rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
      "$ROOT/client/dist-ru/" "$target:/var/www/reaktivo-ru/"
  elif [[ -d "$ROOT/deploy-web/reaktivo-ru" ]]; then
    rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
      "$ROOT/deploy-web/reaktivo-ru/" "$target:/var/www/reaktivo-ru/"
  else
    echo "WARN: нет client/dist-ru — сайт .ru не обновлён"
  fi

  # .env не затираем с локальной машины, если на сервере уже есть
  ssh "${SSH_OPTS[@]}" "$target" 'bash -s' <<'REMOTE'
set -euo pipefail
REPO=/opt/reaktivo/src
cd "$REPO"
if [[ ! -f server/.env ]]; then
  echo "FAIL: нет /opt/reaktivo/src/server/.env на сервере"
  exit 1
fi
npm install --omit=dev
install -m 0644 "$REPO/scripts/nginx/local-api-proxy.conf" /etc/nginx/snippets/local-api-proxy.conf
install -m 0644 "$REPO/scripts/nginx/render-proxy.conf" /etc/nginx/snippets/render-proxy.conf
install -m 0644 "$REPO/scripts/systemd/reaktivo-api.service" /etc/systemd/system/reaktivo-api.service
chown -R www-data:www-data "$REPO"
# статика от www-data
chown -R www-data:www-data /var/www/reaktivo-pro /var/www/reaktivo-ru 2>/dev/null || true
systemctl daemon-reload
systemctl restart reaktivo-api
nginx -t && systemctl reload nginx
sleep 1
curl -fsS -m 15 http://127.0.0.1:8787/api/health
echo
REMOTE
}

local_deploy() {
  echo "==== deploy on this host ===="
  REPO="${REPO:-/opt/reaktivo/src}"
  cd "$REPO"
  npm install --omit=dev
  if [[ -d "$ROOT/client/dist" ]]; then
    rsync -a --delete "$ROOT/client/dist/" /var/www/reaktivo-pro/
  fi
  if [[ -d "$ROOT/client/dist-ru" ]]; then
    rsync -a --delete "$ROOT/client/dist-ru/" /var/www/reaktivo-ru/
  fi
  install -m 0644 "$REPO/scripts/nginx/local-api-proxy.conf" /etc/nginx/snippets/local-api-proxy.conf
  install -m 0644 "$REPO/scripts/systemd/reaktivo-api.service" /etc/systemd/system/reaktivo-api.service
  systemctl daemon-reload
  systemctl restart reaktivo-api
  nginx -t && systemctl reload nginx
  curl -fsS -m 15 http://127.0.0.1:8787/api/health
  echo
}

# Build if dist missing
if [[ "${SKIP_BUILD:-0}" != "1" && "$HOST_MODE" != "local" ]]; then
  if [[ ! -d "$ROOT/client/dist" ]]; then
    echo "building client…"
    (cd "$ROOT" && npm install && npm run build)
  fi
fi

if [[ "$HOST_MODE" == "local" ]]; then
  local_deploy
  exit 0
fi

targets=()
if [[ -z "$ONLY" || "$ONLY" == "a" || "$ONLY" == "A" ]]; then
  [[ -n "${VPS_A:-}" ]] && targets+=("$VPS_A")
fi
if [[ -z "$ONLY" || "$ONLY" == "b" || "$ONLY" == "B" ]]; then
  [[ -n "${VPS_B:-}" ]] && targets+=("$VPS_B")
fi

if [[ ${#targets[@]} -eq 0 ]]; then
  echo "Задайте VPS_A и/или VPS_B (user@host), либо --host local"
  exit 1
fi

for t in "${targets[@]}"; do
  remote_deploy "$t"
done
echo "ALL DONE"
