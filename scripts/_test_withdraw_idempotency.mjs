/**
 * Проверка защиты вывода средств от повторного ключа идемпотентности.
 * Supabase подменён заглушкой — реальная база не участвует.
 *
 * Запуск: node scripts/_test_withdraw_idempotency.mjs
 */
import { requestWithdrawal } from '../server/fintechWithdrawals.js';

const CLIENT_ID = '11111111-1111-1111-1111-111111111111';
const LEDGER_ENTRY_ID = '22222222-2222-2222-2222-222222222222';

let ledgerCalls = 0;
let inserts = 0;
const requestsTable = [];

/** Минимальная заглушка supabase-js: только то, что дёргает requestWithdrawal. */
function makeSupabase() {
  const usedKeys = new Set();

  function selectBuilder(table, rows) {
    const filters = {};
    const api = {
      eq(col, val) { filters[col] = val; return api; },
      order() { return api; },
      limit() { return api; },
      async maybeSingle() {
        const found = rows.find((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
        return { data: found || null, error: null };
      },
      async single() {
        const found = rows.find((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
        return { data: found || null, error: found ? null : { message: 'not found' } };
      },
    };
    return api;
  }

  return {
    async rpc(fn, params) {
      if (fn !== 'fintech_record_ledger_entry') throw new Error(`unexpected rpc ${fn}`);
      ledgerCalls += 1;
      const dup = usedKeys.has(params.p_idempotency_key);
      usedKeys.add(params.p_idempotency_key);
      return {
        data: [{
          entry_id: LEDGER_ENTRY_ID,
          rub_balance: dup ? 5000 : 5000,
          gold_grams: 0,
          is_duplicate: dup,
        }],
        error: null,
      };
    },
    from(table) {
      if (table === 'fintech_clients') {
        return {
          select: () => selectBuilder(table, [{
            id: CLIENT_ID,
            status: 'approved',
            email: 'test@example.invalid',
            full_name: 'Тестовый Клиент',
            phone_normalized: '9990000000',
          }]),
        };
      }
      if (table === 'fintech_settings') {
        return { select: () => selectBuilder(table, []) };
      }
      if (table === 'fintech_withdrawal_requests') {
        return {
          select: () => selectBuilder(table, requestsTable),
          insert(row) {
            inserts += 1;
            const created = {
              id: `req-${inserts}`,
              client_id: row.client_id,
              rub_amount: row.rub_amount,
              fee_rub: row.fee_rub,
              net_rub: row.net_rub,
              payout_details: row.payout_details,
              status: row.status,
              reject_reason: null,
              decided_at: null,
              ledger_entry_id: row.ledger_entry_id,
              created_at: new Date().toISOString(),
            };
            requestsTable.push(created);
            return {
              select: () => ({
                async single() { return { data: created, error: null }; },
                async maybeSingle() { return { data: created, error: null }; },
              }),
            };
          },
        };
      }
      return { select: () => selectBuilder(table, []) };
    },
  };
}

const supabase = makeSupabase();
const payload = {
  clientId: CLIENT_ID,
  rubAmount: 5000,
  payoutMethod: 'sbp',
  sbpPhone: '79990000000',
  recipientName: 'Тестовый Клиент',
  idempotencyKey: 'ОДИН-И-ТОТ-ЖЕ-КЛЮЧ',
};

const first = await requestWithdrawal(supabase, payload);
const second = await requestWithdrawal(supabase, payload);
const third = await requestWithdrawal(supabase, payload);

console.log('вызовов ledger RPC:      ', ledgerCalls, '(ожидаем 3 — RPC зовём каждый раз)');
console.log('создано заявок в таблице:', inserts, '(ожидаем 1)');
console.log('id заявок:               ', first.request.id, second.request.id, third.request.id);
console.log('пометка duplicate:       ', first.duplicate ?? false, second.duplicate, third.duplicate);

const ok = inserts === 1
  && first.request.id === second.request.id
  && second.request.id === third.request.id
  && second.duplicate === true;

if (!ok) {
  console.error('\nПРОВАЛ: повторный ключ всё ещё создаёт лишние заявки на выплату.');
  process.exit(1);
}
console.log('\nОК: одно списание — одна заявка на выплату. Повтор ключа денег не задваивает.');
