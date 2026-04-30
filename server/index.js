import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';
import { buildScrapContractPdfBuffer } from './scrapContractPdf.js';
import { computeAnalyticsSummaryData } from './analyticsSummaryData.js';
import { buildAnalyticsReportPdfBuffer } from './analyticsReportPdf.js';
import { computeTeamPerformanceData } from './teamPerformanceData.js';
import { buildTeamPerformancePdfBuffer } from './teamPerformancePdf.js';
import { firstFilledContractRow } from './scrapDealFirstRow.js';

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

function normalizeScrapPhoneDigits(v) {
  const digits = String(v || '').replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return digits.slice(1);
  }
  if (digits.length === 10) return digits;
  return '';
}

/** Единый вид в БД для РФ-номера и поле для точного поиска. */
function scrapCustomerPhonePayload(phoneRaw) {
  const raw = phoneRaw != null && String(phoneRaw).trim() ? String(phoneRaw).trim() : null;
  if (!raw) return { phone: null, phone_normalized: null };
  const n = normalizeScrapPhoneDigits(raw);
  if (n.length === 10) return { phone: `+7${n}`, phone_normalized: n };
  return { phone: raw, phone_normalized: null };
}

function sortCustomersByNameRu(rows) {
  return [...rows].sort((a, b) =>
    String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ru', { sensitivity: 'base' })
  );
}

function parseCellNumber(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

async function resolveCustomerIdByPhone(phone) {
  const n = normalizeScrapPhoneDigits(phone);
  if (!n) return null;
  const { data: hit, error } = await supabase
    .from('scrap_customers')
    .select('id')
    .eq('phone_normalized', n)
    .maybeSingle();
  if (!error && hit?.id) return hit.id;
  const { data, error: e2 } = await supabase.from('scrap_customers').select('id, phone');
  if (e2) return null;
  for (const row of data || []) {
    if (row?.id && normalizeScrapPhoneDigits(row.phone) === n) return row.id;
  }
  return null;
}

async function recordScrapDealFromPdf({ req, body, totalRub }) {
  const userId = req.user?.id || null;
  const customerRaw = body?.customerId;
  let customerId =
    customerRaw && /^[0-9a-f-]{36}$/i.test(String(customerRaw)) ? String(customerRaw) : null;
  const phone = String(body?.phone || '').trim() || null;
  const phoneNorm = normalizeScrapPhoneDigits(phone) || null;
  if (!customerId && phone) {
    const resolved = await resolveCustomerIdByPhone(phone);
    if (resolved) customerId = resolved;
  }
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  const r0 = firstFilledContractRow(rows) || {};
  const probeStr = String(r0?.probe || '').replace(/\D/g, '');
  const firstProbe = probeStr ? parseInt(probeStr, 10) : null;
  const firstWg = parseCellNumber(r0?.weightGross ?? r0?.weight_gross);
  const firstWn = parseCellNumber(r0?.weightNet ?? r0?.weight_net);
  const { error } = await supabase.from('scrap_deals').insert({
    customer_id: customerId,
    operator_id: userId,
    contract_no: String(body?.contractNo || '').trim() || null,
    total_rub: totalRub,
    seller_name: String(body?.sellerName || '').trim() || null,
    phone,
    phone_normalized: phoneNorm,
    rows,
    first_probe: Number.isFinite(firstProbe) ? firstProbe : null,
    first_weight_gross: firstWg,
    first_weight_net: firstWn,
    appraiser_name: String(body?.appraiserName || '').trim() || null,
  });
  if (error) throw error;
}

/** Email → полный доступ к API (если роль из profiles по какой-то причине не подтягивается). Render: PANEL_FULL_ACCESS_EMAILS=a@b.com,c@d.com */
function panelFullAccessEmails() {
  return (process.env.PANEL_FULL_ACCESS_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function hasPanelFullAccessByEmail(user) {
  const e = String(user?.email || '').trim().toLowerCase();
  if (!e) return false;
  return panelFullAccessEmails().includes(e);
}

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
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '100kb' }));

