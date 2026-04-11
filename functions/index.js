const axios = require('axios');
const cors = require('cors');
const express = require('express');
const admin = require('firebase-admin');
const { XMLParser } = require('fast-xml-parser');
const { onRequest } = require('firebase-functions/v2/https');

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'gold-panel';
const databaseURL =
  process.env.FIREBASE_DATABASE_URL ||
  `https://${projectId}-default-rtdb.europe-west1.firebasedatabase.app`;

admin.initializeApp({ databaseURL });
const db = admin.database();

const corsMiddleware = cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

const app = express();
app.use(corsMiddleware);
app.options('*', corsMiddleware);
app.use(express.json({ limit: '100kb' }));

const DEFAULT_SETTINGS = {
  buybackPercentOfScrap: 92,
  rangeHalfWidthPercent: 2,
  purityAdjustments: { 375: 0, 500: 0, 583: 0, 585: 0, 750: 0, 875: 0, 916: 0, 958: 0, 999: 0 },
  purityOrder: [375, 500, 583, 585, 750, 875, 916, 958, 999],
};

function parseRussianNum(s) {
  if (s == null) return null;
  const n = parseFloat(String(s).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function todayCbrDate() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function fetchCbrGoldRubPerGram() {
  const dateReq = todayCbrDate();
  const { data: xml } = await axios.get('https://www.cbr.ru/scripts/xml_metall.asp', {
    params: { date_req1: dateReq, date_req2: dateReq },
    timeout: 20000,
    responseType: 'text',
    headers: { 'User-Agent': 'CalculatedGold/1.0' },
  });
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
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

async function getPriceCache() {
  const snap = await db.ref('cache/goldPrice').get();
  return snap.exists() ? snap.val() : null;
}

async function setPriceCache(value) {
  await db.ref('cache/goldPrice').set(value);
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
  const snap = await db.ref('app/settings').get();
  const value = snap.exists() ? snap.val() : null;
  if (!value) {
    await db.ref('app/settings').set(DEFAULT_SETTINGS);
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
  await db.ref('app/settings').set(next);
  return next;
}

function calculateBuybackRange({ weightGrams, purityPerThousand, goldRubPerGram, settings }) {
  const w = Number(weightGrams);
  const purity = Number(purityPerThousand);
  if (!Number.isFinite(w) || w <= 0) return { ok: false, error: 'Укажите положительный вес, г' };
  if (!Number.isFinite(purity) || purity <= 0 || purity > 1000) return { ok: false, error: 'Некорректная проба' };
  if (!Number.isFinite(goldRubPerGram) || goldRubPerGram <= 0) return { ok: false, error: 'Курс золота недоступен. Подождите обновления.' };
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

async function ensureBootstrapAdmin(uid) {
  const adminSnap = await db.ref('admins').limitToFirst(1).get();
  if (!adminSnap.exists()) {
    await db.ref(`admins/${uid}`).set(true);
    await db.ref(`userRoles/${uid}`).set('admin');
  }
}

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Требуется вход' });
    const token = authHeader.slice(7);
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    await ensureBootstrapAdmin(decoded.uid);
    next();
  } catch {
    res.status(401).json({ error: 'Сессия недействительна' });
  }
}

async function requireAdmin(req, res, next) {
  const isAdmin = (await db.ref(`admins/${req.user.uid}`).get()).val() === true;
  if (!isAdmin) return res.status(403).json({ error: 'Недостаточно прав' });
  next();
}

const api = express.Router();
api.use(authMiddleware);

api.get('/auth/me', async (req, res) => {
  const adminSnap = await db.ref(`admins/${req.user.uid}`).get();
  const roleSnap = await db.ref(`userRoles/${req.user.uid}`).get();
  const isAdmin = adminSnap.val() === true;
  const role = isAdmin ? 'admin' : roleSnap.val() || 'courier';
  res.json({ user: { uid: req.user.uid, email: req.user.email, role } });
});

api.get('/price', async (_req, res) => {
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
});

api.post('/price/refresh', requireAdmin, async (_req, res) => {
  const data = await refreshPriceCache(true);
  res.json(data);
});

api.post('/calculate', async (req, res) => {
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
});

api.get('/settings', async (_req, res) => {
  res.json(await getSettings());
});

api.put('/settings', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const allowed = ['buybackPercentOfScrap', 'rangeHalfWidthPercent', 'purityAdjustments', 'purityOrder'];
  const patch = {};
  for (const k of allowed) if (body[k] !== undefined) patch[k] = body[k];
  res.json(await saveSettings(patch));
});

api.get('/users', requireAdmin, async (_req, res) => {
  const listed = await admin.auth().listUsers(1000);
  const roleSnap = await db.ref('userRoles').get();
  const adminSnap = await db.ref('admins').get();
  const roles = roleSnap.exists() ? roleSnap.val() : {};
  const admins = adminSnap.exists() ? adminSnap.val() : {};
  res.json(
    listed.users.map((u) => ({
      uid: u.uid,
      email: u.email,
      disabled: !!u.disabled,
      role: admins[u.uid] === true ? 'admin' : roles[u.uid] || 'courier',
    }))
  );
});

api.post('/users', requireAdmin, async (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });
  const r = String(role || 'courier').toLowerCase();
  if (r === 'admin') {
    return res.status(400).json({
      error: 'Администратора нельзя создать из панели. Используйте Firebase Console при необходимости.',
    });
  }
  const dbRole = r === 'seller' ? 'seller' : 'courier';
  const user = await admin.auth().createUser({ email: String(email).trim(), password: String(password) });
  await db.ref(`userRoles/${user.uid}`).set(dbRole);
  await db.ref(`admins/${user.uid}`).remove();
  res.json({ ok: true, uid: user.uid });
});

api.delete('/users/:uid', requireAdmin, async (req, res) => {
  const uid = req.params.uid;
  if (uid === req.user.uid) return res.status(400).json({ error: 'Нельзя удалить себя' });
  await admin.auth().deleteUser(uid);
  await db.ref(`userRoles/${uid}`).remove();
  await db.ref(`admins/${uid}`).remove();
  res.json({ ok: true });
});

app.use('/api', api);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

exports.api = onRequest({ region: 'europe-west1', cors: true }, app);
