import { supabase } from './supabase.js';

const API_BASE = import.meta.env.DEV ? '/api' : import.meta.env.VITE_API_BASE || '/api';

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE) {
  console.error(
    '[Calculated Gold] Задайте VITE_API_BASE в client/.env.production (полный URL API, заканчивается на /api) перед vite build.'
  );
}

const AUTH_EXPIRED_EVENT = 'cg:session-expired';

export function onSessionExpired(fn) {
  window.addEventListener(AUTH_EXPIRED_EVENT, fn, { once: false });
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, fn);
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
    const hdrs = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(fetchOpts.headers || {}) };
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
      const err = new Error(
        'API не ответил в срок. На бесплатном хосте первый запрос после паузы может занять до 1–2 минут, откройте панель ещё раз.'
      );
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
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

async function requestBlob(path, options = {}) {
  const { timeout = BLOB_TIMEOUT_MS, ...opt } = options;
  const c = new AbortController();
  const to = setTimeout(() => c.abort(), timeout);
  const token = await getAccessToken();
  const h = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opt.headers || {}) };
  if (opt.body != null) h['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(withBase(path), {
      method: opt.method || 'GET',
      headers: h,
      body: opt.body != null ? JSON.stringify(opt.body) : undefined,
      signal: c.signal,
    });
  } catch (e) {
    clearTimeout(to);
    if (e?.name === 'AbortError') {
      const err = new Error('Скачивание PDF: сервер слишком долго не отвечал. Повторите, на бесплатном плане первый запуск может тянуться.');
      err.code = 'API_TIMEOUT';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(to);
  }
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
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
  if (!ct.includes('pdf')) {
    let msg = 'Ожидался PDF';
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  return res.blob();
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
        },
        signal: controller.signal,
      });

      if (!res.ok) {
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

export const api = {
  me: () => request('/auth/me'),
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
  scrapContractPdf: (body) => requestBlob('/scrap-contract/pdf', { method: 'POST', body }),
  /** Полный список клиентов (панель «База»). q — поиск, limit/offset — пагинация. */
  scrapCustomersList: (params = {}) => {
    const q = new URLSearchParams();
    if (params.q) q.set('q', String(params.q));
    if (params.limit != null) q.set('limit', String(params.limit));
    if (params.offset != null) q.set('offset', String(params.offset));
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
  /** PDF договора по id сохранённой сделки. */
  scrapDealPdf: (id) => requestBlob(`/scrap-deals/${encodeURIComponent(String(id))}/pdf`, { method: 'GET' }),
  deleteScrapDeal: (id) => request(`/scrap-deals/${encodeURIComponent(String(id))}`, { method: 'DELETE' }),
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
};
