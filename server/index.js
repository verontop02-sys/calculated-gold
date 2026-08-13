import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';
import { buildScrapContractPdfBuffer } from './scrapContractPdf.js';
import { computeAnalyticsSummaryData } from './analyticsSummaryData.js';
import { buildAnalyticsReportPdfBuffer } from './analyticsReportPdf.js';
import { buildDashboardReportPdf } from './dashboardReportPdf.js';
import { computeTeamPerformanceData } from './teamPerformanceData.js';
import { buildTeamPerformancePdfBuffer } from './teamPerformancePdf.js';
import {
  insertScrapDealRow,
  updateScrapDealRow,
  createFieldDealSession,
  getPublicFieldDealSession,
  verifyFieldDealSession,
  sendFieldDealReceiptByClient,
  listFieldDealSessionsForManager,
  cancelFieldDealSession,
} from './fieldDealSession.js';
import { sendConsultLeadEmailIfConfigured } from './emailDealReceipt.js';
import { sendTelegramMessage } from './telegramNotify.js';
import {
  buildGoldIndexOverview,
  buildGoldIndexPublicSummary,
  createGoldIndexCity,
  updateGoldIndexCity,
  deleteGoldIndexCity,
  createGoldIndexCompetitor,
  updateGoldIndexCompetitor,
  deleteGoldIndexCompetitor,
  listGoldIndexHistory,
  enrichGoldIndexHistoryActors,
  geocodeGoldIndexLocation,
  reverseGeocodeGoldIndex,
  buildGoldIndexChartData,
} from './goldIndex.js';
import { buildGoldIndexReportPdfBuffer } from './goldIndexPdf.js';
import { buildGoldIndexExcelBuffer } from './goldIndexExcel.js';
import {
  requestClientCode,
  verifyClientCode,
  verifyClientToken,
  getClientDeals,
  getClientLoginMethod,
  verifyClientPin,
  setClientPin,
  getClientPinStatus,
} from './clientPortal.js';
import {
  setDisplayState,
  getDisplayState,
  subscribeDisplay,
  normalizeDisplayCode,
} from './clientDisplay.js';
import {
  deviceTrustEnabled,
  deviceHashFromReq,
  isDeviceTrusted,
  checkDeviceAndMaybeSendCode,
  verifyDeviceCode,
  logLoginEvent,
} from './deviceTrust.js';
import {
  requestFintechCode,
  verifyFintechCode,
  verifyFintechToken,
  exchangeClientSessionForFintech,
  getClientProfile as getFintechClientProfile,
  updateClientContactInfo,
  uploadKycDocument,
  submitForReview,
} from './fintechClients.js';
import {
  buyGold,
  sellGold,
  getClientPortfolio as getFintechPortfolio,
  getClientLedger as getFintechLedger,
  getFintechSettings,
  setFintechSettings,
} from './fintechLedger.js';
import {
  listFintechClients,
  getClientDetailForStaff,
  getKycDocumentSignedUrl,
  reviewKycDocument,
  decideClientStatus,
  manualTopup as fintechManualTopup,
  getFintechAdminSummary,
  deleteFintechClient,
} from './fintechAdmin.js';
import {
  requestWithdrawal as fintechRequestWithdrawal,
  getClientWithdrawals as getFintechClientWithdrawals,
  cancelWithdrawal as fintechCancelWithdrawal,
  listWithdrawalRequests as listFintechWithdrawalRequests,
  decideWithdrawal as decideFintechWithdrawal,
} from './fintechWithdrawals.js';
import {
  yookassaConfigured,
  createTopupPayment as createYooTopupPayment,
  creditYooPaymentIfSucceeded,
  handleYooWebhook,
  getYooPayment,
  minTopupRub as yooMinTopupRub,
} from './yookassa.js';
import {
  tbankConfigured,
  tbankIsDemo,
  tbankMinTopupRub,
  createTbankTopupPayment,
  creditTbankPaymentIfSucceeded,
  handleTbankWebhook,
  getTbankPaymentState,
} from './tbank.js';

/** Активный эквайринг: tbank | yookassa (по умолчанию — что настроено, приоритет TBANK если FINTECH_ACQUIRING_PROVIDER не задан и есть ключи). */
function acquiringProvider() {
  const forced = String(process.env.FINTECH_ACQUIRING_PROVIDER || '').trim().toLowerCase();
  if (forced === 'tbank' || forced === 'yookassa') return forced;
  if (tbankConfigured()) return 'tbank';
  if (yookassaConfigured()) return 'yookassa';
  return 'none';
}
import {
  createPriceAlert as createFintechPriceAlert,
  listClientPriceAlerts as listFintechClientPriceAlerts,
  cancelPriceAlert as cancelFintechPriceAlert,
  listActivePriceAlertsForStaff,
  processPriceAlerts,
  getClientRecurringInvestment as getFintechRecurringInvestment,
  upsertRecurringInvestment as upsertFintechRecurringInvestment,
  setRecurringStatus as setFintechRecurringStatus,
  listRecurringRuns as listFintechRecurringRuns,
  processRecurringInvestments,
  unbindRecurringCard as unbindFintechRecurringCard,
  runRecurringNow as runFintechRecurringNow,
} from './fintechAutomation.js';
import {
  clientGetSupportChat,
  clientSendSupportMessage,
  clientSupportUnread,
  staffListSupportThreads,
  staffGetSupportThread,
  staffReplySupport,
  staffSetSupportThreadStatus,
  staffSupportUnreadTotal,
} from './supportChat.js';

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

// ── Простой in-memory TTL кэш ─────────────────────────────────────────────────
const _cache = new Map();
function cacheGet(key) {
  const e = _cache.get(key);
  if (!e) return undefined;
  if (Date.now() > e.exp) { _cache.delete(key); return undefined; }
  return e.val;
}
function cacheSet(key, val, ttlMs) {
  _cache.set(key, { val, exp: Date.now() + ttlMs });
}
function cacheInvalidate(prefix) {
  for (const k of _cache.keys()) if (k.startsWith(prefix)) _cache.delete(k);
}
// Периодическая очистка — раз в 5 минут
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of _cache) if (now > e.exp) _cache.delete(k);
}, 5 * 60_000).unref?.();

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
  return insertScrapDealRow(supabase, { operatorUserId: req.user?.id || null, body, totalRub });
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

// За Render/прокси — иначе req.ip у всех одинаковый и rate limit бьёт по всем сразу.
app.set('trust proxy', 1);

// Security headers. CSP отключён: SPA раздаётся с этого же origin со своими inline-стилями,
// а строгий CSP без нонсов сломал бы Vite-бандл; остальные заголовки (nosniff, frame-deny,
// referrer-policy, HSTS на https) работают.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (corsOrigins.includes(origin)) return callback(null, true);
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Token'],
    // Чтобы фронт на другом домене мог прочитать id созданной сделки и догрузить фото.
    exposedHeaders: ['X-Deal-Id'],
  })
);

// ── Rate limiting ────────────────────────────────────────────────────────────
// Общий потолок на /api: щедрый, чтобы не мешать работе панели (SSE не считаем).
const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.endsWith('/stream'),
  message: { error: 'Слишком много запросов. Подождите минуту.' },
});

// Жёсткий лимит на публичные auth/verify-ручки — от перебора кодов и SMS-бомбинга.
const authBurstLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Подождите 10 минут.' },
});

// Чат поддержки: от спама сообщениями (и флуда в Telegram-уведомления).
const supportMessageLimiter = rateLimit({
  windowMs: 5 * 60_000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много сообщений подряд. Подождите пару минут.' },
});

app.use('/api', apiLimiter);
app.use(
  [
    '/api/public/client-auth',
    '/api/public/field-deal-session/:token/verify',
    '/api/auth/device',
    '/api/public/fintech-auth',
    '/api/public/consult-lead',
  ],
  authBurstLimiter
);
// Загрузка фото/документов шлёт base64 (несколько МБ) — для этих маршрутов поднимаем лимит,
// для остальных оставляем строгие 100kb. Глобальный парсер иначе режет тело раньше роутового.
const jsonSmall = express.json({ limit: '100kb' });
const jsonLarge = express.json({ limit: '16mb' });
const LARGE_BODY_PATHS = new Set(['/api/deal-photos/upload', '/api/public/fintech/kyc/upload']);
app.use((req, res, next) => {
  if (LARGE_BODY_PATHS.has(req.path)) return jsonLarge(req, res, next);
  return jsonSmall(req, res, next);
});

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
/** Кэш «в проекте уже есть admin/super_admin» — не дергаем БД на каждый запрос. */
let projectHasManagerCache = null;

/** Кэш роли профиля в памяти процесса (снижает повторные SELECT). */
const profileRoleMem = new Map();
const PROFILE_ROLE_MEM_TTL_MS = 120_000;

/**
 * Кэш «профиль точно существует» — раньше ensureProfileAndBootstrap дергал БД
 * (SELECT profiles) на КАЖДЫЙ авторизованный запрос, для любой страницы (в т.ч.
 * админку и инвестиции), хотя после первого раза профиль уже гарантированно есть.
 * Правка: как только видим строку — запоминаем на время жизни процесса.
 */
const profileExistsMem = new Set();

async function ensureProfileAndBootstrap(userId) {
  if (!profileExistsMem.has(userId)) {
    const { data: row } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (!row) {
      const { error: insErr } = await supabase.from('profiles').insert({ id: userId, role: 'courier' });
      if (insErr && insErr.code !== '23505') throw insErr;
      profileRoleMem.delete(userId);
    }
    profileExistsMem.add(userId);
  }
  if (projectHasManagerCache === true) return;
  const { data: managers, error: mErr } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['super_admin', 'admin'])
    .limit(1);
  if (mErr) {
    console.error('[profiles bootstrap]', mErr);
    return;
  }
  if (managers?.length) {
    projectHasManagerCache = true;
    return;
  }
  projectHasManagerCache = false;
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

    // Пароль верный, но устройство ещё не подтверждено кодом с почты → не пускаем к API.
    if (deviceTrustEnabled()) {
      const deviceHash = deviceHashFromReq(req);
      if (!deviceHash || !(await isDeviceTrusted(supabase, user.id, deviceHash))) {
        return res.status(403).json({
          error: 'Подтвердите вход кодом из письма',
          code: 'device_unverified',
        });
      }
    }

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
  const mem = profileRoleMem.get(userId);
  if (mem && Date.now() - mem.ts < PROFILE_ROLE_MEM_TTL_MS) return mem.role;
  let { data: prof } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (!prof) {
    await ensureProfileAndBootstrap(userId);
    ({ data: prof } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle());
  }
  const role = prof?.role ?? null;
  profileRoleMem.set(userId, { role, ts: Date.now() });
  return role;
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

