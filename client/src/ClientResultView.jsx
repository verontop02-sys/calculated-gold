/**
 * Презентационный «зелёный экран» для клиента: крупная сумма выкупа + сравнение с рынком.
 * Только отрисовка по готовому `view` (см. computeClientView) — без вычислений и запросов.
 *
 * Используется в двух местах:
 *   - ClientPresentation — оверлей на экране оператора (с переключателем города);
 *   - ClientDisplay — отдельный экран клиента (второй монитор / планшет).
 *
 * @param {object} props
 * @param {object} props.view        Результат computeClientView.
 * @param {Function} props.formatMoney
 * @param {React.ReactNode} [props.cityControl]  Доп. контрол (выбор города) в шапке сравнения.
 */
export function ClientResultView({ view, formatMoney, cityControl = null }) {
  const v = view || {};
  const hasMarket = v.marketAvg != null;
  const adv = v.advantagePct;

  return (
    <div className="cg-crv">
      <section className="cg-crv__hero">
        <p className="cg-crv__hero-label">Ваш выкуп</p>
        <p className="cg-crv__hero-value mono-nums">
          {v.ourSumRub != null ? formatMoney(v.ourSumRub) : '—'}
        </p>
        <p className="cg-crv__hero-sub">
          {v.weightNum > 0 && v.purityNum > 0
            ? `За ${formatWeight(v.weightNum)} г · ${v.purityNum} проба`
            : 'Ожидаем расчёт оператора'}
        </p>
        {v.fineGrams != null && (
          <p className="cg-crv__hero-meta">Чистого золота {v.fineGrams.toFixed(3)} г</p>
        )}
      </section>

      <section className="cg-crv__compare">
        <div className="cg-crv__compare-head">
          <h3 className="cg-crv__compare-title">Сравнение с рынком</h3>
          {cityControl}
        </div>

        <div className="cg-crv__compare-grid">
          <article className="cg-crv__pillar cg-crv__pillar--ours">
            <div className="cg-crv__pillar-label">Наша цена за 1 г</div>
            <div className="cg-crv__pillar-value mono-nums">
              {v.ourRubPerGram != null ? formatMoney(Math.round(v.ourRubPerGram)) : '—'}
            </div>
            <div className="cg-crv__pillar-sub">проба {v.purityNum || '—'}</div>
          </article>

          <div className="cg-crv__vs">VS</div>

          <article className="cg-crv__pillar cg-crv__pillar--market">
            <div className="cg-crv__pillar-label">Среднее по конкурентам</div>
            <div className="cg-crv__pillar-value mono-nums">
              {hasMarket ? formatMoney(Math.round(v.marketAvg)) : '—'}
            </div>
            <div className="cg-crv__pillar-sub">
              {v.marketLo != null && v.marketHi != null
                ? `от ${formatMoney(Math.round(v.marketLo))} до ${formatMoney(Math.round(v.marketHi))}`
                : v.cityName
                  ? `данных по пробе ${v.purityNum || '—'} нет`
                  : '—'}
            </div>
          </article>
        </div>

        {adv != null && (
          <div className={`cg-crv__advantage ${adv >= 0 ? 'cg-crv__advantage--good' : 'cg-crv__advantage--bad'}`}>
            {adv >= 0 ? (
              <>
                <span className="cg-crv__advantage-pct">+{adv.toFixed(1)}%</span>
                <span>выгоднее средней по городу — это +{formatMoney(Math.round(v.advantageDelta))} за каждый грамм</span>
              </>
            ) : (
              <>
                <span className="cg-crv__advantage-pct">{adv.toFixed(1)}%</span>
                <span>относительно средней по городу</span>
              </>
            )}
          </div>
        )}

        {v.cityName && (
          <p className="cg-crv__compare-foot">
            {v.cityName}{v.regionName ? ` · ${v.regionName}` : ''}
            {v.competitorsCount != null
              ? ` · на основе данных ${v.competitorsCount} ${pluralComps(v.competitorsCount)}`
              : ''}
            {v.lastMeasuredAt ? `, актуально на ${formatDate(v.lastMeasuredAt)}` : ''}.
          </p>
        )}
      </section>
    </div>
  );
}

