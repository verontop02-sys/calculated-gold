import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// npm run dev из корня монорепо: cwd ≠ server/, иначе dotenv не видит server/.env
dotenv.config({ path: path.join(__dirname, '.env') });

const isDev = process.env.NODE_ENV !== 'production';

const PORT = Number(process.env.PORT || 8787);
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!supabaseUrl || !serviceKey) {
  console.error(
    '[FATAL] Укажите SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в server/.env (рядом с server/index.js).'
  );
  process.exit(1);
}

if (!serviceKey.startsWith('eyJ')) {
  console.error(
    '[FATAL] SUPABASE_SERVICE_ROLE_KEY должен быть legacy JWT (начинается с eyJ).\n' +
      '  Supabase → Settings → API Keys → «Legacy anon, service_role» → service_role (secret) → Copy.\n' +
      '  Ключ sb_secret_… сюда не подходит — из-за него вход не работает.'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function getUserFromAccessToken(accessToken) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);
  if (error || !user) return { user: null, error: error?.message || 'invalid session' };
  return { user, error: null };
}

const app = express();
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function mapSupabaseAuthAdminError(err) {
  const code = err?.code || '';
  const msg = String(err?.message || '');
  const byCode = {
    email_exists: { status: 409, message: 'Пользователь с таким email уже существует' },
    weak_password: { status: 400, message: 'Слишком слабый пароль (минимум 6 символов)' },
    invalid_credentials: { status: 400, message: 'Некорректные данные' },
  };
  if (byCode[code]) return byCode[code];
  if (/already (registered|exists)/i.test(msg)) {
    return { status: 409, message: 'Пользователь с таким email уже существует' };
  }
  if (/invalid email/i.test(msg)) return { status: 400, message: 'Некорректный email' };
  return null;
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (corsOrigins.includes(origin)) return callback(null, true);
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '100kb' }));

const DEFAULT_SETTINGS = {
  buybackPercentOfScrap: 92,
  rangeHalfWidthPercent: 2,
  purityAdjustments: { 375: 0, 500: 0, 583: 0, 585: 0, 750: 0, 875: 0, 916: 0, 958: 0, 999: 0 },
  purityOrder: [375, 500, 583, 585, 750, 875, 916, 958, 999],
};

