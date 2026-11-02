#!/bin/bash
# reaktivo.pro → https://pro.reaktivo.ru (панель и API там стабильны)
# Вставить на VPS одним блоком.
set -euo pipefail

mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /root
TS=$(date +%s)
cp -a /etc/nginx/sites-enabled "/root/nginx-enabled-bak-$TS" 2>/dev/null || true

# Серты
PRO_CERT=/etc/letsencrypt/live/reaktivo.pro/fullchain.pem
PRO_KEY=/etc/letsencrypt/live/reaktivo.pro/privkey.pem
if [[ ! -f "$PRO_CERT" ]]; then
  echo "FAIL: нет $PRO_CERT"
  ls -la /etc/letsencrypt/live/ || true
  exit 1
fi

cat >/etc/nginx/sites-available/reaktivo-pro-redirect.conf <<EOF
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
    ssl_certificate $PRO_CERT;
    ssl_certificate_key $PRO_KEY;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://pro.reaktivo.ru\$request_uri; }
}
EOF

ln -sfn /etc/nginx/sites-available/reaktivo-pro-redirect.conf /etc/nginx/sites-enabled/reaktivo-pro-redirect.conf

# Убрать из enabled дубли server_name reaktivo.pro (кроме нашего redirect)
for f in /etc/nginx/sites-enabled/*; do
  base=$(basename "$f")
  [[ "$base" == "reaktivo-pro-redirect.conf" ]] && continue
  if grep -qE 'server_name[[:space:]]+.*reaktivo\.pro' "$f" 2>/dev/null; then
    echo "disable conflicting $f"
    rm -f "$f"
  fi
done

nginx -t
systemctl reload nginx

echo "=== check ==="
curl -sSI -m 15 https://reaktivo.pro/pro?staff | head -n 15 || true
echo
curl -sS -m 10 https://pro.reaktivo.ru/api/health
echo
echo "OK: reaktivo.pro → pro.reaktivo.ru"
