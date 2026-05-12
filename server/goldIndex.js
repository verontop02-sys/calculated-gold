/**
 * Индекс золота: города и конкуренты (ручной ввод цен по пробам).
 * Эталонная цена лома за грамм изделия = биржа × проба × политика выкупа (как в калькуляторе).
 */

import axios from 'axios';

const DEFAULT_SETTINGS = {
  buybackPercentOfScrap: 92,
  rangeHalfWidthPercent: 2,
  purityAdjustments: { 375: 0, 500: 0, 583: 0, 585: 0, 750: 0, 875: 0, 900: 0, 916: 0, 958: 0, 999: 0 },
  purityOrder: [375, 500, 583, 585, 750, 875, 900, 916, 958, 999],
};

async function logGoldIndexChange(supabase, payload) {
  const { error } = await supabase.from('gold_index_changes').insert(payload);
  if (error) throw error;
}

function parseThresholds() {
  const raw = (process.env.GOLD_INDEX_THRESHOLDS || '1.03,1.10,1.18').trim();
  const parts = raw
    .split(',')
    .map((s) => parseFloat(String(s).trim()))
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b);
  const a = parts[0] ?? 1.03;
  const b = parts[1] ?? 1.1;
  const c = parts[2] ?? 1.18;
  return { greenMax: a, yellowMax: b, orangeMax: c };
}

function ratioColorKey(ratio, th) {
  if (ratio == null || !Number.isFinite(ratio)) return 'neutral';
  if (ratio <= th.greenMax) return 'green';
  if (ratio <= th.yellowMax) return 'yellow';
  if (ratio <= th.orangeMax) return 'orange';
  return 'red';
}

async function loadSettingsMerged(supabase) {
  const { data } = await supabase.from('app_kv').select('value').eq('key', 'settings').maybeSingle();
  const value = data?.value || {};
  const rawOrder = Array.isArray(value.purityOrder) ? value.purityOrder : DEFAULT_SETTINGS.purityOrder;
  const orderNums = rawOrder.map((p) => Number(p)).filter((p) => Number.isFinite(p));
  const uniqueOrder = [...new Set(orderNums)];
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    purityAdjustments: { ...DEFAULT_SETTINGS.purityAdjustments, ...(value.purityAdjustments || {}) },
    purityOrder: uniqueOrder.length ? uniqueOrder : DEFAULT_SETTINGS.purityOrder,
  };
}

