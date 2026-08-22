/**
 * Не выставил ли кто-то себе роль в user_metadata (эскалация прав). Только чтение.
 * Запуск: node scripts/_audit_user_metadata.mjs
 */
import fs from 'node:fs';

const env = {};
for (const line of fs.readFileSync('server/.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const BASE = String(env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const r = await fetch(`${BASE}/auth/v1/admin/users?per_page=200`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
if (!r.ok) {
  console.error('Ошибка admin API:', r.status, (await r.text()).slice(0, 200));
  process.exit(1);
}
const { users = [] } = await r.json();

const prof = await fetch(`${BASE}/rest/v1/profiles?select=id,role,display_name&limit=200`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
const profiles = await prof.json();
const roleById = new Map(profiles.map((p) => [p.id, p.role]));

console.log('=== Пользователи панели ===');
let suspicious = 0;
for (const u of users) {
  const dbRole = roleById.get(u.id) ?? '(нет профиля)';
  const userMetaRole = u.user_metadata?.role ?? null;
  const appMetaRole = u.app_metadata?.role ?? null;
  const flag = userMetaRole && String(userMetaRole).toLowerCase() !== String(dbRole).toLowerCase();
  if (flag) suspicious += 1;
  console.log(
    `${(u.email || '(без email)').padEnd(34)} profiles.role=${String(dbRole).padEnd(14)}`,
    `user_metadata.role=${userMetaRole ?? '-'} app_metadata.role=${appMetaRole ?? '-'}`,
    flag ? '  <<< РАСХОЖДЕНИЕ' : '',
  );
}
console.log('\nвсего пользователей:', users.length);
console.log('с ролью в user_metadata, не совпадающей с базой:', suspicious);
if (!suspicious) console.log('Признаков самовольного повышения прав нет.');
