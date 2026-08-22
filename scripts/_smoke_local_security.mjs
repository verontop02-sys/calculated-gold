/**
 * Локальный смоук после правок безопасности.
 * Поднимает API на своём порту, проверяет защиты и гасит процесс.
 * Держим меньше 90 секунд: фоновый тик ценовых коридоров ходит в живую базу.
 *
 * Запуск: node scripts/_smoke_local_security.mjs
 */
import { spawn } from 'node:child_process';

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;

const child = spawn(process.execPath, ['server/index.js'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'production',
    CORS_ORIGIN: 'http://localhost:5173',
    // Специально включаем опасные флаги: сервер обязан их погасить сам.
    FINTECH_OTP_RETURN_CODE: '1',
    DEVICE_TRUST_RETURN_CODE: '1',
    FIELD_DEAL_RETURN_CODE: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let log = '';
child.stdout.on('data', (b) => { log += b.toString(); });
child.stderr.on('data', (b) => { log += b.toString(); });

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(pass ? 'OK  ' : 'FAIL', name, detail ? `— ${detail}` : '');
}

async function waitForBoot(timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`сервер упал на старте (код ${child.exitCode})\n${log}`);
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch { /* ещё поднимается */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`сервер не поднялся за ${timeoutMs} мс\n${log}`);
}

try {
  await waitForBoot();
  check('сервер поднялся с NODE_ENV=production', true);

  check(
    'опасные debug-флаги погашены в проде',
    /FINTECH_OTP_RETURN_CODE=1 в production/.test(log)
      && /DEVICE_TRUST_RETURN_CODE=1 в production/.test(log)
      && /FIELD_DEAL_RETURN_CODE=1 в production/.test(log),
    'в логе три предупреждения [SECURITY]',
  );

  const noAuth = await fetch(`${BASE}/api/settings`);
  check('GET /api/settings без токена → 401', noAuth.status === 401, `получили ${noAuth.status}`);

  const patchNoAuth = await fetch(`${BASE}/api/scrap-deals/00000000-0000-0000-0000-000000000000`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  check('PATCH /api/scrap-deals без токена → 401', patchNoAuth.status === 401, `получили ${patchNoAuth.status}`);

  const delNoAuth = await fetch(`${BASE}/api/scrap-deals/00000000-0000-0000-0000-000000000000`, { method: 'DELETE' });
  check('DELETE /api/scrap-deals без токена → 401', delNoAuth.status === 401, `получили ${delNoAuth.status}`);

  const badFintech = await fetch(`${BASE}/api/public/fintech/portfolio`, {
    headers: { Authorization: 'Bearer forged-body.forged-signature' },
  });
  check('поддельный fintech-токен → 401', badFintech.status === 401, `получили ${badFintech.status}`);

  // Лимит входа по паролю: 30 за 15 минут. Обычные вызовы Auth не должны задеваться.
  let loginCodes = [];
  for (let i = 0; i < 35; i += 1) {
    const r = await fetch(`${BASE}/sb/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `probe-${i}@example.invalid`, password: 'wrong' }),
    });
    loginCodes.push(r.status);
  }
  const limited = loginCodes.filter((c) => c === 429).length;
  check('перебор пароля через /sb упирается в 429', limited > 0, `429 получено ${limited} раз из 35`);

  const refresh = await fetch(`${BASE}/sb/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: 'nope' }),
  });
  check('обновление токена лимитом НЕ задето', refresh.status !== 429, `получили ${refresh.status}`);

  const health = await fetch(`${BASE}/api/health`);
  check('после лимитов API живой', health.ok, `получили ${health.status}`);
} catch (e) {
  check('прогон завершился без ошибок', false, e.message);
} finally {
  child.kill('SIGKILL');
}

const failed = results.filter((r) => !r.pass);
console.log(`\nИтог: ${results.length - failed.length}/${results.length} проверок пройдено`);
if (failed.length) {
  console.log('Не прошло:', failed.map((f) => f.name).join('; '));
  process.exit(1);
}
