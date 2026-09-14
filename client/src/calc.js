export const DEFAULT_SETTINGS = {
  buybackPercentOfScrap: 92,
  rangeHalfWidthPercent: 2,
  purityAdjustments: { 375: 0, 500: 0, 583: 0, 585: 0, 750: 0, 875: 0, 916: 0, 958: 0, 999: 0 },
  purityOrder: [375, 500, 583, 585, 750, 875, 916, 958, 999],
};

export function mergeSettings(value) {
  if (!value) return { ...DEFAULT_SETTINGS };
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    purityAdjustments: { ...DEFAULT_SETTINGS.purityAdjustments, ...(value.purityAdjustments || {}) },
  };
}

export function calculateBuybackRange({ weightGrams, purityPerThousand, goldRubPerGram, settings }) {
  const w = Number(weightGrams);
  const purity = Number(purityPerThousand);
  if (!Number.isFinite(w) || w <= 0) return { ok: false, error: 'Укажите положительный вес, г' };
  if (!Number.isFinite(purity) || purity <= 0 || purity > 1000) return { ok: false, error: 'Некорректная проба' };
  if (!Number.isFinite(goldRubPerGram) || goldRubPerGram <= 0) {
    return { ok: false, error: 'Курс золота недоступен. Подождите обновления.' };
  }

  const fineGrams = w * (purity / 1000);
  const scrapRub = fineGrams * goldRubPerGram;
  const adjPct = settings.purityAdjustments[String(Math.round(purity))] ?? 0;
  const buybackPct = Math.min(100, Math.max(0, Number(settings.buybackPercentOfScrap) || 0));
  const midRub = scrapRub * (buybackPct / 100) * (1 + adjPct / 100);
  const half = Math.min(50, Math.max(0, Number(settings.rangeHalfWidthPercent) || 0));

  return {
    ok: true,
    fineGrams,
    scrapRub,
    midRub,
    lowRub: midRub * (1 - half / 100),
    highRub: midRub * (1 + half / 100),
    purityUsed: purity,
    adjPct,
    buybackPct,
    rangeHalfWidthPercent: half,
  };
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Цена выкупа ₽/г по пробе — тот же mid, что в отделении и кабинете. */
export function quotePerGram(quote, purityPerThousand) {
  if (!quote) return null;
  const p = Number(purityPerThousand);
  if (!Number.isFinite(p) || p <= 0) return null;
  const direct = numOrNull(quote.perGram?.[p] ?? quote.perGram?.[String(p)]);
  if (direct != null && direct > 0) return direct;
  const spot = numOrNull(quote.goldRubPerGram);
  const pct = numOrNull(quote.buybackPercentOfScrap);
  if (spot == null || spot <= 0 || pct == null || pct <= 0) return null;
  return spot * (p / 1000) * (pct / 100);
}

/** Сумма выкупа по политике офиса (не «90% от спота»). */
export function quotePayout(quote, purityPerThousand, weightGrams) {
  const perG = quotePerGram(quote, purityPerThousand);
  const w = Number(weightGrams);
  if (perG == null || !Number.isFinite(w) || w <= 0) return null;
  return perG * w;
}

/** Коридор выкупа: известная проба — mid ± rangeHalfWidth; неизвестная — 375…999. */
export function quotePayoutRange(quote, purityPerThousand, weightGrams) {
  const w = Number(weightGrams);
  if (!quote || !Number.isFinite(w) || w <= 0) return { low: null, high: null, mid: null };
  if (purityPerThousand === 'unknown' || purityPerThousand == null || purityPerThousand === '') {
    const low = quotePayout(quote, 375, w);
    const high = quotePayout(quote, 999, w);
    return { low, high, mid: null };
  }
  const mid = quotePayout(quote, purityPerThousand, w);
  if (mid == null) return { low: null, high: null, mid: null };
  const half = Math.min(50, Math.max(0, Number(quote.rangeHalfWidthPercent) || 0));
  return {
    mid,
    low: mid * (1 - half / 100),
    high: mid * (1 + half / 100),
  };
}

export function quoteBuybackPctLabel(quote) {
  const pct = numOrNull(quote?.buybackPercentOfScrap);
  if (pct == null || pct <= 0) return 'по курсу выкупа';
  return `до ${Math.round(pct)}%`;
}
