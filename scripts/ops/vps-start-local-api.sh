#!/bin/bash
# Поднимает Node API на VPS (обход Cloudflare/Render) и переключает nginx на :8787.
# USAGE (root):
#   # сначала положи секреты:
#   #   nano /opt/reaktivo/src/server/.env
#   # или:  mv /tmp/reaktivo.env /opt/reaktivo/src/server/.env
#   bash scripts/ops/vps-start-local-api.sh
set -euo pipefail

REPO="${REPO:-/opt/reaktivo/src}"
NODE_MAJOR="${NODE_MAJOR:-20}"
GIT_URL="${GIT_URL:-https://github.com/verontop02-sys/calculated-gold.git}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates nginx git rsync openssl

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//;s/\..*//')" -lt "$NODE_MAJOR" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

mkdir -p /opt/reaktivo /var/www/reaktivo-pro /var/www/reaktivo-ru /etc/nginx/snippets /etc/nginx/conf.d

if [[ ! -d "$REPO/.git" ]]; then
  rm -rf "$REPO"
  git clone --depth 1 -b main "$GIT_URL" "$REPO"
else
  git -C "$REPO" fetch --depth 1 origin main
  git -C "$REPO" checkout -f main
  git -C "$REPO" reset --hard origin/main
fi

# .env мог положить заранее в /tmp
if [[ -f /tmp/reaktivo.env && ! -f "$REPO/server/.env" ]]; then
  install -m 600 /tmp/reaktivo.env "$REPO/server/.env"
  shred -u /tmp/reaktivo.env 2>/dev/null || rm -f /tmp/reaktivo.env
fi

if [[ ! -f "$REPO/server/.env" ]]; then
  echo "FAIL: нет $REPO/server/.env"
  echo "С локальной машины:"
  echo "  scp server/.env root@IP:/tmp/reaktivo.env"
  echo "Потом снова: bash $REPO/scripts/ops/vps-start-local-api.sh"
  exit 1
fi

grep -q '^PORT=' "$REPO/server/.env" || echo 'PORT=8787' >>"$REPO/server/.env"
grep -q '^NODE_ENV=' "$REPO/server/.env" || echo 'NODE_ENV=production' >>"$REPO/server/.env"
grep -q '^PUBLIC_APP_ORIGIN=' "$REPO/server/.env" \
  || echo 'PUBLIC_APP_ORIGIN=https://pro.reaktivo.ru' >>"$REPO/server/.env"
chmod 600 "$REPO/server/.env"

cd "$REPO"
npm install --omit=dev

mkdir -p /etc/nginx/conf.d
cat >/etc/nginx/conf.d/00-websocket-map.conf <<'EOF'
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
EOF

install -m 0644 "$REPO/scripts/nginx/local-api-proxy.conf" /etc/nginx/snippets/local-api-proxy.conf
install -m 0644 "$REPO/scripts/nginx/render-proxy.conf" /etc/nginx/snippets/render-proxy.conf
install -m 0644 "$REPO/scripts/systemd/reaktivo-api.service" /etc/systemd/system/reaktivo-api.service

chown -R www-data:www-data "$REPO"
chmod 600 "$REPO/server/.env"

systemctl daemon-reload
systemctl enable reaktivo-api
systemctl restart reaktivo-api
sleep 3
systemctl --no-pager --full status reaktivo-api | head -n 30

echo "=== local health ==="
curl -fsS -m 15 http://127.0.0.1:8787/api/health
echo

# Канон vhost'ов (теперь local API жив → restore выберет local-api-proxy)
bash "$REPO/scripts/ops/vps-restore-sites-now.sh"

# На всякий случай ещё раз форсим local
sed -i 's|snippets/render-proxy.conf|snippets/local-api-proxy.conf|g' /etc/nginx/sites-available/reaktivo-sites.conf || true
nginx -t
systemctl reload nginx

echo "=== via nginx ==="
curl -sS -m 15 -H 'Host: pro.reaktivo.ru' http://127.0.0.1/api/health; echo
curl -sS -m 15 https://pro.reaktivo.ru/api/health; echo
curl -sS -m 15 -o /dev/null -w "site-visits %{http_code} %{content_type}\n" \
  "https://pro.reaktivo.ru/api/site-visits?from=2026-10-01&to=2026-11-02"

echo
echo "OK. Панель: https://pro.reaktivo.ru/pro?staff → Посещаемость"
