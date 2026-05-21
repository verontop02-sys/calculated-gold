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

function parseLegacyCompetitorNotes(notes) {
  const src = String(notes || '').trim();
  if (!src) return { address: null, comment: null };
  const mAddr = src.match(/(?:^|\n)\s*Адрес:\s*([^\n]+)/i);
  const mComment = src.match(/(?:^|\n)\s*Комментарий:\s*([^\n]+)/i);
  return {
    address: mAddr?.[1]?.trim() || null,
    comment: mComment?.[1]?.trim() || null,
  };
}

function buildLegacyCompetitorNotes({ address, comment, notes }) {
  const a = String(address || '').trim();
  const c = String(comment || '').trim();
  if (a || c) {
    const rows = [];
    if (a) rows.push(`Адрес: ${a}`);
    if (c) rows.push(`Комментарий: ${c}`);
    return rows.join('\n');
  }
  const n = String(notes || '').trim();
  return n || null;
}

function isMissingCompetitorAddressColumns(err) {
  // Check all error fields — Supabase/PostgREST may use single or double quotes
  const haystack = [err?.message, err?.details, err?.hint, err?.code, String(err || '')]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const hasTable =
    haystack.includes('gold_index_competitors') ||
    // PostgREST sometimes omits table name; fall back to just column check
    (!haystack.includes('gold_index_') && (haystack.includes("'address'") || haystack.includes('"address"')));
  const hasCol =
    haystack.includes("'address'") ||
    haystack.includes('"address"') ||
    haystack.includes("'comment'") ||
    haystack.includes('"comment"') ||
    haystack.includes('column address') ||
    haystack.includes('column comment') ||
    haystack.includes('pgrst204');
  return hasTable && hasCol;
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
    // Try with address/comment columns first; fall back to legacy schema if they don't exist yet
    let comps = null;
    let compErr = null;
    ({ data: comps, error: compErr } = await supabase
      .from('gold_index_competitors')
      .select('id, city_id, company_name, probes, measured_at, notes, address, comment, lat, lng, sort_order, updated_at')
      .in('city_id', cityIds)
      .order('sort_order', { ascending: true })
      .order('company_name', { ascending: true }));
    if (compErr && isMissingCompetitorAddressColumns(compErr)) {
      ({ data: comps, error: compErr } = await supabase
        .from('gold_index_competitors')
        .select('id, city_id, company_name, probes, measured_at, notes, lat, lng, sort_order, updated_at')
        .in('city_id', cityIds)
        .order('sort_order', { ascending: true })
        .order('company_name', { ascending: true }));
    }
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
        address: co.address || parseLegacyCompetitorNotes(co.notes).address || null,
        comment: co.comment || parseLegacyCompetitorNotes(co.notes).comment || co.notes || null,
        notes: co.notes,
        lat: co.lat ?? null,
        lng: co.lng ?? null,
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
  const region_code_raw = String(body?.region_code || '').trim();
  const region_name = String(body?.region_name || '').trim();
  const city_name = String(body?.city_name || '').trim();
  const lat = parseFloat(body?.lat);
  const lng = parseFloat(body?.lng);
  if (!region_name || !city_name) {
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
  const region_code = region_code_raw || region_name;
  // NB: `address` / `comment` here intentionally live only on competitors,
  // not on cities — the `gold_index_cities` table doesn't have those columns.
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
  // city_id = null because the city was just deleted (FK ON DELETE SET NULL)
  await logGoldIndexChange(supabase, {
    entity_type: 'city',
    entity_id: id,
    city_id: null,
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
  const address = body?.address != null ? String(body.address).trim() || null : null;
  const comment = body?.comment != null ? String(body.comment).trim() || null : null;
  const legacyNotes = buildLegacyCompetitorNotes({ address, comment, notes });
  const sort_order = parseInt(String(body?.sort_order ?? '0'), 10) || 0;
  const lat = body?.lat != null && String(body.lat).trim() !== '' ? parseFloat(String(body.lat)) : null;
  const lng = body?.lng != null && String(body.lng).trim() !== '' ? parseFloat(String(body.lng)) : null;
  const now = new Date().toISOString();
  const insertPayload = {
    city_id: cityId,
    company_name,
    probes,
    measured_at,
    notes: legacyNotes,
    address,
    comment,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    sort_order,
    updated_at: now,
  };
  let data;
  let error;
  ({ data, error } = await supabase
    .from('gold_index_competitors')
    .insert(insertPayload)
    .select('id')
    .maybeSingle());
  if (error && isMissingCompetitorAddressColumns(error)) {
    const fallbackPayload = { ...insertPayload };
    delete fallbackPayload.address;
    delete fallbackPayload.comment;
    ({ data, error } = await supabase
      .from('gold_index_competitors')
      .insert(fallbackPayload)
      .select('id')
      .maybeSingle());
  }
  if (error) throw error;
  await logGoldIndexChange(supabase, {
    entity_type: 'competitor',
    entity_id: data?.id,
    city_id: cityId,
    action: 'create',
    changed_by: changedBy || null,
    payload: { company_name, probes, measured_at, notes: legacyNotes, address, comment, sort_order },
  });
  return data?.id;
}

export async function updateGoldIndexCompetitor(supabase, id, body, changedBy) {
  let { data: beforeRow, error: beforeErr } = await supabase
    .from('gold_index_competitors')
    .select('id, city_id, company_name, probes, measured_at, notes, address, comment, sort_order')
    .eq('id', id)
    .maybeSingle();
  if (beforeErr && isMissingCompetitorAddressColumns(beforeErr)) {
    ({ data: beforeRow, error: beforeErr } = await supabase
      .from('gold_index_competitors')
      .select('id, city_id, company_name, probes, measured_at, notes, sort_order')
      .eq('id', id)
      .maybeSingle());
  }
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
  const nextNotes = body?.notes != null ? String(body.notes).trim() || null : null;
  const nextAddress = body?.address != null ? String(body.address).trim() || null : null;
  const nextComment = body?.comment != null ? String(body.comment).trim() || null : null;
  if (body.notes !== undefined || body.address !== undefined || body.comment !== undefined) {
    patch.notes = buildLegacyCompetitorNotes({
      address: body.address !== undefined ? nextAddress : beforeRow?.address,
      comment: body.comment !== undefined ? nextComment : beforeRow?.comment,
      notes: body.notes !== undefined ? nextNotes : beforeRow?.notes,
    });
  }
  if (body.address !== undefined) patch.address = body.address != null ? String(body.address).trim() || null : null;
  if (body.comment !== undefined) patch.comment = body.comment != null ? String(body.comment).trim() || null : null;
  if (body.sort_order != null) patch.sort_order = parseInt(String(body.sort_order), 10) || 0;
  if (body.lat !== undefined) { const v = parseFloat(String(body.lat ?? '')); patch.lat = Number.isFinite(v) ? v : null; }
  if (body.lng !== undefined) { const v = parseFloat(String(body.lng ?? '')); patch.lng = Number.isFinite(v) ? v : null; }
  let { error } = await supabase.from('gold_index_competitors').update(patch).eq('id', id);
  if (error && isMissingCompetitorAddressColumns(error)) {
    const fallbackPatch = { ...patch };
    delete fallbackPatch.address;
    delete fallbackPatch.comment;
    ({ error } = await supabase.from('gold_index_competitors').update(fallbackPatch).eq('id', id));
  }
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
  let { data: beforeRow, error: beforeErr } = await supabase
    .from('gold_index_competitors')
    .select('id, city_id, company_name, probes, measured_at, notes, address, comment, sort_order')
    .eq('id', id)
    .maybeSingle();
  if (beforeErr && isMissingCompetitorAddressColumns(beforeErr)) {
    ({ data: beforeRow, error: beforeErr } = await supabase
      .from('gold_index_competitors')
      .select('id, city_id, company_name, probes, measured_at, notes, sort_order')
      .eq('id', id)
      .maybeSingle());
  }
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
  if (error) {
    const msg = String(error?.message || '');
    if (error?.code === '42P01' || /gold_index_changes/i.test(msg)) {
      console.warn('[gold index history] table missing, continue without history');
      return { rows: [], limit, offset };
    }
    throw error;
  }
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
 * Исторические данные по ценам проб — для линейного графика динамики.
 * Группирует обновления конкурентов по (неделе, region_code) и вычисляет
 * среднюю цену каждой пробы в конкретный период.
 */
export async function buildGoldIndexChartData(supabase, opts = {}) {
  const from = String(opts.from || '').trim();
  const to = String(opts.to || '').trim();
  const regionCode = String(opts.regionCode || '').trim();

  // 1. История конкурентов (создание + обновление)
  let hq = supabase
    .from('gold_index_changes')
    .select('city_id, action, payload, created_at')
    .eq('entity_type', 'competitor')
    .in('action', ['create', 'update'])
    .not('city_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(2000);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) hq = hq.gte('created_at', `${from}T00:00:00.000Z`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) hq = hq.lte('created_at', `${to}T23:59:59.999Z`);

  const { data: histRows, error: hErr } = await hq;
  if (hErr) {
    const msg = String(hErr?.message || '');
    if (hErr?.code === '42P01' || /gold_index_changes/i.test(msg)) return { series: [] };
    throw hErr;
  }
  if (!histRows?.length) return { series: [] };

  // 2. Города — нужны region_code и region_name
  const cityIds = [...new Set(histRows.map((r) => r.city_id).filter(Boolean))];
  const { data: cities, error: cErr } = await supabase
    .from('gold_index_cities')
    .select('id, region_code, region_name')
    .in('id', cityIds);
  if (cErr) throw cErr;

  const cityMap = new Map((cities || []).map((c) => [c.id, c]));

  // 3. Группировка по (неделя, regionCode)
  function weekMonday(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return iso.slice(0, 10);
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - day + 1);
    return d.toISOString().slice(0, 10);
  }

  // series[rc] = { regionCode, regionName, points: { weekKey: { sums: {}, counts: {} } } }
  const series = {};

  for (const row of histRows) {
    const city = cityMap.get(row.city_id);
    if (!city) continue;
    if (regionCode && city.region_code !== regionCode) continue;

    const probes =
      row.action === 'create'
        ? row.payload?.probes || {}
        : row.payload?.patch?.probes || row.payload?.probes || {};
    if (!probes || !Object.keys(probes).length) continue;

    const rc = city.region_code || 'UNKNOWN';
    const week = weekMonday(row.created_at);

    if (!series[rc]) {
      series[rc] = { regionCode: rc, regionName: city.region_name || rc, points: {} };
    }
    if (!series[rc].points[week]) {
      series[rc].points[week] = { sums: {}, counts: {} };
    }
    const pt = series[rc].points[week];
    for (const [probe, price] of Object.entries(probes)) {
      const p = parseFloat(String(price));
      if (!Number.isFinite(p) || p <= 0) continue;
      pt.sums[probe] = (pt.sums[probe] || 0) + p;
      pt.counts[probe] = (pt.counts[probe] || 0) + 1;
    }
  }

  // 4. Преобразуем в массив с усреднёнными значениями
  const result = Object.values(series).map((s) => ({
    regionCode: s.regionCode,
    regionName: s.regionName,
    points: Object.entries(s.points)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, pt]) => {
        const entry = { week };
        for (const [probe, sum] of Object.entries(pt.sums)) {
          entry[`p${probe}`] = Math.round(sum / pt.counts[probe]);
        }
        return entry;
      }),
  }));

  return { series: result };
}

/**
 * Геокодирование через OpenStreetMap Nominatim (без ключа).
 * https://nominatim.org/release-docs/latest/api/Search/ — не злоупотребляйте частотой запросов.
 */
/** Попытка геокодирования через Nominatim. Возвращает { lat, lng, displayName } или null при ошибке. */
async function tryNominatimSearch(q) {
  try {
    const { data } = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q, format: 'json', limit: 1, 'accept-language': 'ru' },
      timeout: 12000,
      headers: {
        'User-Agent':
          process.env.NOMINATIM_USER_AGENT ||
          'ReaktivoProGoldIndex/1.0 (https://reaktivo.pro; nikita@reaktivo.pro)',
      },
    });
    if (!Array.isArray(data) || !data[0]) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, displayName: data[0].display_name || q };
  } catch {
    return null;
  }
}

