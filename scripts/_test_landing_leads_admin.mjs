/**
 * E2E админ-ручек заявок: временный admin-пользователь → JWT → список,
 * смена статуса, бейдж. После проверки пользователь и данные удаляются.
 * Сервер должен работать на localhost:8787.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

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
const cenv = readEnv('client/.env.production');
const SB = String(env.SUPABASE_URL || '').replace(/\/$/, '');
const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = cenv.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const H = { apikey: SRV, Authorization: `Bearer ${SRV}`, 'Content-Type': 'application/json' };
const API = 'http://localhost:8787/api';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) pass += 1; else fail += 1;
};

const email = `lead-autotest-${Date.now()}@reaktivo.test`;
const password = crypto.randomBytes(18).toString('base64url');
let userId = null;
const TEST_NAME = 'Тест админ-ручек (автопроверка)';

try {
  // 1. Временный пользователь с ролью admin
  const cr = await fetch(`${SB}/auth/v1/admin/users`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const cu = await cr.json();
  userId = cu?.id || cu?.user?.id;
  check('создан временный пользователь', Boolean(userId), `status ${cr.status}`);

  const pr = await fetch(`${SB}/rest/v1/profiles`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ id: userId, role: 'admin', display_name: 'Автотест' }),
  });
  check('профиль admin создан', pr.ok, `status ${pr.status}`);

  // 2. Логин по паролю → JWT
  const lr = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const lj = await lr.json();
  const jwt = lj?.access_token;
  check('получен JWT', Boolean(jwt), `status ${lr.status}`);

  // Доверяем тестовое устройство: тот же HMAC, что в server/deviceTrust.js
  const deviceToken = crypto.randomBytes(24).toString('hex');
  const pepper = (env.FIELD_DEAL_CODE_PEPPER || SRV).trim().slice(0, 64);
  const deviceHash = crypto.createHmac('sha256', pepper).update(deviceToken).digest('hex');
  const td = await fetch(`${SB}/rest/v1/panel_trusted_devices`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ user_id: userId, device_hash: deviceHash }),
  });
  check('устройство доверено', td.ok, `status ${td.status}`);

  const authH = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', 'X-Device-Token': deviceToken };

  // 3. Тестовая заявка через публичный эндпоинт
  await fetch(`${API}/public/landing-lead`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'partneram', name: TEST_NAME, phone: '@autotest', fields: { 'Профиль': 'ломбард' } }),
  });

  // 4. Список заявок под админом
  const list = await fetch(`${API}/landing-leads?status=new`, { headers: authH });
  const ljson = await list.json().catch(() => ({}));
  const mine = (ljsonSafe(ljson).leads || []).find((l) => l.name === TEST_NAME);
  check('админ видит заявку в списке', list.status === 200 && Boolean(mine), `status ${list.status}`);

  // 5. Бейдж непрочитанных
  const un = await fetch(`${API}/landing-leads/unread`, { headers: authH });
  const uj = await un.json().catch(() => ({}));
  check('бейдж новых > 0', un.status === 200 && (uj.total || 0) >= 1, `total ${uj.total}`);

  // 6. Смена статуса → done, фиксируется кто обработал
  const pt = await fetch(`${API}/landing-leads/${mine.id}`, { method: 'PATCH', headers: authH, body: JSON.stringify({ status: 'done' }) });
  const pj = await pt.json().catch(() => ({}));
  check('статус → done, видно кто обработал', pt.status === 200 && pj?.lead?.status === 'done' && pj?.lead?.processed_by_name === 'Автотест', `status ${pt.status}, by ${pj?.lead?.processed_by_name}`);

  // 7. Возврат в new очищает отметку
  const pt2 = await fetch(`${API}/landing-leads/${mine.id}`, { method: 'PATCH', headers: authH, body: JSON.stringify({ status: 'new' }) });
  const pj2 = await pt2.json().catch(() => ({}));
  check('возврат в new очищает отметку', pt2.status === 200 && pj2?.lead?.status === 'new' && !pj2?.lead?.processed_by_name);

  // 8. Недопустимый статус отклоняется
  const bad = await fetch(`${API}/landing-leads/${mine.id}`, { method: 'PATCH', headers: authH, body: JSON.stringify({ status: 'hacked' }) });
  check('кривой статус отклонён (400)', bad.status === 400, `status ${bad.status}`);
} finally {
  // Чистка: заявки, доверенные устройства, профиль, пользователь
  await fetch(`${SB}/rest/v1/landing_leads?name=eq.${encodeURIComponent(TEST_NAME)}`, { method: 'DELETE', headers: H });
  if (userId) {
    await fetch(`${SB}/rest/v1/panel_trusted_devices?user_id=eq.${userId}`, { method: 'DELETE', headers: H });
    await fetch(`${SB}/rest/v1/profiles?id=eq.${userId}`, { method: 'DELETE', headers: H });
    const dr = await fetch(`${SB}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: H });
    console.log(`\nочистка: пользователь удалён (${dr.status}), заявки удалены`);
  }
}

function ljsonSafe(x) { return x && typeof x === 'object' ? x : {}; }

console.log(`\nИтог: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
