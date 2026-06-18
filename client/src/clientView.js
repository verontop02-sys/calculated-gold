import { calculateBuybackRange, mergeSettings } from './calc.js';

/**
 * Считает готовый к показу клиенту «view» (сумма выкупа + сравнение с рынком).
 *
 * Возвращает ПРОСТОЙ сериализуемый объект — его можно как рендерить локально,
 * так и переслать на отдельный экран клиента (через сервер-релей).
 *
 * @param {object} p
 * @param {object|null} p.settings  Политика выкупа (сырые настройки, будут смержены).
 * @param {object|null} p.price     Курс { goldRubPerGram }.
 * @param {object|null} p.summary   Публичная сводка по рынку { cities: [...] }.
 * @param {string} p.cityId         Выбранный город (для сравнения).
 * @param {number|string} p.weight  Вес изделия, г.
 * @param {number|string} p.purity  Проба (585, 750, …).
 */
export function computeClientView({ settings, price, summary, cityId, weight, purity }) {
  const purityNum = Number(purity) || 0;
  const weightNum = parseFloat(String(weight ?? '').replace(',', '.')) || 0;
  const goldRub = price?.goldRubPerGram;
  const merged = settings ? mergeSettings(settings) : null;

  let ourSumRub = null;
  let fineGrams = null;
  let ourRubPerGram = null;
  if (merged && Number.isFinite(goldRub) && weightNum > 0 && purityNum > 0) {
    const r = calculateBuybackRange({
      weightGrams: weightNum,
      purityPerThousand: purityNum,
      goldRubPerGram: goldRub,
      settings: merged,
    });
    if (r.ok) {
      ourSumRub = Math.round(r.midRub);
      fineGrams = r.fineGrams;
      ourRubPerGram = r.midRub / weightNum;
    }
  }

  const city = (summary?.cities || []).find((c) => c.id === cityId) || null;

  let marketAvg = null;
  let marketLo = null;
  let marketHi = null;
  if (city && purityNum) {
    const v = city.avgByProbe?.[purityNum];
    if (Number.isFinite(v)) {
      marketAvg = v;
      const lo = city.minByProbe?.[purityNum];
      const hi = city.maxByProbe?.[purityNum];
      marketLo = Number.isFinite(lo) ? lo : null;
      marketHi = Number.isFinite(hi) ? hi : null;
    }
  }

  let advantagePct = null;
  let advantageDelta = null;
  if (ourRubPerGram != null && marketAvg) {
    advantageDelta = ourRubPerGram - marketAvg;
    advantagePct = (advantageDelta / marketAvg) * 100;
  }

  return {
    ready: ourSumRub != null,
    weightNum,
    purityNum,
    goldRubPerGram: Number.isFinite(goldRub) ? goldRub : null,
    ourSumRub,
    fineGrams,
    ourRubPerGram,
    cityName: city?.cityName || null,
    regionName: city?.regionName || null,
    competitorsCount: city?.competitorsCount ?? null,
    lastMeasuredAt: city?.lastMeasuredAt || null,
    marketAvg,
    marketLo,
    marketHi,
    advantagePct,
    advantageDelta,
  };
}
