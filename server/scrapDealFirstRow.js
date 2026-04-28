/**
 * Первая строка таблицы договора с данными (проба или вес).
 * Иначе [0] — как раньше (пустые строки сверху не редкость).
 */

function parseCell(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** JSON позиций из записи scrap_deals (имя колонки `rows` — иногда приходит иначе в клиенте). */
export function rowsJsonFromDeal(r) {
  if (!r || typeof r !== 'object') return [];
  const raw = r.rows ?? r.Rows;
  return normalizeDealRows(raw);
}

/** @param {unknown} raw */
export function normalizeDealRows(raw) {
  let rows = raw;
  if (rows == null) return [];
  if (typeof rows === 'string') {
    try {
      rows = JSON.parse(rows);
    } catch {
      return [];
    }
  }
  return Array.isArray(rows) ? rows : [];
}

/**
 * @param {unknown[]} rowsArr
 * @returns {Record<string, unknown> | null}
 */
export function firstFilledContractRow(rowsArr) {
  const arr = Array.isArray(rowsArr) ? rowsArr : [];
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue;
    const probeStr = String(row.probe ?? '').replace(/\D/g, '');
    let wg = parseCell(row.weightGross ?? row.weight_gross);
    let wn = parseCell(row.weightNet ?? row.weight_net);
    if (wg == null && wn == null) {
      for (const k of Object.keys(row)) {
        if (!/weight|ves|масс|вес/i.test(k)) continue;
        const n = parseCell(row[k]);
        if (n != null) {
          if (/gross|общ|лом|bruto/i.test(k)) wg = n;
          else if (/net|чист|нетто/i.test(k)) wn = n;
          else if (wg == null) wg = n;
          else if (wn == null) wn = n;
        }
      }
    }
    if (probeStr || wg != null || wn != null) return row;
  }
  const z = arr[0];
  return z && typeof z === 'object' ? z : null;
}
