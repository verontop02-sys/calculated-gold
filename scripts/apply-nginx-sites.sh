#!/bin/bash
# Накатить каноничный reaktivo-sites.conf из репо.
# ВНИМАНИЕ: файл из репо ожидает уже выпущенные сертификаты Let's Encrypt.
# На VPS A серты уже есть. На VPS B — сначала checklist (копия или DNS-01).
set -euo pipefail
REPO="${REPO:-/opt/reaktivo/src}"
install -m 0644 "$REPO/scripts/nginx/local-api-proxy.conf" /etc/nginx/snippets/local-api-proxy.conf
install -m 0644 "$REPO/scripts/nginx/reaktivo-sites.conf" /etc/nginx/sites-available/reaktivo-sites
ln -sfn /etc/nginx/sites-available/reaktivo-sites /etc/nginx/sites-enabled/reaktivo-sites
# убрать bootstrap, если был
rm -f /etc/nginx/sites-enabled/reaktivo-http-bootstrap
nginx -t
systemctl reload nginx
echo "nginx sites applied"
