/**
 * Проверка прода после деплоя. Только чтение и заведомо неудачные входы —
 * ничего не пишем, реальных клиентов не трогаем.
 *
 * Запуск: node scripts/_verify_prod_after_deploy.mjs
 */
const API = 'https://api.201-34-142-76.sslip.io/api';
const SB = 'https://api.201-34-142-76.sslip.io/sb';
const RENDER = 'https://calculated-gold.onrender.com/api';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(pass ? 'OK  ' : 'FAIL', name, detail ? `— ${detail}` : '');
}

const health = await fetch(`${API}/health`).catch((e) => ({ ok: false, status: e.message }));
check('API живой', health.ok === true, `статус ${health.status}`);

const renderHealth = await fetch(`${RENDER}/health`).catch((e) => ({ ok: false, status: e.message }));
check('Render живой', renderHealth.ok === true, `статус ${renderHealth.status}`);

for (const [name, path] of [['настройки', '/settings'], ['пользователи', '/users'], ['сводка fintech', '/fintech/admin/summary']]) {
  const r = await fetch(`${API}${path}`);
  check(`${name} без токена → 401`, r.status === 401, `получили ${r.status}`);
}

const patch = await fetch(`${API}/scrap-deals/00000000-0000-0000-0000-000000000000`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
check('правка сделки без токена → 401', patch.status === 401, `получили ${patch.status}`);

const withdraw = await fetch(`${API}/public/fintech/withdraw`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rubAmount: 1000, idempotencyKey: 'probe' }),
});
check('заявка на вывод без сессии → 401', withdraw.status === 401, `получили ${withdraw.status}`);

// Новый лимит на вход по паролю — главный признак того, что свежий код уже в бою.
const codes = [];
for (let i = 0; i < 40; i += 1) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `probe-${Date.now()}-${i}@example.invalid`, password: 'wrong' }),
  });
  codes.push(r.status);
  if (r.status === 429) break;
}
const blockedAt = codes.indexOf(429);
check(
  'новый код в бою: перебор пароля упирается в 429',
  blockedAt !== -1,
  blockedAt !== -1 ? `заблокировано с попытки ${blockedAt + 1}` : `429 не получен за ${codes.length} попыток`,
);

const stillAlive = await fetch(`${API}/health`);
check('после лимита API по-прежнему отвечает', stillAlive.ok, `статус ${stillAlive.status}`);

const cors = await fetch(`${API}/health`, { headers: { Origin: 'https://reaktivo.pro' } });
check('CORS для reaktivo.pro работает', cors.headers.get('access-control-allow-origin') === 'https://reaktivo.pro');

const failed = results.filter((r) => !r.pass);
console.log(`\nИтог: ${results.length - failed.length}/${results.length} проверок пройдено`);
if (failed.length) {
  console.log('Не прошло:', failed.map((f) => f.name).join('; '));
  process.exit(1);
}
