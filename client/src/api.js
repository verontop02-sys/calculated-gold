import { supabase } from './supabase.js';

const API_BASE = import.meta.env.DEV ? '/api' : import.meta.env.VITE_API_BASE || '/api';

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE) {
  console.error(
    '[Calculated Gold] Задайте VITE_API_BASE в client/.env.production (полный URL API, заканчивается на /api) перед vite build.'
  );
}

const AUTH_EXPIRED_EVENT = 'cg:session-expired';
const DEVICE_UNVERIFIED_EVENT = 'cg:device-unverified';

// ── Токен устройства: случайный id в localStorage, сервер хранит только его хеш.
// Первый вход с нового устройства подтверждается кодом на почту.
const DEVICE_TOKEN_KEY = 'cg_device_token';

export function getDeviceToken() {
  try {
    let t = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!t || t.length < 16) {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      t = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(DEVICE_TOKEN_KEY, t);
    }
    return t;
  } catch {
    return '';
  }
}

export function onDeviceUnverified(fn) {
  window.addEventListener(DEVICE_UNVERIFIED_EVENT, fn);
  return () => window.removeEventListener(DEVICE_UNVERIFIED_EVENT, fn);
}

function notifyDeviceUnverified() {
  window.dispatchEvent(new CustomEvent(DEVICE_UNVERIFIED_EVENT));
}

function isDeviceUnverifiedBody(data) {
  return data && typeof data === 'object' && data.code === 'device_unverified';
}

/** Один «всплеск» протухшей сессии — много параллельных 401 не должны слать N тостов. */
let authExpiredArmed = true;

function notifyAuthExpired() {
  if (!authExpiredArmed) return;
  authExpiredArmed = false;
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

/** Снова разрешить событие после успешного входа / свежего токена. */
export function resetAuthExpiredGate() {
  authExpiredArmed = true;
}

export function onSessionExpired(fn) {
  window.addEventListener(AUTH_EXPIRED_EVENT, fn, { once: false });
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, fn);
}

/** Ошибки, при которых имеет смысл тихо повторить запрос к API (сон хоста, сеть, 5xx). */
export function isTransientProfileLoadError(e) {
  if (!e) return false;
  const st = e.status;
  if (st === 401 || st === 403) return false;
  if (st >= 500 && st <= 599) return true;
  if (e.code === 'API_TIMEOUT') return true;
  if (e.name === 'TypeError') return true;
  const m = String(e.message || '');
  if (/failed to fetch|load failed|networkerror|сеть/i.test(m)) return true;
  return false;
}

