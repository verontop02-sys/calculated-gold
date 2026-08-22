/**
 * Проверка того, что импорт изделий из localStorage нельзя подделать:
 * принимается только позиция с подтверждённым платежом в ledger, цена берётся из ledger.
 * Supabase подменён заглушкой — реальная база не участвует.
 *
 * Запуск: node scripts/_test_jewelry_sync.mjs
 */
import { syncClientJewelryOrders } from '../server/jewelryOrders.js';

const CLIENT_ID = '11111111-1111-1111-1111-111111111111';

// В ledger есть только один реальный платёж на 90 000 ₽.
const LEDGER = [
  {
    idempotency_key: 'yookassa:pay-real-001',
    rub_delta: 90000,
    created_at: '2026-08-01T10:00:00.000Z',
  },
];

const written = [];

function makeSupabase() {
  return {
    from(table) {
      if (table === 'fintech_ledger_entries') {
        const f = {};
        const api = {
          select() { return api; },
          eq(col, val) { f[col] = val; return api; },
          in(col, vals) { f[col] = vals; return Promise.resolve({ data: LEDGER.filter((e) => vals.includes(e.idempotency_key)), error: null }); },
        };
        return api;
      }
      if (table === 'fintech_jewelry_orders') {
        return {
          select() {
            const api = {
              eq() { return api; },
              is() { return api; },
              limit() { return api; },
              async maybeSingle() { return { data: null, error: null }; },
            };
            return api;
          },
          upsert(row) {
            written.push(row);
            return {
              select: () => ({ async maybeSingle() { return { data: { id: `j-${written.length}`, ...row }, error: null }; } }),
            };
          },
          insert(row) {
            written.push(row);
            return {
              select: () => ({ async maybeSingle() { return { data: { id: `j-${written.length}`, ...row }, error: null }; } }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const rows = [
  // Настоящая покупка: платёж есть в ledger. Цену клиент занизил — сервер должен взять свою.
  { catalogId: 'ring-01', title: 'Кольцо 585', assay: 585, weightG: 3.2, priceRub: 1, paymentId: 'pay-real-001', status: 'issued' },
  // Подделка: платежа нет.
  { catalogId: 'bar-100', title: 'Слиток 100 г', assay: 999, weightG: 100, priceRub: 1000000, paymentId: 'pay-fake-999' },
  // Подделка: вообще без платежа.
  { catalogId: 'bar-500', title: 'Слиток 500 г', assay: 999, weightG: 500, priceRub: 5000000 },
];

const out = await syncClientJewelryOrders(makeSupabase(), { clientId: CLIENT_ID, rows });

console.log('принято позиций:', out.saved, '(ожидаем 1)');
console.log('отброшено:      ', out.skipped, '(ожидаем 2)');
console.log('записано в БД:  ', JSON.stringify(written.map((w) => ({ title: w.title, price: w.price_rub, status: w.status })), null, 0));

const ok = out.saved === 1
  && written.length === 1
  && written[0].title === 'Кольцо 585'
  && Number(written[0].price_rub) === 90000
  && written[0].status === 'stored';

if (!ok) {
  console.error('\nПРОВАЛ: неоплаченное изделие проходит, либо цена/статус берутся из запроса клиента.');
  process.exit(1);
}
console.log('\nОК: без подтверждённого платежа изделие не засчитывается, цена и статус берутся с сервера.');
