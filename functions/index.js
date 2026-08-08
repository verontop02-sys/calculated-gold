/**
 * Прокси /api/* → Render (calculated-gold.onrender.com).
 *
 * Зачем: из РФ браузеры часто плохо достукиваются до *.onrender.com без VPN,
 * а Firebase Hosting (reaktivo.pro) и Cloud Functions — нормально. ЮKassa при
 * этом должна открываться БЕЗ VPN с российского IP.
 *
 * Клиент в проде ходит на same-origin /api; Function форвардит на Render.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const RENDER_ORIGIN = (process.env.RENDER_API_ORIGIN || 'https://calculated-gold.onrender.com').replace(/\/$/, '');

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
]);

function pickRequestHeaders(incoming) {
  const out = {};
  for (const [k, v] of Object.entries(incoming || {})) {
    if (v == null) continue;
    const key = k.toLowerCase();
    if (HOP_BY_HOP.has(key)) continue;
    out[k] = v;
  }
  out['x-forwarded-host'] = incoming['x-forwarded-host'] || incoming.host || 'reaktivo.pro';
  out['x-reaktivo-proxy'] = 'firebase-apiProxy';
  return out;
}

function proxyToRender(req, res) {
  const pathWithQuery = req.originalUrl || req.url || '/';
  const target = new URL(pathWithQuery, `${RENDER_ORIGIN}/`);
  const lib = target.protocol === 'http:' ? http : https;

  const headers = pickRequestHeaders(req.headers);
  const opts = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (target.protocol === 'http:' ? 80 : 443),
    path: target.pathname + target.search,
    method: req.method,
    headers,
    timeout: 280_000,
  };

  const upstream = lib.request(opts, (upRes) => {
    const outHeaders = {};
    for (const [k, v] of Object.entries(upRes.headers)) {
      if (v == null) continue;
      if (HOP_BY_HOP.has(k.toLowerCase())) continue;
      outHeaders[k] = v;
    }
    outHeaders['access-control-allow-origin'] = req.headers.origin || '*';
    outHeaders['access-control-allow-credentials'] = 'true';
    res.writeHead(upRes.statusCode || 502, outHeaders);
    upRes.pipe(res);
  });

  upstream.on('timeout', () => {
    upstream.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: 'Таймаут соединения с API. Попробуйте ещё раз.' });
    } else {
      res.end();
    }
  });

  upstream.on('error', (err) => {
    console.error('[apiProxy]', err?.message || err);
    if (!res.headersSent) {
      res.status(502).json({
        error: 'API временно недоступен. Подождите несколько секунд и обновите страницу.',
        detail: String(err?.message || err),
      });
    } else {
      res.end();
    }
  });

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.rawBody && Buffer.isBuffer(req.rawBody)) {
      upstream.end(req.rawBody);
    } else {
      req.pipe(upstream);
    }
  } else {
    upstream.end();
  }
}

exports.apiProxy = onRequest(
  {
    region: 'europe-west1',
    cors: true,
    timeoutSeconds: 300,
    memory: '512MiB',
    invoker: 'public',
  },
  (req, res) => {
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Token');
      res.set('Access-Control-Max-Age', '86400');
      return res.status(204).send('');
    }
    return proxyToRender(req, res);
  }
);

/** Не даём free-тиру Render заснуть — иначе первый заход из РФ «висит» минутами. */
exports.keepRenderWarm = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'europe-west1',
    timeoutSeconds: 60,
  },
  async () => {
    const url = `${RENDER_ORIGIN}/api/health`;
    try {
      const r = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(45_000) });
      console.log('[keepRenderWarm]', r.status, url);
    } catch (e) {
      console.warn('[keepRenderWarm] fail', e?.message || e);
    }
  }
);
