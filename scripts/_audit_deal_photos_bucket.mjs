/**
 * Можно ли анонимно перечислить и залить файлы в бакет deal-photos. Только чтение (кроме
 * пробной загрузки, которая специально идёт в отдельный служебный путь и не трогает сделки).
 * Запуск: node scripts/_audit_deal_photos_bucket.mjs
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
const BASE = String(env.SUPABASE_URL || '').replace(/\/$/, '');
const ANON = env.SUPABASE_ANON_KEY;

console.log('Проект:', BASE);
console.log('Ключ: anon (то есть любой человек из интернета)\n');

const listRes = await fetch(`${BASE}/storage/v1/object/list/deal-photos`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ prefix: '', limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
});
const listBody = await listRes.text();
console.log('1) Перечислить файлы бакета:', listRes.status);
if (listRes.ok) {
  let arr = [];
  try { arr = JSON.parse(listBody); } catch {}
  console.log(`   ДОСТУПНО. Записей вернулось: ${Array.isArray(arr) ? arr.length : '?'}`);
  if (Array.isArray(arr)) for (const o of arr.slice(0, 5)) console.log('   -', o.name);
} else {
  console.log('   закрыто:', listBody.slice(0, 160));
}

const upRes = await fetch(`${BASE}/storage/v1/object/deal-photos/_audit_probe/probe-${Date.now()}.png`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'image/png' },
  body: Buffer.from('89504e470d0a1a0a', 'hex'),
});
console.log('\n2) Залить свой файл в бакет (anon):', upRes.status, upRes.ok ? 'ДОСТУПНО' : 'закрыто');
if (!upRes.ok) console.log('   ', (await upRes.text()).slice(0, 160));

const pubRes = await fetch(`${BASE}/storage/v1/object/public/deal-photos/_nope_/none.jpg`);
console.log('\n3) Публичные ссылки на объекты работают (проверка режима бакета):', pubRes.status === 400 || pubRes.status === 404 ? 'бакет публичный' : `код ${pubRes.status}`);
