/**
 * Smoke-test: создать тестовый платёж ЮKassa на 10 ₽ (без зачисления).
 * node scripts/yookassa-smoke.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnv(p) {
  const o = {};
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    o[m[1]] = v;
  }
  return o;
}
const env = loadEnv(resolve(__dirname, '../server/.env'));
const shopId = env.YOOKASSA_SHOP_ID;
const secret = env.YOOKASSA_SECRET_KEY;
if (!shopId || !secret) {
  console.error('Missing YOOKASSA_* in server/.env');
  process.exit(1);
}
const auth = Buffer.from(`${shopId}:${secret}`).toString('base64');
const body = {
  amount: { value: '10.00', currency: 'RUB' },
  capture: true,
  confirmation: { type: 'redirect', return_url: 'https://reaktivo.pro/kabinet?topup=1' },
  description: 'Smoke test Reaktivo topup',
  metadata: { purpose: 'fintech_topup', clientId: '00000000-0000-0000-0000-000000000000', rubAmount: '10.00' },
};
const res = await fetch('https://api.yookassa.ru/v3/payments', {
  method: 'POST',
  headers: {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/json',
    'Idempotence-Key': crypto.randomUUID(),
  },
  body: JSON.stringify(body),
});
const data = await res.json();
console.log('status', res.status);
console.log('payment', data.id, data.status, data.test);
console.log('url', data.confirmation?.confirmation_url || data.description || data);
if (!res.ok) process.exit(1);