const DEFAULT_SETTINGS = {
  buybackPercentOfScrap: 92,
  rangeHalfWidthPercent: 2,
  purityAdjustments: { 375: 0, 500: 0, 583: 0, 585: 0, 750: 0, 875: 0, 900: 0, 916: 0, 958: 0, 999: 0 },
  purityOrder: [375, 500, 583, 585, 750, 875, 900, 916, 958, 999],
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

/** ISS MOEX: фьючерс GLDRUBF, цена в руб/г чистого золота, обновляется в торговую сессию */
const MOEX_GOLD_ISS_URL =
  process.env.MOEX_GOLD_ISS_URL ||
  'https://iss.moex.com/iss/engines/futures/markets/forts/securities/GLDRUBF.json';

/**
 * PRICE_SOURCE: auto | moex | cbr
 * auto — сначала Мосбиржа, при ошибке официальный курс ЦБ
 */
function priceSourceMode() {
  return (process.env.PRICE_SOURCE || 'auto').toLowerCase().trim();
}

async function fetchMoexGoldRubPerGram() {
  const { data } = await axios.get(MOEX_GOLD_ISS_URL, {
    params: { 'iss.meta': 'off' },
    timeout: 20000,
    headers: { 'User-Agent': 'CalculatedGold/1.0' },
    validateStatus: (s) => s === 200,
  });

  const cols = data?.marketdata?.columns;
  const rowArr = data?.marketdata?.data?.[0];
  if (!cols?.length || !rowArr) throw new Error('MOEX: нет данных marketdata');

  const row = Object.fromEntries(cols.map((c, i) => [c, rowArr[i]]));
  const last = typeof row.LAST === 'number' ? row.LAST : parseFloat(String(row.LAST).replace(',', '.'));
  if (!Number.isFinite(last) || last <= 0) throw new Error('MOEX: нет последней цены (LAST)');

  return {
    goldRubPerGram: last,
    sellRubPerGram: null,
    cbrDate: null,
    moexSecurity: 'GLDRUBF',
    moexTradeDate: row.TRADEDATE || null,
    moexSysTime: row.SYSTIME || null,
    source: 'moex',
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchGoldPrice() {
  const mode = priceSourceMode();
  if (mode === 'cbr') {
    const c = await fetchCbrGoldRubPerGram();
    return { ...c, source: 'cbr', fallbackFrom: null };
  }
  if (mode === 'moex') {
    return await fetchMoexGoldRubPerGram();
  }
  try {
    return await fetchMoexGoldRubPerGram();
  } catch (err) {
    const c = await fetchCbrGoldRubPerGram();
    return {
      ...c,
      source: 'cbr',
      fallbackFrom: 'moex',
      fallbackReason: err?.message || String(err),
    };
  }
}

const TROY_OZ_GRAMS = 31.1034768;
const COINGECKO_XAUT_URL =
  process.env.COINGECKO_XAUT_URL ||
  'https://api.coingecko.com/api/v3/simple/price?ids=tether-gold&vs_currencies=usd';

/** Курс USD к рублю по ежедневному XML ЦБ */
async function fetchCbrUsdRub() {
  const { data: xml } = await axios.get('https://www.cbr.ru/scripts/XML_daily.asp', {
    timeout: 20000,
    responseType: 'text',
    headers: { 'User-Agent': 'CalculatedGold/1.0' },
  });
  const doc = parser.parse(xml);
  const cursDate = doc?.ValCurs?.['@_Date'] || doc?.ValCurs?.Date || null;
  const vals = doc?.ValCurs?.Valute;
  const list = Array.isArray(vals) ? vals : vals ? [vals] : [];
  const usd = list.find((v) => v.CharCode === 'USD');
  if (!usd) throw new Error('ЦБ: нет курса USD');
  const rub = parseRussianNum(usd.VunitRate || usd.Value);
  if (!rub || !Number.isFinite(rub)) throw new Error('ЦБ: не удалось разобрать USD');
  return { usdRub: rub, cbrDate: cursDate };
}

/** Tether Gold XAUT: цена токена в USD за тройскую унцию (1 XAUT = 1 oz) */
async function fetchXautUsdPerOz() {
  const { data } = await axios.get(COINGECKO_XAUT_URL, {
    timeout: 20000,
    headers: { 'User-Agent': 'CalculatedGold/1.0' },
    validateStatus: (s) => s === 200,
  });
  const raw = data?.['tether-gold']?.usd;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) throw new Error('CoinGecko: нет цены tether-gold (XAUT)');
  return n;
}

async function fetchXautGoldRubPerGram() {
  const [usdPerOz, { usdRub, cbrDate }] = await Promise.all([fetchXautUsdPerOz(), fetchCbrUsdRub()]);
  const usdPerGram = usdPerOz / TROY_OZ_GRAMS;
  const goldRubPerGram = usdPerGram * usdRub;
  return {
    goldRubPerGram,
    sellRubPerGram: null,
    cbrDate,
    xautUsdPerOz: usdPerOz,
    cbrUsdRub: usdRub,
    source: 'xaut',
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchCbrGoldRubPerGram() {
  // CBR doesn't publish quotes on weekends/holidays — try up to 4 days back
  const MAX_DAYS_BACK = 4;
  let lastError;

  for (let daysBack = 0; daysBack <= MAX_DAYS_BACK; daysBack++) {
    const d = new Date();
    d.setDate(d.getDate() - daysBack);
    const dateReq = formatCbrDate(d);

    try {
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
      if (!gold) {
        lastError = new Error(`CBR: нет данных за ${dateReq}`);
        continue;
      }

      const buy = parseRussianNum(gold.Buy);
      const sell = parseRussianNum(gold.Sell);
      if (!buy) {
        lastError = new Error('CBR: не удалось разобрать цену золота');
        continue;
      }

      return {
        goldRubPerGram: buy,
        sellRubPerGram: sell,
        cbrDate: gold['@_Date'] || dateReq,
        fetchedAt: new Date().toISOString(),
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error(`CBR: нет данных за последние ${MAX_DAYS_BACK + 1} дней`);
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
    const fresh = await fetchGoldPrice();
    const payload = {
      ...fresh,
      cachedAt: new Date().toISOString(),
      error: null,
      lastRefreshError: null,
    };
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
      source: priceSourceMode() === 'moex' ? 'moex' : 'cbr',
      cachedAt: new Date().toISOString(),
      error: message,
    };
    await setPriceCache(fallback);
    return { ...fallback, stale: true };
  }
}

const KV_XAUT = 'gold_price_xaut';

async function refreshXautPriceCache(force = false) {
  const existing = await getKv(KV_XAUT);
  if (!force && existing?.cachedAt) {
    const age = Date.now() - new Date(existing.cachedAt).getTime();
    if (age < ttlMs()) return { ...existing, stale: false, ageMs: age };
  }

  try {
    const fresh = await fetchXautGoldRubPerGram();
    const payload = {
      ...fresh,
      cachedAt: new Date().toISOString(),
      error: null,
      lastRefreshError: null,
    };
    await setKv(KV_XAUT, payload);
    return { ...payload, stale: false, ageMs: 0 };
  } catch (err) {
    const message = err?.message || 'Ошибка загрузки XAUT';
    if (existing) {
      const merged = { ...existing, lastRefreshError: message, lastRefreshAttemptAt: new Date().toISOString() };
      await setKv(KV_XAUT, merged);
      return { ...merged, stale: true, error: message };
    }
    const fallback = {
      goldRubPerGram: null,
      sellRubPerGram: null,
      cbrDate: null,
      source: 'xaut',
      cachedAt: new Date().toISOString(),
      error: message,
    };
    await setKv(KV_XAUT, fallback);
    return { ...fallback, stale: true };
  }
}

async function getSettings() {
  const value = await getKv('settings');
  if (!value || Object.keys(value).length === 0) {
    await setKv('settings', DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  const rawOrder = Array.isArray(value.purityOrder) ? value.purityOrder : DEFAULT_SETTINGS.purityOrder;
  const orderNums = rawOrder
    .map((p) => Number(p))
    .filter((p) => Number.isFinite(p));
  const uniqueOrder = [...new Set(orderNums)];
  if (!uniqueOrder.includes(900)) {
    const idx875 = uniqueOrder.indexOf(875);
    if (idx875 >= 0) uniqueOrder.splice(idx875 + 1, 0, 900);
    else uniqueOrder.push(900);
  }
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    purityAdjustments: { ...DEFAULT_SETTINGS.purityAdjustments, ...(value.purityAdjustments || {}) },
    purityOrder: uniqueOrder,
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

/**
 * Профиль + первый «владелец» проекта.
 * Важно: не вызывать RPC claim_first_admin со старой логикой (только role = 'admin'):
 * если в БД только super_admin, старая функция каждый вход сбрасывала пользователя в admin.
 * Здесь только проверка «есть ли кто-то с admin или super_admin» и обновление одной строки uid.
 */
async function ensureProfileAndBootstrap(userId) {
  const { data: row } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
  if (!row) {
    const { error: insErr } = await supabase.from('profiles').insert({ id: userId, role: 'courier' });
    if (insErr && insErr.code !== '23505') throw insErr;
  }
  const { data: managers, error: mErr } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['super_admin', 'admin'])
    .limit(1);
  if (mErr) {
    console.error('[profiles bootstrap]', mErr);
    return;
  }
  if (managers?.length) return;
  const { error: upErr } = await supabase
    .from('profiles')
    .update({ role: 'super_admin', updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (upErr) console.error('[bootstrap super_admin]', upErr);
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
    const rawRole = await loadProfileRole(user.id);
    const metaRole = user.app_metadata?.role ?? user.user_metadata?.role ?? null;
    const emailBypass = hasPanelFullAccessByEmail(user);

    req.profileRoleRaw = rawRole;
    req.isSuperAdmin =
      emailBypass ||
      isSuperAdminRole(rawRole) ||
      isSuperAdminRole(metaRole);
    req.isUserManager =
      emailBypass ||
      isUserManagerRole(rawRole) ||
      isUserManagerRole(metaRole) ||
      req.isSuperAdmin;
    next();
  } catch (e) {
    if (isDev) console.warn('[auth]', e?.message || e);
    res.status(401).json({ error: 'Сессия недействительна' });
  }
}

/** Единый разбор роли из БД (пробелы, регистр, невидимые символы, типичные опечатки). */
function normalizeRole(role) {
  let r = String(role ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u00a0-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (r === 'super-admin' || r === 'superadmin') r = 'super_admin';
  return r;
}

/** Только латинские буквы роли — ловит «super admin», «super_admin» с мусором в строке. */
function roleLettersOnly(role) {
  return String(role ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** Админ или супер: управление пользователями (создание курьеров/продавцов; супер — ещё и админов). */
function isUserManagerRole(role) {
  const r = normalizeRole(role);
  return r === 'admin' || r === 'super_admin';
}

/** Супер-админ: PUT /settings и управление админами; обновление курса — у любого вошедшего (см. POST /price/refresh). */
function isSuperAdminRole(role) {
  if (role == null || role === '') return false;
  const r = normalizeRole(role);
  if (r === 'super_admin') return true;
  return roleLettersOnly(role) === 'superadmin';
}

async function loadProfileRole(userId) {
  let { data: prof } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (!prof) {
    await ensureProfileAndBootstrap(userId);
    ({ data: prof } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle());
  }
  return prof?.role ?? null;
}

async function requireUserManager(req, res, next) {
  if (req.isUserManager) return next();
  try {
    const raw = await loadProfileRole(req.user.id);
    const meta = req.user?.app_metadata?.role ?? req.user?.user_metadata?.role ?? null;
    if (isUserManagerRole(raw) || isUserManagerRole(meta) || isSuperAdminRole(meta)) return next();
    return res.status(403).json({ error: 'Недостаточно прав' });
  } catch (e) {
    console.warn('[requireUserManager]', req.user?.id, e?.message || e);
    return res.status(403).json({ error: 'Недостаточно прав' });
  }
}

async function requireSuperAdmin(req, res, next) {
  if (req.isSuperAdmin) return next();
  try {
    const raw = await loadProfileRole(req.user.id);
    const meta = req.user?.app_metadata?.role ?? req.user?.user_metadata?.role ?? null;
    if (isSuperAdminRole(raw) || isSuperAdminRole(meta)) return next();
    return res.status(403).json({ error: 'Недостаточно прав' });
  } catch (e) {
    console.warn('[requireSuperAdmin]', req.user?.id, e?.message || e);
    return res.status(403).json({ error: 'Недостаточно прав' });
  }
}

async function getRequesterRole(req) {
  if (req.isSuperAdmin) return 'super_admin';
  const raw = await loadProfileRole(req.user.id);
  const meta = req.user?.app_metadata?.role ?? req.user?.user_metadata?.role ?? null;
  const rProf = normalizeRole(raw);
  const rMeta = normalizeRole(meta);
  if (isSuperAdminRole(raw) || isSuperAdminRole(meta)) return 'super_admin';
  if (rProf === 'admin' || rMeta === 'admin') return 'admin';
  if (rProf === 'seller' || rMeta === 'seller') return 'seller';
  if (rProf === 'courier' || rMeta === 'courier') return 'courier';
  return 'courier';
}

async function getProfileRoleById(uid) {
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
  const r = normalizeRole(prof?.role);
  if (r === 'admin' || r === 'super_admin' || r === 'seller' || r === 'courier') return r;
  return 'courier';
}

async function teamPerformanceOptsFromRequest(req) {
  const role = await getRequesterRole(req);
  const emailBypass = hasPanelFullAccessByEmail(req.user);
  const isMgr = emailBypass || isUserManagerRole(role);
  const operatorsQ = String(req.query.operators || '').trim();
  const operatorFilterIds = operatorsQ
    ? operatorsQ.split(/[,+]/).map((s) => s.trim()).filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    : null;
  return {
    fromD: String(req.query.from || '').trim(),
    toD: String(req.query.to || '').trim(),
    viewerIsManager: isMgr,
    viewerUserId: req.user.id,
    operatorFilterIds: isMgr ? operatorFilterIds : null,
  };
}

// ── SSE: real-time price stream ────────────────────────────────────────────
const sseClients = new Set();

function broadcastPrice(priceData) {
  if (sseClients.size === 0) return;
  const msg = `data: ${JSON.stringify(priceData)}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch { sseClients.delete(client); }
  }
}

// Server-side periodic push every 60 s (mirrors old client polling)
setInterval(async () => {
  if (sseClients.size === 0) return;
  try {
    const existing = await getPriceCache();
    if (!existing) return;
    const age = Date.now() - new Date(existing.cachedAt).getTime();
    const payload = age >= ttlMs()
      ? await refreshPriceCache(false)
      : { ...existing, stale: age >= ttlMs(), ageMs: age };
    broadcastPrice(payload);
  } catch {}
}, 60_000);

/**
 * Эти три маршрута — напрямую на app (не через Router), до authMiddleware: только JWT внутри.
 * Так POST /api/price/refresh никогда не попадает в цепочку с проверкой ролей (403).
 */
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get(
  '/api/price/stream',
  asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Требуется вход' });
    const rawToken = authHeader.slice(7);
    const { user, error } = await getUserFromAccessToken(rawToken);
    if (error || !user?.id) return res.status(401).json({ error: 'Сессия недействительна' });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    sseClients.add(res);

    try {
      const p = await getPriceCache();
      if (p) res.write(`data: ${JSON.stringify(p)}\n\n`);
    } catch {}

    const hb = setInterval(() => {
      try { res.write(': ping\n\n'); } catch {}
    }, 25_000);

    req.on('close', () => {
      sseClients.delete(res);
      clearInterval(hb);
    });
  })
);
app.post(
  '/api/price/refresh',
  asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Требуется вход' });
    const token = authHeader.slice(7);
    const { user, error } = await getUserFromAccessToken(token);
    if (error || !user?.id) return res.status(401).json({ error: 'Сессия недействительна' });
    await ensureProfileAndBootstrap(user.id);
    await refreshXautPriceCache(true);
    const data = await refreshPriceCache(true);
    broadcastPrice(data);
    res.json(data);
  })
);

app.use('/api', asyncHandler(authMiddleware));

app.get(
  '/api/auth/me',
  asyncHandler(async (req, res) => {
    const role = await getRequesterRole(req);
    res.json({ user: { uid: req.user.id, email: req.user.email, role } });
  })
);

app.get(
  '/api/price',
  asyncHandler(async (req, res) => {
    const quote = String(req.query.quote || 'moex').toLowerCase();

    if (quote === 'xaut') {
      let data = await getKv(KV_XAUT);
      if (!data?.goldRubPerGram) data = await refreshXautPriceCache(false);
      const ageMs = data?.cachedAt ? Date.now() - new Date(data.cachedAt).getTime() : Number.MAX_SAFE_INTEGER;
      return res.json({
        goldRubPerGram: data?.goldRubPerGram ?? null,
        sellRubPerGram: data?.sellRubPerGram ?? null,
        cbrDate: data?.cbrDate ?? null,
        xautUsdPerOz: data?.xautUsdPerOz ?? null,
        cbrUsdRub: data?.cbrUsdRub ?? null,
        moexTradeDate: null,
        moexSysTime: null,
        moexSecurity: null,
        fallbackFrom: null,
        cachedAt: data?.cachedAt ?? null,
        stale: ageMs > ttlMs(),
        source: 'xaut',
        quote: 'xaut',
        error: data?.error || data?.lastRefreshError || null,
      });
    }

    let data = await getPriceCache();
    if (!data?.goldRubPerGram) data = await refreshPriceCache(false);
    const ageMs = data?.cachedAt ? Date.now() - new Date(data.cachedAt).getTime() : Number.MAX_SAFE_INTEGER;
    res.json({
      goldRubPerGram: data?.goldRubPerGram ?? null,
      sellRubPerGram: data?.sellRubPerGram ?? null,
      cbrDate: data?.cbrDate ?? null,
      moexTradeDate: data?.moexTradeDate ?? null,
      moexSysTime: data?.moexSysTime ?? null,
      moexSecurity: data?.moexSecurity ?? null,
      fallbackFrom: data?.fallbackFrom ?? null,
      cachedAt: data?.cachedAt ?? null,
      stale: ageMs > ttlMs(),
      source: data?.source ?? 'cbr',
      quote: 'moex',
      error: data?.error || data?.lastRefreshError || null,
    });
  })
);

app.post(
  '/api/calculate',
  asyncHandler(async (req, res) => {
    const { weightGrams, purityPerThousand } = req.body || {};
    const quote = String(req.body?.quote || 'moex').toLowerCase();
    let cache;
    if (quote === 'xaut') {
      cache = await getKv(KV_XAUT);
      if (!cache?.goldRubPerGram) cache = await refreshXautPriceCache(false);
    } else {
      cache = await getPriceCache();
      if (!cache?.goldRubPerGram) cache = await refreshPriceCache(false);
    }
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

app.get(
  '/api/scrap-customers/search',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ customers: [] });
    const esc = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    const pattern = `%${esc}%`;
    const sel = 'id, full_name, phone, passport_line, address, updated_at';
    const phoneDig = normalizeScrapPhoneDigits(q);

    const { data: byName, error: e1 } = await supabase
      .from('scrap_customers')
      .select(sel)
      .ilike('full_name', pattern)
      .limit(40);
    if (e1) throw e1;

    let byPhone = [];
    if (phoneDig.length === 10) {
      const { data: byNorm, error: e2 } = await supabase
        .from('scrap_customers')
        .select(sel)
        .eq('phone_normalized', phoneDig)
        .limit(20);
      if (e2) throw e2;
      byPhone = byNorm || [];
      if (byPhone.length === 0) {
        const { data: fallback, error: e3 } = await supabase
          .from('scrap_customers')
          .select(sel)
          .ilike('phone', `%${phoneDig}%`)
          .limit(20);
        if (e3) throw e3;
        byPhone = fallback || [];
      }
    } else {
      const { data: byIl, error: e4 } = await supabase
        .from('scrap_customers')
        .select(sel)
        .ilike('phone', pattern)
        .limit(20);
      if (e4) throw e4;
      byPhone = byIl || [];
    }

    const map = new Map();
    for (const r of [...(byName || []), ...byPhone]) {
      if (r?.id) map.set(r.id, r);
    }
    const merged = sortCustomersByNameRu([...map.values()]).slice(0, 20);
    res.json({ customers: merged });
  })
);

const SCRAP_CUST_LIST_SEL = 'id, full_name, phone, passport_line, address, created_at, updated_at';

app.get(
  '/api/scrap-customers',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
    if (q.length >= 1) {
      const esc = q.replace(/%/g, '\\%').replace(/_/g, '\\_');
      const p = `%${esc}%`;
      const phoneDig = normalizeScrapPhoneDigits(q);

      const { data: byName, error: e1 } = await supabase
        .from('scrap_customers')
        .select(SCRAP_CUST_LIST_SEL)
        .ilike('full_name', p)
        .range(0, 1999);
      if (e1) throw e1;

      let byPhone = [];
      if (phoneDig.length === 10) {
        const { data: byNorm, error: e2 } = await supabase
          .from('scrap_customers')
          .select(SCRAP_CUST_LIST_SEL)
          .eq('phone_normalized', phoneDig)
          .range(0, 999);
        if (e2) throw e2;
        byPhone = byNorm || [];
        if (byPhone.length === 0) {
          const { data: fb, error: e3 } = await supabase
            .from('scrap_customers')
            .select(SCRAP_CUST_LIST_SEL)
            .ilike('phone', `%${phoneDig}%`)
            .range(0, 1999);
          if (e3) throw e3;
          byPhone = fb || [];
        }
      } else {
        const { data: byIl, error: e4 } = await supabase
          .from('scrap_customers')
          .select(SCRAP_CUST_LIST_SEL)
          .ilike('phone', p)
          .range(0, 1999);
        if (e4) throw e4;
        byPhone = byIl || [];
      }

      const map = new Map();
      for (const r of [...(byName || []), ...byPhone]) {
        if (r?.id) map.set(r.id, r);
      }
      const merged = sortCustomersByNameRu([...map.values()]);
      return res.json({ customers: merged.slice(offset, offset + limit), total: merged.length });
    }
    const { data, count, error } = await supabase
      .from('scrap_customers')
      .select(SCRAP_CUST_LIST_SEL, { count: 'exact' })
      .order('full_name', { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    res.json({ customers: data || [], total: count ?? 0 });
  })
);

app.get(
  '/api/scrap-deals',
  asyncHandler(async (req, res) => {
    const customerId = String(req.query.customerId || '').trim();
    const phone = String(req.query.phone || '').trim();
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '40'), 10) || 40));
    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
    const sel =
      'id, customer_id, contract_no, total_rub, seller_name, phone, first_probe, first_weight_gross, first_weight_net, created_at, "rows"';
    if (phone && !customerId) {
      const n = normalizeScrapPhoneDigits(phone);
      if (!n) return res.json({ deals: [], total: 0 });
      const { data, error, count } = await supabase
        .from('scrap_deals')
        .select(sel, { count: 'exact' })
        .eq('phone_normalized', n)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return res.json({ deals: data || [], total: count ?? 0 });
    }
    if (customerId) {
      const { data: byCid, error: e1 } = await supabase
        .from('scrap_deals')
        .select(sel)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (e1) throw e1;
      const { data: cust } = await supabase
        .from('scrap_customers')
        .select('phone')
        .eq('id', customerId)
        .maybeSingle();
      const n = cust?.phone ? normalizeScrapPhoneDigits(cust.phone) : '';
      let orphan = [];
      if (n) {
        const { data: byPhone, error: e2 } = await supabase
          .from('scrap_deals')
          .select(sel)
          .is('customer_id', null)
          .eq('phone_normalized', n)
          .order('created_at', { ascending: false })
          .limit(500);
        if (e2) throw e2;
        orphan = byPhone || [];
      }
      const map = new Map();
      for (const r of [...(byCid || []), ...orphan]) {
        if (r?.id) map.set(r.id, r);
      }
      const merged = [...map.values()].sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );
      return res.json({ deals: merged.slice(offset, offset + limit), total: merged.length });
    }
    if (!phone && !customerId) {
      return res.status(400).json({ error: 'Укажите customerId или phone' });
    }
    return res.json({ deals: [], total: 0 });
  })
);

app.get(
  '/api/scrap-deals/:id/pdf',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ error: 'Некорректный id' });
    }
    const { data: deal, error: dErr } = await supabase
      .from('scrap_deals')
      .select(
        'id, customer_id, contract_no, total_rub, seller_name, phone, "rows", appraiser_name, created_at'
      )
      .eq('id', id)
      .maybeSingle();
    if (dErr) throw dErr;
    if (!deal) return res.status(404).json({ error: 'Сделка не найдена' });

    let passportLine = '—';
    let address = '—';
    let sellerName = (deal.seller_name && String(deal.seller_name).trim()) || '—';
    if (deal.customer_id) {
      const { data: cu } = await supabase
        .from('scrap_customers')
        .select('full_name, passport_line, address, phone')
        .eq('id', deal.customer_id)
        .maybeSingle();
      if (cu) {
        if (cu.full_name) sellerName = String(cu.full_name).trim();
        passportLine = (cu.passport_line && String(cu.passport_line).trim()) || '—';
        address = (cu.address && String(cu.address).trim()) || '—';
      }
    }

    const rows = Array.isArray(deal.rows) ? deal.rows : [];
    const issueFromDeal = deal.created_at
      ? new Date(deal.created_at).toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          timeZone: 'Europe/Moscow',
        })
      : '';
    const buf = await buildScrapContractPdfBuffer({
      contractNo: deal.contract_no || '',
      sellerName,
      passportLine,
      address,
      phone: deal.phone || '',
      appraiserName: deal.appraiser_name != null && String(deal.appraiser_name).trim() !== '' ? deal.appraiser_name : '________________',
      rows,
      totalRub: deal.total_rub,
      issueDate: issueFromDeal,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="dogovor-${id.slice(0, 8)}.pdf"`);
    res.send(buf);
  })
);

app.delete(
  '/api/scrap-deals/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ error: 'Некорректный id' });
    }
    const { data: row, error: fErr } = await supabase
      .from('scrap_deals')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (fErr) throw fErr;
    if (!row) return res.status(404).json({ error: 'Сделка не найдена' });
    const { error: dErr } = await supabase.from('scrap_deals').delete().eq('id', id);
    if (dErr) throw dErr;
    res.json({ ok: true });
  })
);

app.get(
  '/api/analytics/summary',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const fromD = String(req.query.from || '').trim();
    const toD = String(req.query.to || '').trim();
    const data = await computeAnalyticsSummaryData(supabase, fromD, toD);
    res.json(data);
  })
);

app.get(
  '/api/analytics/summary.pdf',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const fromD = String(req.query.from || '').trim();
    const toD = String(req.query.to || '').trim();
    const g = String(req.query.group || 'day').toLowerCase();
    const group = g === 'week' || g === 'month' ? g : 'day';
    const data = await computeAnalyticsSummaryData(supabase, fromD, toD);
    const sectionsQ = String(req.query.sections || '');
    const buf = await buildAnalyticsReportPdfBuffer(data, group, sectionsQ);
    const p = data.period || {};
    const safe = (s) => String(s || 'x').replace(/[^\d-]/g, '') || 'period';
    const fname = `analitika-${safe(p.from)}_${safe(p.to)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(buf);
  })
);

app.get(
  '/api/team-performance',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const opts = await teamPerformanceOptsFromRequest(req);
    const data = await computeTeamPerformanceData(supabase, opts);
    res.json(data);
  })
);

app.get(
  '/api/team-performance.pdf',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const opts = await teamPerformanceOptsFromRequest(req);
    const data = await computeTeamPerformanceData(supabase, opts);
    const buf = await buildTeamPerformancePdfBuffer(data);
    const p = data.period || {};
    const safe = (s) => String(s || 'x').replace(/[^\d-]/g, '') || 'period';
    const fname = `komanda-kpi-${safe(p.from)}_${safe(p.to)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(Buffer.from(buf));
  })
);

app.delete(
  '/api/scrap-customers/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ error: 'Некорректный id' });
    }
    const { data: ex, error: fErr } = await supabase.from('scrap_customers').select('id').eq('id', id).maybeSingle();
    if (fErr) throw fErr;
    if (!ex) return res.status(404).json({ error: 'Клиент не найден' });
    const { error: dErr } = await supabase.from('scrap_customers').delete().eq('id', id);
    if (dErr) throw dErr;
    res.json({ ok: true, id });
  })
);

