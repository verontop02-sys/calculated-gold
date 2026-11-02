#!/bin/bash
# Новый VPS B (или чистый VPS): nginx + Node API локально (без Render).
# Запускать от root ПОСЛЕ: git clone репо в /opt/reaktivo/src и положить server/.env
#
# USAGE:
#   git clone <repo> /opt/reaktivo/src
#   nano /opt/reaktivo/src/server/.env   # секреты с Render / VPS A
#   bash /opt/reaktivo/src/scripts/bootstrap-vps-local-api.sh
set -euo pipefail

REPO="${REPO:-/opt/reaktivo/src}"
NODE_MAJOR="${NODE_MAJOR:-20}"
EMAIL="${CERTBOT_EMAIL:-nikita@reaktivo.ru}"
ROLE="${VPS_ROLE:-secondary}"   # primary | secondary

if [[ ! -d "$REPO/server" || ! -d "$REPO/scripts/nginx" ]]; then
  echo "FAIL: ожидается клон репо в $REPO"
  exit 1
fi
if [[ ! -f "$REPO/server/.env" ]]; then
  echo "FAIL: положите секреты в $REPO/server/.env"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates nginx certbot python3-certbot-nginx git rsync ufw

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//;s/\..*//' )" -lt "$NODE_MAJOR" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

mkdir -p /var/www/html /var/www/reaktivo-pro /var/www/reaktivo-ru \
  /etc/nginx/snippets /etc/nginx/conf.d

cat >/etc/nginx/conf.d/00-websocket-map.conf <<'EOF'
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
EOF

install -m 0644 "$REPO/scripts/nginx/local-api-proxy.conf" /etc/nginx/snippets/local-api-proxy.conf
install -m 0644 "$REPO/scripts/nginx/render-proxy.conf" /etc/nginx/snippets/render-proxy.conf

# HTTP-only sites first (certs later). Strip ssl server blocks for initial boot if no certs yet.
# For standby we often copy certs from A or use DNS-01 later — start with HTTP → local API.
cat >/etc/nginx/sites-available/reaktivo-http-bootstrap <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    client_max_body_size 50m;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location /api/ { include snippets/local-api-proxy.conf; }
    location = /sb { include snippets/local-api-proxy.conf; }
    location /sb/ { include snippets/local-api-proxy.conf; }
    location / { return 200 "reaktivo ${ROLE}\\n"; add_header Content-Type text/plain; }
}
EOF
rm -f /etc/nginx/sites-enabled/default
ln -sfn /etc/nginx/sites-available/reaktivo-http-bootstrap /etc/nginx/sites-enabled/reaktivo-http-bootstrap

# deps
cd "$REPO"
npm install --omit=dev

grep -q '^PUBLIC_APP_ORIGIN=' "$REPO/server/.env" \
  || echo 'PUBLIC_APP_ORIGIN=https://pro.reaktivo.ru' >>"$REPO/server/.env"
grep -q '^PORT=' "$REPO/server/.env" || echo 'PORT=8787' >>"$REPO/server/.env"
chmod 600 "$REPO/server/.env"
chown -R www-data:www-data "$REPO"

install -m 0644 "$REPO/scripts/systemd/reaktivo-api.service" /etc/systemd/system/reaktivo-api.service
systemctl daemon-reload
systemctl enable --now reaktivo-api
systemctl enable --now nginx
nginx -t
systemctl reload nginx
sleep 2

curl -fsS -m 15 "http://127.0.0.1:8787/api/health"
echo
curl -fsS -m 10 -H 'Host: reaktivo.ru' "http://127.0.0.1/api/health"
echo

IP="$(curl -4 -fsS --max-time 15 https://ifconfig.me || true)"
echo
echo "==== BOOTSTRAP OK (${ROLE}) ===="
echo "IP: ${IP}"
echo "Дальше:"
echo "  1) Залить статику: bash scripts/deploy-to-vps.sh --host local"
echo "  2) Серты: см. scripts/ops/vps-b-checklist.md (DNS-01 или копирование с A)"
echo "  3) Когда DNS укажет сюда: установить scripts/nginx/reaktivo-sites.conf и reload"
