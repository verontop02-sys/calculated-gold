/**
 * Прокси /api/* → Render (calculated-gold.onrender.com).
 *
 * Зачем: из РФ браузер часто не достучится до *.onrender.com без VPN.
 * Supabase Edge (и Firebase Hosting) из РФ открываются нормально; ЮKassa
 * при этом должна открываться БЕЗ VPN с российского IP.
 *
 * Клиент: VITE_API_BASE=https://<ref>.supabase.co/functions/v1/api-proxy
 * Запрос /health → …/api-proxy/health → https://…onrender.com/api/health
 *
 * Деплой:
 *   npx supabase login
 *   npx supabase link --project-ref csfrsctvrhltthwocspo
 *   npx supabase functions deploy api-proxy --no-verify-jwt
 */
const RENDER_ORIGIN = (
  Deno.env.get('RENDER_API_ORIGIN') || 'https://calculated-gold.onrender.com'
).replace(/\/$/, '');

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  // Supabase gateway — не тащим на Render
  'apikey',
  'x-client-info',
  'x-supabase-api-version',
  'sb-request-id',
]);

const corsHeaders = (req: Request): Record<string, string> => {
  const origin = req.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-device-token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};

function toUpstreamPath(pathname: string): string {
  // Supabase может отдать полный /functions/v1/api-proxy/... или уже обрезанный путь.
  let rest = pathname
    .replace(/^\/functions\/v1\/api-proxy\/?/i, '/')
    .replace(/^\/api-proxy\/?/i, '/');
  if (!rest.startsWith('/')) rest = `/${rest}`;
  if (rest === '/') rest = '/health';
  if (rest.startsWith('/api/') || rest === '/api') return rest;
  return `/api${rest}`;
}

function pickForwardHeaders(req: Request): Headers {
  const out = new Headers();
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const apikey = req.headers.get('apikey') || '';
  for (const [k, v] of req.headers.entries()) {
    const key = k.toLowerCase();
    if (HOP_BY_HOP.has(key)) continue;
    if (key === 'authorization') {
      // Gateway Supabase требует Bearer anon; на Render его слать нельзя —
      // иначе authMiddleware отвечает «Сессия недействительна».
      const token = v.replace(/^Bearer\s+/i, '').trim();
      if (!token) continue;
      if (anon && token === anon) continue;
      if (apikey && token === apikey) continue;
      out.set(k, v);
      continue;
    }
    out.set(k, v);
  }
  out.set('x-forwarded-host', req.headers.get('x-forwarded-host') || 'reaktivo.pro');
  out.set('x-reaktivo-proxy', 'supabase-api-proxy');
  return out;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const inbound = new URL(req.url);
  const upstreamPath = toUpstreamPath(inbound.pathname) + inbound.search;
  const target = `${RENDER_ORIGIN}${upstreamPath}`;

  let body: ArrayBuffer | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.arrayBuffer();
  }

  let up: Response;
  try {
    up = await fetch(target, {
      method: req.method,
      headers: pickForwardHeaders(req),
      body: body && body.byteLength ? body : undefined,
      redirect: 'manual',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api-proxy]', msg);
    return new Response(
      JSON.stringify({
        error: 'API временно недоступен. Подождите несколько секунд и обновите страницу.',
        detail: msg,
      }),
      { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  const outHeaders = new Headers();
  for (const [k, v] of up.headers.entries()) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    // CORS задаём сами
    if (k.toLowerCase().startsWith('access-control-')) continue;
    outHeaders.set(k, v);
  }
  for (const [k, v] of Object.entries(cors)) outHeaders.set(k, v);
  // Диагностика пути (безопасно): видно в Network, секретов нет.
  outHeaders.set('x-reaktivo-upstream', upstreamPath);

  return new Response(up.body, { status: up.status, headers: outHeaders });
});
