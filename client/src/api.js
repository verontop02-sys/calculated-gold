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

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function request(path, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(withBase(path), {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

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
};