app.post(
  '/api/scrap-customers',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const full_name = String(body.full_name || '').trim();
    if (!full_name) return res.status(400).json({ error: 'Укажите ФИО' });
    const { phone, phone_normalized } = scrapCustomerPhonePayload(body.phone);
    const passport_line = String(body.passport_line || '').trim() || null;
    const address = String(body.address || '').trim() || null;
    const id = body.id ? String(body.id) : null;
    const now = new Date().toISOString();

    if (id) {
      const { data, error } = await supabase
        .from('scrap_customers')
        .update({ full_name, phone, phone_normalized, passport_line, address, updated_at: now })
        .eq('id', id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Клиент не найден' });
      return res.json({ customer: data });
    }

    let duplicateId = null;
    if (phone_normalized) {
      const { data: exN } = await supabase
        .from('scrap_customers')
        .select('id')
        .eq('phone_normalized', phone_normalized)
        .maybeSingle();
      duplicateId = exN?.id || null;
    }
    if (!duplicateId && phone) {
      const { data: exP } = await supabase.from('scrap_customers').select('id').eq('phone', phone).maybeSingle();
      duplicateId = exP?.id || null;
    }
    if (duplicateId) {
      const { data, error } = await supabase
        .from('scrap_customers')
        .update({ full_name, phone, phone_normalized, passport_line, address, updated_at: now })
        .eq('id', duplicateId)
        .select()
        .maybeSingle();
      if (error) throw error;
      return res.json({ customer: data });
    }

    const { data, error } = await supabase
      .from('scrap_customers')
      .insert({ full_name, phone, phone_normalized, passport_line, address, updated_at: now })
      .select()
      .maybeSingle();
    if (error) throw error;
    res.json({ customer: data });
  })
);

