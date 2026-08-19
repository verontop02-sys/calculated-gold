/**
 * Браузерный прокси к Supabase (Auth и т.п.).
 * Из РФ *.supabase.co часто даёт ERR_CONNECTION_RESET без VPN.
 * Клиент ходит на наш Render (/sb/...), сервер форвардит на project URL.
 */
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

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

function forwardHeaders(incoming, targetHost) {
  const out = {};
  for (const [k, v] of Object.entries(incoming || {})) {
    if (v == null) continue;
    if (HOP_BY_HOP.has(String(k).toLowerCase())) continue;
    out[k] = v;
  }
  out.host = targetHost;
  out['x-forwarded-host'] = incoming['x-forwarded-host'] || incoming.host || '';
  out['x-reaktivo-proxy'] = 'supabase-browser';
  return out;
}

/**
 * @param {import('express').Express} app
 * @param {{ targetOrigin: string }} opts
 */
export function mountSupabaseBrowserProxy(app, { targetOrigin }) {
  const base = String(targetOrigin || '').replace(/\/$/, '');
  if (!base) {
    console.warn('[supabase-proxy] SUPABASE_URL пуст — /sb не смонтирован');
    return;
  }
  const target = new URL(base);
  const lib = target.protocol === 'http:' ? http : https;

  app.use('/sb', (req, res) => {
    const pathWithQuery = (req.originalUrl || req.url || '/').replace(/^\/sb/, '') || '/';
    const headers = forwardHeaders(req.headers, target.host);
    const upstream = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === 'http:' ? 80 : 443),
        path: pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`,
        method: req.method,
        headers,
        timeout: 60_000,
      },
      (upRes) => {
        const outHeaders = {};
        for (const [k, v] of Object.entries(upRes.headers || {})) {
          if (v == null) continue;
          if (HOP_BY_HOP.has(String(k).toLowerCase())) continue;
          outHeaders[k] = v;
        }
        res.writeHead(upRes.statusCode || 502, outHeaders);
        upRes.pipe(res);
      },
    );

    upstream.on('timeout', () => {
      upstream.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: 'Таймаут Supabase через прокси' });
      }
    });
    upstream.on('error', (err) => {
      console.error('[supabase-proxy]', err?.message || err);
      if (!res.headersSent) {
        res.status(502).json({
          error: 'Supabase временно недоступен через прокси',
          detail: String(err?.message || err),
        });
      } else {
        res.end();
      }
    });

    req.pipe(upstream);
  });
}