async function loadGoldRubPerGram(supabase) {
  const { data } = await supabase.from('app_kv').select('value').eq('key', 'gold_price').maybeSingle();
  const g = data?.value?.goldRubPerGram;
  const n = typeof g === 'number' ? g : parseFloat(String(g ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Эталон ₽/г за изделие при пробе probe (как «середина» выкупа в калькуляторе). */
export function referenceRubPerGramJewelry({ goldRubPerGram, probe, settings }) {
  const purity = Number(probe);
  if (!Number.isFinite(purity) || purity <= 0 || purity > 1000) return null;
  if (!Number.isFinite(goldRubPerGram) || goldRubPerGram <= 0) return null;
  const adjPct = settings.purityAdjustments[String(Math.round(purity))] ?? 0;
  const buybackPct = Math.min(100, Math.max(0, Number(settings.buybackPercentOfScrap) || 0));
  const fineFrac = purity / 1000;
  const scrapRub = fineFrac * goldRubPerGram;
  return scrapRub * (buybackPct / 100) * (1 + adjPct / 100);
}

function competitorProbeRatios(probesObj, goldRubPerGram, settings) {
  const out = [];
  if (!probesObj || typeof probesObj !== 'object') return out;
  for (const [k, v] of Object.entries(probesObj)) {
    const probe = parseInt(String(k).replace(/\D/g, ''), 10);
    const price =
      typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(probe) || probe <= 0) continue;
    if (!Number.isFinite(price) || price <= 0) continue;
    const ref = referenceRubPerGramJewelry({ goldRubPerGram, probe, settings });
    if (ref == null || ref <= 0) continue;
    out.push({
      probe,
      marketRubPerGram: price,
      refRubPerGram: ref,
      ratio: price / ref,
    });
  }
  return out;
}

function avg(nums) {
  const a = nums.filter((x) => Number.isFinite(x));
  if (!a.length) return null;
  return a.reduce((s, x) => s + x, 0) / a.length;
}

export function computeCompetitorMetrics(probesObj, goldRubPerGram, settings) {
  const rows = competitorProbeRatios(probesObj, goldRubPerGram, settings);
  const ratioAvg = avg(rows.map((r) => r.ratio));
  return { rows, ratioAvg };
}

export async function buildGoldIndexOverview(supabase) {
  const th = parseThresholds();
  const settings = await loadSettingsMerged(supabase);
  const goldRubPerGram = await loadGoldRubPerGram(supabase);

  const { data: cities, error: cErr } = await supabase
    .from('gold_index_cities')
    .select(
      'id, region_code, region_name, city_name, lat, lng, street, building, address_note, geocoded_label, population, notes, created_at, updated_at'
    )
    .order('region_name', { ascending: true })
    .order('city_name', { ascending: true });
  if (cErr) throw cErr;

  const cityIds = (cities || []).map((c) => c.id);
  let competitorsByCity = {};
  if (cityIds.length) {
    const { data: comps, error: compErr } = await supabase
      .from('gold_index_competitors')
      .select('id, city_id, company_name, probes, measured_at, notes, sort_order, updated_at')
      .in('city_id', cityIds)
      .order('sort_order', { ascending: true })
      .order('company_name', { ascending: true });
    if (compErr) throw compErr;
    for (const row of comps || []) {
      if (!competitorsByCity[row.city_id]) competitorsByCity[row.city_id] = [];
      competitorsByCity[row.city_id].push(row);
    }
  }

  const citiesOut = [];
  const regionAgg = new Map();

  for (const c of cities || []) {
    const comps = competitorsByCity[c.id] || [];
    const competitorsDetailed = [];
    const cityRatios = [];
    for (const co of comps) {
      const { rows: probeRows, ratioAvg } = computeCompetitorMetrics(co.probes, goldRubPerGram, settings);
      if (ratioAvg != null) cityRatios.push(ratioAvg);
      competitorsDetailed.push({
        id: co.id,
        cityId: co.city_id,
        companyName: co.company_name,
        probes: co.probes || {},
        measuredAt: co.measured_at,
        notes: co.notes,
        sortOrder: co.sort_order,
        updatedAt: co.updated_at,
        ratioAvg,
        colorKey: ratioColorKey(ratioAvg, th),
        probeRows,
      });
    }
    const cityRatioAvg = avg(cityRatios);
    const ck = ratioColorKey(cityRatioAvg, th);

    citiesOut.push({
      ...c,
      competitors: competitorsDetailed,
      ratioAvg: cityRatioAvg,
      colorKey: ck,
      competitorCount: comps.length,
    });

    const rk = c.region_code || '—';
    if (!regionAgg.has(rk)) {
      regionAgg.set(rk, {
        regionCode: rk,
        regionName: c.region_name || rk,
        cityIds: [],
        ratios: [],
      });
    }
    const ra = regionAgg.get(rk);
    ra.cityIds.push(c.id);
    if (cityRatioAvg != null) ra.ratios.push(cityRatioAvg);
  }

  const regions = [...regionAgg.values()].map((r) => {
    const ratioAvg = avg(r.ratios);
    return {
      regionCode: r.regionCode,
      regionName: r.regionName,
      cityCount: r.cityIds.length,
      ratioAvg,
      colorKey: ratioColorKey(ratioAvg, th),
    };
  });
  regions.sort((a, b) => String(a.regionName).localeCompare(String(b.regionName), 'ru'));

  return {
    thresholds: th,
    goldRubPerGram,
    probesSuggested: settings.purityOrder || DEFAULT_SETTINGS.purityOrder,
    settingsSnapshot: {
      buybackPercentOfScrap: settings.buybackPercentOfScrap,
      purityAdjustments: settings.purityAdjustments,
    },
    regions,
    cities: citiesOut,
    stats: {
      cityCount: citiesOut.length,
      populationCovered: citiesOut.reduce((s, x) => s + (x.population || 0), 0),
      competitorRows: citiesOut.reduce((s, x) => s + x.competitors.length, 0),
    },
  };
}

export async function createGoldIndexCity(supabase, body, createdBy) {
  const region_code = String(body?.region_code || '').trim();
  const region_name = String(body?.region_name || '').trim();
  const city_name = String(body?.city_name || '').trim();
  const lat = parseFloat(body?.lat);
  const lng = parseFloat(body?.lng);
  if (!region_code || !region_name || !city_name) {
    const e = new Error('Укажите регион и город');
    e.status = 400;
    throw e;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const e = new Error('Укажите координаты (широта и долгота)');
    e.status = 400;
    throw e;
  }
  let population = null;
  if (body?.population != null && body.population !== '') {
    const n = parseInt(String(body.population), 10);
    if (Number.isFinite(n) && n >= 0) population = n;
  }
  const notes = body?.notes != null ? String(body.notes).trim() || null : null;
  const street = body?.street != null ? String(body.street).trim() || null : null;
  const building = body?.building != null ? String(body.building).trim() || null : null;
  const address_note = body?.address_note != null ? String(body.address_note).trim() || null : null;
  const geocoded_label =
    body?.geocoded_label != null ? String(body.geocoded_label).trim() || null : null;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('gold_index_cities')
    .insert({
      region_code,
      region_name,
      city_name,
      lat,
      lng,
      street,
      building,
      address_note,
      geocoded_label,
      population: Number.isFinite(population) ? population : null,
      notes,
      created_by: createdBy || null,
      updated_at: now,
    })
    .select('id')
    .maybeSingle();
  if (error) throw error;
  await logGoldIndexChange(supabase, {
    entity_type: 'city',
    entity_id: data?.id,
    city_id: data?.id,
    action: 'create',
    changed_by: createdBy || null,
    payload: {
      region_code,
      region_name,
      city_name,
      lat,
      lng,
      street,
      building,
      address_note,
      geocoded_label,
      population: Number.isFinite(population) ? population : null,
      notes,
    },
  });
  return data?.id;
}

export async function updateGoldIndexCity(supabase, id, body, changedBy) {
  const { data: beforeRow, error: beforeErr } = await supabase
    .from('gold_index_cities')
    .select(
      'id, region_code, region_name, city_name, lat, lng, street, building, address_note, geocoded_label, population, notes'
    )
    .eq('id', id)
    .maybeSingle();
  if (beforeErr) throw beforeErr;
  const patch = {};
  if (body.region_code != null) patch.region_code = String(body.region_code).trim();
  if (body.region_name != null) patch.region_name = String(body.region_name).trim();
  if (body.city_name != null) patch.city_name = String(body.city_name).trim();
  if (body.lat != null) patch.lat = parseFloat(body.lat);
  if (body.lng != null) patch.lng = parseFloat(body.lng);
  if (body.population !== undefined) {
    patch.population =
      body.population != null && body.population !== ''
        ? Math.max(0, parseInt(String(body.population), 10))
        : null;
  }
  if (body.notes !== undefined) patch.notes = body.notes != null ? String(body.notes).trim() || null : null;
  if (body.street !== undefined) patch.street = body.street != null ? String(body.street).trim() || null : null;
  if (body.building !== undefined) patch.building = body.building != null ? String(body.building).trim() || null : null;
  if (body.address_note !== undefined) {
    patch.address_note = body.address_note != null ? String(body.address_note).trim() || null : null;
  }
  if (body.geocoded_label !== undefined) {
    patch.geocoded_label = body.geocoded_label != null ? String(body.geocoded_label).trim() || null : null;
  }
  patch.updated_at = new Date().toISOString();
  const { error } = await supabase.from('gold_index_cities').update(patch).eq('id', id);
  if (error) throw error;
  await logGoldIndexChange(supabase, {
    entity_type: 'city',
    entity_id: id,
    city_id: id,
    action: 'update',
    changed_by: changedBy || null,
    payload: { before: beforeRow || null, patch },
  });
}

export async function deleteGoldIndexCity(supabase, id, changedBy) {
  const { data: beforeRow, error: beforeErr } = await supabase
    .from('gold_index_cities')
    .select(
      'id, region_code, region_name, city_name, lat, lng, street, building, address_note, geocoded_label, population, notes'
    )
    .eq('id', id)
    .maybeSingle();
  if (beforeErr) throw beforeErr;
  const { error } = await supabase.from('gold_index_cities').delete().eq('id', id);
  if (error) throw error;
  await logGoldIndexChange(supabase, {
    entity_type: 'city',
    entity_id: id,
    city_id: id,
    action: 'delete',
    changed_by: changedBy || null,
    payload: beforeRow || null,
  });
}

function normalizeProbes(p) {
  if (!p || typeof p !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    const probe = parseInt(String(k).replace(/\D/g, ''), 10);
    if (!Number.isFinite(probe) || probe <= 0) continue;
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) continue;
    out[String(probe)] = Math.round(n * 100) / 100;
  }
  return out;
}

export async function createGoldIndexCompetitor(supabase, cityId, body, changedBy) {
  const company_name = String(body?.company_name || '').trim();
  if (!company_name) {
    const e = new Error('Укажите название компании');
    e.status = 400;
    throw e;
  }
  const probes = normalizeProbes(body?.probes);
  const measured_at =
    body?.measured_at != null && String(body.measured_at).trim()
      ? String(body.measured_at).slice(0, 10)
      : null;
  const notes = body?.notes != null ? String(body.notes).trim() || null : null;
  const sort_order = parseInt(String(body?.sort_order ?? '0'), 10) || 0;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('gold_index_competitors')
    .insert({
      city_id: cityId,
      company_name,
      probes,
      measured_at,
      notes,
      sort_order,
      updated_at: now,
    })
    .select('id')
    .maybeSingle();
  if (error) throw error;
  await logGoldIndexChange(supabase, {
    entity_type: 'competitor',
    entity_id: data?.id,
    city_id: cityId,
    action: 'create',
    changed_by: changedBy || null,
    payload: { company_name, probes, measured_at, notes, sort_order },
  });
  return data?.id;
}

export async function updateGoldIndexCompetitor(supabase, id, body, changedBy) {
  const { data: beforeRow, error: beforeErr } = await supabase
    .from('gold_index_competitors')
    .select('id, city_id, company_name, probes, measured_at, notes, sort_order')
    .eq('id', id)
    .maybeSingle();
  if (beforeErr) throw beforeErr;
  const patch = { updated_at: new Date().toISOString() };
  if (body.company_name != null) patch.company_name = String(body.company_name).trim();
  if (body.probes != null) patch.probes = normalizeProbes(body.probes);
  if (body.measured_at !== undefined) {
    patch.measured_at =
      body.measured_at != null && String(body.measured_at).trim()
        ? String(body.measured_at).slice(0, 10)
        : null;
  }
  if (body.notes !== undefined) patch.notes = body.notes != null ? String(body.notes).trim() || null : null;
  if (body.sort_order != null) patch.sort_order = parseInt(String(body.sort_order), 10) || 0;
  const { error } = await supabase.from('gold_index_competitors').update(patch).eq('id', id);
  if (error) throw error;
  await logGoldIndexChange(supabase, {
    entity_type: 'competitor',
    entity_id: id,
    city_id: beforeRow?.city_id || null,
    action: 'update',
    changed_by: changedBy || null,
    payload: { before: beforeRow || null, patch },
  });
}

export async function deleteGoldIndexCompetitor(supabase, id, changedBy) {
  const { data: beforeRow, error: beforeErr } = await supabase
    .from('gold_index_competitors')
    .select('id, city_id, company_name, probes, measured_at, notes, sort_order')
    .eq('id', id)
    .maybeSingle();
  if (beforeErr) throw beforeErr;
  const { error } = await supabase.from('gold_index_competitors').delete().eq('id', id);
  if (error) throw error;
  await logGoldIndexChange(supabase, {
    entity_type: 'competitor',
    entity_id: id,
    city_id: beforeRow?.city_id || null,
    action: 'delete',
    changed_by: changedBy || null,
    payload: beforeRow || null,
  });
}

export async function listGoldIndexHistory(supabase, opts = {}) {
  const limit = Math.min(200, Math.max(1, parseInt(String(opts.limit || '30'), 10) || 30));
  const offset = Math.max(0, parseInt(String(opts.offset || '0'), 10) || 0);
  const cityId = String(opts.cityId || '').trim();
  const from = String(opts.from || '').trim();
  const to = String(opts.to || '').trim();
  const cityIds = Array.isArray(opts.cityIds) ? opts.cityIds.filter((x) => /^[0-9a-f-]{36}$/i.test(String(x))) : [];
  let q = supabase
    .from('gold_index_changes')
    .select('id, entity_type, entity_id, city_id, action, changed_by, payload, created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (/^[0-9a-f-]{36}$/i.test(cityId)) q = q.eq('city_id', cityId);
  if (cityIds.length) q = q.in('city_id', cityIds);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte('created_at', `${from}T00:00:00.000Z`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) q = q.lte('created_at', `${to}T23:59:59.999Z`);
  const { data, error } = await q;
  if (error) throw error;
  return { rows: data || [], limit, offset };
}

export async function enrichGoldIndexHistoryActors(supabase, rows) {
  const list = Array.isArray(rows) ? rows : [];
  const actorIds = [...new Set(list.map((r) => String(r?.changed_by || '').trim()).filter(Boolean))];
  if (!actorIds.length) return list;

  let users = [];
  try {
    const { data: listData, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (!error && Array.isArray(listData?.users)) users = listData.users;
  } catch (e) {
    console.warn('[gold index history actors]', e?.message || e);
  }

  const byId = new Map();
  for (const u of users) {
    const id = String(u?.id || '').trim();
    if (!id) continue;
    const email = String(u?.email || '').trim();
    const fullName =
      String(u?.user_metadata?.full_name || '').trim() ||
      String(u?.user_metadata?.name || '').trim() ||
      (email ? email.split('@')[0] : '');
    byId.set(id, { fullName: fullName || '—', email: email || '—' });
  }

  return list.map((r) => {
    const key = String(r?.changed_by || '').trim();
    const actor = key ? byId.get(key) : null;
    return {
      ...r,
      changed_by_name: actor?.fullName || (key ? 'Пользователь' : 'Система'),
      changed_by_email: actor?.email || (key ? '—' : '—'),
    };
  });
}

/**
 * Геокодирование через OpenStreetMap Nominatim (без ключа).
 * https://nominatim.org/release-docs/latest/api/Search/ — не злоупотребляйте частотой запросов.
 */
export async function geocodeGoldIndexLocation(body) {
  const raw = String(body?.raw_query || '').trim();
  let q;
  if (raw) {
    q = raw;
  } else {
    const city = String(body?.city_name || '').trim();
    const region = String(body?.region_name || '').trim();
    const street = String(body?.street || '').trim();
    const building = String(body?.building || '').trim();
    const note = String(body?.address_note || '').trim();
    if (!city || !region) {
      const err = new Error('Укажите регион и город, либо поле «Адрес одной строкой»');
      err.status = 400;
      throw err;
    }
    const line1 = [street, building].filter(Boolean).join(', ');
    q = [line1, city, region, 'Россия'].filter((x) => x && String(x).trim()).join(', ');
    if (note) q = `${q}. ${note}`;
  }
  let data;
  try {
    ({ data } = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q, format: 'json', limit: 1, 'accept-language': 'ru' },
      timeout: 20000,
      headers: {
        'User-Agent':
          process.env.NOMINATIM_USER_AGENT ||
          'ReaktivoProGoldIndex/1.0 (https://reaktivo.pro; gold index geocode)',
      },
      validateStatus: (s) => s === 200,
    }));
  } catch (e) {
    const st = e?.response?.status;
    const err = new Error(
      st === 429
        ? 'Слишком частые запросы к геокодеру. Подождите минуту и повторите.'
        : 'Сервис геокодирования временно недоступен. Введите координаты вручную или повторите позже.'
    );
    err.status = st === 429 ? 429 : 502;
    throw err;
  }
  if (!Array.isArray(data) || !data[0]) {
    const err = new Error(
      'Точка не найдена. Уточните адрес или вставьте запрос в «Адрес одной строкой», либо введите координаты вручную (карты: ПКМ по точке → координаты).'
    );
    err.status = 404;
    throw err;
  }
  const hit = data[0];
  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const err = new Error('Геокодер вернул некорректные координаты');
    err.status = 502;
    throw err;
  }
  return {
    lat,
    lng,
    displayName: hit.display_name || q,
    queryUsed: q,
  };
}
