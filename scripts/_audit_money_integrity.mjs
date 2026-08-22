/**
 * Разовая сверка целостности денег fintech-кабинета. Только чтение.
 * Запуск: node scripts/_audit_money_integrity.mjs
 */
import fs from 'node:fs';

const env = {};
for (const line of fs.readFileSync('server/.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const BASE = String(env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) {
  console.error('Нет SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY в server/.env');
  process.exit(1);
}
console.log('project host:', new URL(BASE).host);

async function q(path) {
  const r = await fetch(`${BASE}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const wr = await q('fintech_withdrawal_requests?select=id,client_id,rub_amount,status,ledger_entry_id,refund_ledger_entry_id,created_at&order=created_at.desc&limit=2000');
console.log('\n=== Заявки на вывод ===');
console.log('всего:', wr.length);
const byStatus = {};
for (const r of wr) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
console.log('по статусам:', JSON.stringify(byStatus));

const seen = new Map();
const dupes = [];
for (const r of wr) {
  if (!r.ledger_entry_id) continue;
  if (seen.has(r.ledger_entry_id)) dupes.push(r);
  else seen.set(r.ledger_entry_id, r);
}
console.log('дубли (одно списание → несколько заявок):', dupes.length);
for (const d of dupes) console.log('  ', d.id, d.rub_amount, d.status, d.created_at);

const noLedger = wr.filter((r) => !r.ledger_entry_id);
console.log('заявки без списания (ledger_entry_id пуст):', noLedger.length);
for (const d of noLedger) console.log('  ', d.id, d.rub_amount, d.status, d.created_at);

const paidSum = wr.filter((r) => r.status === 'paid').reduce((s, r) => s + Number(r.rub_amount), 0);
const pendingSum = wr.filter((r) => r.status === 'pending' || r.status === 'approved').reduce((s, r) => s + Number(r.rub_amount), 0);
console.log('выплачено всего, ₽:', paidSum.toFixed(2), '| висит в открытых заявках, ₽:', pendingSum.toFixed(2));

console.log('\n=== Сверка баланса против ledger ===');
const bal = await q('fintech_balances?select=client_id,rub_balance,gold_grams&limit=2000');
const led = await q('fintech_ledger_entries?select=client_id,entry_type,rub_delta,gold_grams_delta&limit=20000');
console.log('клиентов с балансом:', bal.length, '| записей ledger:', led.length);

const sum = new Map();
const types = {};
for (const e of led) {
  types[e.entry_type] = (types[e.entry_type] || 0) + 1;
  const s = sum.get(e.client_id) || { r: 0, g: 0 };
  s.r += Number(e.rub_delta);
  s.g += Number(e.gold_grams_delta);
  sum.set(e.client_id, s);
}
console.log('типы записей:', JSON.stringify(types));

let mismatch = 0;
let negative = 0;
for (const b of bal) {
  const s = sum.get(b.client_id) || { r: 0, g: 0 };
  if (Math.abs(Number(b.rub_balance) - s.r) > 0.01 || Math.abs(Number(b.gold_grams) - s.g) > 0.000001) {
    mismatch += 1;
    console.log('  РАСХОЖДЕНИЕ', b.client_id, '| руб', Number(b.rub_balance), 'vs', s.r.toFixed(2), '| золото', Number(b.gold_grams), 'vs', s.g.toFixed(6));
  }
  if (Number(b.rub_balance) < -0.005 || Number(b.gold_grams) < -0.000001) {
    negative += 1;
    console.log('  ОТРИЦАТЕЛЬНЫЙ БАЛАНС', b.client_id, b.rub_balance, b.gold_grams);
  }
}
console.log('расхождений баланс/ledger:', mismatch, '| отрицательных балансов:', negative);

const orphan = [...sum.keys()].filter((cid) => !bal.some((b) => b.client_id === cid));
console.log('клиентов с ledger но без строки баланса:', orphan.length);
