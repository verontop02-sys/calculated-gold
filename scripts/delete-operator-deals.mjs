/**
 * Удалить scrap_deals конкретного оператора. Руслана не трогает.
 * Usage:
 *   node scripts/delete-operator-deals.mjs --email-or-name "Никита"           # dry-run
 *   node scripts/delete-operator-deals.mjs --operator-id <uuid> --execute
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function loadEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[m[1]] = v;
    }
  } catch { /* ok */ }
  return out;
}
const env = loadEnv(resolve(root, 'server/.env'));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

let operatorId = argVal('--operator-id');
const needle = (argVal('--email-or-name') || 'Никита').toLowerCase();

const { data: profiles } = await sb.from('profiles').select('*').limit(100);
if (!operatorId) {
  const hit = (profiles || []).find((p) => {
    const blob = `${p.email || ''} ${p.full_name || ''} ${p.display_name || ''} ${p.name || ''}`.toLowerCase();
    return blob.includes(needle);
  });
  if (!hit) {
    console.error('Operator not found for', needle);
    console.error((profiles || []).map((p) => ({ id: p.id, full_name: p.full_name, email: p.email })));
    process.exit(1);
  }
  operatorId = hit.id;
  console.log('Matched operator:', hit.full_name || hit.email, operatorId);
}

const { data: deals, error } = await sb
  .from('scrap_deals')
  .select('id, contract_no, total_rub, seller_name, created_at, customer_id')
  .eq('operator_id', operatorId);
if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(`Found ${deals?.length || 0} deals for operator ${operatorId}`);
for (const d of deals || []) {
  console.log(` - ${d.created_at} | ${d.contract_no || '—'} | ${d.seller_name} | ${d.total_rub}₽ | ${d.id}`);
}

if (!EXECUTE) {
  console.log('\nDry-run. Add --execute to delete these deals only.');
  process.exit(0);
}

const ids = (deals || []).map((d) => d.id);
if (!ids.length) {
  console.log('Nothing to delete.');
  process.exit(0);
}

const { error: delErr, count } = await sb.from('scrap_deals').delete({ count: 'exact' }).in('id', ids);
if (delErr) {
  console.error('Delete failed:', delErr.message);
  process.exit(1);
}
console.log(`Deleted ${count ?? ids.length} deals. Ruslan's deals untouched.`);