function resolveRequesterRoleFromReq(req) {
  if (req.isSuperAdmin) return 'super_admin';
  const raw = req.profileRoleRaw;
  const meta = req.user?.app_metadata?.role ?? req.user?.user_metadata?.role ?? null;
  const rProf = normalizeRole(raw);
  const rMeta = normalizeRole(meta);
  if (isSuperAdminRole(raw) || isSuperAdminRole(meta)) return 'super_admin';
  if (rProf === 'admin' || rMeta === 'admin') return 'admin';
  if (rProf === 'seller' || rMeta === 'seller') return 'seller';
  if (rProf === 'courier' || rMeta === 'courier') return 'courier';
  return 'courier';
}

async function getRequesterRole(req) {
  return resolveRequesterRoleFromReq(req);
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

/** Скоуп просмотра аналитики: курьер/продавец видит только свои сделки, менеджер — все. */
async function analyticsScopeFromRequest(req) {
  const role = await getRequesterRole(req);
  const emailBypass = hasPanelFullAccessByEmail(req.user);
  const isMgr = emailBypass || isUserManagerRole(role);
  return {
    viewerIsManager: isMgr,
    viewerUserId: req.user.id,
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

// ── Fintech-автоматизация: ценовые коридоры и регулярные инвестиции ────────
// Курс проверяем чаще (коридоры реагируют почти сразу), подписки — реже
// (next_run_at сам решает, кому пора платить, тик просто периодически заглядывает).
setInterval(async () => {
  try {
    const cache = await refreshPriceCache(false);
    const rate = Number(cache?.goldRubPerGram);
    if (Number.isFinite(rate) && rate > 0) await processPriceAlerts(supabase, rate);
  } catch (e) {
    console.warn('[fintech automation] price tick', e?.message || e);
  }
}, 90_000);

setInterval(async () => {
  try {
    await processRecurringInvestments(supabase);
  } catch (e) {
    console.warn('[fintech automation] recurring tick', e?.message || e);
  }
}, 30 * 60_000);

/**
 * Эти три маршрута — напрямую на app (не через Router), до authMiddleware: только JWT внутри.
 * Так POST /api/price/refresh никогда не попадает в цепочку с проверкой ролей (403).
 */
app.get('/api/health', (_req, res) => res.json({ ok: true }));

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (xf) return xf.slice(0, 45);
  return String(req.socket?.remoteAddress || '').slice(0, 45) || null;
}

app.get(
  '/api/public/field-deal-session/:token',
  asyncHandler(async (req, res) => {
    try {
      const out = await getPublicFieldDealSession(supabase, req.params.token);
      res.json(out);
    } catch (e) {
      const st = e.status || 500;
      res.status(st).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.post(
  '/api/public/field-deal-session/:token/verify',
  asyncHandler(async (req, res) => {
    try {
      const out = await verifyFieldDealSession(supabase, {
        token: req.params.token,
        code: req.body?.code,
        clientIp: clientIp(req),
      });
      res.json(out);
    } catch (e) {
      const st = e.status || 500;
      res.status(st).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.post(
  '/api/public/field-deal-session/:token/receipt',
  asyncHandler(async (req, res) => {
    try {
      const out = await sendFieldDealReceiptByClient(supabase, {
        token: req.params.token,
        channel: req.body?.channel,
        target: req.body?.target,
      });
      res.json(out);
    } catch (e) {
      const st = e.status || 500;
      res.status(st).json({ error: e.message || 'Ошибка' });
    }
  })
);
// ── Экран клиента (покупательский дисплей): публичная подписка по коду ──────
app.get(
  '/api/public/client-display/:code',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(getDisplayState(req.params.code));
  })
);

app.get(
  '/api/public/client-display/:code/stream',
  asyncHandler(async (req, res) => {
    const code = normalizeDisplayCode(req.params.code);
    if (!code) return res.status(400).json({ error: 'Некорректный код экрана' });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const unsubscribe = subscribeDisplay(code, res);
    const hb = setInterval(() => {
      try { res.write(': ping\n\n'); } catch { /* ignore */ }
    }, 25_000);

    req.on('close', () => {
      unsubscribe();
      clearInterval(hb);
    });
  })
);

app.get(
  '/api/price/stream',
  asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Требуется вход' });
    const rawToken = authHeader.slice(7);
    const { user, error } = await getUserFromAccessToken(rawToken);
    if (error || !user?.id) return res.status(401).json({ error: 'Сессия недействительна' });
    if (deviceTrustEnabled()) {
      const dh = deviceHashFromReq(req);
      if (!dh || !(await isDeviceTrusted(supabase, user.id, dh))) {
        return res.status(403).json({ error: 'Подтвердите вход кодом из письма', code: 'device_unverified' });
      }
    }

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
    if (deviceTrustEnabled()) {
      const dh = deviceHashFromReq(req);
      if (!dh || !(await isDeviceTrusted(supabase, user.id, dh))) {
        return res.status(403).json({ error: 'Подтвердите вход кодом из письма', code: 'device_unverified' });
      }
    }
    await ensureProfileAndBootstrap(user.id);
    await refreshXautPriceCache(true);
    const data = await refreshPriceCache(true);
    broadcastPrice(data);
    res.json(data);
  })
);

/**
 * Заявка на консультацию с публичного лендинга → push в Telegram (best-effort).
 * Использует тот же бот, что и чат поддержки; чат можно задать отдельным
 * TELEGRAM_LEADS_CHAT_ID, иначе уходит в TELEGRAM_SUPPORT_CHAT_ID.
 */
async function notifyConsultLeadTelegram({ name, phone }) {
  const chatId = process.env.TELEGRAM_LEADS_CHAT_ID || process.env.TELEGRAM_SUPPORT_CHAT_ID;
  if (!chatId) {
    console.warn('[consult-lead tg] skip: TELEGRAM_SUPPORT_CHAT_ID not set');
    return { sent: false, reason: 'not_configured' };
  }
  const text = [
    '📝 Новая заявка с лендинга Reaktivo',
    `Имя: ${name}`,
    `Телефон: ${phone}`,
  ].join('\n');
  return sendTelegramMessage(chatId, text);
}

/**
 * Публичная заявка на консультацию (имя + телефон) → email команде + Telegram.
 */
app.post(
  '/api/public/consult-lead',
  asyncHandler(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const name = String(req.body?.name || '').trim().slice(0, 120);
    const phoneRaw = String(req.body?.phone || '').replace(/\D/g, '');
    const phone = phoneRaw.replace(/^8/, '7');
    if (phone.length < 11) {
      return res.status(400).json({ error: 'Укажите корректный номер телефона' });
    }
    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Укажите имя' });
    }
    const phonePretty = phone.startsWith('7') ? `+${phone}` : phone;

    // Ждём TG до ответа — иначе на free Render fire-and-forget может оборваться.
    const tg = await notifyConsultLeadTelegram({ name, phone: phonePretty }).catch((e) => {
      console.warn('[consult-lead tg notify]', e?.message || e);
      return { sent: false, reason: 'error' };
    });
    if (!tg?.sent) {
      console.warn('[consult-lead tg] not sent', tg?.reason || 'unknown');
    }

    try {
      const out = await sendConsultLeadEmailIfConfigured({ name, phone: phonePretty });
      if (!out.sent && out.reason === 'not_configured') {
        console.info('[consult-lead]', name, phone);
        return res.json({ ok: true, queued: true });
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error('[consult-lead]', e?.message || e);
      if (tg?.sent) return res.json({ ok: true });
      return res.status(502).json({ error: 'Не удалось отправить заявку. Напишите на team@reaktivo.ru' });
    }
  })
);

/**
 * Публичная котировка выкупа для внешнего сайта (без авторизации).
 * Возвращает текущую цену биржи и стоимость выкупа за 1 грамм по ходовым пробам
 * с учётом политики выкупа (процент от биржи + поправки по пробе).
 * CORS открыт для любого домена — данные обезличены и предназначены для витрины.
 */
app.get(
  '/api/public/buyback-quote',
  asyncHandler(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=60');

    const quote = String(req.query.quote || 'moex').toLowerCase();
    let cache;
    if (quote === 'xaut') {
      cache = await getKv(KV_XAUT);
      if (!cache?.goldRubPerGram) cache = await refreshXautPriceCache(false);
    } else {
      cache = await getPriceCache();
      if (!cache?.goldRubPerGram) cache = await refreshPriceCache(false);
    }
    const goldRubPerGram = cache?.goldRubPerGram ?? null;
    const settings = await getSettings();

    // Какие пробы отдаём: ходовые + всё, что настроено в системе.
    const probes = [...new Set([585, 750, 999, ...(settings.purityOrder || [])].map(Number))]
      .filter((p) => Number.isFinite(p) && p > 0 && p <= 1000)
      .sort((a, b) => a - b);

    const perGram = {};
    if (goldRubPerGram) {
      for (const p of probes) {
        const r = calculateBuybackRange({
          weightGrams: 1,
          purityPerThousand: p,
          goldRubPerGram,
          settings,
        });
        if (r.ok) perGram[p] = Math.round(r.midRub);
      }
    }

    res.json({
      currency: 'RUB',
      goldRubPerGram,
      source: quote === 'xaut' ? 'xaut' : (cache?.source ?? 'cbr'),
      buybackPercentOfScrap: Number(settings.buybackPercentOfScrap) || null,
      rangeHalfWidthPercent: Number(settings.rangeHalfWidthPercent) || 0,
      perGram,
      updatedAt: cache?.cachedAt ?? null,
    });
  })
);

// ── Клиентский кабинет (публичный, вход по телефону + SMS-код) ──────────────
function clientPortalOrigin(req) {
  const fromEnv = String(process.env.PUBLIC_APP_ORIGIN || '').trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const origin = String(req.headers.origin || '').trim();
  if (origin) return origin.replace(/\/$/, '');
  const host = req.get('host');
  return host ? `${req.protocol}://${host}` : '';
}

function clientTokenFromReq(req) {
  const h = String(req.headers.authorization || '');
  if (h.startsWith('Bearer ')) return h.slice(7);
  return '';
}

app.post(
  '/api/public/client-auth/request-code',
  asyncHandler(async (req, res) => {
    try {
      const out = await requestClientCode(supabase, {
        phone: req.body?.phone,
        origin: clientPortalOrigin(req),
      });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.post(
  '/api/public/client-auth/verify',
  asyncHandler(async (req, res) => {
    try {
      const out = await verifyClientCode(supabase, { phone: req.body?.phone, code: req.body?.code });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

// Каким способом входить этому номеру: PIN (если установлен) или SMS.
app.post(
  '/api/public/client-auth/method',
  asyncHandler(async (req, res) => {
    try {
      const out = await getClientLoginMethod(supabase, { phone: req.body?.phone });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.post(
  '/api/public/client-auth/login-pin',
  asyncHandler(async (req, res) => {
    try {
      const out = await verifyClientPin(supabase, { phone: req.body?.phone, pin: req.body?.pin });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.get(
  '/api/public/client/me',
  asyncHandler(async (req, res) => {
    const session = verifyClientToken(clientTokenFromReq(req));
    if (!session) return res.status(401).json({ error: 'Сессия недействительна, войдите снова' });
    const pinStatus = await getClientPinStatus(supabase, session.phoneNormalized).catch(() => ({ hasPin: false }));
    res.json({ ok: true, phoneNormalized: session.phoneNormalized, hasPin: pinStatus.hasPin });
  })
);

// Установка/смена PIN — внутри авторизованной сессии кабинета.
app.post(
  '/api/public/client/pin',
  asyncHandler(async (req, res) => {
    const session = verifyClientToken(clientTokenFromReq(req));
    if (!session) return res.status(401).json({ error: 'Сессия недействительна, войдите снова' });
    try {
      const out = await setClientPin(supabase, {
        phoneNormalized: session.phoneNormalized,
        pin: req.body?.pin,
        currentPin: req.body?.currentPin,
      });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.get(
  '/api/public/client/deals',
  asyncHandler(async (req, res) => {
    const session = verifyClientToken(clientTokenFromReq(req));
    if (!session) return res.status(401).json({ error: 'Сессия недействительна, войдите снова' });
    try {
      const out = await getClientDeals(supabase, session.phoneNormalized);
      res.setHeader('Cache-Control', 'no-store');
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

// ── Чат поддержки (клиентская сторона) ──────────────────────────────────────
app.get(
  '/api/public/client/support/unread',
  asyncHandler(async (req, res) => {
    const session = verifyClientToken(clientTokenFromReq(req));
    if (!session) return res.status(401).json({ error: 'Сессия недействительна, войдите снова' });
    try {
      const out = await clientSupportUnread(supabase, session.phoneNormalized);
      res.setHeader('Cache-Control', 'no-store');
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.get(
  '/api/public/client/support',
  asyncHandler(async (req, res) => {
    const session = verifyClientToken(clientTokenFromReq(req));
    if (!session) return res.status(401).json({ error: 'Сессия недействительна, войдите снова' });
    try {
      const out = await clientGetSupportChat(supabase, session.phoneNormalized);
      res.setHeader('Cache-Control', 'no-store');
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.post(
  '/api/public/client/support/message',
  supportMessageLimiter,
  asyncHandler(async (req, res) => {
    const session = verifyClientToken(clientTokenFromReq(req));
    if (!session) return res.status(401).json({ error: 'Сессия недействительна, войдите снова' });
    try {
      const out = await clientSendSupportMessage(supabase, {
        phoneNormalized: session.phoneNormalized,
        body: req.body?.body,
      });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

// ── Fintech-кабинет клиента: вход по телефону+SMS (отдельно от кабинета скупки) ──
function fintechTokenFromReq(req) {
  const h = String(req.headers.authorization || '');
  if (h.startsWith('Bearer ')) return h.slice(7);
  return '';
}

function requireFintechSession(req, res) {
  const session = verifyFintechToken(fintechTokenFromReq(req));
  if (!session) {
    res.status(401).json({ error: 'Сессия недействительна, войдите снова' });
    return null;
  }
  return session;
}

app.post(
  '/api/public/fintech-auth/request-code',
  asyncHandler(async (req, res) => {
    try {
      const out = await requestFintechCode(supabase, { phone: req.body?.phone, origin: clientPortalOrigin(req) });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.post(
  '/api/public/fintech-auth/verify',
  asyncHandler(async (req, res) => {
    try {
      const out = await verifyFintechCode(supabase, { phone: req.body?.phone, code: req.body?.code });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

// Клиент уже вошёл в общий кабинет (calc/deals) по SMS-коду — тот же номер телефона,
// повторный код для вкладки «Инвестиции» не нужен. Принимает clientApi-токен (Authorization).
app.post(
  '/api/public/fintech-auth/from-client-session',
  asyncHandler(async (req, res) => {
    try {
      const session = verifyClientToken(clientTokenFromReq(req));
      if (!session) return res.status(401).json({ error: 'Сессия недействительна, войдите снова' });
      const out = await exchangeClientSessionForFintech(supabase, { phoneNormalized: session.phoneNormalized });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.get(
  '/api/public/fintech/profile',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const out = await getFintechClientProfile(supabase, session.clientId);
      res.setHeader('Cache-Control', 'no-store');
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.patch(
  '/api/public/fintech/profile',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const out = await updateClientContactInfo(supabase, session.clientId, {
        fullName: req.body?.fullName,
        email: req.body?.email,
      });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.post(
  '/api/public/fintech/kyc/upload',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const out = await uploadKycDocument(supabase, {
        clientId: session.clientId,
        docType: req.body?.docType,
        base64: req.body?.base64,
        mimeType: req.body?.mimeType,
      });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.post(
  '/api/public/fintech/kyc/submit',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const out = await submitForReview(supabase, session.clientId);
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.get(
  '/api/public/fintech/portfolio',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const out = await getFintechPortfolio(supabase, session.clientId);
      res.setHeader('Cache-Control', 'no-store');
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.get(
  '/api/public/fintech/ledger',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const out = await getFintechLedger(supabase, session.clientId, { limit, offset });
      res.setHeader('Cache-Control', 'no-store');
      res.json({ entries: out });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.post(
  '/api/public/fintech/buy',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const out = await buyGold(supabase, {
        clientId: session.clientId,
        rubAmount: req.body?.rubAmount,
        grams: req.body?.grams,
        idempotencyKey: req.body?.idempotencyKey,
      });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка', code: e.code });
    }
  })
);

app.post(
  '/api/public/fintech/sell',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const out = await sellGold(supabase, {
        clientId: session.clientId,
        rubAmount: req.body?.rubAmount,
        grams: req.body?.grams,
        idempotencyKey: req.body?.idempotencyKey,
      });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка', code: e.code });
    }
  })
);

app.post(
  '/api/public/fintech/withdraw',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const out = await fintechRequestWithdrawal(supabase, {
        clientId: session.clientId,
        rubAmount: req.body?.rubAmount,
        payoutDetails: req.body?.payoutDetails,
        payoutMethod: req.body?.payoutMethod,
        cardNumber: req.body?.cardNumber,
        sbpPhone: req.body?.sbpPhone,
        recipientName: req.body?.recipientName,
        idempotencyKey: req.body?.idempotencyKey,
      });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка', code: e.code });
    }
  })
);

app.get(
  '/api/public/fintech/withdrawals',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const out = await getFintechClientWithdrawals(supabase, session.clientId, { limit: 20 });
      res.setHeader('Cache-Control', 'no-store');
      res.json({ requests: out });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

/** Клиент отменяет свою заявку на вывод → сумма возвращается на рублёвый баланс. */
app.post(
  '/api/public/fintech/withdrawals/:id/cancel',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const out = await fintechCancelWithdrawal(supabase, {
        requestId: req.params.id,
        clientId: session.clientId,
      });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Не удалось отменить заявку', code: e.code });
    }
  })
);

// ── ЮKassa: пополнение баланса (тестовый / боевой магазин) ──────────────────
function allowedTopupReturnUrl(candidate) {
  const fallback = (process.env.PUBLIC_APP_ORIGIN || 'https://reaktivo.pro').replace(/\/$/, '');
  const raw = String(candidate || fallback).trim() || fallback;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return `${fallback}/kabinet`;
  }
  const allowed = new Set(
    [
      fallback,
      ...(process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
      'http://localhost:5173',
      'https://reaktivo.pro',
      'https://gold-panel.web.app',
      'https://gold-panel.firebaseapp.com',
    ].map((o) => {
      try { return new URL(o).origin; } catch { return null; }
    }).filter(Boolean)
  );
  if (!allowed.has(u.origin)) return `${fallback}/kabinet`;
  // Всегда возвращаем в кабинет (вкладка invest откроется на клиенте по sessionStorage).
  if (!u.pathname || u.pathname === '/') u.pathname = '/kabinet';
  u.searchParams.set('topup', '1');
  return u.toString();
}

app.get(
  '/api/public/fintech/topup/config',
  asyncHandler(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const provider = acquiringProvider();
    const enabled = provider === 'tbank' ? tbankConfigured() : provider === 'yookassa' ? yookassaConfigured() : false;
    res.json({
      enabled,
      provider,
      testMode: provider === 'tbank'
        ? tbankIsDemo()
        : String(process.env.YOOKASSA_SECRET_KEY || '').startsWith('test_'),
      minRub: provider === 'tbank' ? tbankMinTopupRub() : (Number(process.env.YOOKASSA_MIN_TOPUP_RUB || 10) || 10),
      label: provider === 'tbank' ? 'Т-Банк' : provider === 'yookassa' ? 'ЮKassa' : null,
    });
  })
);

app.post(
  '/api/public/fintech/topup/create',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    const provider = acquiringProvider();
    try {
      if (provider === 'tbank') {
        const out = await createTbankTopupPayment(supabase, {
          clientId: session.clientId,
          rubAmount: req.body?.rubAmount,
          returnUrl: allowedTopupReturnUrl(req.body?.returnUrl),
          description: req.body?.description,
        });
        return res.json(out);
      }
      const out = await createYooTopupPayment(supabase, {
        clientId: session.clientId,
        rubAmount: req.body?.rubAmount,
        returnUrl: allowedTopupReturnUrl(req.body?.returnUrl),
        description: req.body?.description,
        customerEmail: req.body?.email,
      });
      res.json({ ...out, provider: 'yookassa' });
    } catch (e) {
      console.warn(`[${provider} create]`, e?.message || e, e?.tbank || e?.yookassa || '');
      res.status(e.status || 500).json({ error: e.message || 'Не удалось создать платёж', code: e.code });
    }
  })
);

/** Клиент после return_url: дозачислить, если webhook ещё не дошёл (Render cold start). */
app.post(
  '/api/public/fintech/topup/confirm',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    const paymentId = String(req.body?.paymentId || '').trim();
    if (!paymentId) return res.status(400).json({ error: 'Укажите paymentId' });
    const provider = String(req.body?.provider || acquiringProvider()).toLowerCase();
    try {
      if (provider === 'tbank') {
        const payment = await creditTbankPaymentIfSucceeded(supabase, paymentId);
        if (payment.clientId && payment.clientId !== String(session.clientId)) {
          return res.status(403).json({ error: 'Платёж принадлежит другому клиенту' });
        }
        // Ещё не CONFIRMED — просто статус, без ошибки
        if (!payment.ok && payment.status && payment.status !== 'CONFIRMED') {
          return res.json(payment);
        }
        return res.json(payment);
      }
      const raw = await getYooPayment(paymentId);
      if (String(raw?.metadata?.clientId || '') !== String(session.clientId)) {
        return res.status(403).json({ error: 'Платёж принадлежит другому клиенту' });
      }
      const payment = await creditYooPaymentIfSucceeded(supabase, raw);
      res.json(payment);
    } catch (e) {
      console.warn(`[${provider} confirm]`, e?.message || e);
      res.status(e.status || 500).json({ error: e.message || 'Не удалось подтвердить платёж' });
    }
  })
);

/** Проверка URL в браузере / кабинете ЮKassa: GET не = «вход», это просто ping эндпоинта. */
app.get(
  '/api/public/fintech/topup/webhook',
  asyncHandler(async (_req, res) => {
    res.status(200).json({
      ok: true,
      endpoint: 'yookassa_webhook',
      hint: 'Сюда ЮKassa шлёт POST при смене статуса платежа. Открывать в браузере не нужно.',
    });
  })
);

app.post(
  '/api/public/fintech/topup/webhook',
  asyncHandler(async (req, res) => {
    try {
      const out = await handleYooWebhook(supabase, req.body);
      res.status(200).json(out);
    } catch (e) {
      console.error('[yookassa webhook]', e?.message || e);
      // 500 → ЮKassa ретраит; лучше 200 после логирования только для «своих» ошибок бизнеса.
      // Сетевые/временные — 500.
      res.status(e.status && e.status < 500 ? 200 : 500).json({ error: e.message || 'webhook error' });
    }
  })
);

/** Т-Банк NotificationURL — ответ строго текстом OK. */
app.get(
  '/api/public/fintech/topup/webhook-tbank',
  asyncHandler(async (_req, res) => {
    res.status(200).json({
      ok: true,
      endpoint: 'tbank_webhook',
      hint: 'Сюда Т-Банк шлёт POST Notification. В ЛК укажите этот URL как NotificationURL.',
    });
  })
);

app.post(
  '/api/public/fintech/topup/webhook-tbank',
  asyncHandler(async (req, res) => {
    try {
      const out = await handleTbankWebhook(supabase, req.body);
      res.status(200).type('text/plain').send(out.httpBody || 'OK');
    } catch (e) {
      console.error('[tbank webhook]', e?.message || e);
      res.status(e.status && e.status < 500 ? 200 : 500).type('text/plain').send('OK');
    }
  })
);

// ── Ценовые коридоры: клиент задаёт условие, дальше срабатывает автоматически ──
app.post(
  '/api/public/fintech/price-alerts',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const out = await createFintechPriceAlert(supabase, {
        clientId: session.clientId,
        direction: req.body?.direction,
        targetRate: req.body?.targetRate,
        amountMode: req.body?.amountMode,
        amountValue: req.body?.amountValue,
      });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.get(
  '/api/public/fintech/price-alerts',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const out = await listFintechClientPriceAlerts(supabase, session.clientId);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ alerts: out });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.delete(
  '/api/public/fintech/price-alerts/:id',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const out = await cancelFintechPriceAlert(supabase, { clientId: session.clientId, alertId: req.params.id });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

// ── Регулярные инвестиции: подписка на автопокупку с баланса по расписанию ──
app.get(
  '/api/public/fintech/recurring',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const [subscription, runs] = await Promise.all([
        getFintechRecurringInvestment(supabase, session.clientId),
        listFintechRecurringRuns(supabase, session.clientId, { limit: 12 }),
      ]);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ subscription, runs });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.put(
  '/api/public/fintech/recurring',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const out = await upsertFintechRecurringInvestment(supabase, {
        clientId: session.clientId,
        rubAmount: req.body?.rubAmount,
        dayOfMonth: req.body?.dayOfMonth,
        fundingMode: req.body?.fundingMode,
      });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка', code: e.code });
    }
  })
);

app.patch(
  '/api/public/fintech/recurring/status',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const out = await setFintechRecurringStatus(supabase, { clientId: session.clientId, status: req.body?.status });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

/** Привязка карты: платёж с save_payment_method + зачисление на баланс. */
app.post(
  '/api/public/fintech/recurring/bind-card',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const min = yooMinTopupRub();
      const asked = Number(req.body?.rubAmount);
      const rubAmount = Number.isFinite(asked) && asked >= min ? asked : min;
      const returnUrl = allowedTopupReturnUrl(
        req.body?.returnUrl || `${process.env.PUBLIC_APP_ORIGIN || 'https://reaktivo.pro'}/kabinet?invest=1&bind=1`,
      );
      // Гарантируем query bind=1
      let finalReturn = returnUrl;
      try {
        const u = new URL(returnUrl);
        u.searchParams.set('invest', '1');
        u.searchParams.set('bind', '1');
        finalReturn = u.toString();
      } catch { /* keep */ }

      const out = await createYooTopupPayment(supabase, {
        clientId: session.clientId,
        rubAmount,
        returnUrl: finalReturn,
        savePaymentMethod: true,
        purpose: 'fintech_bind',
        description: `Привязка карты Reaktivo ${rubAmount} ₽`,
      });
      res.json(out);
    } catch (e) {
      console.warn('[yookassa bind]', e?.message || e, e?.yookassa || '');
      res.status(e.status || 500).json({ error: e.message || 'Не удалось привязать карту', code: e.code });
    }
  })
);

app.post(
  '/api/public/fintech/recurring/unbind-card',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const out = await unbindFintechRecurringCard(supabase, session.clientId);
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

/** Прогнать автопокупку сейчас (тест / срочно). */
app.post(
  '/api/public/fintech/recurring/run-now',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const out = await runFintechRecurringNow(supabase, session.clientId);
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка', code: e.code });
    }
  })
);

// ── История курса золота для графика в кабинете (дневные свечи GLDRUBF) ─────
const MOEX_GOLD_CANDLES_URL =
  'https://iss.moex.com/iss/engines/futures/markets/forts/securities/GLDRUBF/candles.json';

async function fetchGoldHistoryDaily(days) {
  const cacheKey = `fintech_gold_history:${days}`;
  const hit = cacheGet(cacheKey);
  if (hit) return hit;

  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const points = [];
  let start = 0;
  // ISS отдаёт максимум 500 свечей за запрос — листаем, годовая история влезает в 1-2 страницы.
  for (let page = 0; page < 8; page++) {
    const { data } = await axios.get(MOEX_GOLD_CANDLES_URL, {
      params: { 'iss.meta': 'off', interval: 24, from, start },
      timeout: 20000,
      headers: { 'User-Agent': 'CalculatedGold/1.0' },
      validateStatus: (s) => s === 200,
    });
    const cols = data?.candles?.columns || [];
    const rows = data?.candles?.data || [];
    if (!rows.length) break;
    const iClose = cols.indexOf('close');
    const iBegin = cols.indexOf('begin');
    for (const r of rows) {
      const close = Number(r[iClose]);
      const date = String(r[iBegin] || '').slice(0, 10);
      if (Number.isFinite(close) && close > 0 && date) points.push({ date, price: close });
    }
    if (rows.length < 500) break;
    start += rows.length;
  }

  const out = { points, source: 'moex', security: 'GLDRUBF', unit: 'rub_per_gram' };
  if (points.length) cacheSet(cacheKey, out, 30 * 60 * 1000);
  return out;
}

/**
 * Мировая биржа: дневная история золота COMEX (GC=F, $/унция) через Yahoo Finance chart API.
 * Правка Руслана: в кабинете клиента нужна глобальная биржа и период 3–5 лет.
 */
const GLOBAL_GOLD_SYMBOL = process.env.GLOBAL_GOLD_SYMBOL || 'GC=F';
async function fetchGlobalGoldHistoryDaily(days) {
  // Yahoo принимает фиксированные range — берём ближайший сверху, клиент отфильтрует по датам.
  const range = days <= 31 ? '1mo' : days <= 92 ? '3mo' : days <= 183 ? '6mo' : days <= 366 ? '1y' : days <= 731 ? '2y' : '5y';
  const cacheKey = `fintech_gold_history_global:${range}`;
  const hit = cacheGet(cacheKey);
  if (hit) return hit;

  const { data } = await axios.get(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(GLOBAL_GOLD_SYMBOL)}`,
    {
      params: { range, interval: '1d', 'includePrePost': 'false' },
      timeout: 20000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CalculatedGold/1.0' },
      validateStatus: (s) => s === 200,
    },
  );
  const result = data?.chart?.result?.[0];
  const stamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const points = [];
  for (let i = 0; i < stamps.length; i++) {
    const close = Number(closes[i]);
    if (!Number.isFinite(close) || close <= 0) continue;
    const date = new Date(stamps[i] * 1000).toISOString().slice(0, 10);
    points.push({ date, price: Math.round(close * 100) / 100 });
  }

  const out = { points, source: 'comex', security: GLOBAL_GOLD_SYMBOL, unit: 'usd_per_oz' };
  if (points.length) cacheSet(cacheKey, out, 30 * 60 * 1000);
  return out;
}

app.get(
  '/api/public/fintech/gold-history',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const days = Math.min(1830, Math.max(30, Number(req.query.days) || 365));
      const source = String(req.query.source || 'moex');
      const out = source === 'global'
        ? await fetchGlobalGoldHistoryDaily(days)
        : await fetchGoldHistoryDaily(days);
      res.setHeader('Cache-Control', 'no-store');
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Не удалось загрузить историю курса' });
    }
  })
);

/**
 * Годовые якоря официального курса золота ЦБ РФ (с 2000) — для калькулятора
 * упущенной выгоды. Берём последний доступный курс каждого года, кэш 24ч.
 */
async function fetchCbrGoldYearlyAnchors() {
  const cacheKey = 'fintech_cbr_gold_yearly';
  const hit = cacheGet(cacheKey);
  if (hit) return hit;

  const startYear = 2000;
  const endYear = new Date().getFullYear();
  const byYear = new Map();

  async function fetchRange(y1, y2) {
    const date1 = `01/01/${y1}`;
    const date2 = y2 >= endYear
      ? formatCbrDate(new Date())
      : `31/12/${y2}`;
    const { data: xml } = await axios.get('https://www.cbr.ru/scripts/xml_metall.asp', {
      params: { date_req1: date1, date_req2: date2 },
      timeout: 45000,
      responseType: 'text',
      headers: { 'User-Agent': 'CalculatedGold/1.0' },
      validateStatus: (s) => s === 200,
    });
    const doc = parser.parse(xml);
    const records = doc?.Metall?.Record;
    const list = Array.isArray(records) ? records : records ? [records] : [];
    for (const rec of list) {
      if (String(rec['@_Code']) !== '1') continue;
      const buy = parseRussianNum(rec.Buy);
      if (!buy || buy <= 0) continue;
      const raw = String(rec['@_Date'] || '');
      // ЦБ: ДД.ММ.ГГГГ
      const m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (!m) continue;
      const year = Number(m[3]);
      const date = `${m[3]}-${m[2]}-${m[1]}`;
      const prev = byYear.get(year);
      if (!prev || date > prev.date) {
        byYear.set(year, { year, date, price: buy });
      }
    }
  }

  // Диапазоны по 3 года — меньше запросов, чем по одному дню на год.
  for (let y = startYear; y <= endYear; y += 3) {
    try {
      await fetchRange(y, Math.min(endYear, y + 2));
    } catch (e) {
      console.warn('[cbr yearly]', y, e?.message || e);
    }
  }

  const points = [...byYear.values()].sort((a, b) => a.year - b.year);
  const out = { points, source: 'cbr', unit: 'rub_per_gram' };
  if (points.length >= 5) cacheSet(cacheKey, out, 24 * 60 * 60 * 1000);
  return out;
}

app.get(
  '/api/public/fintech/cbr-gold-history',
  asyncHandler(async (req, res) => {
    // Публичные данные ЦБ — сессия не обязательна (калькулятор упущенной выгоды).
    try {
      const out = await fetchCbrGoldYearlyAnchors();
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Не удалось загрузить историю ЦБ' });
    }
  })
);

// ── AI-ассистент (Stage 10: Grok) ────────────────────────────────────────────
// Анализ портфеля и прогноз по сценариям. Сценарии считаются детерминированно на
// сервере; текстовый комментарий — Grok (x.ai), а без XAI_API_KEY — локальный текст.
function computePortfolioForecast(portfolio, historyPoints) {
  let yearlyGrowthPct = null;
  if (Array.isArray(historyPoints) && historyPoints.length > 30) {
    const first = historyPoints[0];
    const last = historyPoints[historyPoints.length - 1];
    const spanDays = (new Date(last.date) - new Date(first.date)) / 86_400_000;
    if (first.price > 0 && spanDays > 30) {
      const total = last.price / first.price;
      yearlyGrowthPct = Math.round((Math.pow(total, 365 / spanDays) - 1) * 1000) / 10;
    }
  }

  const grams = Number(portfolio?.goldGrams || 0);
  const rate = Number(portfolio?.currentRatePerGram || 0);
  const scenarios = [];
  // Пустой портфель — показываем накопительный пример из Stage 10 (5 г в месяц).
  const accumulation = grams <= 0;
  const monthlyGrams = 5;

  if (rate > 0) {
    const gHist = yearlyGrowthPct != null ? yearlyGrowthPct / 100 : 0.1;
    const defs = [
      { key: 'flat', label: 'Без роста цены', annual: 0 },
      {
        key: 'hist',
        label: yearlyGrowthPct != null
          ? `Темп последнего года (${yearlyGrowthPct > 0 ? '+' : ''}${yearlyGrowthPct}%/год)`
          : 'Умеренный рост (+10%/год)',
        annual: gHist,
      },
      { key: 'strong', label: 'Оптимистичный (×1.5 темпа)', annual: gHist * 1.5 },
    ];
    for (const d of defs) {
      scenarios.push({
        key: d.key,
        label: d.label,
        annualPct: Math.round(d.annual * 1000) / 10,
        values: [1, 3, 5].map((y) => {
          const totalGrams = accumulation ? monthlyGrams * 12 * y : grams;
          return { years: y, grams: totalGrams, valueRub: Math.round(totalGrams * rate * Math.pow(1 + d.annual, y)) };
        }),
      });
    }
  }

  return { yearlyGrowthPct, ratePerGram: rate || null, accumulation, monthlyGrams: accumulation ? monthlyGrams : null, scenarios };
}

function buildLocalAssistantAnswer(portfolio, forecast) {
  const lines = [];
  const grams = Number(portfolio?.goldGrams || 0);
  const fmtRub = (n) => `${Math.round(Number(n) || 0).toLocaleString('ru-RU')} ₽`;

  if (grams > 0) {
    lines.push(`На вашем счёте ${grams.toFixed(4)} г золота — при текущем курсе это ${fmtRub(portfolio.marketValueRub)}.`);
    if (portfolio.pnlRub != null && portfolio.investedRub > 0) {
      const sign = portfolio.pnlRub >= 0 ? 'плюсе' : 'минусе';
      lines.push(`Вы вложили ${fmtRub(portfolio.investedRub)}; сейчас портфель в ${sign}: ${portfolio.pnlRub >= 0 ? '+' : ''}${fmtRub(portfolio.pnlRub)} (${portfolio.pnlPercent > 0 ? '+' : ''}${portfolio.pnlPercent}%).`);
    }
  } else {
    lines.push('Золота на счёте пока нет — ниже пример, как может расти накопление при покупке 5 г каждый месяц.');
  }

  if (forecast.yearlyGrowthPct != null) {
    lines.push(`За последний год биржевой курс золота изменился примерно на ${forecast.yearlyGrowthPct > 0 ? '+' : ''}${forecast.yearlyGrowthPct}% в годовом выражении.`);
  }

  const hist = forecast.scenarios.find((s) => s.key === 'hist');
  const five = hist?.values?.find((v) => v.years === 5);
  if (five) {
    lines.push(`Если темп сохранится, через 5 лет ${forecast.accumulation ? `накопленные ${five.grams} г` : 'ваш объём золота'} может стоить около ${fmtRub(five.valueRub)}.`);
  }

  lines.push('Регулярные небольшие покупки сглаживают колебания курса: вы копите не рубли, а граммы металла.');
  lines.push('Прогноз не является гарантией доходности или инвестиционной рекомендацией — цена золота может как расти, так и снижаться.');
  return lines.join('\n\n');
}

async function callGrokAssistant({ portfolio, forecast, question }) {
  const key = (process.env.XAI_API_KEY || '').trim();
  if (!key) return null;
  const model = (process.env.XAI_MODEL || 'grok-3-mini').trim();

  const system = [
    'Ты — встроенный AI-ассистент сервиса Reaktivo Invest (покупка настоящего физического золота от 1 грамма, агентская модель, хранение и обратный выкуп).',
    'Отвечай по-русски, дружелюбно и кратко (до 180 слов), без markdown-заголовков, можно списки с «—».',
    'Опирайся ТОЛЬКО на переданные данные портфеля и сценарии. Не выдумывай цифры.',
    'Никогда не обещай гарантированную доходность; в конце всегда одна короткая фраза-дисклеймер, что это не инвестиционная рекомендация.',
  ].join(' ');

  const user = [
    `Данные портфеля клиента: ${JSON.stringify(portfolio)}`,
    `Расчётные сценарии (сервер): ${JSON.stringify(forecast)}`,
    question ? `Вопрос клиента: ${question}` : 'Вопроса нет — сделай краткий анализ портфеля и перспектив.',
  ].join('\n');

  const { data } = await axios.post(
    'https://api.x.ai/v1/chat/completions',
    {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.4,
      max_tokens: 700,
    },
    { headers: { Authorization: `Bearer ${key}` }, timeout: 45000 }
  );
  return data?.choices?.[0]?.message?.content?.trim() || null;
}

app.post(
  '/api/public/fintech/assistant',
  asyncHandler(async (req, res) => {
    const session = requireFintechSession(req, res);
    if (!session) return;
    try {
      const cdKey = `fintech_assistant_cd:${session.clientId}`;
      if (cacheGet(cdKey)) {
        return res.status(429).json({ error: 'Ассистент отвечает не чаще раза в 10 секунд — подождите немного.' });
      }
      cacheSet(cdKey, 1, 10_000);

      const question = String(req.body?.question || '').trim().slice(0, 500);
      const [portfolio, history] = await Promise.all([
        getFintechPortfolio(supabase, session.clientId),
        fetchGoldHistoryDaily(366).catch(() => ({ points: [] })),
      ]);
      const forecast = computePortfolioForecast(portfolio, history.points);

      let answer = null;
      let source = 'local';
      try {
        answer = await callGrokAssistant({ portfolio, forecast, question });
        if (answer) source = 'grok';
      } catch (e) {
        console.warn('[grok assistant]', e?.response?.data?.error || e?.message || e);
      }
      if (!answer) answer = buildLocalAssistantAnswer(portfolio, forecast);

      res.setHeader('Cache-Control', 'no-store');
      res.json({ source, answer, forecast });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ассистент временно недоступен' });
    }
  })
);

// ── Доверенные устройства: подтверждение кодом с почты при первом входе ─────
// До authMiddleware: JWT проверяем сами, а enforcement устройства здесь не нужен —
// иначе было бы невозможно подтвердить новое устройство.
async function requireJwtUser(req, res) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Требуется вход' });
    return null;
  }
  const { user, error } = await getUserFromAccessToken(authHeader.slice(7));
  if (error || !user?.id) {
    res.status(401).json({ error: 'Сессия недействительна' });
    return null;
  }
  return user;
}

app.post(
  '/api/auth/device/check',
  asyncHandler(async (req, res) => {
    const user = await requireJwtUser(req, res);
    if (!user) return;
    try {
      const out = await checkDeviceAndMaybeSendCode(supabase, {
        user,
        deviceHash: deviceHashFromReq(req),
        ip: clientIp(req),
        userAgent: req.headers['user-agent'],
      });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.post(
  '/api/auth/device/verify',
  asyncHandler(async (req, res) => {
    const user = await requireJwtUser(req, res);
    if (!user) return;
    try {
      const out = await verifyDeviceCode(supabase, {
        user,
        deviceHash: deviceHashFromReq(req),
        code: req.body?.code,
        ip: clientIp(req),
        userAgent: req.headers['user-agent'],
      });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.use('/api', asyncHandler(authMiddleware));

app.get(
  '/api/auth/me',
  asyncHandler(async (req, res) => {
    const role = resolveRequesterRoleFromReq(req);
    const uid = req.user.id;
    const cacheKey = `auth-me:${uid}`;
    const hit = cacheGet(cacheKey);
    if (hit) {
      res.setHeader('Cache-Control', 'no-store');
      return res.json(hit);
    }
    const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', uid).maybeSingle();
    const result = { user: { uid, email: req.user.email, role, displayName: prof?.display_name || null } };
    cacheSet(cacheKey, result, 60_000);
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  })
);

// Экран клиента: оператор пушит готовый view в комнату по коду (требует входа).
app.post(
  '/api/client-display/:code',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    await getRequesterRole(req);
    const { mode, view, brandName } = req.body || {};
    const out = setDisplayState(req.params.code, { mode, view, brandName });
    if (!out.ok) return res.status(400).json({ error: 'Некорректный код экрана' });
    res.json({ ok: true, subscribers: out.subscribers });
  })
);

// Личный профиль: статистика и последние сделки текущего пользователя (всегда строго свои).
app.get(
  '/api/profile/me',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const role = await getRequesterRole(req);
    const uid = req.user.id;
    const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', uid).maybeSingle();
    const sel = 'id, contract_no, total_rub, seller_name, first_probe, first_weight_gross, first_weight_net, created_at, rows';
    const { data: deals, error } = await supabase
      .from('scrap_deals')
      .select(sel)
      .eq('operator_id', uid)
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;
    const list = deals || [];
    const totalRub = list.reduce((s, d) => s + (Number(d.total_rub) || 0), 0);
    const totalGross = list.reduce((s, d) => s + (Number(d.first_weight_gross) || 0), 0);
    const totalNet = list.reduce((s, d) => s + (Number(d.first_weight_net) || 0), 0);
    const dealsCount = list.length;
    const avg = dealsCount > 0 ? Math.round(totalRub / dealsCount) : 0;
    const maxDeal = list.reduce((m, d) => (Number(d.total_rub) > (m?.total_rub || 0) ? d : m), null);
    const firstDealAt = dealsCount > 0 ? list[list.length - 1].created_at : null;
    const lastDealAt = dealsCount > 0 ? list[0].created_at : null;
    res.json({
      user: { uid, email: req.user.email, role, displayName: prof?.display_name || null },
      stats: { dealsCount, totalRub, totalGross, totalNet, avg, firstDealAt, lastDealAt, maxDealRub: maxDeal?.total_rub || 0 },
      recent: list.slice(0, 12),
    });
  })
);

// Обновление отображаемого имени.
app.patch(
  '/api/profile/me',
  asyncHandler(async (req, res) => {
    const uid = req.user.id;
    const raw = String(req.body?.displayName ?? '').trim();
    if (raw.length > 80) {
      return res.status(400).json({ error: 'Имя не должно превышать 80 символов' });
    }
    const displayName = raw || null;
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName, updated_at: new Date().toISOString() })
      .eq('id', uid);
    if (error) throw error;
    profileRoleMem.delete(uid);
    cacheInvalidate(`auth-me:${uid}`);
    res.json({ ok: true, displayName });
  })
);

app.post(
  '/api/field-deal-sessions',
  asyncHandler(async (req, res) => {
    const role = await getRequesterRole(req);
    const origin = corsOrigins[0] || 'http://localhost:5173';
    const base = process.env.PUBLIC_APP_ORIGIN || origin;
    const out = await createFieldDealSession(supabase, {
      reqUser: req.user,
      requesterRole: role,
      body: req.body || {},
      publicAppOrigin: base,
    });
    res.json(out);
  })
);

app.get(
  '/api/field-deal-sessions',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    const limit = parseInt(String(req.query.limit || '40'), 10) || 40;
    const offset = parseInt(String(req.query.offset || '0'), 10) || 0;
    const data = await listFieldDealSessionsForManager(supabase, { limit, offset });
    res.json(data);
  })
);

app.post(
  '/api/field-deal-sessions/:id/cancel',
  asyncHandler(async (req, res) => {
    const role = await getRequesterRole(req);
    const isMgr = req.isUserManager || isUserManagerRole(role);
    const out = await cancelFieldDealSession(supabase, {
      sessionId: req.params.id,
      reqUser: req.user,
      isManager: isMgr,
    });
    res.json(out);
  })
);

app.get(
  '/api/gold-index/overview',
  asyncHandler(requireSuperAdmin),
  asyncHandler(async (_req, res) => {
    const data = await buildGoldIndexOverview(supabase);
    res.json(data);
  })
);

// Облегчённая обезличенная сводка для всех авторизованных пользователей
// (используется в клиентском режиме калькулятора для сравнения «наша сумма vs рынок»).
app.get(
  '/api/gold-index/public-summary',
  asyncHandler(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const hit = cacheGet('gold-index:public-summary');
    if (hit) return res.json(hit);
    const data = await buildGoldIndexPublicSummary(supabase);
    cacheSet('gold-index:public-summary', data, 5 * 60_000);
    res.json(data);
  })
);

app.get(
  '/api/gold-index/history',
  asyncHandler(requireSuperAdmin),
  asyncHandler(async (req, res) => {
    const cityId = String(req.query.cityId || '').trim();
    const limit = parseInt(String(req.query.limit || '30'), 10) || 30;
    const offset = parseInt(String(req.query.offset || '0'), 10) || 0;
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const data = await listGoldIndexHistory(supabase, { cityId, from, to, limit, offset });
    const rows = await enrichGoldIndexHistoryActors(supabase, data.rows || []);
    res.json({ ...data, rows });
  })
);

app.get(
  '/api/gold-index/history/chart',
  asyncHandler(requireSuperAdmin),
  asyncHandler(async (req, res) => {
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const regionCode = String(req.query.regionCode || '').trim();
    const result = await buildGoldIndexChartData(supabase, { from, to, regionCode });
    res.json(result);
  })
);

app.get(
  '/api/gold-index/reverse-geocode',
  asyncHandler(requireSuperAdmin),
  asyncHandler(async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat);
      const lng = parseFloat(req.query.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: 'Неверные координаты' });
      }
      const out = await reverseGeocodeGoldIndex({ lat, lng });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.post(
  '/api/gold-index/geocode',
  asyncHandler(requireSuperAdmin),
  asyncHandler(async (req, res) => {
    try {
      const out = await geocodeGoldIndexLocation(req.body || {});
      res.json(out);
    } catch (e) {
      const st = e.status || 500;
      res.status(st).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.get(
  '/api/gold-index/report.pdf',
  asyncHandler(requireSuperAdmin),
  asyncHandler(async (req, res) => {
    try {
      const overview = await buildGoldIndexOverview(supabase);
      const regionCode = String(req.query.regionCode || '').trim();
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();
      const filteredCities = regionCode
        ? (overview.cities || []).filter((c) => String(c.region_code || '') === regionCode)
        : overview.cities || [];
      const cityIdSet = new Set(filteredCities.map((c) => c.id));
      const filteredRegions = (overview.regions || []).filter((r) => {
        if (!regionCode) return true;
        return String(r.regionCode || '') === regionCode;
      });
      const filteredOverview = {
        ...overview,
        regions: filteredRegions,
        cities: filteredCities,
        stats: {
          cityCount: filteredCities.length,
          populationCovered: filteredCities.reduce((s, x) => s + (x.population || 0), 0),
          competitorRows: filteredCities.reduce((s, x) => s + (x.competitors?.length || 0), 0),
        },
      };
      const history = await listGoldIndexHistory(supabase, {
        cityIds: [...cityIdSet],
        from,
        to,
        limit: 120,
        offset: 0,
      });
      const historyRows = await enrichGoldIndexHistoryActors(supabase, history.rows || []);
      const buf = await buildGoldIndexReportPdfBuffer(filteredOverview, {
        filters: {
          regionCode: regionCode || null,
          regionName:
            regionCode && filteredCities[0] ? String(filteredCities[0].region_name || regionCode) : null,
          from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null,
          to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : null,
        },
        historyRows,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="gold-index.pdf"');
      res.send(buf);
    } catch (e) {
      console.error('[gold-index/report.pdf]', e?.message || e);
      res.status(500).json({ error: 'Не удалось сформировать PDF. Проверьте миграции и повторите.' });
    }
  })
);

app.get(
  '/api/gold-index/export.xlsx',
  asyncHandler(requireSuperAdmin),
  asyncHandler(async (req, res) => {
    const overview = await buildGoldIndexOverview(supabase);
    const regionCode = String(req.query.regionCode || '').trim();
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const filteredCities = regionCode
      ? (overview.cities || []).filter((c) => String(c.region_code || '') === regionCode)
      : overview.cities || [];
    const cityIdSet = new Set(filteredCities.map((c) => c.id));
    const filteredRegions = (overview.regions || []).filter((r) => {
      if (!regionCode) return true;
      return String(r.regionCode || '') === regionCode;
    });
    const filteredOverview = {
      ...overview,
      regions: filteredRegions,
      cities: filteredCities,
      stats: {
        cityCount: filteredCities.length,
        populationCovered: filteredCities.reduce((s, x) => s + (x.population || 0), 0),
        competitorRows: filteredCities.reduce((s, x) => s + (x.competitors?.length || 0), 0),
      },
    };
    const history = await listGoldIndexHistory(supabase, {
      cityIds: [...cityIdSet],
      from,
      to,
      limit: 1000,
      offset: 0,
    });
    const historyRows = await enrichGoldIndexHistoryActors(supabase, history.rows || []);
    const buf = buildGoldIndexExcelBuffer(filteredOverview, {
      filters: {
        regionCode: regionCode || null,
        regionName:
          regionCode && filteredCities[0] ? String(filteredCities[0].region_name || regionCode) : null,
        from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null,
        to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : null,
      },
      historyRows,
    });
    const out = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="gold-index.xlsx"');
    res.send(out);
  })
);

app.post(
  '/api/gold-index/cities',
  asyncHandler(requireSuperAdmin),
  asyncHandler(async (req, res) => {
    const id = await createGoldIndexCity(supabase, req.body || {}, req.user.id);
    res.json({ id });
  })
);

app.patch(
  '/api/gold-index/cities/:id',
  asyncHandler(requireSuperAdmin),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Некорректный id' });
    await updateGoldIndexCity(supabase, id, req.body || {}, req.user.id);
    res.json({ ok: true });
  })
);

app.delete(
  '/api/gold-index/cities/:id',
  asyncHandler(requireSuperAdmin),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Некорректный id' });
    await deleteGoldIndexCity(supabase, id, req.user.id);
    res.json({ ok: true });
  })
);

app.post(
  '/api/gold-index/cities/:cityId/competitors',
  asyncHandler(requireSuperAdmin),
  asyncHandler(async (req, res) => {
    const cityId = String(req.params.cityId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(cityId)) return res.status(400).json({ error: 'Некорректный id города' });
    const id = await createGoldIndexCompetitor(supabase, cityId, req.body || {}, req.user.id);
    res.json({ id });
  })
);

app.patch(
  '/api/gold-index/competitors/:id',
  asyncHandler(requireSuperAdmin),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Некорректный id' });
    await updateGoldIndexCompetitor(supabase, id, req.body || {}, req.user.id);
    res.json({ ok: true });
  })
);

app.delete(
  '/api/gold-index/competitors/:id',
  asyncHandler(requireSuperAdmin),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Некорректный id' });
    await deleteGoldIndexCompetitor(supabase, id, req.user.id);
    res.json({ ok: true });
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
    const sort = String(req.query.sort || 'alpha').trim();
    let orderCol = 'full_name';
    let orderAsc = true;
    if (sort === 'newest') { orderCol = 'created_at'; orderAsc = false; }
    const { data, count, error } = await supabase
      .from('scrap_customers')
      .select(SCRAP_CUST_LIST_SEL, { count: 'exact' })
      .order(orderCol, { ascending: orderAsc })
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

// Все сделки конкретного сотрудника (страница «Сделки сотрудников», только руководитель).
app.get(
  '/api/operator-deals',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const operatorId = String(req.query.operatorId || '').trim();
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '200'), 10) || 200));
    const sel =
      'id, contract_no, total_rub, seller_name, phone, first_probe, first_weight_gross, first_weight_net, created_at, operator_id, "rows"';
    let q = supabase
      .from('scrap_deals')
      .select(sel)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (operatorId === 'none') q = q.is('operator_id', null);
    else if (operatorId && /^[0-9a-f-]{36}$/i.test(operatorId)) q = q.eq('operator_id', operatorId);
    const { data, error } = await q;
    if (error) throw error;
    const deals = data || [];
    const totalRub = deals.reduce((s, d) => s + (Number(d.total_rub) || 0), 0);
    const totalGross = deals.reduce((s, d) => s + (Number(d.first_weight_gross) || 0), 0);
    const totalNet = deals.reduce((s, d) => s + (Number(d.first_weight_net) || 0), 0);
    res.json({
      deals,
      stats: { dealsCount: deals.length, totalRub, totalGross, totalNet },
    });
  })
);

// Лента последних сделок (дашборд). Курьер/продавец видит только свои.
app.get(
  '/api/scrap-deals-recent',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit || '6'), 10) || 6));
    const scope = await analyticsScopeFromRequest(req);
    const cacheKey = `recent:${scope.viewerIsManager ? 'mgr' : `self:${scope.viewerUserId}`}:${limit}`;
    const hit = cacheGet(cacheKey);
    if (hit) return res.json(hit);
    let q = supabase
      .from('scrap_deals')
      .select('id, contract_no, total_rub, seller_name, first_probe, first_weight_gross, created_at, operator_id')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (!scope.viewerIsManager) q = q.eq('operator_id', scope.viewerUserId);
    const { data, error } = await q;
    if (error) throw error;
    const result = { deals: data || [] };
    cacheSet(cacheKey, result, 60_000);
    res.json(result);
  })
);

// Получить детали одной сделки (для дравера в дашборде и т.д.)
app.get(
  '/api/scrap-deals/:id/detail',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Некорректный id' });
    const scope = await analyticsScopeFromRequest(req);
    let q = supabase
      .from('scrap_deals')
      .select('id, customer_id, contract_no, total_rub, seller_name, phone, appraiser_name, first_probe, first_weight_gross, first_weight_net, created_at, operator_id, rows, source')
      .eq('id', id);
    if (!scope.viewerIsManager) q = q.eq('operator_id', scope.viewerUserId);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Сделка не найдена' });
    // Паспорт и адрес живут в карточке клиента — подтягиваем, если сделка к нему привязана.
    if (data.customer_id) {
      const { data: cust } = await supabase
        .from('scrap_customers')
        .select('passport_line, address')
        .eq('id', data.customer_id)
        .maybeSingle();
      if (cust) {
        data.passport_line = cust.passport_line || null;
        data.address = cust.address || null;
      }
    }
    res.json({ deal: data });
  })
);

// Загрузить фото изделия для позиции сделки и сохранить URL в rows JSON
app.post(
  '/api/deal-photos/upload',
  asyncHandler(async (req, res) => {
    const { dealId, rowIdx, base64, mimeType } = req.body || {};
    if (!dealId || !/^[0-9a-f-]{36}$/i.test(String(dealId))) {
      return res.status(400).json({ error: 'Некорректный dealId' });
    }
    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ error: 'Нет данных изображения' });
    }
    const scope = await analyticsScopeFromRequest(req);
    let q = supabase.from('scrap_deals').select('rows, operator_id').eq('id', dealId);
    if (!scope.viewerIsManager) q = q.eq('operator_id', scope.viewerUserId);
    const { data: deal, error: fetchErr } = await q.maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!deal) return res.status(404).json({ error: 'Сделка не найдена' });

    const rawBase64 = base64.replace(/^data:[^;]+;base64,/, '');
    const buf = Buffer.from(rawBase64, 'base64');
    const ext = (mimeType || 'image/jpeg').split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const fileName = `${dealId}/row-${rowIdx ?? 0}-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('deal-photos')
      .upload(fileName, buf, { contentType: mimeType || 'image/jpeg', upsert: true });
    if (upErr) throw new Error(`Ошибка загрузки фото: ${upErr.message}`);

    const { data: urlData } = supabase.storage.from('deal-photos').getPublicUrl(fileName);
    const photoUrl = urlData?.publicUrl || '';

    const rows = Array.isArray(deal.rows) ? deal.rows : [];
    const updatedRows = rows.map((r, i) =>
      i === (rowIdx ?? 0) ? { ...r, photoUrl } : r,
    );
    const { error: patchErr } = await supabase
      .from('scrap_deals')
      .update({ rows: updatedRows })
      .eq('id', dealId);
    if (patchErr) throw patchErr;

    res.json({ ok: true, photoUrl });
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

/** Исправить сохранённую сделку (ФИО, телефон, позиции, сумма). PDF пересоберётся при скачивании. */
app.patch(
  '/api/scrap-deals/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ error: 'Некорректный id' });
    }
    const scope = await analyticsScopeFromRequest(req);
    let q = supabase
      .from('scrap_deals')
      .select('id, customer_id, contract_no, total_rub, seller_name, phone, appraiser_name, rows, operator_id, source')
      .eq('id', id);
    if (!scope.viewerIsManager) q = q.eq('operator_id', scope.viewerUserId);
    const { data: existing, error: fErr } = await q.maybeSingle();
    if (fErr) throw fErr;
    if (!existing) return res.status(404).json({ error: 'Сделка не найдена' });
    try {
      const deal = await updateScrapDealRow(supabase, { dealId: id, body: req.body || {}, existing });
      res.json({ ok: true, deal });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Не удалось сохранить' });
    }
  })
);

app.delete(
  '/api/scrap-deals/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ error: 'Некорректный id' });
    }
    const scope = await analyticsScopeFromRequest(req);
    let q = supabase.from('scrap_deals').select('id').eq('id', id);
    if (!scope.viewerIsManager) q = q.eq('operator_id', scope.viewerUserId);
    const { data: row, error: fErr } = await q.maybeSingle();
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
    res.setHeader('Cache-Control', 'no-store');
    const fromD = String(req.query.from || '').trim();
    const toD = String(req.query.to || '').trim();
    const scope = await analyticsScopeFromRequest(req);
    const cacheKey = `analytics:${scope.viewerIsManager ? 'mgr' : `self:${scope.viewerUserId}`}:${fromD}:${toD}`;
    const hit = cacheGet(cacheKey);
    if (hit) return res.json(hit);
    const data = await computeAnalyticsSummaryData(supabase, fromD, toD, scope);
    cacheSet(cacheKey, data, 2 * 60_000);
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
    const scope = await analyticsScopeFromRequest(req);
    const data = await computeAnalyticsSummaryData(supabase, fromD, toD, scope);
    const sectionsQ = String(req.query.sections || '');
    const buf = await buildAnalyticsReportPdfBuffer(data, group, sectionsQ);
    const p = data.period || {};
    const safe = (s) => String(s || 'x').replace(/[^\d-]/g, '') || 'period';
    const scopeTag = data.viewerScope === 'self' ? '-my' : '';
    const fname = `analitika${scopeTag}-${safe(p.from)}_${safe(p.to)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(buf);
  })
);

// ── Дашборд: PDF-отчёт ───────────────────────────────────────────────────────
app.post(
  '/api/dashboard-report.pdf',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    await getRequesterRole(req); // проверка авторизации
    const payload = req.body || {};
    const buf = await buildDashboardReportPdf(payload);
    const date = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\./g, '-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="dashboard-${date}.pdf"`);
    res.send(buf);
  })
);
const GROK_API_KEY = process.env.GROK_API_KEY || '';
const GROK_MODEL = process.env.GROK_MODEL || 'grok-3-mini';

const AI_SYSTEM_PROMPT = [
  'Ты — встроенный AI-аналитик панели REAKTIVO PRO (скупка золота и лома в России).',
  'Тебе передают агрегированную сводку сделок за период (JSON) и текущий курс золота.',
  'Отвечай на русском, кратко и по делу: 3–6 пунктов или 2–4 коротких абзаца.',
  'Опирайся только на переданные цифры; если данных мало — честно скажи об этом.',
  'Суммы пиши в рублях с разделителями тысяч, проценты — с одним знаком после запятой.',
  'Прогнозы помечай как оценку, не как гарантию. Не используй markdown-разметку (#, *, `):',
  'обычный текст, пункты начинай с «— ».',
].join(' ');

app.post(
  '/api/ai/ask',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    if (!GROK_API_KEY) {
      return res.status(503).json({ error: 'AI не настроен: задайте GROK_API_KEY на сервере' });
    }
    const question = String(req.body?.question || '').trim().slice(0, 600);
    if (!question) return res.status(400).json({ error: 'Задайте вопрос' });
    const fromD = String(req.body?.from || '').trim();
    const toD = String(req.body?.to || '').trim();

    const scope = await analyticsScopeFromRequest(req);
    const data = await computeAnalyticsSummaryData(supabase, fromD, toD, scope);
    let goldRubPerGram = null;
    try {
      goldRubPerGram = (await getPriceCache())?.goldRubPerGram ?? null;
    } catch {}

    // Компактный контекст: только то, что нужно для ответа.
    const ctx = {
      period: data.period,
      totals: data.totals,
      byDay: data.byDay,
      byProbe: (data.byProbe || []).map((x) => ({ probe: x.probe, count: x.count, sumRub: x.sumRub })),
      byOperator: (data.byOperator || []).map((o) => ({ email: o.email, deals: o.deals, sumRub: o.sumRub })),
      goldRubPerGram,
    };

    let r;
    try {
      r = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROK_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROK_MODEL,
          messages: [
            { role: 'system', content: AI_SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Сводка за период (JSON):\n${JSON.stringify(ctx)}\n\nВопрос: ${question}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 800,
        }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (e) {
      const msg = e?.name === 'TimeoutError' || e?.name === 'AbortError'
        ? 'AI не ответил за отведённое время, попробуйте ещё раз'
        : 'Не удалось связаться с AI-сервисом';
      return res.status(502).json({ error: msg });
    }
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      const raw = j?.error?.message || j?.error || `Grok API: HTTP ${r.status}`;
      console.warn('[ai/ask] Grok error:', raw);
      return res.status(502).json({ error: typeof raw === 'string' ? raw : 'Ошибка AI-сервиса' });
    }
    const answer = String(j?.choices?.[0]?.message?.content || '').trim();
    if (!answer) return res.status(502).json({ error: 'AI вернул пустой ответ, попробуйте переформулировать' });
    res.json({ answer, model: GROK_MODEL });
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
    let dealId = null;
    try {
      dealId = await recordScrapDealFromPdf({ req, body, totalRub: total });
      cacheInvalidate('analytics:');
      cacheInvalidate('recent:');
    } catch (e) {
      console.error('[scrap_deals insert]', e?.message || e);
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="dogovor-kvitanciya.pdf"');
    if (dealId) res.setHeader('X-Deal-Id', dealId);
    res.send(buf);
  })
);

app.get('/api/settings', asyncHandler(async (_req, res) => {
  const hit = cacheGet('settings');
  if (hit) return res.json(hit);
  const data = await getSettings();
  cacheSet('settings', data, 5 * 60_000);
  res.json(data);
}));

app.put(
  '/api/settings',
  asyncHandler(requireSuperAdmin),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const allowed = ['buybackPercentOfScrap', 'rangeHalfWidthPercent', 'purityAdjustments', 'purityOrder'];
    const patch = {};
    for (const k of allowed) if (body[k] !== undefined) patch[k] = body[k];
    const result = await saveSettings(patch);
    cacheInvalidate('settings');
    res.json(result);
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

// ── Fintech: модерация клиентов биржи (admin/super_admin) ───────────────────
app.get(
  '/api/fintech/admin/summary',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    try {
      const out = await getFintechAdminSummary(supabase, {
        from: req.query.from ? String(req.query.from) : undefined,
        to: req.query.to ? String(req.query.to) : undefined,
      });
      res.setHeader('Cache-Control', 'no-store');
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Не удалось построить сводку биржи' });
    }
  })
);

app.get(
  '/api/fintech/admin/clients',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
    const out = await listFintechClients(supabase, { status: req.query.status, q: req.query.q, limit, offset });
    res.setHeader('Cache-Control', 'no-store');
    res.json(out);
  })
);

/** Лёгкий счётчик «на проверке» для бейджа в сайдбаре (правка Руслана). */
app.get(
  '/api/fintech/admin/pending-count',
  asyncHandler(requireUserManager),
  asyncHandler(async (_req, res) => {
    const { count, error } = await supabase
      .from('fintech_clients')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_review');
    if (error) throw error;
    res.setHeader('Cache-Control', 'no-store');
    res.json({ pendingReview: count || 0 });
  })
);

// Полное удаление клиента — только супер-админ (правка Руслана).
app.delete(
  '/api/fintech/admin/clients/:id',
  asyncHandler(requireSuperAdmin),
  asyncHandler(async (req, res) => {
    try {
      const out = await deleteFintechClient(supabase, req.params.id);
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Не удалось удалить клиента' });
    }
  })
);

app.get(
  '/api/fintech/admin/clients/:id',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    try {
      const out = await getClientDetailForStaff(supabase, req.params.id);
      res.setHeader('Cache-Control', 'no-store');
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.get(
  '/api/fintech/admin/documents/:id/signed-url',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    try {
      const out = await getKycDocumentSignedUrl(supabase, req.params.id);
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.patch(
  '/api/fintech/admin/documents/:id/review',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    try {
      const out = await reviewKycDocument(supabase, {
        documentId: req.params.id,
        status: req.body?.status,
        staffId: req.user.id,
        rejectReason: req.body?.rejectReason,
      });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.patch(
  '/api/fintech/admin/clients/:id/status',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    try {
      const out = await decideClientStatus(supabase, {
        clientId: req.params.id,
        decision: req.body?.decision,
        staffId: req.user.id,
        rejectReason: req.body?.rejectReason,
      });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.post(
  '/api/fintech/admin/clients/:id/topup',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    try {
      const out = await fintechManualTopup(supabase, {
        clientId: req.params.id,
        rubAmount: req.body?.rubAmount,
        staffId: req.user.id,
        comment: req.body?.comment,
        idempotencyKey: req.body?.idempotencyKey,
      });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

// Комиссии и лимиты биржи — настраиваются из админки (правка Руслана: раньше только правкой в БД).
app.get(
  '/api/fintech/admin/settings',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    try {
      const out = await getFintechSettings(supabase);
      res.setHeader('Cache-Control', 'no-store');
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Не удалось загрузить настройки' });
    }
  })
);

app.put(
  '/api/fintech/admin/settings',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    try {
      const patch = {};
      for (const k of ['buyFeePercent', 'sellFeePercent', 'minPurchaseGrams', 'minSellGrams', 'withdrawFeePercent', 'minWithdrawRub']) {
        if (req.body?.[k] == null) continue;
        const v = Number(req.body[k]);
        if (!Number.isFinite(v) || v < 0) {
          return res.status(400).json({ error: `Некорректное значение поля ${k}` });
        }
        patch[k] = v;
      }
      const out = await setFintechSettings(supabase, patch);
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Не удалось сохранить настройки' });
    }
  })
);

// ── Fintech: заявки на вывод средств (модерация, без интеграции A7/ПСБ) ─────
app.get(
  '/api/fintech/admin/withdrawals',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    try {
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));
      const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
      const out = await listFintechWithdrawalRequests(supabase, { status: req.query.status, limit, offset });
      res.setHeader('Cache-Control', 'no-store');
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Не удалось загрузить заявки на вывод' });
    }
  })
);

// ── Обзор автоматизации (ценовые условия) для админки, только чтение ───────
app.get(
  '/api/fintech/admin/price-alerts',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    try {
      const out = await listActivePriceAlertsForStaff(supabase);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ alerts: out });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Не удалось загрузить условия' });
    }
  })
);

app.patch(
  '/api/fintech/admin/withdrawals/:id',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    try {
      const out = await decideFintechWithdrawal(supabase, {
        requestId: req.params.id,
        decision: req.body?.decision,
        staffId: req.user.id,
        rejectReason: req.body?.rejectReason,
      });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

// ── Чат поддержки (сторона сотрудников, admin/super_admin) ──────────────────
app.get(
  '/api/support/threads',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    const out = await staffListSupportThreads(supabase, { status: req.query.status });
    res.setHeader('Cache-Control', 'no-store');
    res.json(out);
  })
);

app.get(
  '/api/support/unread',
  asyncHandler(requireUserManager),
  asyncHandler(async (_req, res) => {
    const out = await staffSupportUnreadTotal(supabase);
    res.setHeader('Cache-Control', 'no-store');
    res.json(out);
  })
);

app.get(
  '/api/support/threads/:id',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    try {
      const out = await staffGetSupportThread(supabase, req.params.id);
      res.setHeader('Cache-Control', 'no-store');
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.post(
  '/api/support/threads/:id/reply',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    try {
      let staffName = null;
      try {
        const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', req.user.id).maybeSingle();
        staffName = prof?.display_name || req.user?.email?.split('@')[0] || null;
      } catch { /* имя — best-effort */ }
      const out = await staffReplySupport(supabase, {
        threadId: req.params.id,
        staffId: req.user.id,
        staffName,
        body: req.body?.body,
      });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
  })
);

app.patch(
  '/api/support/threads/:id/status',
  asyncHandler(requireUserManager),
  asyncHandler(async (req, res) => {
    try {
      const out = await staffSetSupportThreadStatus(supabase, { threadId: req.params.id, status: req.body?.status });
      res.json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Ошибка' });
    }
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
  const status = Number.isInteger(err?.status) ? err.status : 500;
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  const publicMessage =
    err?.publicMessage ||
    (safeStatus >= 500 ? (isDev ? `Внутренняя ошибка сервиса: ${err?.message || 'unknown'}` : 'Внутренняя ошибка сервиса') : err?.message || 'Ошибка');
  console.error('[API ERROR]', err?.stack || err);
  res.status(safeStatus).json({ error: publicMessage });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Calculated Gold API listening on ${PORT}`);
  console.log(`CORS origins: ${corsOrigins.join(', ')}`);

  // Keep-alive: пингуем собственный публичный эндпоинт каждые 10 минут,
  // чтобы Render не усыплял бесплатный Web Service.
  if (!isDev) {
    const selfUrl = `http://localhost:${PORT}/api/public/buyback-quote`;
    setInterval(() => {
      fetch(selfUrl, { signal: AbortSignal.timeout(15_000) })
        .then(() => console.log('[keep-alive] ping ok'))
        .catch((e) => console.warn('[keep-alive] ping failed:', e?.message));
    }, 10 * 60 * 1000); // каждые 10 минут
  }
});

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`[Calculated Gold] Порт ${PORT} уже занят.`);
    console.error(`Освободи порт: netstat -ano | findstr :${PORT} и taskkill /PID <PID> /F`);
    process.exit(1);
  }
  throw err;
});
