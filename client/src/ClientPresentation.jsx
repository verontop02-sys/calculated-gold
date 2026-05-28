import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api.js';
import { calculateBuybackRange, mergeSettings } from './calc.js';

/**
 * Полноэкранный режим «Показать клиенту».
 *
 * Что показывает:
 *   - Большую сумму нашего выкупа за указанные вес/пробу.
 *   - Цену за 1 г выбранной пробы (для сравнения).
 *   - Средние/диапазон цен по конкурентам в выбранном городе/регионе
 *     (берём из /api/gold-index/public-summary — обезличенная сводка для всех ролей).
 *   - Выгоду в % относительно средней по рынку.
 *
 * Город выбирается из выпадающего списка и сохраняется в localStorage.
 * Светлая премиальная палитра не зависит от темы приложения — чтобы клиент через стол
 * видел контрастно и без «компьютерных» цветов.
 */
export function ClientPresentation({ open, onClose, formatMoney, price, weight, purity, brandName = 'REAKTIVO PRO' }) {
  const [settings, setSettings] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryErr, setSummaryErr] = useState(null);
  const [cityId, setCityId] = useState(() => {
    try { return localStorage.getItem('cg_client_view_city') || ''; } catch { return ''; }
  });
  const overlayRef = useRef(null);
  const wasOpenRef = useRef(false);

  // Загружаем настройки и публичную сводку при первом открытии.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setSummaryLoading(true);
    setSummaryErr(null);
    Promise.all([
      api.settings().catch(() => null),
      api.goldIndexPublicSummary().catch((e) => { throw e; }),
    ])
      .then(([s, sum]) => {
        if (!alive) return;
        setSettings(mergeSettings(s));
        setSummary(sum || null);
      })
      .catch((e) => {
        if (!alive) return;
        setSummaryErr(e?.message || 'Не удалось загрузить сводку по рынку');
      })
      .finally(() => {
        if (alive) setSummaryLoading(false);
      });
    return () => { alive = false; };
  }, [open]);

  // Блокируем body-scroll, ESC закрывает, без layout-jank в Safari.
  useEffect(() => {
    if (!open) return undefined;
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      document.body.classList.add('cg-cp-open');
      document.documentElement.classList.add('cg-cp-open');
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('cg-cp-open');
      document.documentElement.classList.remove('cg-cp-open');
      wasOpenRef.current = false;
    };
  }, [open, onClose]);

  // По умолчанию выбираем первый город из списка, если ничего не сохранено.
  useEffect(() => {
    if (!open || !summary?.cities?.length) return;
    if (!cityId) {
      setCityId(summary.cities[0].id);
    } else if (!summary.cities.some((c) => c.id === cityId)) {
      // Сохранённый город удалили — берём первый
      setCityId(summary.cities[0].id);
    }
  }, [open, summary, cityId]);

  // Сохраняем выбор города
  useEffect(() => {
    if (!cityId) return;
    try { localStorage.setItem('cg_client_view_city', cityId); } catch { /* ignore */ }
  }, [cityId]);

  const purityNum = Number(purity) || 0;
  const weightNum = parseFloat(String(weight || '').replace(',', '.')) || 0;
  const goldRub = price?.goldRubPerGram;

  // Наш расчёт
  const ourCalc = useMemo(() => {
    if (!settings || !Number.isFinite(goldRub) || !weightNum || !purityNum) return null;
    const r = calculateBuybackRange({
      weightGrams: weightNum,
      purityPerThousand: purityNum,
      goldRubPerGram: goldRub,
      settings,
    });
    if (!r.ok) return null;
    return r;
  }, [settings, goldRub, weightNum, purityNum]);

  // Наша цена за 1 г для пробы (без учёта веса) — для честного сравнения с конкурентами.
  const ourRubPerGram = useMemo(() => {
    if (!ourCalc || !weightNum) return null;
    return ourCalc.midRub / weightNum;
  }, [ourCalc, weightNum]);

  const city = useMemo(
    () => (summary?.cities || []).find((c) => c.id === cityId) || null,
    [summary, cityId],
  );

  // Средняя по конкурентам для текущей пробы. Если по нашей пробе данных нет —
  // показываем «нет данных», без подмен.
  const cityAvgForProbe = useMemo(() => {
    if (!city || !purityNum) return null;
    const v = city.avgByProbe?.[purityNum];
    if (!Number.isFinite(v)) return null;
    const lo = city.minByProbe?.[purityNum];
    const hi = city.maxByProbe?.[purityNum];
    return { avg: v, lo: Number.isFinite(lo) ? lo : null, hi: Number.isFinite(hi) ? hi : null };
  }, [city, purityNum]);

  // Разница в %: на сколько мы выгоднее средней по рынку.
  const advantage = useMemo(() => {
    if (!ourRubPerGram || !cityAvgForProbe?.avg) return null;
    const delta = ourRubPerGram - cityAvgForProbe.avg;
    const pct = (delta / cityAvgForProbe.avg) * 100;
    return { delta, pct };
  }, [ourRubPerGram, cityAvgForProbe]);

  const handleBackdropClick = useCallback((e) => {
    if (e.target === overlayRef.current) onClose?.();
  }, [onClose]);

  if (!open) return null;

  const node = (
    <div
      ref={overlayRef}
      className="cg-cp"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Показать клиенту"
    >
      <div className="cg-cp__sheet">
        <header className="cg-cp__header">
          <div className="cg-cp__brand">
            <span className="cg-cp__brand-mark">
              <img src="/logo_reactivo1.png" alt={brandName} />
            </span>
            <span className="cg-cp__brand-name">{brandName}</span>
          </div>
          <button type="button" className="cg-cp__close" onClick={onClose} aria-label="Закрыть">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <main className="cg-cp__body">
          {/* Главный блок — наша сумма */}
          <section className="cg-cp__hero">
            <p className="cg-cp__hero-label">Ваш выкуп</p>
            <p className="cg-cp__hero-value mono-nums">
              {ourCalc ? formatMoney(Math.round(ourCalc.midRub)) : '—'}
            </p>
            <p className="cg-cp__hero-sub">
              {weightNum > 0 && purityNum > 0
                ? `За ${formatWeight(weightNum)} г · ${purityNum} проба`
                : 'Введите вес и пробу в калькуляторе'}
            </p>
            {ourCalc && (
              <p className="cg-cp__hero-meta">
                Чистого золота {ourCalc.fineGrams.toFixed(3)} г
              </p>
            )}
          </section>

          {/* Сравнение по рынку */}
          <section className="cg-cp__compare">
            <div className="cg-cp__compare-head">
              <h3 className="cg-cp__compare-title">Сравнение с рынком</h3>
              <div className="cg-cp__city-pick">
                <span className="cg-cp__city-label">Город:</span>
                <select
                  className="cg-cp__city-select"
                  value={cityId || ''}
                  onChange={(e) => setCityId(e.target.value)}
                >
                  {(summary?.cities || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.cityName} · {c.regionName}
                    </option>
                  ))}
                  {!summary?.cities?.length && <option value="">Нет городов</option>}
                </select>
              </div>
            </div>

            <div className="cg-cp__compare-grid">
              <article className="cg-cp__pillar cg-cp__pillar--ours">
                <div className="cg-cp__pillar-label">Наша цена за 1 г</div>
                <div className="cg-cp__pillar-value mono-nums">
                  {ourRubPerGram != null ? formatMoney(Math.round(ourRubPerGram)) : '—'}
                </div>
                <div className="cg-cp__pillar-sub">проба {purityNum || '—'}</div>
              </article>

              <div className="cg-cp__vs">VS</div>

              <article className="cg-cp__pillar cg-cp__pillar--market">
                <div className="cg-cp__pillar-label">Среднее по конкурентам</div>
                <div className="cg-cp__pillar-value mono-nums">
                  {summaryLoading ? '…' : cityAvgForProbe ? formatMoney(Math.round(cityAvgForProbe.avg)) : '—'}
                </div>
                <div className="cg-cp__pillar-sub">
                  {cityAvgForProbe?.lo != null && cityAvgForProbe?.hi != null
                    ? `от ${formatMoney(Math.round(cityAvgForProbe.lo))} до ${formatMoney(Math.round(cityAvgForProbe.hi))}`
                    : city
                      ? `данных по пробе ${purityNum} нет`
                      : '—'}
                </div>
              </article>
            </div>

            {advantage && (
              <div className={`cg-cp__advantage ${advantage.pct >= 0 ? 'cg-cp__advantage--good' : 'cg-cp__advantage--bad'}`}>
                {advantage.pct >= 0 ? (
                  <>
                    <span className="cg-cp__advantage-pct">+{advantage.pct.toFixed(1)}%</span>
                    <span>выгоднее средней по городу — это +{formatMoney(Math.round(advantage.delta))} за каждый грамм</span>
                  </>
                ) : (
                  <>
                    <span className="cg-cp__advantage-pct">{advantage.pct.toFixed(1)}%</span>
                    <span>относительно средней по городу</span>
                  </>
                )}
              </div>
            )}

            {city && (
              <p className="cg-cp__compare-foot">
                На основе данных {city.competitorsCount} {pluralComps(city.competitorsCount)} в городе{city.lastMeasuredAt ? `, актуально на ${formatDate(city.lastMeasuredAt)}` : ''}.
              </p>
            )}

            {summaryErr && !summaryLoading && (
              <p className="cg-cp__err">{summaryErr}</p>
            )}
          </section>

          <footer className="cg-cp__footer">
            <span className="cg-cp__footer-note">Биржевая цена сегодня: {goldRub != null ? formatMoney(goldRub) : '—'} / г чистого</span>
            <button type="button" className="cg-cp__back" onClick={onClose}>
              К калькулятору
            </button>
          </footer>
        </main>
      </div>

      <style>{CSS}</style>
    </div>
  );

  return createPortal(node, document.body);
}

