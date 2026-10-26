export const DEFAULT_SETTINGS = {
  buybackPercentOfScrap: 92,
  rangeHalfWidthPercent: 2,
  buybackCoeffOffice: 1,
  buybackCoeffCourier: 1,
  purityAdjustments: { 375: 0, 500: 0, 583: 0, 585: 0, 750: 0, 875: 0, 916: 0, 958: 0, 999: 0 },
  purityOrder: [375, 500, 583, 585, 750, 875, 916, 958, 999],
};

/** Множитель поверх процента выкупа. Пустое или нечисловое значение = 1, как раньше. */
export function readBuybackCoeff(settings, channel) {
  const key = channel === 'courier' ? 'buybackCoeffCourier' : 'buybackCoeffOffice';
  const n = Number(settings?.[key]);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(2, Math.max(0.5, n));
}

/**
 * Процент выкупа курьера от биржи, уже итоговый.
 * Если поле ещё не задавали, берём прежний процент отделения, умноженный на старый коэффициент.
 */
export function readCourierBuybackPercent(settings) {
  const raw = settings?.buybackPercentCourier;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const n = Number(String(raw).trim().replace(',', '.'));
    if (Number.isFinite(n)) return Math.min(100, Math.max(0, n));
  }
  const base = Math.min(100, Math.max(0, Number(settings?.buybackPercentOfScrap) || 0));
  return Math.min(100, Math.round(base * readBuybackCoeff(settings, 'courier') * 100) / 100);
}

/** Итоговый процент от биржи: у курьера свой, у отделения базовый процент на коэффициент. */
export function effectiveBuybackPercent(settings, channel) {
  if (channel === 'courier') return readCourierBuybackPercent(settings);
  const base = Math.min(100, Math.max(0, Number(settings?.buybackPercentOfScrap) || 0));
  return Math.min(100, Math.round(base * readBuybackCoeff(settings, 'office') * 100) / 100);
}

/** Курьер в панели считает по коэффициенту курьера, отделение и остальные роли — по отделению. */
export function buybackChannelForRole(role) {
  const r = String(role ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return r === 'courier' ? 'courier' : 'office';
}

export function mergeSettings(value) {
  if (!value) return { ...DEFAULT_SETTINGS };
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    purityAdjustments: { ...DEFAULT_SETTINGS.purityAdjustments, ...(value.purityAdjustments || {}) },
  };
}

export function calculateBuybackRange({ weightGrams, purityPerThousand, goldRubPerGram, settings, channel = 'office' }) {
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
  const usedChannel = channel === 'courier' ? 'courier' : 'office';
  const buybackPct = usedChannel === 'courier'
    ? readCourierBuybackPercent(settings)
    : Math.min(100, Math.max(0, Number(settings.buybackPercentOfScrap) || 0));
  const buybackCoeff = usedChannel === 'courier' ? 1 : readBuybackCoeff(settings, 'office');
  const midRub = scrapRub * (buybackPct / 100) * (1 + adjPct / 100) * buybackCoeff;
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
    buybackCoeff,
    channel: usedChannel,
    rangeHalfWidthPercent: half,
  };
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Котировка с perGram нужного канала.
 * perGram без суффикса остаётся отделенческим, чтобы старые экраны не сменили сумму.
 */
export function quoteForChannel(quote, channel) {
  if (!quote) return quote;
  const ch = channel === 'courier' ? 'courier' : 'office';
  const bag = ch === 'courier' ? quote.perGramCourier : quote.perGramOffice;
  if (bag && typeof bag === 'object') return { ...quote, perGram: bag };
  if (ch === 'office') return quote;
  const courierPct = readCourierBuybackPercent(quote);
  const officePct = effectiveBuybackPercent(quote, 'office');
  if (!quote.perGram || !officePct || courierPct === officePct) return quote;
  const scaled = {};
  for (const [k, v] of Object.entries(quote.perGram)) {
    const n = Number(v);
    if (Number.isFinite(n)) scaled[k] = Math.round((n * courierPct) / officePct);
  }
  return { ...quote, perGram: scaled };
}

/** Цена выкупа ₽/г по пробе. По умолчанию карта отделения. */
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

export function quoteBuybackPctLabel() {
  return 'до 90%';
}