function parseRussianNum(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function formatCbrDate(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function fetchCbrGoldRubPerGram() {
  const dateReq = formatCbrDate();
  const { data: xml } = await axios.get('https://www.cbr.ru/scripts/xml_metall.asp', {
    params: { date_req1: dateReq, date_req2: dateReq },
    timeout: 20000,
    responseType: 'text',
    headers: { 'User-Agent': 'CalculatedGold/1.0' },
  });

  const doc = parser.parse(xml);
  const records = doc?.Metall?.Record;
  const list = Array.isArray(records) ? records : records ? [records] : [];
  const gold = list.find((r) => String(r['@_Code']) === '1');
  if (!gold) throw new Error('CBR: не найдена запись золота (Code=1)');

  const buy = parseRussianNum(gold.Buy);
  const sell = parseRussianNum(gold.Sell);
  if (!buy) throw new Error('CBR: не удалось разобрать цену золота');

  return {
    goldRubPerGram: buy,
    sellRubPerGram: sell,
    cbrDate: gold['@_Date'] || dateReq,
    fetchedAt: new Date().toISOString(),
  };
}

function ttlMs() {
  return Math.max(60, Number(process.env.PRICE_CACHE_TTL_SEC || 180)) * 1000;
}

async function getKv(key) {
  const { data, error } = await supabase.from('app_kv').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

async function setKv(key, value) {
  const { error } = await supabase.from('app_kv').upsert({ key, value }, { onConflict: 'key' });
  if (error) throw error;
}

async function getPriceCache() {
  return getKv('gold_price');
}

async function setPriceCache(value) {
  await setKv('gold_price', value);
}

async function refreshPriceCache(force = false) {
  const existing = await getPriceCache();
  if (!force && existing?.cachedAt) {
    const age = Date.now() - new Date(existing.cachedAt).getTime();
    if (age < ttlMs()) return { ...existing, stale: false, ageMs: age };
  }

  try {
    const fresh = await fetchCbrGoldRubPerGram();
    const payload = { ...fresh, source: 'cbr', cachedAt: new Date().toISOString(), error: null };
    await setPriceCache(payload);
    return { ...payload, stale: false, ageMs: 0 };
  } catch (err) {
    const message = err?.message || 'Ошибка загрузки курса';
    if (existing) {
      const merged = { ...existing, lastRefreshError: message, lastRefreshAttemptAt: new Date().toISOString() };
      await setPriceCache(merged);
      return { ...merged, stale: true, error: message };
    }
    const fallback = {
      goldRubPerGram: null,
      sellRubPerGram: null,
      cbrDate: null,
      source: 'cbr',
      cachedAt: new Date().toISOString(),
      error: message,
    };
    await setPriceCache(fallback);
    return { ...fallback, stale: true };
  }
}

async function getSettings() {
  const value = await getKv('settings');
  if (!value || Object.keys(value).length === 0) {
    await setKv('settings', DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    purityAdjustments: { ...DEFAULT_SETTINGS.purityAdjustments, ...(value.purityAdjustments || {}) },
  };
}

async function saveSettings(partial) {
  const current = await getSettings();
  const next = {
    ...current,
    ...partial,
    purityAdjustments: { ...current.purityAdjustments, ...(partial.purityAdjustments || {}) },
  };
  await setKv('settings', next);
  return next;
}

function calculateBuybackRange({ weightGrams, purityPerThousand, goldRubPerGram, settings }) {
  const w = Number(weightGrams);
  const purity = Number(purityPerThousand);
  if (!Number.isFinite(w) || w <= 0) return { ok: false, error: 'Укажите положительный вес, г' };
  if (!Number.isFinite(purity) || purity <= 0 || purity > 1000) return { ok: false, error: 'Некорректная проба' };
  if (!Number.isFinite(goldRubPerGram) || goldRubPerGram <= 0) {
    return { ok: false, error: 'Курс золота недоступен. Подождите обновления.' };
  }

  const fineGrams = w * (purity / 1000);
  const scrapRub = fineGrams * goldRubPerGram;
  const adjPct = settings.purityAdjustments[String(Math.round(purity))] ?? 0;
  const buybackPct = Math.min(100, Math.max(0, Number(settings.buybackPercentOfScrap) || 0));
  const midRub = scrapRub * (buybackPct / 100) * (1 + adjPct / 100);
  const half = Math.min(50, Math.max(0, Number(settings.rangeHalfWidthPercent) || 0));

  return {
    ok: true,
    fineGrams,
    scrapRub,
    midRub,
    lowRub: midRub * (1 - half / 100),
    highRub: midRub * (1 + half / 100),
    purityUsed: purity,
    adjPct,
    buybackPct,
    rangeHalfWidthPercent: half,
  };
}

async function ensureProfileAndBootstrap(userId) {
  const { data: row } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
  if (!row) {
    const { error: insErr } = await supabase.from('profiles').insert({ id: userId, role: 'courier' });
    if (insErr && insErr.code !== '23505') throw insErr;
  }
  const { error: rpcErr } = await supabase.rpc('claim_first_admin', { uid: userId });
  if (rpcErr) console.error('[claim_first_admin]', rpcErr);
}

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Требуется вход' });
    const token = authHeader.slice(7);
    const { user, error } = await getUserFromAccessToken(token);
    if (error || !user?.id) {
      if (error) console.warn('[auth]', error);
      return res.status(401).json({ error: 'Сессия недействительна' });
    }
    req.user = user;
    await ensureProfileAndBootstrap(user.id);
    next();
  } catch (e) {
    if (isDev) console.warn('[auth]', e?.message || e);
    res.status(401).json({ error: 'Сессия недействительна' });
  }
}

async function requireAdmin(req, res, next) {
  const { data: prof, error } = await supabase.from('profiles').select('role').eq('id', req.user.id).single();
  if (error || prof?.role !== 'admin') return res.status(403).json({ error: 'Недостаточно прав' });
  next();
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api', asyncHandler(authMiddleware));

app.get(
  '/api/auth/me',
  asyncHandler(async (req, res) => {
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', req.user.id).single();
    const role = prof?.role || 'courier';
    res.json({ user: { uid: req.user.id, email: req.user.email, role } });
  })
);

app.get(
  '/api/price',
  asyncHandler(async (_req, res) => {
    let data = await getPriceCache();
    if (!data?.goldRubPerGram) data = await refreshPriceCache(false);
    const ageMs = data?.cachedAt ? Date.now() - new Date(data.cachedAt).getTime() : Number.MAX_SAFE_INTEGER;
    res.json({
      goldRubPerGram: data?.goldRubPerGram ?? null,
      sellRubPerGram: data?.sellRubPerGram ?? null,
      cbrDate: data?.cbrDate ?? null,
      cachedAt: data?.cachedAt ?? null,
      stale: ageMs > ttlMs(),
      source: data?.source ?? 'cbr',
      error: data?.error || data?.lastRefreshError || null,
    });
  })
);

app.post(
  '/api/price/refresh',
  asyncHandler(requireAdmin),
  asyncHandler(async (_req, res) => {
    res.json(await refreshPriceCache(true));
  })
);

app.post(
  '/api/calculate',
  asyncHandler(async (req, res) => {
    const { weightGrams, purityPerThousand } = req.body || {};
    let cache = await getPriceCache();
    if (!cache?.goldRubPerGram) cache = await refreshPriceCache(false);
    const settings = await getSettings();
    const result = calculateBuybackRange({
      weightGrams,
      purityPerThousand,
      goldRubPerGram: cache?.goldRubPerGram,
      settings,
    });
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  })
);

app.get('/api/settings', asyncHandler(async (_req, res) => res.json(await getSettings())));

app.put(
  '/api/settings',
  asyncHandler(requireAdmin),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const allowed = ['buybackPercentOfScrap', 'rangeHalfWidthPercent', 'purityAdjustments', 'purityOrder'];
    const patch = {};
    for (const k of allowed) if (body[k] !== undefined) patch[k] = body[k];
    res.json(await saveSettings(patch));
  })
);

app.get(
  '/api/users',
  asyncHandler(requireAdmin),
  asyncHandler(async (_req, res) => {
    const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) throw listErr;
    const users = listData?.users || [];
    const { data: profiles, error: pErr } = await supabase.from('profiles').select('id, role');
    if (pErr) throw pErr;
    const roleById = Object.fromEntries((profiles || []).map((p) => [p.id, p.role]));
    res.json(
      users.map((u) => ({
        uid: u.id,
        email: u.email,
        disabled: !!u.banned_until,
        role: roleById[u.id] || 'courier',
      }))
    );
  })
);

