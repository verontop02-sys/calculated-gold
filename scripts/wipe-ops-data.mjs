/**
 * Обнуление операционных данных перед стартом «чистого» рабочего режима.
 * НЕ трогает: gold_index_cities / competitors / changes, app_kv (настройки/курс),
 * profiles админов.
 *
 * Usage:
 *   node scripts/wipe-ops-data.mjs           # dry-run (counts only)
 *   node scripts/wipe-ops-data.mjs --execute # irreversible wipe
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

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
  } catch { /* missing file ok */ }
  return out;
}

const env = { ...loadEnv(resolve(root, '.env')), ...loadEnv(resolve(root, 'server/.env')) };
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const EXECUTE = process.argv.includes('--execute');

/** Tables wiped in FK-safe order (children first). Gold index tables intentionally omitted. */
const WIPE_TABLES = [
  'fintech_recurring_runs',
  'fintech_price_alerts',
  'fintech_withdrawal_requests',
  'fintech_ledger_entries',
  'fintech_recurring_investments',
  'fintech_balances',
  'fintech_kyc_documents',
  'fintech_clients',
  'support_messages',
  'support_threads',
  'field_deal_audit_events',
  'field_deal_sessions',
  'scrap_deals',
  'scrap_customers',
  'panel_login_events',
  'panel_trusted_devices',
];

const KEEP_NOTE = [
  'gold_index_cities',
  'gold_index_competitors',
  'gold_index_changes',
  'app_kv (settings / gold_price / fintech_settings — OTP keys cleaned separately)',
  'profiles + auth.users (listed below; non-admin cleanup is opt-in)',
];

async function countTable(name) {
  const { count, error } = await supabase.from(name).select('*', { count: 'exact', head: true });
  if (error) return { name, error: error.message, count: null };
  return { name, count: count ?? 0 };
}

async function deleteAll(name) {
  // PostgREST requires a filter. Most tables use uuid `id`; fintech_balances uses `client_id`.
  const pk = name === 'fintech_balances' ? 'client_id' : 'id';
  const { error, count } = await supabase
    .from(name)
    .delete({ count: 'exact' })
    .neq(pk, '00000000-0000-0000-0000-000000000000');
  if (error) {
    const retry = await supabase.from(name).delete({ count: 'exact' }).gte('created_at', '1970-01-01');
    if (retry.error) throw new Error(`${name}: ${error.message} / retry: ${retry.error.message}`);
    return retry.count ?? 0;
  }
  return count ?? 0;
}

async function listStorage(bucket) {
  const all = [];
  async function walk(prefix = '') {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) throw error;
    for (const item of data || []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      // folders have null id / metadata in some API versions
      if (item.id == null && !item.metadata) {
        await walk(path);
      } else {
        all.push(path);
      }
    }
  }
  try {
    await walk('');
  } catch (e) {
    console.warn(`  storage ${bucket}: ${e.message || e}`);
  }
  return all;
}

async function wipeStorage(bucket) {
  const paths = await listStorage(bucket);
  if (!paths.length) return 0;
  // remove in chunks
  let removed = 0;
  for (let i = 0; i < paths.length; i += 50) {
    const chunk = paths.slice(i, i + 50);
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) console.warn(`  storage remove ${bucket}:`, error.message);
    else removed += chunk.length;
  }
  return removed;
}

async function cleanOtpKv() {
  const { data, error } = await supabase.from('app_kv').select('key');
  if (error) throw error;
  const otpKeys = (data || [])
    .map((r) => r.key)
    .filter((k) => /^(client_otp:|fintech_otp:|panel_device_otp:|fintech_session:|client_session:)/.test(String(k)));
  if (!EXECUTE) return otpKeys.length;
  for (const k of otpKeys) {
    const { error: delErr } = await supabase.from('app_kv').delete().eq('key', k);
    if (delErr) console.warn('  kv delete', k, delErr.message);
  }
  return otpKeys.length;
}

async function listProfiles() {
  const { data, error } = await supabase.from('profiles').select('id, role, display_name, updated_at');
  if (error) {
    console.warn('profiles:', error.message);
    return [];
  }
  // enrich with email from auth
  const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const byId = new Map((listData?.users || []).map((u) => [u.id, u.email]));
  return (data || []).map((p) => ({
    ...p,
    email: byId.get(p.id) || '—',
  }));
}

async function main() {
  console.log(EXECUTE ? '=== EXECUTE WIPE ===' : '=== DRY-RUN (pass --execute to wipe) ===');
  console.log('KEEP:', KEEP_NOTE.join(', '));
  console.log('');

  console.log('Row counts:');
  const counts = [];
  for (const t of WIPE_TABLES) {
    const c = await countTable(t);
    counts.push(c);
    console.log(`  ${t.padEnd(32)} ${c.error ? `ERR ${c.error}` : c.count}`);
  }

  // gold index — show but never wipe
  console.log('\nGold index (NOT wiped):');
  for (const t of ['gold_index_cities', 'gold_index_competitors', 'gold_index_changes']) {
    const c = await countTable(t);
    console.log(`  ${t.padEnd(32)} ${c.error ? `ERR ${c.error}` : c.count}`);
  }

  const otpN = await cleanOtpKv();
  console.log(`\nOTP / session keys in app_kv: ${otpN}`);

  console.log('\nStorage files:');
  for (const b of ['deal-photos', 'kyc-documents']) {
    const paths = await listStorage(b);
    console.log(`  ${b.padEnd(20)} ${paths.length} files`);
  }

  console.log('\nPanel users (profiles):');
  const profiles = await listProfiles();
  for (const p of profiles) {
    console.log(`  ${p.role.padEnd(12)} ${(p.email || '—').padEnd(36)} ${p.display_name || ''}`);
  }
  console.log(`  total: ${profiles.length}`);

  if (!EXECUTE) {
    console.log('\nDry-run only. Re-run with --execute to delete the wipe tables + storage + OTP keys.');
    console.log('Profiles/auth users are NOT deleted automatically — review the list above.');
    return;
  }

  console.log('\nWiping tables…');
  for (const t of WIPE_TABLES) {
    try {
      const n = await deleteAll(t);
      console.log(`  deleted ${t}: ${n}`);
    } catch (e) {
      console.error(`  FAIL ${t}:`, e.message || e);
    }
  }

  console.log('\nWiping storage…');
  for (const b of ['deal-photos', 'kyc-documents']) {
    const n = await wipeStorage(b);
    console.log(`  ${b}: removed ${n}`);
  }

  const otpDeleted = await cleanOtpKv();
  console.log(`\nOTP/session keys removed: ${otpDeleted}`);

  console.log('\nDone. Gold index untouched. Review panel users above if any test accounts remain.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