/** Попытка геокодирования через Photon (komoot.io) — fallback, тот же OSM-датасет. */
async function tryPhotonSearch(q) {
  try {
    const { data } = await axios.get('https://photon.komoot.io/api/', {
      params: { q, limit: 1, lang: 'ru' },
      timeout: 12000,
      headers: { 'User-Agent': 'ReaktivoProGoldIndex/1.0 (https://reaktivo.pro)' },
    });
    const feat = data?.features?.[0];
    if (!feat) return null;
    const [lng, lat] = feat.geometry?.coordinates || [];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const p = feat.properties || {};
    const displayName = [p.name, p.street, p.city, p.state, p.country].filter(Boolean).join(', ');
    return { lat, lng, displayName: displayName || q };
  } catch {
    return null;
  }
}

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

  // Try Nominatim first, fall back to Photon
  let result = await tryNominatimSearch(q);
  if (!result) result = await tryPhotonSearch(q);

  if (!result) {
    const err = new Error(
      'Точка не найдена. Уточните адрес или введите координаты вручную (в Яндекс/Google Картах: ПКМ по точке → скопировать координаты).'
    );
    err.status = 404;
    throw err;
  }
  return { lat: result.lat, lng: result.lng, displayName: result.displayName, queryUsed: q };
}

/**
 * Обратное геокодирование координат → город/регион через Nominatim.
 */
