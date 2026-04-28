import { firstFilledContractRow, rowsJsonFromDeal } from './scrapDealFirstRow.js';

/**
 * Разбор веса 1-й строки договора для scrap_deals (колонки + jsonb rows).
 * Общий модуль для аналитики и панели команды.
 */

export function asWeightG(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function hasScalarWeight(v) {
  if (v == null) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return true;
}

export function contractRowForScalars(r) {
  return firstFilledContractRow(rowsJsonFromDeal(r));
}

/** @param {Record<string, unknown>} r */
export function dealWeightGross(r) {
  if (hasScalarWeight(r.first_weight_gross)) return asWeightG(r.first_weight_gross);
  const row = contractRowForScalars(r) || {};
  return asWeightG(row.weightGross ?? row.weight_gross);
}

export function dealWeightNet(r) {
  if (hasScalarWeight(r.first_weight_net)) return asWeightG(r.first_weight_net);
  const row = contractRowForScalars(r) || {};
  return asWeightG(row.weightNet ?? row.weight_net);
}

export function dealProbeN(r) {
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