app.post(
  '/api/users',
  asyncHandler(requireAdmin),
  asyncHandler(async (req, res) => {
    const { email, password, role } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });
    const r = String(role || 'courier').toLowerCase();
    if (r === 'admin') {
      return res.status(400).json({
        error: 'Администратора нельзя создать из панели. Создайте второго админа вручную в Supabase при необходимости.',
      });
    }
    const dbRole = r === 'seller' ? 'seller' : 'courier';
    const { data: created, error: cErr } = await supabase.auth.admin.createUser({
      email: String(email).trim(),
      password: String(password),
      email_confirm: true,
    });
    if (cErr) {
      const mapped = mapSupabaseAuthAdminError(cErr);
      if (mapped) return res.status(mapped.status).json({ error: mapped.message });
      throw cErr;
    }
    const newId = created.user?.id;
    if (!newId) return res.status(500).json({ error: 'Не удалось создать пользователя' });
    const { error: uErr } = await supabase.from('profiles').upsert(
      { id: newId, role: dbRole },
      { onConflict: 'id' }
    );
    if (uErr) console.error('[profiles upsert after create]', uErr);
    res.json({ ok: true, uid: newId });
  })
);

app.delete(
  '/api/users/:uid',
  asyncHandler(requireAdmin),
  asyncHandler(async (req, res) => {
    const uid = req.params.uid;
    if (uid === req.user.id) return res.status(400).json({ error: 'Нельзя удалить себя' });
    const { error: dErr } = await supabase.auth.admin.deleteUser(uid);
    if (dErr) throw dErr;
    res.json({ ok: true });
  })
);

app.use((err, _req, res, _next) => {
  const mapped = mapSupabaseAuthAdminError(err);
  if (mapped) {
    return res.status(mapped.status).json({ error: mapped.message });
  }
  console.error('[API ERROR]', err?.stack || err);
  res.status(500).json({
    error: isDev ? `Внутренняя ошибка сервера: ${err?.message || 'unknown'}` : 'Внутренняя ошибка сервера',
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Calculated Gold API listening on ${PORT}`);
  console.log(`CORS origins: ${corsOrigins.join(', ')}`);
});

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`[Calculated Gold] Порт ${PORT} уже занят.`);
    console.error(`Освободи порт: netstat -ano | findstr :${PORT} и taskkill /PID <PID> /F`);
    process.exit(1);
  }
  throw err;
});
