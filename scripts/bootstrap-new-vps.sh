#!/bin/bash
# Новый VPS: nginx → Render (API + /sb). Запускать от root.
# USAGE: bash bootstrap-new-vps.sh
set -euo pipefail

RENDER_HOST="calculated-gold.onrender.com"
RENDER_ORIGIN="https://${RENDER_HOST}"
IP="$(curl -4 -fsS --max-time 15 https://ifconfig.me || curl -4 -fsS --max-time 15 https://api.ipify.org)"
IP="${IP//$'\n'/}"
SSLIP="api.${IP//./-}.sslip.io"
EMAIL="${CERTBOT_EMAIL:-nikita@reaktivo.ru}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx curl ca-certificates

mkdir -p /var/www/html /etc/nginx/sites-available /etc/nginx/sites-enabled

cat >/etc/nginx/conf.d/00-websocket-map.conf <<'EOF'
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
EOF

cat >/etc/nginx/sites-available/reaktivo-proxy <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${SSLIP} api.reaktivo.pro sb.reaktivo.pro _;

    client_max_body_size 50m;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass ${RENDER_ORIGIN};
        proxy_http_version 1.1;
        proxy_set_header Host ${RENDER_HOST};
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_ssl_server_name on;
        proxy_ssl_name ${RENDER_HOST};
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_connect_timeout 60s;
        proxy_buffering off;
        proxy_cache off;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sfn /etc/nginx/sites-available/reaktivo-proxy /etc/nginx/sites-enabled/reaktivo-proxy
nginx -t
systemctl enable --now nginx
systemctl reload nginx

# sslip.io отвечает сразу, без DNS reaktivo.pro
certbot --nginx -d "${SSLIP}" --non-interactive --agree-tos -m "${EMAIL}" --redirect || true

echo
echo "==== READY ===="
echo "IP          ${IP}"
echo "SSLIP       https://${SSLIP}"
curl -sS --max-time 25 "http://127.0.0.1/api/health" -H "Host: ${RENDER_HOST}" || true
echo
echo "Проверка снаружи: curl -sS https://${SSLIP}/api/health"
echo "Потом A-записи: api.reaktivo.pro и sb.reaktivo.pro → ${IP}"
echo "и: certbot --nginx -d api.reaktivo.pro -d sb.reaktivo.pro --expand"