app.post(
  '/api/scrap-contract/pdf',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const sellerName = String(body.sellerName || '').trim();
    if (!sellerName) return res.status(400).json({ error: 'Укажите ФИО продавца' });
    const rows = Array.isArray(body.rows) ? body.rows : [];
    let total = body.totalRub != null ? Math.round(Number(body.totalRub)) : NaN;
    if (!Number.isFinite(total)) {
      total = 0;
      for (const r of rows) {
        const raw = r?.priceRub;
        const p =
          typeof raw === 'number'
            ? raw
            : parseFloat(String(raw ?? '').replace(/\s/g, '').replace(',', '.'));
        if (Number.isFinite(p)) total += Math.round(p);
      }
    }
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: 'Укажите итоговую сумму или стоимость по строкам' });
    }
    const buf = await buildScrapContractPdfBuffer({ ...body, totalRub: total });
    try {
      await recordScrapDealFromPdf({ req, body, totalRub: total });
    } catch (e) {
      console.error('[scrap_deals insert]', e?.message || e);
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="dogovor-kvitanciya.pdf"');
    res.send(buf);
  })
);

app.get('/api/settings', asyncHandler(async (_req, res) => res.json(await getSettings())));

app.put(
  '/api/settings',
  asyncHandler(requireSuperAdmin),
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
  asyncHandler(requireUserManager),
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
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    const { email, password, role } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });
    const me = await getRequesterRole(req);
    const ALL = ['courier', 'seller', 'admin', 'super_admin'];
    const requested = String(role || 'courier').toLowerCase();
    if (!ALL.includes(requested)) return res.status(400).json({ error: 'Недопустимая роль' });
    if (!req.isSuperAdmin && !isSuperAdminRole(me) && (requested === 'admin' || requested === 'super_admin')) {
      return res.status(403).json({ error: 'Только супер-администратор может создавать администраторов' });
    }
    const dbRole = requested;
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

