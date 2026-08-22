/**
 * Применяет миграции безопасности через Supabase Management API и проверяет результат.
 * Запуск: node scripts/_apply_security_migrations.mjs
 */
import fs from 'node:fs';

const readEnv = (p) => {
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:VITE_)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
};
const env = { ...readEnv('client/.env.production'), ...readEnv('server/.env') };
const SB = String(env.SUPABASE_URL || '').replace(/\/$/, '');
const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.SUPABASE_ANON_KEY;
const PAT = process.env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN || '';
const REF = (SB.match(/https:\/\/([a-z0-9]+)\.supabase\./) || [])[1];

const files = [
  'supabase/migrations/20260822130000_withdrawal_one_request_per_ledger_entry.sql',
  'supabase/migrations/20260822143000_deal_photos_private.sql',
  'supabase/migrations/20260822144000_revoke_claim_first_admin.sql',
];

if (!PAT) {
  console.log('Нет SUPABASE_ACCESS_TOKEN — SQL через API не выполнить.');
  console.log('Выполните эти файлы в SQL-редакторе Supabase:');
  for (const f of files) console.log('  -', f);
} else {
  for (const f of files) {
    const sql = fs.readFileSync(f, 'utf8');
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    });
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${f} → ${r.status}`);
    if (!r.ok) console.log('   ', (await r.text()).slice(0, 300));
  }
}

console.log('\n=== Контрольные проверки ===');

const list = await fetch(`${SB}/storage/v1/object/list/deal-photos`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ prefix: '', limit: 10, offset: 0 }),
});
console.log(`anon перечисляет фото сделок: ${list.status} ${list.ok ? '<<< ВСЁ ЕЩЁ ОТКРЫТО' : 'закрыто'}`);

const rpc = await fetch(`${SB}/rest/v1/rpc/claim_first_admin`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ uid: '00000000-0000-0000-0000-000000000000' }),
});
console.log(`anon вызывает claim_first_admin: ${rpc.status} ${rpc.ok ? '<<< ВСЁ ЕЩЁ ОТКРЫТО' : 'закрыто'}`);

const idx = await fetch(
  `${SB}/rest/v1/fintech_withdrawal_requests?select=id&limit=1`,
  { headers: { apikey: SRV, Authorization: `Bearer ${SRV}` } },
);
console.log(`таблица заявок на вывод читается сервером: ${idx.status}`);
