import { dealWeightGross, dealWeightNet } from './dealWeights.js';
import { SCRAP_DEALS_ANALYTICS_COLS } from './analyticsSummaryData.js';

function tierFromSum(sumRub, thresholds) {
  const { high, mid } = thresholds;
  if (sumRub >= high) return 'high';
  if (sumRub >= mid) return 'mid';
  return 'low';
}

function weekKeyFromDay(dayIso) {
  const t = new Date(`${dayIso}T12:00:00Z`);
  if (Number.isNaN(t.getTime())) return '';
  const dow = t.getUTCDay();
  const add = dow === 0 ? -6 : 1 - dow;
  t.setUTCDate(t.getUTCDate() + add);
  return t.toISOString().slice(0, 10);
}

/**
 * Панель руководителя / личные KPI по сделкам (PDF из договора).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   fromD: string,
 *   toD: string,
 *   viewerIsManager: boolean,
 *   viewerUserId: string,
 *   operatorFilterIds: string[] | null,
 * }} opts
 */
export async function computeTeamPerformanceData(supabase, opts) {
  const now = new Date();
  const toDefault = String(opts.toD || '').trim() || now.toISOString().slice(0, 10);
  const fromDefault =
    String(opts.fromD || '').trim() || new Date(now.getTime() - 7 * 864e5).toISOString().slice(0, 10);
  const fromIso = new Date(`${fromDefault}T00:00:00.000Z`).toISOString();
  const toIso = new Date(`${toDefault}T23:59:59.999Z`).toISOString();

  const high = Number(process.env.TEAM_PERF_HIGH_SUM_RUB || '3000000');
  const mid = Number(process.env.TEAM_PERF_MID_SUM_RUB || '500000');
  const thresholds = { high: Number.isFinite(high) ? high : 3_000_000, mid: Number.isFinite(mid) ? mid : 500_000 };

  let q = supabase
    .from('scrap_deals')
    .select(SCRAP_DEALS_ANALYTICS_COLS)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: true });

  if (!opts.viewerIsManager) {
    q = q.eq('operator_id', opts.viewerUserId);
  }

  const { data: dealsData, error } = await q;
  if (error) throw error;
  let list = dealsData || [];

  let operatorFilterIds = opts.operatorFilterIds;
  if (opts.viewerIsManager && Array.isArray(operatorFilterIds) && operatorFilterIds.length > 0) {
    const allow = new Set(operatorFilterIds.map((id) => String(id).trim()).filter(Boolean));
    list = list.filter((r) => r.operator_id && allow.has(String(r.operator_id)));
  }

  const sumRubTotal = list.reduce((s, r) => s + (Number(r.total_rub) || 0), 0);
  const dealsTotal = list.length;
  const wgTot = list.reduce((s, r) => s + dealWeightGross(r), 0);
  const wnTot = list.reduce((s, r) => s + dealWeightNet(r), 0);

  let emailById = new Map();
  try {
    const { data: listData, error: luErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (!luErr && listData?.users) {
      emailById = new Map(listData.users.map((u) => [u.id, u.email || '']));
    }
  } catch (e) {
    console.warn('[teamPerformance listUsers]', e?.message || e);
  }

  const opMap = new Map();
  for (const r of list) {
    const oid = r.operator_id ? String(r.operator_id) : '';
    const key = oid || '__none__';
    if (!opMap.has(key)) {
      opMap.set(key, {
        operatorId: oid || null,
        email: oid ? emailById.get(oid) || '—' : 'без учётки',
        deals: 0,
        sumRub: 0,
        weightGrossSum: 0,
        weightNetSum: 0,
      });
    }
    const o = opMap.get(key);
    o.deals += 1;
    o.sumRub += Number(r.total_rub) || 0;
    o.weightGrossSum += dealWeightGross(r);
    o.weightNetSum += dealWeightNet(r);
  }

  const operatorsRaw = [...opMap.values()].sort((a, b) => b.sumRub - a.sumRub);
  const operators = operatorsRaw.map((o, i) => {
    const shareRubPct = sumRubTotal > 0 ? Math.round((o.sumRub / sumRubTotal) * 1000) / 10 : 0;
    return {
      rank: i + 1,
      operatorId: o.operatorId,
      email: o.email,
      deals: o.deals,
      sumRub: o.sumRub,
      weightGrossSum: Number(o.weightGrossSum) || 0,
      weightNetSum: Number(o.weightNetSum) || 0,
      shareRubPct,
      tier: tierFromSum(o.sumRub, thresholds),
    };
  });

  const dailyRows = [];
  const dayOp = new Map();
  for (const r of list) {
    const day = r.created_at ? String(r.created_at).slice(0, 10) : '';
    if (!day) continue;
    const oid = r.operator_id ? String(r.operator_id) : '';
    const key = `${day}|${oid || '__none__'}`;
    if (!dayOp.has(key)) {
      dayOp.set(key, {
        day,
        operatorId: oid || null,
        email: oid ? emailById.get(oid) || '—' : 'без учётки',
        deals: 0,
        sumRub: 0,
      });
    }
    const row = dayOp.get(key);
    row.deals += 1;
    row.sumRub += Number(r.total_rub) || 0;
  }
  for (const v of dayOp.values()) dailyRows.push(v);
  dailyRows.sort((a, b) => (a.day === b.day ? String(a.email).localeCompare(String(b.email)) : a.day.localeCompare(b.day)));

  const weekMap = new Map();
  for (const r of list) {
    const day = r.created_at ? String(r.created_at).slice(0, 10) : '';
    if (!day) continue;
    const wk = weekKeyFromDay(day);
    if (!wk) continue;
    if (!weekMap.has(wk)) {
      weekMap.set(wk, { weekStart: wk, deals: 0, sumRub: 0, weightGrossSum: 0, weightNetSum: 0 });
    }
    const w = weekMap.get(wk);
    w.deals += 1;
    w.sumRub += Number(r.total_rub) || 0;
    w.weightGrossSum += dealWeightGross(r);
    w.weightNetSum += dealWeightNet(r);
  }
  const byWeek = [...weekMap.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  return {
    period: { from: fromDefault, to: toDefault },
    viewerIsManager: opts.viewerIsManager,
    thresholds: { highSumRub: thresholds.high, midSumRub: thresholds.mid },
    totals: {
      deals: dealsTotal,
      sumRub: sumRubTotal,
      weightGrossSum: wgTot,
      weightNetSum: wnTot,
    },
    operators,
    dailyRows,
    byWeek,
  };
}
