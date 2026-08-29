/**
 * Применяет supabase/migrations/20260830010000_landing_leads.sql через Management API
 * и проверяет, что таблица доступна service_role. Запуск: scripts/_apply_leads_migration.ps1
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
const env = readEnv('server/.env');
const SB = String(env.SUPABASE_URL || '').replace(/\/$/, '');
const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
const REF = (SB.match(/https:\/\/([a-z0-9]+)\.supabase\./) || [])[1];
const PAT = process.env.SUPABASE_ACCESS_TOKEN;

if (!PAT || !REF) {
  console.error('Нет SUPABASE_ACCESS_TOKEN или project ref');
  process.exit(1);
}

const runSql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return r;
};

const sql = fs.readFileSync('supabase/migrations/20260830010000_landing_leads.sql', 'utf8');
const r = await runSql(sql);
console.log(`${r.ok ? 'OK  ' : 'FAIL'} миграция landing_leads → ${r.status}`);
if (!r.ok) {
  console.error((await r.text()).slice(0, 500));
  process.exit(1);
}

// PostgREST кэширует схему — просим перечитать и ждём.
await runSql("notify pgrst, 'reload schema';");

let ok = false;
for (let i = 0; i < 10 && !ok; i++) {
  await new Promise((res) => setTimeout(res, 2000));
  const srv = await fetch(`${SB}/rest/v1/landing_leads?select=id&limit=1`, {
    headers: { apikey: SRV, Authorization: `Bearer ${SRV}` },
  });
  ok = srv.ok;
  console.log(`service_role читает landing_leads: ${srv.status}${ok ? ' ok' : ' …ждём кэш схемы'}`);
}
process.exit(ok ? 0 : 1);
