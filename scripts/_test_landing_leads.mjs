/**
 * Локальная проверка заявок с лендингов: публичный эндпоинт, валидация,
 * ловушка для ботов, закрытость админ-ручек и запись в базу.
 * Сервер должен работать на localhost:8787. Тестовые строки удаляются.
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
const H = { apikey: SRV, Authorization: `Bearer ${SRV}`, 'Content-Type': 'application/json' };
const API = 'http://localhost:8787/api';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) pass += 1; else fail += 1;
};

const post = (body) => fetch(`${API}/public/landing-lead`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const TEST_NAME = 'Тест связки (автопроверка)';

// 1. Валидная заявка со всеми полями
let r = await post({
  source: 'franshiza',
  name: TEST_NAME,
  phone: '+7 900 000-00-00',
  fields: { 'Город': 'Тестоград', 'Действующая точка': 'нет' },
});
check('валидная заявка принята', r.status === 200, `status ${r.status}`);

// 2. Заявка попала в базу с полями
let rows = await (await fetch(`${SB}/rest/v1/landing_leads?name=eq.${encodeURIComponent(TEST_NAME)}&select=*`, { headers: H })).json();
const lead = rows[0];
check('заявка в базе', rows.length === 1 && lead?.source === 'franshiza' && lead?.status === 'new');
check('доп. поля сохранены', lead?.fields?.['Город'] === 'Тестоград');

// 3. Валидация: короткое имя
r = await post({ source: 'prodat', name: 'A', phone: '+79000000000' });
check('короткое имя отклонено (400)', r.status === 400, `status ${r.status}`);

// 4. Валидация: неизвестный источник
r = await post({ source: 'hacker', name: TEST_NAME, phone: '+79000000000' });
check('неизвестный источник отклонён (400)', r.status === 400, `status ${r.status}`);

// 5. Ловушка для ботов: website заполнен → ok, но записи нет
r = await post({ source: 'resale', name: `${TEST_NAME} бот`, phone: '+79000000001', website: 'http://spam.example' });
const botRows = await (await fetch(`${SB}/rest/v1/landing_leads?name=eq.${encodeURIComponent(`${TEST_NAME} бот`)}&select=id`, { headers: H })).json();
check('бот получил ok, но записи нет', r.status === 200 && botRows.length === 0, `status ${r.status}, rows ${botRows.length}`);

// 6. Админ-ручки закрыты без токена
for (const [method, path] of [['GET', '/landing-leads'], ['GET', '/landing-leads/unread'], ['PATCH', `/landing-leads/${lead?.id || '00000000-0000-0000-0000-000000000000'}`]]) {
  const rr = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'PATCH' ? JSON.stringify({ status: 'done' }) : undefined });
  check(`${method} ${path} без токена → 401`, rr.status === 401, `status ${rr.status}`);
}

// 7. Таблица закрыта для anon (RLS)
const ANON = readEnv('client/.env.production').SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
if (ANON) {
  const ar = await fetch(`${SB}/rest/v1/landing_leads?select=id&limit=1`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  const aj = await ar.json().catch(() => null);
  const empty = ar.ok && Array.isArray(aj) && aj.length === 0;
  check('anon не видит заявки (RLS)', !ar.ok || empty, `status ${ar.status}, rows ${Array.isArray(aj) ? aj.length : '—'}`);
} else {
  console.log('SKIP anon-проверка: нет ANON ключа');
}

// Чистим тестовые записи
const del = await fetch(`${SB}/rest/v1/landing_leads?name=like.${encodeURIComponent(`${TEST_NAME}%`)}`, { method: 'DELETE', headers: H });
console.log(`\nочистка тестовых записей: ${del.status}`);

console.log(`\nИтог: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
