/**
 * Проверка дыры «продавец делает себя супер-админом».
 *
 * Сервер брал роль из user_metadata токена, а user_metadata пользователь пишет сам своим же
 * токеном через PUT /auth/v1/user. То есть любой сотрудник одним запросом получал права
 * супер-админа: ручное пополнение баланса, модерацию выводов, правку и удаление сделок.
 *
 * Тест заводит временного сотрудника, проделывает атаку от его имени и удаляет его за собой.
 * Запуск: node scripts/_test_role_escalation.mjs
 */
import { spawn } from 'node:child_process';
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
// anon-ключ лежит только в клиентском конфиге: атаку изображаем именно им, как из браузера.
const env = { ...readEnv('client/.env.production'), ...readEnv('server/.env') };
const SB = String(env.SUPABASE_URL || '').replace(/\/$/, '');
const SRV = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.SUPABASE_ANON_KEY;
if (!SB || !SRV || !ANON) throw new Error('нет SUPABASE_URL / service_role / anon в конфигах');

const PORT = 8798;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();
const EMAIL = `sec-probe-${STAMP}@reaktivo-selftest.invalid`;
const PASSWORD = `Probe-${STAMP}-Aa!`;

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

let child = null;
let userId = null;

async function waitForBoot(timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`сервер упал на старте (код ${child.exitCode})`);
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* поднимается */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('сервер не поднялся');
}

async function signIn() {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`вход не удался: ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token;
}

/** Отдаёт статус и текст ошибки, чтобы отличить отказ по правам от отказа по устройству. */
async function probe(path, init = {}) {
  const r = await fetch(`${BASE}${path}`, init);
  let body = '';
  try { body = (await r.text()).slice(0, 200); } catch { /* пусто */ }
  return { status: r.status, body, denied: r.status === 403 && body.includes('Недостаточно прав') };
}

const probeSuperAdmin = (token) =>
  probe('/api/scrap-deals/00000000-0000-0000-0000-000000000000', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

const probeUserManager = (token) =>
  probe('/api/users', { headers: { Authorization: `Bearer ${token}` } });

try {
  child = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'production',
      CORS_ORIGIN: 'http://localhost:5173',
      // Подтверждение устройства письмом гасим только здесь: иначе оно отдаёт 403 всем
      // и проверка ролей ничего не покажет. Проверяем именно роли.
      DEVICE_TRUST_ENFORCE: '0',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  await waitForBoot();

  const cr = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  });
  const created = await cr.json();
  userId = created?.id;
  if (!userId) throw new Error(`не удалось создать пользователя: ${JSON.stringify(created).slice(0, 200)}`);
  console.log(`\nвременный сотрудник создан: ${EMAIL}\n`);

  let token = await signIn();
  // Первый вызов создаёт профиль, затем жёстко фиксируем роль продавца.
  await probeUserManager(token);
  await admin(`/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ role: 'seller' }),
  });

  const roleRes = await admin(`/rest/v1/profiles?id=eq.${userId}&select=role`);
  const roleRow = (await roleRes.json())[0];
  check('в базе у него роль продавца', roleRow?.role === 'seller', `profiles.role=${roleRow?.role}`);

  token = await signIn();
  const before = await probeSuperAdmin(token);
  check('до атаки: удаление сделки запрещено по правам', before.denied, `${before.status} ${before.body}`);
  const beforeUsers = await probeUserManager(token);
  check('до атаки: список сотрудников запрещён по правам', beforeUsers.denied, `${beforeUsers.status} ${beforeUsers.body}`);

  // Сама атака: пишем себе роль в user_metadata своим же токеном.
  const attack = await fetch(`${SB}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { role: 'super_admin' } }),
  });
  const attacked = await attack.json();
  check(
    'атака удалась на уровне Supabase: он записал себе role=super_admin',
    attacked?.user_metadata?.role === 'super_admin',
    `user_metadata.role=${attacked?.user_metadata?.role}`,
  );

  const dbRole = (await (await admin(`/rest/v1/profiles?id=eq.${userId}&select=role`)).json())[0]?.role;
  check('в базе роль осталась прежней', dbRole === 'seller', `profiles.role=${dbRole}`);

  token = await signIn();
  const after = await probeSuperAdmin(token);
  check(
    'ПОСЛЕ атаки: удаление сделки всё равно запрещено',
    after.denied,
    `${after.status}${after.status === 404 ? ' — прошёл как супер-админ!' : ''}`,
  );

  const afterUsers = await probeUserManager(token);
  check(
    'ПОСЛЕ атаки: список сотрудников всё равно запрещён',
    afterUsers.denied,
    `${afterUsers.status}${afterUsers.status === 200 ? ' — прошёл как руководитель!' : ''}`,
  );

  const settings = await probe('/api/settings', { headers: { Authorization: `Bearer ${token}` } });
  check('обычная работа сотрудника не сломалась', settings.status === 200, `GET /api/settings → ${settings.status}`);
} catch (e) {
  check('прогон завершился без ошибок', false, e.message);
} finally {
  if (userId) {
    await admin(`/rest/v1/profiles?id=eq.${userId}`, { method: 'DELETE' }).catch(() => {});
    const del = await admin(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' }).catch(() => null);
    console.log(`\nвременный сотрудник удалён: ${del?.ok ? 'да' : 'ПРОВЕРЬТЕ ВРУЧНУЮ'}`);
  }
  if (child) child.kill('SIGKILL');
}

const failed = results.filter((r) => !r.pass);
console.log(`\nИтог: ${results.length - failed.length}/${results.length} проверок пройдено`);
if (failed.length) {
  console.log('Не прошло:', failed.map((f) => f.name).join('; '));
  process.exit(1);
}
