#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
test -f "$ROOT/dist/index.html"
test -f "$ROOT/dist-ru/index.html"
mkdir -p /etc/nginx/snippets /var/www
rm -rf /var/www/reaktivo-pro /var/www/reaktivo-ru
mv "$ROOT/dist" /var/www/reaktivo-pro
mv "$ROOT/dist-ru" /var/www/reaktivo-ru
install -m 644 "$ROOT/render-proxy.conf" /etc/nginx/snippets/render-proxy.conf
install -m 644 "$ROOT/reaktivo-sites.conf" /etc/nginx/sites-available/reaktivo-sites
ln -sfn /etc/nginx/sites-available/reaktivo-sites /etc/nginx/sites-enabled/reaktivo-sites
nginx -t
systemctl reload nginx
echo '=== pro ==='
curl -sS -m 15 -o /tmp/pro.html -H 'Host: reaktivo.pro' http://127.0.0.1/
grep -o '<title>[^<]*' /tmp/pro.html
echo '=== pro asset ==='
curl -sS -m 15 -o /dev/null -w 'asset:%{http_code}\n' -H 'Host: reaktivo.pro' http://127.0.0.1/logo-reaktivo-mark.svg
echo '=== pro spa ==='
curl -sS -m 15 -o /dev/null -w 'spa:%{http_code}\n' -H 'Host: reaktivo.pro' http://127.0.0.1/pro
echo '=== ru ==='
curl -sS -m 15 -o /tmp/ru.html -H 'Host: reaktivo.ru' http://127.0.0.1/
grep -o '<title>[^<]*' /tmp/ru.html
echo '=== api ==='
curl -skS -m 20 -o /dev/null -w 'api:%{http_code}\n' --resolve api.reaktivo.pro:443:127.0.0.1 https://api.reaktivo.pro/api/health
echo DONE