export function formatWeight(w) {
  if (!Number.isFinite(w)) return '—';
  return Number.isInteger(w) ? String(w) : w.toFixed(2).replace(/\.?0+$/, '');
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function pluralComps(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'конкурентов';
  if (mod10 === 1) return 'конкурент';
  if (mod10 >= 2 && mod10 <= 4) return 'конкурента';
  return 'конкурентов';
}

/** Общий CSS зелёного экрана. Используется и в оверлее, и на экране клиента. */
export const CLIENT_RESULT_CSS = `
.cg-crv { display: flex; flex-direction: column; gap: 22px; width: 100%; }

/* ── Hero: сумма к выдаче — КРУПНЫЙ ЗЕЛЁНЫЙ БЛОК ── */
.cg-crv__hero {
  text-align: center;
  padding: 34px 20px 30px;
  background:
    radial-gradient(ellipse 90% 100% at 50% 0%, rgba(74, 222, 128, 0.16), transparent 70%),
    linear-gradient(180deg, rgba(34, 197, 94, 0.14) 0%, rgba(34, 197, 94, 0.05) 100%);
  border-radius: 22px;
  border: 1px solid rgba(74, 222, 128, 0.35);
  box-shadow: 0 0 60px rgba(74, 222, 128, 0.07) inset, 0 10px 40px rgba(0,0,0,0.2);
  animation: cgCrvHeroIn 0.55s cubic-bezier(0.22, 1, 0.36, 1) 0.05s backwards;
}
@keyframes cgCrvHeroIn {
  from { opacity: 0; transform: translateY(14px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
.cg-crv__hero-label {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: rgba(134, 239, 172, 0.85);
  font-weight: 600;
  margin: 0 0 8px;
}
.cg-crv__hero-value {
  font-size: clamp(3.4rem, 8vw, 6rem);
  font-weight: 700;
  color: #4ade80;
  text-shadow: 0 6px 50px rgba(74, 222, 128, 0.45);
  line-height: 1;
  margin: 4px 0 10px;
  letter-spacing: -0.025em;
  font-variant-numeric: tabular-nums;
}
.cg-crv__hero-sub { font-size: 1.2rem; color: #f4f5f7; margin: 0; font-weight: 500; }
.cg-crv__hero-meta { font-size: 0.92rem; color: rgba(244, 245, 247, 0.55); margin: 6px 0 0; }

/* ── Compare ── */
.cg-crv__compare {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 20px 22px;
  animation: cgCrvFadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.16s backwards;
}
@keyframes cgCrvFadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: none; }
}
.cg-crv__compare-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}
.cg-crv__compare-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.01em;
}
.cg-crv__compare-grid {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: stretch;
  gap: 14px;
}
.cg-crv__pillar {
  text-align: center;
  padding: 20px 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.10);
}
.cg-crv__pillar--ours {
  background: linear-gradient(160deg, rgba(34, 197, 94, 0.16) 0%, rgba(34, 197, 94, 0.04) 100%);
  border-color: rgba(74, 222, 128, 0.45);
  box-shadow: 0 8px 32px rgba(34, 197, 94, 0.10);
}
.cg-crv__pillar-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: rgba(244, 245, 247, 0.5);
  font-weight: 600;
}
.cg-crv__pillar--ours .cg-crv__pillar-label { color: rgba(134, 239, 172, 0.85); }
.cg-crv__pillar-value {
  font-size: clamp(2rem, 4vw, 2.8rem);
  font-weight: 700;
  margin: 8px 0 4px;
  color: #fff;
  line-height: 1.05;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.cg-crv__pillar--ours .cg-crv__pillar-value { color: #4ade80; }
.cg-crv__pillar-sub { font-size: 0.82rem; color: rgba(244, 245, 247, 0.5); }

.cg-crv__vs {
  align-self: center;
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  color: rgba(244, 245, 247, 0.3);
}

.cg-crv__advantage {
  margin-top: 14px;
  padding: 14px 20px;
  border-radius: 14px;
  font-size: 1rem;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
}
.cg-crv__advantage--good {
  background: rgba(74, 222, 128, 0.12);
  color: #86efac;
  border: 1px solid rgba(74, 222, 128, 0.4);
}
.cg-crv__advantage--bad {
  background: rgba(251, 113, 133, 0.10);
  color: #fda4af;
  border: 1px solid rgba(251, 113, 133, 0.35);
}
.cg-crv__advantage-pct { font-size: 1.7rem; font-weight: 800; letter-spacing: -0.01em; }
.cg-crv__compare-foot {
  margin: 12px 0 0;
  font-size: 0.78rem;
  color: rgba(244, 245, 247, 0.45);
  text-align: center;
}

@media (max-width: 720px) {
  .cg-crv { gap: 14px; }
  .cg-crv__hero { padding: 24px 16px 20px; }
  .cg-crv__hero-value { font-size: clamp(2.8rem, 14vw, 4.6rem); }
  .cg-crv__hero-sub { font-size: 1rem; }
  .cg-crv__compare { padding: 16px; }
  .cg-crv__compare-grid { grid-template-columns: 1fr; gap: 8px; }
  .cg-crv__vs {
    height: 1px; width: 100%; font-size: 0;
    background: rgba(255,255,255,0.08); border-radius: 1px;
    transform: none; align-self: stretch; margin: 0;
  }
  .cg-crv__compare-head { flex-direction: column; align-items: stretch; }
  .cg-crv__pillar { padding: 14px 12px; }
  .cg-crv__pillar-value { font-size: clamp(1.7rem, 9vw, 2.6rem); }
  .cg-crv__advantage { font-size: 0.9rem; padding: 12px 14px; }
  .cg-crv__advantage-pct { font-size: 1.4rem; }
}
@media (max-width: 400px) {
  .cg-crv__hero { padding: 20px 12px 16px; }
  .cg-crv__hero-value { font-size: clamp(2.4rem, 16vw, 3.4rem); }
  .cg-crv__hero-label { font-size: 0.75rem; letter-spacing: 0.16em; }
  .cg-crv__compare { padding: 12px; }
  .cg-crv__pillar { padding: 12px 10px; }
  .cg-crv__pillar-value { font-size: clamp(1.5rem, 10vw, 2.2rem); }
  .cg-crv__pillar-label { font-size: 0.66rem; }
  .cg-crv__compare-title { font-size: 1rem; }
}
`;