export async function reverseGeocodeGoldIndex({ lat, lng }) {
  let data;

  // Try Nominatim reverse
  let nominatimOk = false;
  try {
    ({ data } = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: { lat, lon: lng, format: 'json', 'accept-language': 'ru' },
      timeout: 10000,
      headers: {
        'User-Agent':
          process.env.NOMINATIM_USER_AGENT ||
          'ReaktivoProGoldIndex/1.0 (https://reaktivo.pro; nikita@reaktivo.pro)',
      },
    }));
    nominatimOk = true;
  } catch { /* fall through to Photon */ }

  if (!nominatimOk) {
    // Fallback: Photon reverse geocode
    try {
      const photon = await axios.get('https://photon.komoot.io/reverse', {
        params: { lat, lon: lng, lang: 'ru' },
        timeout: 10000,
        headers: { 'User-Agent': 'ReaktivoProGoldIndex/1.0 (https://reaktivo.pro)' },
      });
      const feat = photon.data?.features?.[0];
      if (feat) {
        const p = feat.properties || {};
        const city = p.city || p.town || p.village || p.county || '';
        const region = p.state || '';
        const street = [p.street, p.housenumber].filter(Boolean).join(', ');
        const displayName = [p.name, p.street, city, region, 'Россия'].filter(Boolean).join(', ');
        return { city, region, street, displayName };
      }
    } catch { /* ignore */ }
    const err = new Error('Сервис геокодирования временно недоступен');
    err.status = 502;
    throw err;
  }
  const addr = data?.address || {};
  const city = addr.city || addr.town || addr.village || addr.county || addr.municipality || '';
  const region = addr.state || '';
  const street = [addr.road || addr.pedestrian || addr.footway || '', addr.house_number || '']
    .map((s) => String(s).trim())
    .filter(Boolean)
    .join(', ');
  return {
    city,
    region,
    street,
    lat: parseFloat(data.lat ?? lat),
    lng: parseFloat(data.lon ?? lng),
    displayName: data.display_name || '',
    address: addr,
  };
}
