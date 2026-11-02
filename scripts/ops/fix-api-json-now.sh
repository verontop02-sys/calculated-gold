#!/bin/bash
# На VPS (root): починить /api → JSON для панели (Посещаемость и остальное).
# USAGE: bash scripts/ops/fix-api-json-now.sh
set -euo pipefail

echo "=== 1. Куда сейчас смотрит nginx /api ==="
grep -RInE 'render-proxy|local-api-proxy|onrender|127\.0\.0\.1:8787' \
  /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/snippets 2>/dev/null | head -n 60 || true

echo
echo "=== 2. Локальный Node ==="
systemctl is-active reaktivo-api 2>/dev/null || echo "reaktivo-api: not active"
curl -sS -m 5 http://127.0.0.1:8787/api/health && echo || echo "local :8787 DOWN"

echo
echo "=== 3. Через nginx (Host) ==="
for h in reaktivo.pro pro.reaktivo.ru reaktivo.ru api.reaktivo.ru; do
  code=$(curl -sS -m 10 -o /tmp/api-h.json -w '%{http_code}' -H "Host: $h" http://127.0.0.1/api/health || echo fail)
  ct=$(file -b --mime-type /tmp/api-h.json 2>/dev/null || echo '?')
  echo "$h → $code $ct $(head -c 80 /tmp/api-h.json 2>/dev/null | tr '\n' ' ')"
done

SNIP_LOCAL=/etc/nginx/snippets/local-api-proxy.conf
SNIP_RENDER=/etc/nginx/snippets/render-proxy.conf
REPO="${REPO:-/opt/reaktivo/src}"

if [[ -f "$REPO/scripts/nginx/local-api-proxy.conf" ]]; then
  install -m 0644 "$REPO/scripts/nginx/local-api-proxy.conf" "$SNIP_LOCAL"
fi
if [[ -f "$REPO/scripts/nginx/render-proxy.conf" ]]; then
  install -m 0644 "$REPO/scripts/nginx/render-proxy.conf" "$SNIP_RENDER"
fi

USE_LOCAL=0
if curl -fsS -m 5 http://127.0.0.1:8787/api/health >/dev/null 2>&1; then
  USE_LOCAL=1
  echo
  echo "=== 4. Локальный API жив → переключаем nginx на local-api-proxy ==="
else
  echo
  echo "=== 4. Локальный API мёртв ==="
  if [[ -f "$REPO/server/.env" ]]; then
    echo "Есть server/.env — поднимаем reaktivo-api…"
    install -m 0644 "$REPO/scripts/systemd/reaktivo-api.service" /etc/systemd/system/reaktivo-api.service
    systemctl daemon-reload
    systemctl enable reaktivo-api
    systemctl restart reaktivo-api
    sleep 2
    if curl -fsS -m 10 http://127.0.0.1:8787/api/health; then
      echo
      USE_LOCAL=1
    else
      echo "Не поднялся. Оставляем Render-прокси, чиним только include."
      systemctl --no-pager --full status reaktivo-api | head -n 40 || true
    fi
  else
    echo "Нет $REPO/server/.env — локальный API без секретов не поднять. Держим Render."
  fi
fi

TARGET_SNIP="snippets/render-proxy.conf"
if [[ "$USE_LOCAL" = "1" ]]; then
  TARGET_SNIP="snippets/local-api-proxy.conf"
fi

shopt -s nullglob
for f in /etc/nginx/sites-available/* /etc/nginx/sites-enabled/*; do
  [[ -f "$f" ]] || continue
  [[ -L "$f" ]] && continue
  if grep -qE 'render-proxy|local-api-proxy|calculated-gold\.onrender\.com|127\.0\.0\.1:8787' "$f"; then
    cp -a "$f" "${f}.bak-fixapi-$(date +%s)"
    sed -i 's|snippets/render-proxy.conf|'"$TARGET_SNIP"'|g' "$f"
    sed -i 's|snippets/local-api-proxy.conf|'"$TARGET_SNIP"'|g' "$f"
    if [[ "$USE_LOCAL" = "1" ]]; then
      sed -i 's|proxy_pass https://calculated-gold.onrender.com|proxy_pass http://127.0.0.1:8787|g' "$f"
      sed -i 's|proxy_set_header Host calculated-gold.onrender.com|proxy_set_header Host $host|g' "$f"
    fi
    echo "patched $f → $TARGET_SNIP"
  fi
done

nginx -t
systemctl reload nginx

echo
echo "=== 5. Проверка снаружи с этой машины ==="
for url in \
  https://pro.reaktivo.ru/api/health \
  https://reaktivo.ru/api/health \
  https://api.reaktivo.ru/api/health \
  https://reaktivo.pro/api/health
do
  echo -n "$url → "
  curl -sS -m 15 -o /tmp/out.json -w '%{http_code} %{content_type}\n' "$url" || echo FAIL
  head -c 100 /tmp/out.json 2>/dev/null; echo
done

echo
echo "=== 6. Быстрый рестарт API из репо (подхватит /api/site-visits) ==="
if [[ -f "$REPO/server/index.js" && -f "$REPO/server/.env" ]]; then
  systemctl restart reaktivo-api || true
  sleep 2
  curl -sS -m 10 -o /dev/null -w "local_site_visits %{http_code}\n" \
    "http://127.0.0.1:8787/api/site-visits?from=2026-10-01&to=2026-11-02" || true
fi

echo
echo "Готово. Руслану: https://pro.reaktivo.ru → Посещаемость → Обновить (лучше без блокировщика на этом сайте)."
