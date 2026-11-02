#!/bin/bash
# VPS A (текущий Timeweb): Node API локально, nginx /api+/sb → 127.0.0.1:8787
# USAGE (root):
#   git clone <repo> /opt/reaktivo/src   # или REPO=...
#   # server/.env — секреты с Render Environment
#   bash /opt/reaktivo/src/scripts/migrate-vps-a-to-local-api.sh
set -euo pipefail

REPO="${REPO:-/opt/reaktivo/src}"
NODE_MAJOR="${NODE_MAJOR:-20}"

if [[ ! -d "$REPO/server" ]]; then
  echo "FAIL: нет $REPO/server"
  exit 1
fi
if [[ ! -f "$REPO/server/.env" ]]; then
  echo "FAIL: нет $REPO/server/.env (скопируйте env с Render)"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates nginx git rsync

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//;s/\..*//')" -lt "$NODE_MAJOR" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

mkdir -p /etc/nginx/snippets /etc/nginx/conf.d
cat >/etc/nginx/conf.d/00-websocket-map.conf <<'EOF'
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
EOF

install -m 0644 "$REPO/scripts/nginx/local-api-proxy.conf" /etc/nginx/snippets/local-api-proxy.conf
install -m 0644 "$REPO/scripts/nginx/render-proxy.conf" /etc/nginx/snippets/render-proxy.conf

cd "$REPO"
npm install --omit=dev

grep -q '^PUBLIC_APP_ORIGIN=' "$REPO/server/.env" \
  || echo 'PUBLIC_APP_ORIGIN=https://pro.reaktivo.ru' >>"$REPO/server/.env"
grep -q '^PORT=' "$REPO/server/.env" || echo 'PORT=8787' >>"$REPO/server/.env"
grep -q '^NODE_ENV=' "$REPO/server/.env" || echo 'NODE_ENV=production' >>"$REPO/server/.env"
chmod 600 "$REPO/server/.env"
chown -R www-data:www-data "$REPO"

install -m 0644 "$REPO/scripts/systemd/reaktivo-api.service" /etc/systemd/system/reaktivo-api.service
systemctl daemon-reload
systemctl enable reaktivo-api
systemctl restart reaktivo-api
sleep 2
systemctl --no-pager --full status reaktivo-api | head -n 25
curl -fsS -m 15 "http://127.0.0.1:8787/api/health"
echo

# Переключить все nginx-конфиги с Render на local
shopt -s nullglob
for f in /etc/nginx/sites-available/* /etc/nginx/sites-enabled/*; do
  [[ -f "$f" ]] || continue
  [[ -L "$f" ]] && continue
  if grep -qE 'render-proxy|calculated-gold\.onrender\.com' "$f"; then
    cp -a "$f" "${f}.bak-localapi-$(date +%s)"
    sed -i 's|snippets/render-proxy.conf|snippets/local-api-proxy.conf|g' "$f"
    sed -i 's|proxy_pass https://calculated-gold.onrender.com|proxy_pass http://127.0.0.1:8787|g' "$f"
    sed -i 's|proxy_set_header Host calculated-gold.onrender.com|proxy_set_header Host $host|g' "$f"
    echo "patched $f"
  fi
done

nginx -t
systemctl reload nginx

echo "===== checks ====="
curl -fsS -m 10 -o /dev/null -w "local %{http_code}\n" http://127.0.0.1:8787/api/health
curl -fsS -m 10 -o /dev/null -w "nginx_host_ru %{http_code}\n" -H 'Host: reaktivo.ru' http://127.0.0.1/api/health || true
curl -sk -m 15 -o /dev/null -w "https_ru %{http_code}\n" https://reaktivo.ru/api/health || true
curl -sk -m 15 -o /dev/null -w "https_pro %{http_code}\n" https://pro.reaktivo.ru/api/health || true
echo "DONE — API на localhost, Render не в горячем пути."
