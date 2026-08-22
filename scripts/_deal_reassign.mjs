/**
 * Перенос сделки с одного сотрудника на другого. Меняется только operator_id —
 * от него считается вся статистика в профиле и отчёты по сотрудникам.
 *
 * Без аргументов только показывает сотрудников и последние сделки, ничего не меняя:
 *   node scripts/_deal_reassign.mjs
 *
 * Перенос (без --yes это пробный прогон):
 *   node scripts/_deal_reassign.mjs --deal <id> --to <email|uuid> [--appraiser "ФИО"] --yes
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
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : null;
};
const has = (name) => process.argv.includes(`--${name}`);

async function rest(path, init = {}) {
  const r = await fetch(`${SB}/rest/v1${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path} → ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const users = (await (await fetch(`${SB}/auth/v1/admin/users?per_page=200`, { headers: H })).json()).users || [];
const profiles = await rest('/profiles?select=id,role,display_name&limit=200');
const label = (id) => {
  const u = users.find((x) => x.id === id);
  const p = profiles.find((x) => x.id === id);
  if (!u && !p) return id || '(никто)';
  return `${p?.display_name || u?.email || id} [${p?.role || '—'}]`;
};
const money = (v) => `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
const when = (v) => (v ? new Date(v).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) : '—');

const dealId = arg('deal');
const to = arg('to');

if (!dealId || !to) {
  console.log('=== Сотрудники ===');
  for (const u of users) {
    const p = profiles.find((x) => x.id === u.id);
    console.log(`${u.id}  ${String(u.email).padEnd(26)} ${p?.display_name || '(имя не задано)'} [${p?.role || '—'}]`);
  }

  const deals = await rest(
    '/scrap_deals?select=id,contract_no,total_rub,seller_name,appraiser_name,operator_id,created_at,source&order=created_at.desc&limit=15',
  );
  console.log('\n=== Последние сделки ===');
  for (const d of deals) {
    console.log(
      `${when(d.created_at).padEnd(20)} №${String(d.contract_no || '—').padEnd(8)} ${money(d.total_rub).padStart(13)}` +
        `  клиент: ${String(d.seller_name || '—').slice(0, 24).padEnd(24)}  оформил: ${label(d.operator_id)}`,
    );
    console.log(`   id=${d.id}   эксперт в договоре: ${d.appraiser_name || '—'}`);
  }
  console.log('\nНичего не изменено. Для переноса: --deal <id> --to <email> --yes');
  process.exit(0);
}

const target = users.find((u) => u.id === to || String(u.email).toLowerCase() === String(to).toLowerCase());
if (!target) throw new Error(`сотрудник "${to}" не найден`);

const deal = (
  await rest(`/scrap_deals?id=eq.${dealId}&select=id,contract_no,total_rub,seller_name,appraiser_name,operator_id,created_at`)
)?.[0];
if (!deal) throw new Error(`сделка ${dealId} не найдена`);

console.log('Сделка :', `№${deal.contract_no || '—'} от ${when(deal.created_at)}, ${money(deal.total_rub)}, клиент ${deal.seller_name || '—'}`);
console.log('Было   :', label(deal.operator_id));
console.log('Станет :', label(target.id));
const appraiser = arg('appraiser');
console.log(
  'Эксперт в договоре:',
  appraiser ? `${deal.appraiser_name || '—'} → ${appraiser}` : `${deal.appraiser_name || '—'} (не меняем: так напечатано в бумаге у клиента)`,
);

if (!has('yes')) {
  console.log('\nПробный прогон, база не тронута. Добавьте --yes, чтобы применить.');
  process.exit(0);
}

const patch = { operator_id: target.id };
if (appraiser) patch.appraiser_name = appraiser;
await rest(`/scrap_deals?id=eq.${dealId}`, {
  method: 'PATCH',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify(patch),
});

const after = (await rest(`/scrap_deals?id=eq.${dealId}&select=operator_id,appraiser_name`))[0];
console.log('\nГотово. Сделка теперь за:', label(after.operator_id), '| эксперт в договоре:', after.appraiser_name || '—');

console.log('\nСтатистика после переноса:');
for (const uid of [...new Set([deal.operator_id, target.id].filter(Boolean))]) {
  const list = await rest(`/scrap_deals?operator_id=eq.${uid}&select=total_rub`);
  const sum = list.reduce((s, d) => s + (Number(d.total_rub) || 0), 0);
  console.log(`  ${label(uid)}: сделок ${list.length}, сумма ${money(sum)}`);
}
