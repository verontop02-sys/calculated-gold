import { useEffect, useMemo, useState } from 'react';
import { Calculator } from './Calculator.jsx';
import { ClientPresentation } from './ClientPresentation.jsx';
import { api } from './api.js';
import { calculateBuybackRange, mergeSettings } from './calc.js';

/**
 * Двухколоночный дашборд для калькулятора.
 * Слева — сам Calculator (без изменений).
 * Справа — правая «приборная панель»: курс, политика выкупа, сегодня, подсказки.
 */
export function CalculatorPage({ formatMoney, price, userUid, onGoToContract }) {
  const [settings, setSettings] = useState(null);
  const [todayStats, setTodayStats] = useState(null);
  const [clientView, setClientView] = useState({ open: false, weight: null, purity: null });

  useEffect(() => {
    api.settings().then(setSettings).catch(() => setSettings(null));
    const onSaved = (e) => {
      if (e?.detail?.settings) setSettings(e.detail.settings);
    };
    window.addEventListener('cg:settings-saved', onSaved);
    return () => window.removeEventListener('cg:settings-saved', onSaved);
  }, []);

  useEffect(() => {
    let alive = true;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const iso = `${yyyy}-${mm}-${dd}`;
    api.analyticsSummary?.(iso, iso)
      .then((d) => { if (alive) setTodayStats(d); })
      .catch(() => { if (alive) setTodayStats(null); });
    return () => { alive = false; };
  }, []);

  const buyPct = settings?.buybackPercentOfScrap != null ? Number(settings.buybackPercentOfScrap) : null;
  const corridor = settings?.rangeHalfWidthPercent != null ? Number(settings.rangeHalfWidthPercent) : null;
  const goldRub = price?.goldRubPerGram;
  const buybackRub = goldRub && buyPct ? Math.round(goldRub * (buyPct / 100)) : null;

  // Выкуп за 1 грамм изделия указанной пробы (с учётом политики и поправок по пробе).
  const perGram = useMemo(() => {
    if (!goldRub || !settings) return {};
    const calc = (purity) => {
      const r = calculateBuybackRange({
        weightGrams: 1,
        purityPerThousand: purity,
        goldRubPerGram: goldRub,
        settings: mergeSettings(settings),
      });
      return r.ok ? Math.round(r.midRub) : null;
    };
    return { 585: calc(585), 750: calc(750) };
  }, [goldRub, settings]);

  const todaySum = todayStats?.totals?.sumRub ?? null;
  const todayDeals = todayStats?.totals?.deals ?? null;

  return (
    <div className="cg-page">
      <div className="cg-page__main cg-calc-page__main">
        <Calculator
          formatMoney={formatMoney}
          price={price}
          userUid={userUid}
          onGoToContract={onGoToContract}
          onShowClient={({ weight, purity }) => setClientView({ open: true, weight, purity })}
        />
      </div>

      <aside className="cg-page__side cg-stagger">
        {/* Карточка: ваш выкуп за грамм */}
        <div className="cg-side-card cg-side-card--accent">
          <div className="cg-side-card__label">Ваш выкуп, чистое золото</div>
          <div className="cg-side-card__value mono-nums">
            {buybackRub != null ? formatMoney(buybackRub) : '—'}
            <span className="cg-side-card__per"> / г</span>
          </div>
          <div className="cg-side-card__sub">
            {buyPct != null ? `${buyPct}% от ${goldRub ? formatMoney(goldRub) : '—'} (биржа)` : 'Настройте политику в «Настройки»'}
          </div>

          {/* Выкуп за грамм по ходовым пробам */}
          <div className="cg-pergram">
            <div className="cg-pergram__item">
              <span className="cg-pergram__probe">585</span>
              <span className="cg-pergram__val mono-nums">
                {perGram[585] != null ? formatMoney(perGram[585]) : '—'}
                <span className="cg-pergram__per"> / г</span>
              </span>
            </div>
            <div className="cg-pergram__item">
              <span className="cg-pergram__probe">750</span>
              <span className="cg-pergram__val mono-nums">
                {perGram[750] != null ? formatMoney(perGram[750]) : '—'}
                <span className="cg-pergram__per"> / г</span>
              </span>
            </div>
          </div>
        </div>

        {/* Карточка: политика */}
        <div className="cg-side-card">
          <div className="cg-side-card__head">
            <span className="cg-side-card__title">Политика выкупа</span>
          </div>
          <div className="cg-side-card__rows">
            <div className="cg-side-row">
              <span className="cg-side-row__k">Процент от биржи</span>
              <span className="cg-side-row__v tone-gold">{buyPct != null ? `${buyPct}%` : '—'}</span>
            </div>
            <div className="cg-side-row">
              <span className="cg-side-row__k">Коридор</span>
              <span className="cg-side-row__v">{corridor != null ? `±${corridor}%` : '—'}</span>
            </div>
            <div className="cg-side-row">
              <span className="cg-side-row__k">Источник курса</span>
              <span className="cg-side-row__v">{quoteSourceLabel(price)}</span>
            </div>
          </div>
        </div>

        {/* Карточка: сегодня */}
        {(todayDeals != null || todaySum != null) && (
          <div className="cg-side-card">
            <div className="cg-side-card__head">
              <span className="cg-side-card__title">Сегодня</span>
              <span className="cg-side-card__date small muted">{formatTodayLabel()}</span>
            </div>
            <div className="cg-side-card__stats">
              <div className="cg-side-stat">
                <span className="cg-side-stat__k">Сделок</span>
                <span className="cg-side-stat__v">{todayDeals ?? 0}</span>
              </div>
              <div className="cg-side-stat">
                <span className="cg-side-stat__k">Сумма</span>
                <span className="cg-side-stat__v tone-gold">{todaySum != null ? formatMoney(todaySum) : '—'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Подсказка */}
        <div className="cg-side-card cg-side-card--emerald cg-side-card--hint">
          <div className="cg-side-card__hint-icon" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
          </div>
          <div>
            <div className="cg-side-card__title">Как работает расчёт</div>
            <p className="cg-side-card__hint-text">
              Курс чистого золота × {buyPct ?? 70}% × масса × проба = ориентир.
              Диапазон выкупа ± {corridor ?? 1}% от ориентира.
            </p>
          </div>
        </div>
      </aside>

      <ClientPresentation
        open={clientView.open}
        onClose={() => setClientView((v) => ({ ...v, open: false }))}
        formatMoney={formatMoney}
        price={price}
        weight={clientView.weight}
        purity={clientView.purity}
      />

      <style>{`
        .cg-calc-page__main { max-width: 600px; }
        @media (max-width: 1100px) { .cg-calc-page__main { max-width: none; } }

        .cg-pergram {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid var(--stroke);
        }
        .cg-pergram__item {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 8px 10px;
          border-radius: var(--radius-sm);
          background: var(--bg-panel-solid, rgba(255,255,255,0.5));
          border: 1px solid var(--stroke-soft, var(--stroke));
        }
        .cg-pergram__probe {
          font-size: 0.64rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: var(--text-muted);
        }
        .cg-pergram__val {
          font-size: 0.98rem;
          font-weight: 700;
          color: var(--gold);
          line-height: 1.1;
        }
        .cg-pergram__per { font-size: 0.66rem; color: var(--text-muted); font-weight: 500; }
      `}</style>
    </div>
  );
}

function quoteSourceLabel(price) {
  if (!price) return '—';
  if (price.source === 'xaut') return 'XAUT USD → ЦБ';
  if (price.source === 'moex') return 'Мосбиржа';
  return 'ЦБ РФ';
}

function formatTodayLabel() {
  const d = new Date();
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

