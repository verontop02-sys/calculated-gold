/**
 * Smoke этапа 9 (публичные + прокси). Без сессии клиента — только инфраструктура.
 * Usage: node scripts/stage9-smoke.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../client/.env.production');
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const BASE = (env.VITE_API_BASE || '').replace(/\/$/, '');
const ANON = env.VITE_SUPABASE_ANON_KEY || '';

if (!BASE) {
  console.error('No VITE_API_BASE');
  process.exit(1);
}

const hdrs = ANON
  ? { apikey: ANON, Authorization: `Bearer ${ANON}`, Accept: 'application/json' }
  : { Accept: 'application/json' };

async function check(name, pathOrUrl, opts = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      method: opts.method || 'GET',
      headers: { ...hdrs, ...(opts.headers || {}) },
      body: opts.body,
      signal: AbortSignal.timeout(opts.timeout || 60_000),
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }
    const ms = Date.now() - t0;
    const ok = opts.expect ? opts.expect(r, json, text) : r.ok;
    console.log(`${ok ? 'OK ' : 'FAIL'} ${name}  ${r.status}  ${ms}ms  ${text.slice(0, 120).replace(/\s+/g, ' ')}`);
    return ok;
  } catch (e) {
    console.log(`FAIL ${name}  ERR ${e.message}`);
    return false;
  }
}

const results = [];
results.push(await check('health', '/health', {
  expect: (r, j) => r.status === 200 && j?.ok === true,
}));
results.push(await check('topup/config', '/public/fintech/topup/config', {
  expect: (r, j) => r.status === 200 && j?.provider === 'yookassa' && typeof j.enabled === 'boolean',
}));
results.push(await check('webhook GET', '/public/fintech/topup/webhook', {
  expect: (r, j) => r.status === 200 && j?.ok === true && j?.endpoint === 'yookassa_webhook',
}));
results.push(await check('recurring w/o auth', '/public/fintech/recurring', {
  expect: (r) => r.status === 401,
}));
results.push(await check('bind-card w/o auth', '/public/fintech/recurring/bind-card', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
  expect: (r) => r.status === 401,
}));
results.push(await check('run-now w/o auth', '/public/fintech/recurring/run-now', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
  expect: (r) => r.status === 401,
}));
results.push(await check('buyback-quote', '/public/buyback-quote', {
  expect: (r, j) => r.status === 200 && (j?.goldRubPerGram != null || j?.rate != null || j?.quote != null || typeof j === 'object'),
}));
results.push(await check('cbr-gold-history', '/public/fintech/cbr-gold-history', {
  expect: (r, j) => r.status === 200 && (Array.isArray(j?.points) || Array.isArray(j?.years) || Array.isArray(j) || j?.ok !== false),
}));
results.push(await check('fintech profile w/o auth', '/public/fintech/profile', {
  expect: (r) => r.status === 401,
}));
results.push(await check('proxy CORS preflight', '/health', {
  method: 'OPTIONS',
  headers: {
    Origin: 'https://reaktivo.pro',
    'Access-Control-Request-Method': 'GET',
  },
  expect: (r) => r.status === 204 || r.status === 200,
}));

const passed = results.filter(Boolean).length;
const total = results.length;
console.log(`\n${passed}/${total} passed`);
process.exit(passed === total ? 0 : 1);