app.patch(
  '/api/users/:uid/role',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    const uid = req.params.uid;
    const { role } = req.body || {};
    const me = await getRequesterRole(req);
    const targetRole = await getProfileRoleById(uid);
    const ALL = ['courier', 'seller', 'admin', 'super_admin'];
    const dbRole = String(role || '').toLowerCase();
    if (!ALL.includes(dbRole)) {
      return res.status(400).json({ error: 'Недопустимая роль' });
    }
    if (!req.isSuperAdmin && !isSuperAdminRole(me) && (targetRole === 'admin' || targetRole === 'super_admin')) {
      return res.status(403).json({ error: 'Только супер-администратор может менять роли администраторов' });
    }
    if (!req.isSuperAdmin && !isSuperAdminRole(me) && (dbRole === 'admin' || dbRole === 'super_admin')) {
      return res.status(403).json({ error: 'Только супер-администратор может назначать администраторов' });
    }
    const { error } = await supabase.from('profiles').upsert({ id: uid, role: dbRole }, { onConflict: 'id' });
    if (error) throw error;
    res.json({ ok: true, uid, role: dbRole });
  })
);

app.delete(
  '/api/users/:uid',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    const uid = req.params.uid;
    if (uid === req.user.id) return res.status(400).json({ error: 'Нельзя удалить себя' });
    const me = await getRequesterRole(req);
    const targetRole = await getProfileRoleById(uid);
    if (!req.isSuperAdmin && !isSuperAdminRole(me) && (targetRole === 'admin' || targetRole === 'super_admin')) {
      return res.status(403).json({ error: 'Только супер-администратор может удалять администраторов' });
    }
    const { error: dErr } = await supabase.auth.admin.deleteUser(uid);
    if (dErr) throw dErr;
    res.json({ ok: true });
  })
);

// Production: один Web Service (Render) отдаёт /api + SPA из client/dist — /api с того же домена без VITE_API_BASE.
if (!isDev) {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  if (existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { index: false }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Не найдено' });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.sendFile(path.join(clientDist, 'index.html'), (e) => e && next(e));
    });
  } else {
    console.warn(
      `[Calculated Gold] client/dist нет: ${clientDist} — в production: npm run build в корне, иначе задайте VITE_API_BASE.`
    );
  }
}

app.use((err, _req, res, _next) => {
  const mapped = mapSupabaseAuthAdminError(err);
  if (mapped) {
    return res.status(mapped.status).json({ error: mapped.message });
  }
  console.error('[API ERROR]', err?.stack || err);
  res.status(500).json({
    error: isDev ? `Внутренняя ошибка сервиса: ${err?.message || 'unknown'}` : 'Внутренняя ошибка сервиса',
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
