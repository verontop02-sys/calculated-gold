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
  p = p.replace(/\/index\.html$/i, '');
  if (!p) p = '/';
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
      .select('created_at, site, session_id, path, referrer_host')
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

const OWN_HOSTS = new Set([
  'reaktivo.pro',
  'reaktivo.ru',
  'gold-panel.web.app',
  'gold-panel.firebaseapp.com',
  'reaktivo-ru.web.app',
  'reaktivo-ru.firebaseapp.com',
]);

/** Откуда открыли сайт: по адресу первого захода в визите. */
export function classifyReferrer(raw) {
  const host = String(raw || '').replace(/^www\./i, '').toLowerCase();
  if (!host) {
    return { host: '', group: 'direct', label: 'Прямой заход', hint: 'Адрес набрали сами или открыли из закладки' };
  }
  if (OWN_HOSTS.has(host)) {
    return { host, group: 'own', label: 'С нашего сайта', hint: `Перешли с ${host}` };
  }
  if (/(^|\.)google\./.test(host)) return { host, group: 'search', label: 'Google', hint: 'Нашли в поиске Google' };
  if (/(^|\.)yandex\./.test(host) || host === 'ya.ru') return { host, group: 'search', label: 'Яндекс', hint: 'Нашли в поиске Яндекса' };
  if (/(^|\.)bing\./.test(host)) return { host, group: 'search', label: 'Bing', hint: 'Нашли в поиске Bing' };
  if (host.includes('duckduckgo.')) return { host, group: 'search', label: 'DuckDuckGo', hint: 'Нашли в поиске' };
  if (host === 't.me' || host.endsWith('.t.me') || host.includes('telegram')) return { host, group: 'social', label: 'Telegram', hint: 'Перешли из Telegram' };
  if (host === 'vk.com' || host === 'vk.ru' || host.endsWith('.vk.com')) return { host, group: 'social', label: 'ВКонтакте', hint: 'Перешли из ВКонтакте' };
  if (host.includes('instagram')) return { host, group: 'social', label: 'Instagram', hint: 'Перешли из Instagram' };
  if (host.includes('youtube') || host === 'youtu.be') return { host, group: 'social', label: 'YouTube', hint: 'Перешли из YouTube' };
  if (host === 'dzen.ru') return { host, group: 'social', label: 'Дзен', hint: 'Перешли из Дзена' };
  if (host === 'ok.ru') return { host, group: 'social', label: 'Одноклассники', hint: 'Перешли из Одноклассников' };
  return { host, group: 'referral', label: host, hint: 'Перешли по ссылке с этого сайта' };
}

export function moscowHour(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return 0;
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(d));
}

function emptyHours() {
  return Array.from({ length: 24 }, (_, hour) => ({ hour, visits: 0, views: 0 }));
}

function emptyWeek() {
  return Array.from({ length: 7 }, (_, dow) => ({ dow, visits: 0, views: 0 }));
}

function emptyGroups() {
  return { direct: 0, search: 0, social: 0, own: 0, referral: 0 };
}

/** 0 = понедельник … 6 = воскресенье, по Москве. */
export function moscowDowMonday(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return 0;
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Moscow', weekday: 'short' }).format(d);
  const sun0 = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[name] ?? 0;
  return (sun0 + 6) % 7;
}

