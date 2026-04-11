/**
 * Прокси котировки золота ЦБ → JSON + CORS.
 * URL после деплоя:
 *   https://<project-ref>.supabase.co/functions/v1/cbr-quote?date=10%2F04%2F2026
 *
 * Деплой (нужен Supabase CLI + логин):
 *   npx supabase login
 *   npx supabase link --project-ref glhfrchbzmxxlftswfck
 *   npx supabase functions deploy cbr-quote
 *
 * В client/.env.production и при необходимости .env.local:
 *   VITE_CBR_QUOTE_URL=https://glhfrchbzmxxlftswfck.supabase.co/functions/v1/cbr-quote
 *
 * verify_jwt = false в supabase/config.toml — вызов без JWT (анонимный публичный прокси).
 * При желании включи verify_jwt и передавай с клиента VITE_SUPABASE_ANON_KEY в заголовках (см. cbr.js).
 */
import { XMLParser } from 'npm:fast-xml-parser@4.5.1';

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatCbrDate(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function parseRussianNum(v: unknown) {
  if (v == null) return null;
  const n = parseFloat(String(v).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let dateReq = formatCbrDate();
  try {
    const u = new URL(req.url);
    const d = u.searchParams.get('date');
    if (d?.trim()) dateReq = d.trim();
  } catch {
    /* ignore */
  }

  const upstream = new URL('https://www.cbr.ru/scripts/xml_metall.asp');
  upstream.searchParams.set('date_req1', dateReq);
  upstream.searchParams.set('date_req2', dateReq);

  let r: Response;
  try {
    r = await fetch(upstream.toString(), {
      headers: { 'User-Agent': 'CalculatedGold/1.0' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'network';
    return new Response(JSON.stringify({ error: `Сеть ЦБ: ${msg}` }), {
      status: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  if (!r.ok) {
    return new Response(JSON.stringify({ error: `ЦБ: HTTP ${r.status}` }), {
      status: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const buf = new Uint8Array(await r.arrayBuffer());
  let xml: string;
  try {
    xml = new TextDecoder('windows-1251').decode(buf);
  } catch {
    xml = new TextDecoder('utf-8').decode(buf);
  }

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    return new Response(JSON.stringify({ error: 'Парсинг XML ЦБ не удался' }), {
      status: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const root = doc as { Metall?: { Record?: unknown } };
  const records = root?.Metall?.Record;
  const list = Array.isArray(records) ? records : records ? [records] : [];
  const gold = list.find((row: { '@_Code'?: string }) => String(row['@_Code']) === '1');
  if (!gold) {
    return new Response(JSON.stringify({ error: 'CBR: не найдена запись золота (Code=1)' }), {
      status: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const buy = parseRussianNum(gold.Buy);
  const sell = parseRussianNum(gold.Sell);
  if (!buy) {
    return new Response(JSON.stringify({ error: 'CBR: не удалось разобрать цену золота' }), {
      status: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const body = {
    goldRubPerGram: buy,
    sellRubPerGram: sell,
    cbrDate: String(gold['@_Date'] || dateReq),
    source: 'cbr',
    fetchedAt: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
