/**
 * Посещаемость reaktivo.pro и reaktivo.ru.
 * Визит — одно открытие сайта в браузере (session id живёт до закрытия вкладки).
 * Просмотр — каждая страница. IP и полные адреса не храним.
 */

const DAY_MS = 86_400_000;
const MAX_DAYS = 400;
const PAGE_SIZE = 1000;
const MAX_ROWS = 50_000;

const recentHits = new Map();

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isIsoDate(value) {
  const s = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function moscowDateKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function eachDate(from, to) {
  const out = [];
  let cur = from;
  while (cur <= to && out.length < MAX_DAYS) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

function moscowRange(from, to) {
  return {
    start: new Date(`${from}T00:00:00+03:00`).toISOString(),
    end: new Date(`${addDays(to, 1)}T00:00:00+03:00`).toISOString(),
  };
}

export function cleanPath(raw) {
  let p = String(raw || '/').split('?')[0].split('#')[0].trim();
  try { p = decodeURIComponent(p); } catch { /* оставляем как есть */ }
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/{2,}/g, '/');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  if (p.length > 160) p = p.slice(0, 160);
  if (/[\u0000-\u001f<>]/.test(p)) return '/';
  return p || '/';
}

export function isPrivatePath(path) {
  return path === '/pro' || path.startsWith('/pro/')
    || path === '/kabinet' || path.startsWith('/kabinet/')
    || path === '/display' || path.startsWith('/display/')
    || path.startsWith('/podtverzhdenie');
}

function hostOf(origin) {
  try {
    return new URL(String(origin || '')).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

export function resolveSite(origin, claimed, path) {
  const host = hostOf(origin);
  if (host === 'localhost' || host === '127.0.0.1') return '';
  if (host === 'reaktivo.ru' || host === 'reaktivo-ru.web.app' || host === 'reaktivo-ru.firebaseapp.com') return 'ru';
  if (host === 'reaktivo.pro' || host === 'gold-panel.web.app' || host === 'gold-panel.firebaseapp.com') {
    return path === '/ru' || path.startsWith('/ru/') ? 'ru' : 'pro';
  }
  const site = String(claimed || '');
  if (!host && (site === 'pro' || site === 'ru')) return site;
  return '';
}

function cleanReferrer(raw) {
  const host = String(raw || '').trim().replace(/^www\./i, '').toLowerCase().slice(0, 80);
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  return host;
}

function seenRecently(key) {
  const now = Date.now();
  const prev = recentHits.get(key);
  if (prev && now - prev < 20_000) return true;
  recentHits.set(key, now);
  if (recentHits.size > 4000) {
    for (const [k, t] of recentHits) {
      if (now - t > 60_000) recentHits.delete(k);
    }
  }
  return false;
}

export function isBotUserAgent(ua) {
  return /bot|spider|crawl|slurp|preview|facebookexternal|telegrambot|whatsapp|slackbot|headless|lighthouse|pagespeed|wget|curl\/|python-requests|go-http/i.test(String(ua || ''));
}

export function isMissingHitsTable(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  return code === '42P01' || code === 'PGRST205' || /site_hits/i.test(msg);
}

/** Готовит строку визита. null — писать не нужно. */
export function buildHit(body, origin) {
  const path = cleanPath(body?.path);
  if (isPrivatePath(path)) return null;
  const site = resolveSite(origin, body?.site, path);
  if (!site) return null;
  const sessionId = String(body?.sessionId || '').trim();
  if (!/^[a-zA-Z0-9-]{16,64}$/.test(sessionId)) return null;
  if (seenRecently(`${site}|${sessionId}|${path}`)) return null;
  return {
    site,
    path,
    session_id: sessionId,
    referrer_host: cleanReferrer(body?.referrer),
  };
}

export async function insertHit(supabase, row) {
  const { error } = await supabase.from('site_hits').insert(row);
  if (error) throw error;
}

async function fetchHits(supabase, from, to) {
  const { start, end } = moscowRange(from, to);
  const rows = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('site_hits')
      .select('created_at, site, session_id, path')
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return rows;
}

function topPages(map) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([path, views]) => ({ path, views }));
}

export function summarizeSiteHits(rows, from, to) {
  const series = eachDate(from, to).map((date) => ({
    date,
    proViews: 0,
    proVisits: 0,
    ruViews: 0,
    ruVisits: 0,
  }));
  const byDate = new Map(series.map((row) => [row.date, row]));
  const sessions = { pro: new Set(), ru: new Set() };
  const daySessions = new Map();
  const pages = { pro: new Map(), ru: new Map() };

  for (const row of rows || []) {
    const site = row.site === 'ru' || row.site === 'pro' ? row.site : '';
    if (!site) continue;
    const date = moscowDateKey(row.created_at);
    const bucket = byDate.get(date);
    if (!bucket) continue;
    bucket[site === 'pro' ? 'proViews' : 'ruViews'] += 1;
    const sid = String(row.session_id || '');
    if (sid) {
      sessions[site].add(sid);
      const key = `${date}|${site}`;
      let set = daySessions.get(key);
      if (!set) {
        set = new Set();
        daySessions.set(key, set);
      }
      set.add(sid);
    }
    const path = String(row.path || '/');
    pages[site].set(path, (pages[site].get(path) || 0) + 1);
  }

  for (const row of series) {
    row.proVisits = daySessions.get(`${row.date}|pro`)?.size || 0;
    row.ruVisits = daySessions.get(`${row.date}|ru`)?.size || 0;
  }

  const views = (key) => series.reduce((sum, row) => sum + row[key], 0);
  return {
    series,
    sites: {
      pro: { views: views('proViews'), visits: sessions.pro.size, pages: topPages(pages.pro) },
      ru: { views: views('ruViews'), visits: sessions.ru.size, pages: topPages(pages.ru) },
    },
  };
}

export async function trafficReport(supabase, from, to) {
  if (!isIsoDate(from) || !isIsoDate(to)) {
    const err = new Error('Укажите период');
    err.status = 400;
    throw err;
  }
  let start = from;
  let end = to;
  if (start > end) [start, end] = [end, start];
  const span = Math.round((new Date(`${end}T12:00:00Z`) - new Date(`${start}T12:00:00Z`)) / DAY_MS) + 1;
  if (span > MAX_DAYS) {
    const err = new Error('Период не длиннее года');
    err.status = 400;
    throw err;
  }

  const prevTo = addDays(start, -1);
  const prevFrom = addDays(prevTo, -(span - 1));
  const [rows, prevRows, firstRes] = await Promise.all([
    fetchHits(supabase, start, end),
    fetchHits(supabase, prevFrom, prevTo),
    supabase.from('site_hits').select('created_at').order('created_at', { ascending: true }).limit(1),
  ]);
  if (firstRes.error && !isMissingHitsTable(firstRes.error)) throw firstRes.error;

  const cur = summarizeSiteHits(rows, start, end);
  const prev = summarizeSiteHits(prevRows, prevFrom, prevTo);
  return {
    from: start,
    to: end,
    startedAt: firstRes.data?.[0]?.created_at || null,
    startedOn: firstRes.data?.[0]?.created_at ? moscowDateKey(firstRes.data[0].created_at) : null,
    sites: {
      pro: { ...cur.sites.pro, prevViews: prev.sites.pro.views, prevVisits: prev.sites.pro.visits },
      ru: { ...cur.sites.ru, prevViews: prev.sites.ru.views, prevVisits: prev.sites.ru.visits },
    },
    series: cur.series,
  };
}
