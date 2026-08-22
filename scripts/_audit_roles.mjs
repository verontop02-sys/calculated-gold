/**
 * Кто есть в панели и с какими ролями. Только чтение.
 * Запуск: node scripts/_audit_roles.mjs
 */
import fs from 'node:fs';

const env = {};
for (const line of fs.readFileSync('server/.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const BASE = String(env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const r = await fetch(`${BASE}/rest/v1/profiles?select=id,role,display_name&limit=200`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
const profiles = await r.json();

const byRole = {};
for (const p of profiles) {
  const role = p.role || 'courier (по умолчанию)';
  byRole[role] = (byRole[role] || 0) + 1;
}
console.log('=== Роли в панели ===');
for (const [role, n] of Object.entries(byRole)) console.log(`${role}: ${n}`);

const supers = profiles.filter((p) => String(p.role || '').toLowerCase().replace(/[\s-]/g, '_') === 'super_admin');
console.log('\nсупер-админов:', supers.length);
for (const s of supers) console.log('  ', s.display_name || '(без имени)', s.id);

if (!supers.length) {
  console.log('\nВНИМАНИЕ: супер-админов нет — правку сделок никто не сможет сделать.');
}
