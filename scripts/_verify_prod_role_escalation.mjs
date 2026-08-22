/**
 * Та же атака «продавец делает себя супер-админом», но против боевого API.
 * Заводит временного сотрудника, пробует, удаляет его за собой. Ничего чужого не трогает.
 *
 * Запуск: node scripts/_verify_prod_role_escalation.mjs
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
const env = { ...readEnv('client/.env.production'), ...readEnv('server/.env') };
const SB = String(env.SUPABASE_URL || '').replace(/\/$/, '');
const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.SUPABASE_ANON_KEY;
const API = 'https://api.201-34-142-76.sslip.io/api';

const STAMP = Date.now();
const EMAIL = `sec-probe-${STAMP}@reaktivo-selftest.invalid`;
const PASSWORD = `Probe-${STAMP}-Aa!`;
// Токен устройства обычный, как у браузера; серверный отпечаток — HMAC на секрете подписи.
const DEVICE_TOKEN = crypto.randomBytes(24).toString('hex');
const DEVICE_HASH = crypto.createHmac('sha256', String(SRV).slice(0, 64)).update(DEVICE_TOKEN).digest('hex');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(pass ? 'OK  ' : 'FAIL', name, detail ? `— ${detail}` : '');
}

const admin = (path, init = {}) =>
  fetch(`${SB}${path}`, {
    ...init,
    headers: { apikey: SRV, Authorization: `Bearer ${SRV}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });

async function signIn() {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`вход не удался: ${JSON.stringify(j).slice(0, 160)}`);
  return j.access_token;
}

async function probe(path, token, init = {}) {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'x-device-token': DEVICE_TOKEN, ...(init.headers || {}) },
  });
  const body = (await r.text()).slice(0, 200);
  return {
    status: r.status,
    body,
    deniedByRole: r.status === 403 && body.includes('Недостаточно прав'),
    deniedByDevice: body.includes('device_unverified'),
  };
}

let userId = null;
try {
  const cr = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  });
  userId = (await cr.json())?.id;
  if (!userId) throw new Error('не удалось создать временного сотрудника');
  console.log(`\nвременный сотрудник: ${EMAIL}\n`);

  let token = await signIn();
  await probe('/users', token); // первый вызов создаёт профиль
  await admin(`/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ role: 'seller' }),
  });
  // Отпечаток устройства считается на секрете, который знает только прод. Поэтому просим
  // прод сам его посчитать: /auth/device/check пишет заявку на код в app_kv, а в ключе
  // строки лежит нужный отпечаток. Иначе прод отвечает 403 про письмо и роли не проверить.
  const chk = await fetch(`${API}/auth/device/check`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-device-token': DEVICE_TOKEN,
      'Content-Type': 'application/json',
    },
    body: '{}',
  }).catch((e) => ({ status: 0, text: async () => e.message }));
  console.log('   запрос кода на устройство →', chk.status, (await chk.text()).slice(0, 160));

  const kvRes = await admin(`/rest/v1/app_kv?key=like.panel_device_otp:${userId}:*&select=key`);
  const kvRows = await kvRes.json();
  const prodDeviceHash = String(kvRows?.[0]?.key || '').split(':')[2] || null;
  check(
    'прод сообщил отпечаток тестового устройства',
    Boolean(prodDeviceHash),
    prodDeviceHash ? `${prodDeviceHash.slice(0, 12)}… (локальный расчёт ${prodDeviceHash === DEVICE_HASH ? 'совпал' : 'не совпал — секрет на проде свой'})` : 'заявка на код не найдена',
  );
  if (prodDeviceHash) {
    await admin('/rest/v1/panel_trusted_devices', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: userId, device_hash: prodDeviceHash, label: 'sec probe' }),
    });
  }

  token = await signIn();
  const warm = await probe('/settings', token);
  check(
    'тестовое устройство принято продом',
    !warm.deniedByDevice,
    warm.deniedByDevice ? 'секрет подписи на проде другой — проверку ролей на бою подтвердить нельзя' : `GET /api/settings → ${warm.status}`,
  );

  const before = await probe('/users', token);
  check('до атаки: список сотрудников закрыт по правам', before.deniedByRole, `${before.status} ${before.body}`);

  const attack = await fetch(`${SB}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { role: 'super_admin' } }),
  });
  const attacked = await attack.json();
  check(
    'он записал себе role=super_admin в user_metadata',
    attacked?.user_metadata?.role === 'super_admin',
    `user_metadata.role=${attacked?.user_metadata?.role}`,
  );

  token = await signIn();
  const afterUsers = await probe('/users', token);
  check(
    'ПРОД: список сотрудников всё равно закрыт',
    afterUsers.deniedByRole,
    `${afterUsers.status}${afterUsers.status === 200 ? ' — ПРОШЁЛ как руководитель!' : ''}`,
  );

  const afterDel = await probe('/scrap-deals/00000000-0000-0000-0000-000000000000', token, { method: 'DELETE' });
  check(
    'ПРОД: удаление сделки всё равно закрыто',
    afterDel.deniedByRole,
    `${afterDel.status}${afterDel.status === 404 ? ' — ПРОШЁЛ как супер-админ!' : ''}`,
  );

  const afterTopup = await probe('/fintech/admin/summary', token);
  check(
    'ПРОД: админка fintech всё равно закрыта',
    afterTopup.status === 403,
    `${afterTopup.status}${afterTopup.status === 200 ? ' — ПРОШЁЛ в деньги!' : ''}`,
  );

  const work = await probe('/settings', token);
  check('обычная работа сотрудника не сломалась', work.status === 200, `GET /api/settings → ${work.status}`);
} catch (e) {
  check('прогон завершился без ошибок', false, e.message);
} finally {
  if (userId) {
    await admin(`/rest/v1/panel_trusted_devices?user_id=eq.${userId}`, { method: 'DELETE' }).catch(() => {});
    await admin(`/rest/v1/panel_login_events?user_id=eq.${userId}`, { method: 'DELETE' }).catch(() => {});
    await admin(`/rest/v1/profiles?id=eq.${userId}`, { method: 'DELETE' }).catch(() => {});
    const del = await admin(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' }).catch(() => null);
    console.log(`\nвременный сотрудник удалён: ${del?.ok ? 'да' : 'ПРОВЕРЬТЕ ВРУЧНУЮ'}`);
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\nИтог: ${results.length - failed.length}/${results.length} проверок пройдено`);
if (failed.length) {
  console.log('Не прошло:', failed.map((f) => f.name).join('; '));
  process.exit(1);
}