function topList(map, limit, mapRow) {
  return [...map.entries()]
    .sort((a, b) => b[1].views - a[1].views || b[1].entries - a[1].entries || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([path, row]) => mapRow(path, row));
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
  const seenEntry = new Set();
  const sessionMeta = new Map();
  const pages = { pro: new Map(), ru: new Map() };
  const sources = { pro: new Map(), ru: new Map() };
  const hours = { pro: emptyHours(), ru: emptyHours() };
  const week = { pro: emptyWeek(), ru: emptyWeek() };
  const groups = { pro: emptyGroups(), ru: emptyGroups() };

  for (const row of rows || []) {
    const site = row.site === 'ru' || row.site === 'pro' ? row.site : '';
    if (!site) continue;
    const date = moscowDateKey(row.created_at);
    const bucket = byDate.get(date);
    if (!bucket) continue;
    const path = cleanPath(row.path);
    const hour = moscowHour(row.created_at);
    const dow = moscowDowMonday(row.created_at);
    bucket[site === 'pro' ? 'proViews' : 'ruViews'] += 1;
    hours[site][hour].views += 1;
    week[site][dow].views += 1;
    const page = pages[site].get(path) || { views: 0, entries: 0, sources: new Map() };
    page.views += 1;

    const sid = String(row.session_id || '');
    if (sid) {
      sessions[site].add(sid);
      const dayKey = `${date}|${site}`;
      let set = daySessions.get(dayKey);
      if (!set) {
        set = new Set();
        daySessions.set(dayKey, set);
      }
      set.add(sid);
      const entryKey = `${site}|${sid}`;
      let meta = sessionMeta.get(entryKey);
      if (!meta) {
        meta = { n: 0, entry: path, second: '' };
        sessionMeta.set(entryKey, meta);
      }
      meta.n += 1;
      if (meta.n === 2 && path !== meta.entry) meta.second = path;
      if (!seenEntry.has(entryKey)) {
        seenEntry.add(entryKey);
        page.entries += 1;
        hours[site][hour].visits += 1;
        week[site][dow].visits += 1;
        const src = classifyReferrer(row.referrer_host);
        const srcKey = src.group === 'direct' ? 'direct' : `${src.group}|${src.host}`;
        const prev = sources[site].get(srcKey) || { ...src, visits: 0 };
        prev.visits += 1;
        sources[site].set(srcKey, prev);
        groups[site][src.group] = (groups[site][src.group] || 0) + 1;
        const pageSrc = page.sources.get(srcKey) || { ...src, visits: 0 };
        pageSrc.visits += 1;
        page.sources.set(srcKey, pageSrc);
      }
    }
    pages[site].set(path, page);
  }

  const depth = { pro: { one: 0, more: 0 }, ru: { one: 0, more: 0 } };
  const flows = { pro: new Map(), ru: new Map() };
  for (const [key, meta] of sessionMeta) {
    const site = key.slice(0, key.indexOf('|'));
    if (!depth[site]) continue;
    if (meta.n <= 1) depth[site].one += 1;
    else {
      depth[site].more += 1;
      if (meta.second) {
        const flowKey = `${meta.entry}\t${meta.second}`;
        flows[site].set(flowKey, (flows[site].get(flowKey) || 0) + 1);
      }
    }
  }

  for (const row of series) {
    row.proVisits = daySessions.get(`${row.date}|pro`)?.size || 0;
    row.ruVisits = daySessions.get(`${row.date}|ru`)?.size || 0;
  }

  const views = (key) => series.reduce((sum, row) => sum + row[key], 0);
  const packSources = (map) => [...map.values()]
    .sort((a, b) => b.visits - a.visits || a.label.localeCompare(b.label, 'ru'))
    .slice(0, 5);
  const pack = (site) => ({
    views: views(site === 'pro' ? 'proViews' : 'ruViews'),
    visits: sessions[site].size,
    pages: topList(pages[site], 20, (path, row) => ({
      path,
      views: row.views,
      entries: row.entries,
      sources: packSources(row.sources || new Map()),
    })),
    sources: [...sources[site].values()].sort((a, b) => b.visits - a.visits || a.label.localeCompare(b.label, 'ru')).slice(0, 30),
    hours: hours[site],
    week: week[site],
    groups: groups[site],
    depth: depth[site],
    flows: [...flows[site].entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, count]) => {
        const [from, to] = key.split('\t');
        return { from, to, visits: count };
      }),
  });
  return {
    series,
    sites: { pro: pack('pro'), ru: pack('ru') },
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
