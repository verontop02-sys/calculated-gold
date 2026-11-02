#!/bin/bash
# Чинит SSL на pro.reaktivo.ru после сломанного редиректа:
# возвращает все server{} + редирект reaktivo.pro → pro.reaktivo.ru
set -euo pipefail

echo "=== сертификаты ==="
ls -la /etc/letsencrypt/live/ || true

need() {
  local name="$1"
  if [[ ! -f "/etc/letsencrypt/live/$name/fullchain.pem" ]]; then
    echo "FAIL: нет сертификата $name"
    exit 1
  fi
}
need reaktivo.pro
need pro.reaktivo.ru
need reaktivo.ru

# API cert: отдельный или SAN на pro.reaktivo.ru
API_LIVE=pro.reaktivo.ru
if [[ -f /etc/letsencrypt/live/api.reaktivo.ru/fullchain.pem ]]; then
  API_LIVE=api.reaktivo.ru
fi

mkdir -p /etc/nginx/snippets /etc/nginx/conf.d /etc/nginx/sites-available /etc/nginx/sites-enabled

cat >/etc/nginx/conf.d/00-websocket-map.conf <<'EOF'
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
EOF

cat >/etc/nginx/snippets/render-proxy.conf <<'EOF'
proxy_pass https://calculated-gold.onrender.com;
proxy_http_version 1.1;
proxy_set_header Host calculated-gold.onrender.com;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
proxy_ssl_server_name on;
proxy_ssl_name calculated-gold.onrender.com;
proxy_read_timeout 300s;
proxy_send_timeout 300s;
proxy_connect_timeout 60s;
proxy_buffering off;
proxy_cache off;
proxy_hide_header Alt-Svc;
add_header Alt-Svc "clear" always;
EOF

cat >/etc/nginx/snippets/local-api-proxy.conf <<'EOF'
proxy_pass http://127.0.0.1:8787;
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
proxy_read_timeout 300s;
proxy_send_timeout 300s;
proxy_connect_timeout 60s;
proxy_buffering off;
proxy_cache off;
proxy_hide_header Alt-Svc;
add_header Alt-Svc "clear" always;
EOF

API_SNIP=snippets/render-proxy.conf
if curl -fsS -m 3 http://127.0.0.1:8787/api/health >/dev/null 2>&1; then
  API_SNIP=snippets/local-api-proxy.conf
  echo "API upstream: local :8787"
else
  echo "API upstream: Render"
fi

TS=$(date +%s)
mkdir -p "/root/nginx-bak-restore-$TS"
cp -a /etc/nginx/sites-enabled "/root/nginx-bak-restore-$TS/" 2>/dev/null || true
cp -a /etc/nginx/sites-available "/root/nginx-bak-restore-$TS/" 2>/dev/null || true

cat >/etc/nginx/sites-available/reaktivo-sites.conf <<EOF
# restored $TS

# ── reaktivo.pro → продовый хост панели ──────────────────────────────────────
server {
    listen 80;
    listen [::]:80;
    server_name reaktivo.pro www.reaktivo.pro;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://pro.reaktivo.ru\$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name reaktivo.pro www.reaktivo.pro;
    ssl_certificate /etc/letsencrypt/live/reaktivo.pro/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/reaktivo.pro/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://pro.reaktivo.ru\$request_uri; }
}

# ── pro.reaktivo.ru (панель) ─────────────────────────────────────────────────
server {
    listen 80;
    listen [::]:80;
    server_name pro.reaktivo.ru;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://pro.reaktivo.ru\$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name pro.reaktivo.ru;
    ssl_certificate /etc/letsencrypt/live/pro.reaktivo.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pro.reaktivo.ru/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    client_max_body_size 50m;
    root /var/www/reaktivo-pro;
    index index.html;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location /api/ { include $API_SNIP; }
    location = /sb { include $API_SNIP; }
    location /sb/ { include $API_SNIP; }
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        try_files \$uri =404;
    }
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files \$uri =404;
    }
    location / { try_files \$uri \$uri/ /index.html; }
}

# ── reaktivo.ru ──────────────────────────────────────────────────────────────
server {
    listen 80;
    listen [::]:80;
    server_name reaktivo.ru www.reaktivo.ru;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://reaktivo.ru\$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name reaktivo.ru www.reaktivo.ru;
    ssl_certificate /etc/letsencrypt/live/reaktivo.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/reaktivo.ru/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    client_max_body_size 50m;
    root /var/www/reaktivo-ru;
    index index.html;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location /api/ { include $API_SNIP; }
    location = /sb { include $API_SNIP; }
    location /sb/ { include $API_SNIP; }
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        try_files \$uri =404;
    }
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files \$uri =404;
    }
    location / { try_files \$uri \$uri/ /index.html; }
}

# ── api.reaktivo.ru ──────────────────────────────────────────────────────────
server {
    listen 80;
    listen [::]:80;
    server_name api.reaktivo.ru;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://api.reaktivo.ru\$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name api.reaktivo.ru;
    ssl_certificate /etc/letsencrypt/live/$API_LIVE/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$API_LIVE/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    client_max_body_size 50m;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { include $API_SNIP; }
}
EOF

# Только наш канон в enabled
rm -f /etc/nginx/sites-enabled/*
ln -sfn /etc/nginx/sites-available/reaktivo-sites.conf /etc/nginx/sites-enabled/reaktivo-sites.conf
# default иногда нужен для acme — не трогаем если был отдельный без наших имён
if [[ -f /etc/nginx/sites-available/default ]]; then
  ln -sfn /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default || true
fi

nginx -t
systemctl reload nginx

echo
echo "=== SSL names ==="
echo | openssl s_client -servername pro.reaktivo.ru -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName 2>/dev/null | head -n 20 || true

echo
echo "=== HTTPS checks ==="
curl -sS -m 15 -o /dev/null -w "pro_health %{http_code} %{content_type}\n" https://pro.reaktivo.ru/api/health
curl -sS -m 15 https://pro.reaktivo.ru/api/health; echo
curl -sS -m 15 -o /dev/null -w "pro_index %{http_code}\n" https://pro.reaktivo.ru/
curl -sS -m 15 https://pro.reaktivo.ru/ | grep -oE 'index-[^"]+\.js' | head -1
curl -sS -m 15 -o /dev/null -w "pro_redirect %{http_code} redirect:%{redirect_url}\n" https://reaktivo.pro/pro?staff
curl -sS -m 15 -o /dev/null -w "ru_health %{http_code}\n" https://reaktivo.ru/api/health

echo
echo "OK. Панель: https://pro.reaktivo.ru/pro?staff"
echo "Бэкап: /root/nginx-bak-restore-$TS"
