/**
 * Smoke-test ЮKassa: обычный topup + create с save_payment_method (без оплаты).
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

async function createPayment(body, label) {
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
  console.log(`[${label}] status`, res.status);
  console.log(`[${label}] payment`, data.id, data.status, data.test, 'save=', data.payment_method?.saved ?? body.save_payment_method);
  console.log(`[${label}] url`, data.confirmation?.confirmation_url || data.description || data);
  if (!res.ok) {
    console.error(data);
    process.exit(1);
  }
  return data;
}

await createPayment({
  amount: { value: '10.00', currency: 'RUB' },
  capture: true,
  confirmation: { type: 'redirect', return_url: 'https://reaktivo.pro/kabinet?invest=1&topup=1' },
  description: 'Smoke test Reaktivo topup',
  metadata: { purpose: 'fintech_topup', clientId: '00000000-0000-0000-0000-000000000000', rubAmount: '10.00' },
}, 'topup');

await createPayment({
  amount: { value: '10.00', currency: 'RUB' },
  capture: true,
  save_payment_method: true,
  confirmation: { type: 'redirect', return_url: 'https://reaktivo.pro/kabinet?invest=1&bind=1' },
  description: 'Smoke test Reaktivo bind card',
  metadata: {
    purpose: 'fintech_bind',
    clientId: '00000000-0000-0000-0000-000000000000',
    rubAmount: '10.00',
    savePaymentMethod: '1',
  },
}, 'bind');

console.log('OK both create payments');