function formatWeight(w) {
  if (!Number.isFinite(w)) return '—';
  // целые — без точки; дробные — с одним знаком
  return Number.isInteger(w) ? String(w) : w.toFixed(2).replace(/\.?0+$/, '');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function pluralComps(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'конкурентов';
  if (mod10 === 1) return 'конкурент';
  if (mod10 >= 2 && mod10 <= 4) return 'конкурента';
  return 'конкурентов';
}

const CSS = `
html.cg-cp-open, body.cg-cp-open {
  overflow: hidden !important;
}

.cg-cp {
  position: fixed; inset: 0;
  z-index: 200;
  background:
    radial-gradient(ellipse 100% 70% at 50% -10%, rgba(232,197,120,0.55), transparent 55%),
    radial-gradient(ellipse 70% 50% at 100% 100%, rgba(255, 220, 160, 0.35), transparent 60%),
    linear-gradient(180deg, #fdfaf2 0%, #f5ecd4 100%);
  color: #1a1409;
  color-scheme: light;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom));
  animation: cgCpFade 0.22s ease;
  overflow-y: auto;
}
@keyframes cgCpFade { from { opacity: 0; } to { opacity: 1; } }

.cg-cp__sheet {
  width: 100%;
  max-width: 920px;
  background: rgba(255, 252, 244, 0.86);
  border: 1px solid rgba(140, 110, 40, 0.2);
  box-shadow: 0 30px 80px rgba(60, 40, 20, 0.18);
  border-radius: 24px;
  padding: 28px 36px 24px;
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  animation: cgCpRise 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
  display: flex;
  flex-direction: column;
  gap: 22px;
}
@keyframes cgCpRise {
  from { opacity: 0; transform: translateY(20px) scale(0.99); }
  to { opacity: 1; transform: none; }
}

.cg-cp__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(140, 110, 40, 0.14);
  padding-bottom: 16px;
}
.cg-cp__brand { display: flex; align-items: center; gap: 12px; }
.cg-cp__brand-mark {
  width: 44px; height: 44px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid rgba(140, 110, 40, 0.2);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0,0,0,0.06);
}
.cg-cp__brand-mark img { width: 100%; height: 100%; object-fit: contain; padding: 5px; box-sizing: border-box; }
.cg-cp__brand-name {
  font-family: 'Cormorant Garamond', 'Playfair Display', serif;
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #1a1409;
}
.cg-cp__close {
  width: 44px; height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(140, 110, 40, 0.2);
  color: #5c4a1f;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.18s, color 0.18s, transform 0.12s, border-color 0.18s;
}
.cg-cp__close:hover { background: #fff; color: #1a1409; border-color: rgba(140, 110, 40, 0.4); }
.cg-cp__close:active { transform: scale(0.94); }

.cg-cp__body { display: flex; flex-direction: column; gap: 22px; }

/* Hero */
.cg-cp__hero {
  text-align: center;
  padding: 28px 16px 24px;
  background: linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.0) 100%);
  border-radius: 18px;
  border: 1px solid rgba(140, 110, 40, 0.10);
}
.cg-cp__hero-label {
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: #6b5419;
  margin: 0 0 6px;
}
.cg-cp__hero-value {
  font-family: 'Cormorant Garamond', 'Playfair Display', serif;
  font-size: clamp(3rem, 7vw, 5.2rem);
  font-weight: 600;
  color: #8a6209;
  text-shadow: 0 4px 30px rgba(184, 134, 11, 0.35);
  line-height: 1;
  margin: 4px 0 8px;
  letter-spacing: -0.01em;
}
.cg-cp__hero-sub { font-size: 1.1rem; color: #2a2117; margin: 0; }
.cg-cp__hero-meta { font-size: 0.86rem; color: rgba(28, 24, 20, 0.6); margin: 4px 0 0; }

/* Compare */
.cg-cp__compare {
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(140, 110, 40, 0.14);
  border-radius: 18px;
  padding: 20px 22px;
}
.cg-cp__compare-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}
.cg-cp__compare-title {
  margin: 0;
  font-family: 'Cormorant Garamond', 'Playfair Display', serif;
  font-size: 1.4rem;
  font-weight: 600;
  color: #1a1409;
}
.cg-cp__city-pick { display: flex; align-items: center; gap: 8px; }
.cg-cp__city-label { font-size: 0.85rem; color: #5c4a1f; }
.cg-cp__city-select {
  padding: 8px 12px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid rgba(140, 110, 40, 0.3);
  color: #1a1409;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}
.cg-cp__city-select:focus { outline: 2px solid #b8860b; outline-offset: 1px; }

.cg-cp__compare-grid {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: stretch;
  gap: 14px;
}
.cg-cp__pillar {
  text-align: center;
  padding: 18px 16px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid rgba(140, 110, 40, 0.18);
}
.cg-cp__pillar--ours {
  background: linear-gradient(135deg, #fff4d1 0%, #fff 100%);
  border-color: rgba(184, 134, 11, 0.5);
  box-shadow: 0 6px 24px rgba(184, 134, 11, 0.12);
}
.cg-cp__pillar-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #6b5419;
}
.cg-cp__pillar-value {
  font-family: 'Cormorant Garamond', 'Playfair Display', serif;
  font-size: clamp(1.8rem, 3.5vw, 2.4rem);
  font-weight: 600;
  margin: 6px 0 4px;
  color: #8a6209;
  line-height: 1.05;
}
.cg-cp__pillar--market .cg-cp__pillar-value { color: #4a3d20; }
.cg-cp__pillar-sub {
  font-size: 0.8rem;
  color: rgba(28, 24, 20, 0.6);
}

.cg-cp__vs {
  align-self: center;
  font-family: 'Cormorant Garamond', 'Playfair Display', serif;
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: rgba(28, 24, 20, 0.35);
}

.cg-cp__advantage {
  margin-top: 14px;
  padding: 12px 18px;
  border-radius: 12px;
  font-size: 0.95rem;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}
.cg-cp__advantage--good {
  background: rgba(30, 107, 79, 0.10);
  color: #1e6b4f;
  border: 1px solid rgba(30, 107, 79, 0.35);
}
.cg-cp__advantage--bad {
  background: rgba(155, 58, 58, 0.10);
  color: #9b3a3a;
  border: 1px solid rgba(155, 58, 58, 0.35);
}
.cg-cp__advantage-pct {
  font-family: 'Cormorant Garamond', 'Playfair Display', serif;
  font-size: 1.5rem;
  font-weight: 700;
}
.cg-cp__compare-foot {
  margin: 12px 0 0;
  font-size: 0.78rem;
  color: rgba(28, 24, 20, 0.55);
  text-align: center;
}
.cg-cp__err {
  margin: 12px 0 0;
  font-size: 0.85rem;
  color: #9b3a3a;
  text-align: center;
}

/* Footer */
.cg-cp__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(140, 110, 40, 0.14);
}
.cg-cp__footer-note {
  font-size: 0.8rem;
  color: rgba(28, 24, 20, 0.6);
}
.cg-cp__back {
  padding: 10px 22px;
  border-radius: 999px;
  border: 1px solid rgba(140, 110, 40, 0.45);
  background: linear-gradient(135deg, #d4ac0e, #b8860b);
  color: #1a1409;
  font-size: 0.92rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(184, 134, 11, 0.3);
  transition: transform 0.12s, box-shadow 0.18s;
}
.cg-cp__back:hover { box-shadow: 0 6px 24px rgba(184, 134, 11, 0.4); }
.cg-cp__back:active { transform: scale(0.97); }
.cg-cp__back:focus-visible { outline: 2px solid #1a1409; outline-offset: 2px; }

/* Mobile */
@media (max-width: 720px) {
  .cg-cp { padding: 0; align-items: stretch; }
  .cg-cp__sheet {
    border-radius: 0;
    max-width: none;
    padding: max(20px, env(safe-area-inset-top)) 18px max(20px, env(safe-area-inset-bottom));
    box-shadow: none;
    border: none;
    background: rgba(255, 252, 244, 0.94);
    min-height: 100dvh;
  }
  .cg-cp__hero-value { font-size: clamp(2.6rem, 14vw, 4rem); }
  .cg-cp__compare-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .cg-cp__vs {
    transform: rotate(90deg);
    align-self: center;
    justify-self: center;
    padding: 4px 0;
  }
  .cg-cp__compare-head { flex-direction: column; align-items: stretch; }
  .cg-cp__city-pick { justify-content: space-between; }
  .cg-cp__city-select { flex: 1; }
}
`;