function withBase(path) {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

const JSON_TIMEOUT_MS = 95_000;
const BLOB_TIMEOUT_MS = 180_000;

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Снимает сон с Render и проверяет, что /api на своём origin отвечает, без сессии не нужен. */
export async function pingApiHealth(opts = {}) {
  const t = opts.timeout != null ? opts.timeout : 95_000;
  const c = new AbortController();
  const to = setTimeout(() => c.abort(), t);
  try {
    const r = await fetch(withBase('/health'), { method: 'GET', signal: c.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(to);
  }
}

async function request(path, options = {}) {
  const { timeout = JSON_TIMEOUT_MS, ...fetchOpts } = options;
  const c = new AbortController();
  const to = setTimeout(() => c.abort(), timeout);
  const token = await getAccessToken();
  let res;
  try {
    const deviceToken = getDeviceToken();
    const hdrs = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(deviceToken ? { 'X-Device-Token': deviceToken } : {}),
      ...(fetchOpts.headers || {}),
    };
    if (fetchOpts.body != null && !hdrs['Content-Type'] && !hdrs['content-type']) {
      hdrs['Content-Type'] = 'application/json';
    }
    res = await fetch(withBase(path), {
      ...fetchOpts,
      signal: c.signal,
      headers: hdrs,
    });
  } catch (e) {
    clearTimeout(to);
    if (e?.name === 'AbortError') {
      const err = new Error('Сервер не ответил за отведённое время. Попробуйте ещё раз через несколько секунд.');
      err.code = 'API_TIMEOUT';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(to);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    const err = new Error(
      'API недоступно: сервер вернул не-JSON. Укажите VITE_API_BASE на задеплоенный Node API или проксируйте /api.'
    );
    err.status = res.status;
    throw err;
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    const err = new Error('API недоступно: некорректный JSON в ответе сервера.');
    err.status = res.status;
    throw err;
  }
  if (!res.ok) {
    if (res.status === 401) {
      notifyAuthExpired();
    }
    if (res.status === 403 && isDeviceUnverifiedBody(data)) {
      notifyDeviceUnverified();
    }
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

async function requestBlob(path, options = {}) {
  const {
    timeout = BLOB_TIMEOUT_MS,
    expectedContentTypes = ['pdf'],
    expectedLabel = 'PDF',
    ...opt
  } = options;
  const token = await getAccessToken();
  const deviceToken = getDeviceToken();
  const h = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(deviceToken ? { 'X-Device-Token': deviceToken } : {}),
    ...(opt.headers || {}),
  };
  if (opt.body != null) h['Content-Type'] = 'application/json';
  const body = opt.body != null ? JSON.stringify(opt.body) : undefined;

  // Одна попытка fetch с собственным таймаутом.
  const attempt = async () => {
    const c = new AbortController();
    const to = setTimeout(() => c.abort(), timeout);
    try {
      return await fetch(withBase(path), {
        method: opt.method || 'GET',
        headers: h,
        body,
        signal: c.signal,
      });
    } finally {
      clearTimeout(to);
    }
  };

  let res;
  try {
    res = await attempt();
  } catch (e) {
    if (e?.name === 'AbortError') {
      const err = new Error(`Скачивание ${expectedLabel}: сервер слишком долго не отвечал. Повторите запрос.`);
      err.code = 'API_TIMEOUT';
      throw err;
    }
    // Сетевой сбой — вероятно холодный старт Render. Будим сервер и повторяем один раз.
    try {
      await pingApiHealth({ timeout: 95_000 });
      res = await attempt();
    } catch (e2) {
      if (e2?.name === 'AbortError') {
        const err = new Error(`Скачивание ${expectedLabel}: сервер слишком долго не отвечал. Повторите запрос.`);
        err.code = 'API_TIMEOUT';
        throw err;
      }
      const err = new Error('Сервер недоступен. Подождите 10–20 секунд (он «просыпается») и повторите.');
      err.code = 'API_OFFLINE';
      throw err;
    }
  }
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!res.ok) {
    if (res.status === 401) {
      notifyAuthExpired();
    }
    if (ct.includes('application/json')) {
      let data = null;
      try {
        data = await res.json();
      } catch {}
      const err = new Error(data?.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const expected = Array.isArray(expectedContentTypes) ? expectedContentTypes : [String(expectedContentTypes || '')];
  const contentOk = expected.some((x) => x && ct.includes(String(x).toLowerCase()));
  if (!contentOk) {
    let msg = `Ожидался ${expectedLabel}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  const blob = await res.blob();
  if (opt.returnHeaders) {
    return { blob, headers: res.headers };
  }
  return blob;
}

/**
 * Connect to the SSE price stream using fetch (supports Authorization header).
 * Returns a cleanup function. Calls onData(priceObject) on each event,
 * onError() when the stream drops or returns non-2xx.
 */
export async function connectPriceStream(onData, onError) {
  const token = await getAccessToken();
  if (!token) {
    // No session — don't make the request at all
    onError?.();
    return () => {};
  }

  const url = withBase('/price/stream');
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
          ...(getDeviceToken() ? { 'X-Device-Token': getDeviceToken() } : {}),
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401) notifyAuthExpired();
        // Pass status so caller can decide whether to retry
        onError?.(res.status);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) { onError?.(); break; }

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try { onData(JSON.parse(line.slice(6))); } catch {}
          }
        }
      }
    } catch (e) {
      if (e?.name !== 'AbortError') onError?.(0);
    }
  })();

  return () => controller.abort();
}

/**
 * Подписка экрана клиента (покупательский дисплей) на комнату по коду — БЕЗ JWT.
 * Экран может стоять на отдельном устройстве (планшет), поэтому без авторизации.
 * Возвращает функцию отписки. При обрыве вызывает onError(status) для авто-реконнекта.
 */
export async function connectClientDisplayStream(code, onData, onError) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!c) { onError?.(); return () => {}; }

  const url = withBase(`/public/client-display/${encodeURIComponent(c)}/stream`);
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(url, { headers: { Accept: 'text/event-stream' }, signal: controller.signal });
      if (!res.ok) { onError?.(res.status); return; }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) { onError?.(); break; }
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try { onData(JSON.parse(line.slice(6))); } catch { /* ignore */ }
          }
        }
      }
    } catch (e) {
      if (e?.name !== 'AbortError') onError?.(0);
    }
  })();

  return () => controller.abort();
}

/** Текущее состояние комнаты экрана клиента (polling-fallback), без JWT. */
export async function clientDisplayGet(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const r = await fetch(withBase(`/public/client-display/${encodeURIComponent(c)}`));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Ошибка ${r.status}`);
  return j;
}

/** Публичная страница подтверждения (без JWT). */
export async function publicFieldDealSessionGet(token) {
  const r = await fetch(withBase(`/public/field-deal-session/${encodeURIComponent(token)}`));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Ошибка ${r.status}`);
  return j;
}

export async function publicFieldDealSessionVerify(token, code) {
  const r = await fetch(withBase(`/public/field-deal-session/${encodeURIComponent(token)}/verify`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Ошибка ${r.status}`);
  return j;
}

// ── Клиентский кабинет (вход по телефону + SMS-код) ─────────────────────────
const CLIENT_TOKEN_KEY = 'cg_client_token';

export function getClientToken() {
  try {
    return localStorage.getItem(CLIENT_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setClientToken(token) {
  try {
    if (token) localStorage.setItem(CLIENT_TOKEN_KEY, token);
    else localStorage.removeItem(CLIENT_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export const clientApi = {
  requestCode: async (phone) => {
    const r = await fetch(withBase('/public/client-auth/request-code'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Ошибка ${r.status}`);
    return j;
  },
  verify: async (phone, code) => {
    const r = await fetch(withBase('/public/client-auth/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Ошибка ${r.status}`);
    if (j.token) setClientToken(j.token);
    return j;
  },
  me: async () => {
    const r = await fetch(withBase('/public/client/me'), {
      headers: { Authorization: `Bearer ${getClientToken()}` },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(j.error || `Ошибка ${r.status}`);
      err.status = r.status;
      throw err;
    }
    return j;
  },
  deals: async () => {
    const r = await fetch(withBase('/public/client/deals'), {
      headers: { Authorization: `Bearer ${getClientToken()}` },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(j.error || `Ошибка ${r.status}`);
      err.status = r.status;
      throw err;
    }
    return j;
  },
  buybackQuote: async (quote = 'moex') => {
    const q = quote === 'xaut' ? '?quote=xaut' : '';
    const r = await fetch(withBase(`/public/buyback-quote${q}`));
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Ошибка ${r.status}`);
    return j;
  },
};

export async function publicFieldDealSessionSendReceipt(token, channel, target) {
  const r = await fetch(withBase(`/public/field-deal-session/${encodeURIComponent(token)}/receipt`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, target }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Ошибка ${r.status}`);
  return j;
}

/** Один in-flight запрос /auth/me — Login и App не дублируют при входе. */
let meInflight = null;
function fetchMeOnce() {
  if (meInflight) return meInflight;
  meInflight = request('/auth/me').finally(() => {
    meInflight = null;
  });
  return meInflight;
}

export const api = {
  me: () => fetchMeOnce(),
  /** Проверка устройства после входа: доверено или отправлен код на почту. */
  deviceCheck: () => request('/auth/device/check', { method: 'POST', body: JSON.stringify({}) }),
  /** Подтверждение устройства 6-значным кодом из письма. */
  deviceVerify: (code) =>
    request('/auth/device/verify', { method: 'POST', body: JSON.stringify({ code }) }),
  prefetchMe: () => {
    void fetchMeOnce();
  },
  /** quote: moex | xaut (Мосбиржа / Tether Gold XAUT в USD → ₽ через ЦБ) */
  price: (opts = {}) => {
    const q = opts.quote === 'xaut' ? '?quote=xaut' : '';
    return request(`/price${q}`);
  },
  refreshPrice: () => request('/price/refresh', { method: 'POST' }),
  calculate: (weightGrams, purityPerThousand, opts = {}) =>
    request('/calculate', {
      method: 'POST',
      body: JSON.stringify({
        weightGrams,
        purityPerThousand,
        ...(opts.quote ? { quote: opts.quote } : {}),
      }),
    }),
  settings: () => request('/settings'),
  saveSettings: (body) => request('/settings', { method: 'PUT', body: JSON.stringify(body) }),
  users: () => request('/users'),
  createUser: (email, password, role) =>
    request('/users', { method: 'POST', body: JSON.stringify({ email, password, role }) }),
  deleteUser: (uid) => request(`/users/${uid}`, { method: 'DELETE' }),
  changeRole: (uid, role) => request(`/users/${uid}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  scrapCustomersSearch: (q) =>
    request(`/scrap-customers/search?q=${encodeURIComponent(q)}`),
  saveScrapCustomer: (body) => request('/scrap-customers', { method: 'POST', body: JSON.stringify(body) }),
  deleteScrapCustomer: (id) => request(`/scrap-customers/${id}`, { method: 'DELETE' }),
  /** PDF договора: возвращает { blob, dealId } */
  scrapContractPdf: async (body) => {
    const { blob, headers } = await requestBlob('/scrap-contract/pdf', { method: 'POST', body, returnHeaders: true });
    return { blob, dealId: headers.get('x-deal-id') || null };
  },
  /** Полный список клиентов (панель «База»). q — поиск, limit/offset — пагинация. */
  scrapCustomersList: (params = {}) => {
    const q = new URLSearchParams();
    if (params.q) q.set('q', String(params.q));
    if (params.limit != null) q.set('limit', String(params.limit));
    if (params.offset != null) q.set('offset', String(params.offset));
    if (params.sort) q.set('sort', String(params.sort));
    const s = q.toString();
    return request(`/scrap-customers${s ? `?${s}` : ''}`);
  },
  /** Сделки по clientId (uuid) ИЛИ телефону. */
  scrapDeals: (params = {}) => {
    const q = new URLSearchParams();
    if (params.customerId) q.set('customerId', params.customerId);
    if (params.phone) q.set('phone', params.phone);
    if (params.limit != null) q.set('limit', String(params.limit));
    if (params.offset != null) q.set('offset', String(params.offset));
    return request(`/scrap-deals?${q.toString()}`);
  },
  /** Лента последних сделок для дашборда (курьер/продавец — только свои). */
  scrapDealsRecent: (limit = 6) => request(`/scrap-deals-recent?limit=${limit}`),
  /** Детали одной сделки (включая rows с photoUrl). */
  scrapDealDetail: (id) => request(`/scrap-deals/${encodeURIComponent(String(id))}/detail`),
  /** Личный профиль: статистика и последние сделки текущего пользователя. */
  profileMe: () => request('/profile/me'),
  updateDisplayName: (displayName) =>
    request('/profile/me', { method: 'PATCH', body: JSON.stringify({ displayName }) }),
  /** Все сделки конкретного сотрудника (только руководитель). operatorId | 'none'. */
  operatorDeals: (operatorId, limit = 200) =>
    request(`/operator-deals?operatorId=${encodeURIComponent(String(operatorId || ''))}&limit=${limit}`),
  /** Загрузить фото позиции в сделку (base64 → Supabase Storage). */
  dealPhotoUpload: (dealId, rowIdx, base64, mimeType) =>
    request('/deal-photos/upload', {
      method: 'POST',
      body: JSON.stringify({ dealId, rowIdx, base64, mimeType }),
      timeout: 60_000,
    }),
  /** PDF договора по id сохранённой сделки. */
  scrapDealPdf: (id) => requestBlob(`/scrap-deals/${encodeURIComponent(String(id))}/pdf`, { method: 'GET' }),
  deleteScrapDeal: (id) => request(`/scrap-deals/${encodeURIComponent(String(id))}`, { method: 'DELETE' }),
  /** Строка AI (Grok): вопрос по аналитике за период Y-M-D. */
  aiAsk: (question, from, to) =>
    request('/ai/ask', {
      method: 'POST',
      body: JSON.stringify({ question, from, to }),
      timeout: 120_000,
    }),
  /** Сводка для вкладки «Аналитика» (Y-M-D). */
  analyticsSummary: (from, to) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    return request(`/analytics/summary?${q.toString()}`);
  },
  /**
   * PDF-отчёт аналитики. sections — список ключей: summary, operators, probe, series (пусто/все = полный отчёт).
   */
  analyticsSummaryPdf: (from, to, group, sections) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (group) q.set('group', group);
    if (Array.isArray(sections) && sections.length > 0) q.set('sections', sections.join(','));
    return requestBlob(`/analytics/summary.pdf?${q.toString()}`, { method: 'GET' });
  },
  /** KPI команды: период Y-M-D; operatorIds — только для руководителя, узкий фильтр (uuid через запятую в query). */
  teamPerformance: (from, to, operatorIds) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (Array.isArray(operatorIds) && operatorIds.length > 0) q.set('operators', operatorIds.join(','));
    return request(`/team-performance?${q.toString()}`);
  },
  teamPerformancePdf: (from, to, operatorIds) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (Array.isArray(operatorIds) && operatorIds.length > 0) q.set('operators', operatorIds.join(','));
    return requestBlob(`/team-performance.pdf?${q.toString()}`, { method: 'GET' });
  },
  dashboardReportPdf: (payload) =>
    requestBlob('/dashboard-report.pdf', { method: 'POST', body: payload }),
  /** Экран клиента: оператор пушит готовый view в комнату по коду. mode: 'show' | 'idle'. */
  clientDisplayPush: (code, body) =>
    request(`/client-display/${encodeURIComponent(String(code || ''))}`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
      timeout: 20_000,
    }),
  /** Полевая сделка: СМС + ссылка клиенту (тело как у scrapContractPdf + phone + опционально courierId для руководителя). */
  fieldDealSessionCreate: (body) =>
    request('/field-deal-sessions', { method: 'POST', body: JSON.stringify(body) }),
  fieldDealSessions: (opts = {}) => {
    const q = new URLSearchParams();
    if (opts.limit != null) q.set('limit', String(opts.limit));
    if (opts.offset != null) q.set('offset', String(opts.offset));
    const s = q.toString();
    return request(`/field-deal-sessions${s ? `?${s}` : ''}`);
  },
  fieldDealSessionCancel: (id) =>
    request(`/field-deal-sessions/${encodeURIComponent(String(id))}/cancel`, { method: 'POST' }),
  /** Индекс золота (только super_admin на сервере). */
  goldIndexOverview: () => request('/gold-index/overview'),
  /** Облегчённая агрегированная сводка для всех ролей (клиентский режим калькулятора). */
  goldIndexPublicSummary: () => request('/gold-index/public-summary'),
  goldIndexHistory: (opts = {}) => {
    const q = new URLSearchParams();
    if (opts.cityId) q.set('cityId', String(opts.cityId));
    if (opts.from) q.set('from', String(opts.from));
    if (opts.to) q.set('to', String(opts.to));
    if (opts.limit != null) q.set('limit', String(opts.limit));
    if (opts.offset != null) q.set('offset', String(opts.offset));
    const s = q.toString();
    return request(`/gold-index/history${s ? `?${s}` : ''}`);
  },
  goldIndexReportPdf: (opts = {}) => {
    const q = new URLSearchParams();
    if (opts.regionCode) q.set('regionCode', String(opts.regionCode));
    if (opts.from) q.set('from', String(opts.from));
    if (opts.to) q.set('to', String(opts.to));
    const s = q.toString();
    return requestBlob(`/gold-index/report.pdf${s ? `?${s}` : ''}`, {
      method: 'GET',
      expectedContentTypes: ['pdf'],
      expectedLabel: 'PDF',
    });
  },
  goldIndexExportXlsx: (opts = {}) => {
    const q = new URLSearchParams();
    if (opts.regionCode) q.set('regionCode', String(opts.regionCode));
    if (opts.from) q.set('from', String(opts.from));
    if (opts.to) q.set('to', String(opts.to));
    const s = q.toString();
    return requestBlob(`/gold-index/export.xlsx${s ? `?${s}` : ''}`, {
      method: 'GET',
      expectedContentTypes: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'octet-stream',
      ],
      expectedLabel: 'Excel',
    });
  },
  goldIndexChartHistory: (opts = {}) => {
    const q = new URLSearchParams();
    if (opts.from) q.set('from', opts.from);
    if (opts.to) q.set('to', opts.to);
    if (opts.regionCode) q.set('regionCode', opts.regionCode);
    return request(`/gold-index/history/chart?${q}`);
  },
  goldIndexGeocode: (body) => request('/gold-index/geocode', { method: 'POST', body: JSON.stringify(body) }),
  goldIndexReverseGeocode: ({ lat, lng }) => request(`/gold-index/reverse-geocode?lat=${lat}&lng=${lng}`),
  goldIndexCreateCity: (body) => request('/gold-index/cities', { method: 'POST', body: JSON.stringify(body) }),
  goldIndexUpdateCity: (id, body) =>
    request(`/gold-index/cities/${encodeURIComponent(String(id))}`, { method: 'PATCH', body: JSON.stringify(body) }),
  goldIndexDeleteCity: (id) =>
    request(`/gold-index/cities/${encodeURIComponent(String(id))}`, { method: 'DELETE' }),
  goldIndexCreateCompetitor: (cityId, body) =>
    request(`/gold-index/cities/${encodeURIComponent(String(cityId))}/competitors`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  goldIndexUpdateCompetitor: (id, body) =>
    request(`/gold-index/competitors/${encodeURIComponent(String(id))}`, { method: 'PATCH', body: JSON.stringify(body) }),
  goldIndexDeleteCompetitor: (id) =>
    request(`/gold-index/competitors/${encodeURIComponent(String(id))}`, { method: 'DELETE' }),
};
