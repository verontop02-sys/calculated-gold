import { firstFilledContractRow, rowsJsonFromDeal } from './scrapDealFirstRow.js';

/**
 * @param {unknown} v
 * @returns {number} Supabase/Postgres numeric часто отдают строкой; parseFloat + проверка.
 */
function asWeightG(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function hasScalarWeight(v) {
  if (v == null) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return true;
}

/** Первая непустая строка позиций в jsonb `rows` (или первая из массива). */
function contractRowForScalars(r) {
  return firstFilledContractRow(rowsJsonFromDeal(r));
}

/**
 * Вес/проба: колонки first_* + fallback на строку из `rows` (имена как в форме: weightGross и т.д.).
 * @param {Record<string, unknown>} r
 */
function dealWeightGross(r) {
  if (hasScalarWeight(r.first_weight_gross)) return asWeightG(r.first_weight_gross);
  const row = contractRowForScalars(r) || {};
  return asWeightG(row.weightGross ?? row.weight_gross);
}

function dealWeightNet(r) {
  if (hasScalarWeight(r.first_weight_net)) return asWeightG(r.first_weight_net);
  const row = contractRowForScalars(r) || {};
  return asWeightG(row.weightNet ?? row.weight_net);
}

function dealProbeN(r) {
  if (r.first_probe != null && r.first_probe !== '') {
    const c = Math.round(Number(r.first_probe));
    if (Number.isFinite(c) && c > 0) return c;
  }
  const row = contractRowForScalars(r) || {};
  const dig = String(row.probe != null ? row.probe : '').replace(/\D/g, '');
  if (dig) {
    const n = Math.round(parseInt(dig, 10));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}

/**
 * Сводка для вкладки «Аналитика» (JSON и PDF).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} fromD Y-M-D
 * @param {string} toD Y-M-D
 */
export async function computeAnalyticsSummaryData(supabase, fromD, toD) {
  const now = new Date();
  const toDefault = String(toD || '').trim() || now.toISOString().slice(0, 10);
  const fromDefault =
    String(fromD || '').trim() || new Date(now.getTime() - 30 * 864e5).toISOString().slice(0, 10);
  const fromIso = new Date(`${fromDefault}T00:00:00.000Z`).toISOString();
  const toIso = new Date(`${toDefault}T23:59:59.999Z`).toISOString();

  // Явный список + "rows" в кавычках: имя колонки совпадает с ключевым словом SQL ROWS.
  const dealCols =
    'id, total_rub, first_probe, first_weight_gross, first_weight_net, created_at, customer_id, phone_normalized, seller_name, operator_id, contract_no, appraiser_name, "rows"';
  const { data: dealsData, error } = await supabase
    .from('scrap_deals')
    .select(dealCols)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const list = dealsData || [];
  const sumRub = list.reduce((s, r) => s + (Number(r.total_rub) || 0), 0);
  const countDeals = list.length;
  const idSet = new Set();
  for (const r of list) {
    if (r.customer_id) idSet.add(`c:${r.customer_id}`);
    else if (r.phone_normalized) idSet.add(`p:${r.phone_normalized}`);
  }
  const uniqueCustomers = idSet.size;
  const weightGross = list.reduce((s, r) => s + dealWeightGross(r), 0);
  const weightNet = list.reduce((s, r) => s + dealWeightNet(r), 0);
  const byDayMap = new Map();
  for (const r of list) {
    const d = r.created_at ? String(r.created_at).slice(0, 10) : '';
    if (!d) continue;
    if (!byDayMap.has(d)) {
      byDayMap.set(d, { day: d, count: 0, sumRub: 0, weightGross: 0, weightNet: 0 });
    }
    const b = byDayMap.get(d);
    b.count += 1;
    b.sumRub += Number(r.total_rub) || 0;
    b.weightGross += dealWeightGross(r);
    b.weightNet += dealWeightNet(r);
  }
  const byDay = [...byDayMap.values()].sort((a, b) => a.day.localeCompare(b.day));
  const mondayIso = (iso) => {
    const t = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(t.getTime())) return '';
    const dow = t.getUTCDay();
    const add = dow === 0 ? -6 : 1 - dow;
    t.setUTCDate(t.getUTCDate() + add);
    return t.toISOString().slice(0, 10);
  };
  const byWeekMap = new Map();
  const byMonthMap = new Map();
  for (const r of list) {
    const d = r.created_at ? String(r.created_at).slice(0, 10) : '';
    if (!d) continue;
    const wk = mondayIso(d);
    if (wk) {
      if (!byWeekMap.has(wk)) {
        byWeekMap.set(wk, { key: wk, count: 0, sumRub: 0, weightGross: 0, weightNet: 0 });
      }
      const bw = byWeekMap.get(wk);
      bw.count += 1;
      bw.sumRub += Number(r.total_rub) || 0;
      bw.weightGross += dealWeightGross(r);
      bw.weightNet += dealWeightNet(r);
    }
    const mo = d.slice(0, 7);
    if (mo) {
      if (!byMonthMap.has(mo)) {
        byMonthMap.set(mo, { key: mo, count: 0, sumRub: 0, weightGross: 0, weightNet: 0 });
      }
      const bm = byMonthMap.get(mo);
      bm.count += 1;
      bm.sumRub += Number(r.total_rub) || 0;
      bm.weightGross += dealWeightGross(r);
      bm.weightNet += dealWeightNet(r);
    }
  }
  const byWeek = [...byWeekMap.values()].sort((a, b) => a.key.localeCompare(b.key));
  const byMonth = [...byMonthMap.values()].sort((a, b) => a.key.localeCompare(b.key));
  const probeMap = new Map();
  for (const r of list) {
    const p = dealProbeN(r);
    if (!p) continue;
    if (!probeMap.has(p)) {
      probeMap.set(p, { probe: p, count: 0, sumRub: 0, weightGrossSum: 0, weightNetSum: 0 });
    }
    const x = probeMap.get(p);
    x.count += 1;
    x.sumRub += Number(r.total_rub) || 0;
    x.weightGrossSum += dealWeightGross(r);
    x.weightNetSum += dealWeightNet(r);
  }
  const byProbe = [...probeMap.values()]
    .map((b) => ({
      probe: b.probe,
      count: b.count,
      sumRub: b.sumRub,
      weightGrossSum: Number(b.weightGrossSum) || 0,
      weightNetSum: Number(b.weightNetSum) || 0,
    }))
    .sort((a, b) => a.probe - b.probe);

  const byOpMap = new Map();
  for (const r of list) {
    const k = r.operator_id || '';
    if (!byOpMap.has(k)) {
      byOpMap.set(k, { operatorId: r.operator_id || null, deals: 0, sumRub: 0 });
    }
    const o = byOpMap.get(k);
    o.deals += 1;
    o.sumRub += Number(r.total_rub) || 0;
  }
  let emailById = new Map();
  try {
    const { data: listData, error: luErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (!luErr && listData?.users) {
      emailById = new Map(listData.users.map((u) => [u.id, u.email || '']));
    }
  } catch (e) {
    console.warn('[analytics listUsers]', e?.message || e);
  }
  const byOperator = [...byOpMap.entries()]
    .map(([k, v]) => ({
      operatorId: v.operatorId,
      email: v.operatorId ? emailById.get(v.operatorId) || '—' : 'без учётки',
      deals: v.deals,
      sumRub: v.sumRub,
    }))
    .sort((a, b) => b.sumRub - a.sumRub);

  return {
    period: { from: fromDefault, to: toDefault },
    totals: {
      deals: countDeals,
      sumRub,
      uniqueCustomers,
      firstRowWeightGrossSum: weightGross,
      firstRowWeightNetSum: weightNet,
    },
    byDay,
    byWeek,
    byMonth,
    byProbe,
    byOperator,
  };
}
