#!/bin/bash
# Вставить на VPS целиком (root). Ничего не ломает — только смотрит.
set -euo pipefail

echo "=== www ==="
ls -la /var/www 2>/dev/null || true

echo
echo "=== nginx api proxy ==="
grep -RInE 'render-proxy|local-api-proxy|onrender|127\.0\.0\.1:8787|location /api' \
  /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/snippets 2>/dev/null | head -n 80 || true

echo
echo "=== local node :8787 ==="
curl -sS -m 5 http://127.0.0.1:8787/api/health && echo || echo "DOWN (ожидаемо, если API только на Render)"

echo
echo "=== systemd ==="
systemctl is-active nginx 2>/dev/null || true
systemctl is-active reaktivo-api 2>/dev/null || echo "reaktivo-api: нет"

echo
echo "=== health через nginx (Host) ==="
for h in reaktivo.pro pro.reaktivo.ru reaktivo.ru api.reaktivo.ru; do
  code=$(curl -sS -m 8 -o /tmp/h.json -w '%{http_code}' -H "Host: $h" http://127.0.0.1/api/health || echo fail)
  echo -n "$h → $code "
  head -c 120 /tmp/h.json 2>/dev/null | tr '\n' ' '
  echo
done

echo
echo "=== снаружи ==="
for u in \
  https://pro.reaktivo.ru/api/health \
  https://reaktivo.ru/api/health \
  https://api.reaktivo.ru/api/health \
  https://reaktivo.pro/api/health
do
  echo -n "$u → "
  curl -sS -m 15 -o /tmp/o.json -w '%{http_code} %{content_type}\n' "$u" || echo FAIL
  head -c 100 /tmp/o.json 2>/dev/null; echo
done

echo
echo "=== репо ==="
ls -d /opt/reaktivo/src /root/calculated-gold /tmp/reaktivo-site-dist 2>/dev/null || echo "исходников не найдено"
