import { useEffect, useState } from 'react';
import { ContractReceipt } from './ContractReceipt.jsx';

/**
 * Двухколоночный layout для раздела «Договор».
 * Слева — форма ContractReceipt, справа — sticky-сводка по текущему договору
 * (количество позиций, общий вес, итоговая сумма) + памятка.
 */
export function ContractPage({ formatMoney, prefill, onConsumedPrefill, toast, price, user }) {
  const [summary, setSummary] = useState({
    rowsCount: 1,
    filledRowsCount: 0,
    totalRub: 0,
    totalGross: 0,
    totalNet: 0,
  });

  useEffect(() => {
    function onSummary(e) {
      const d = e.detail || {};
      setSummary({
        rowsCount: d.rowsCount ?? 1,
        filledRowsCount: d.filledRowsCount ?? 0,
        totalRub: d.totalRub ?? 0,
        totalGross: d.totalGross ?? 0,
        totalNet: d.totalNet ?? 0,
      });
    }
    window.addEventListener('cg:contract-summary', onSummary);
    return () => window.removeEventListener('cg:contract-summary', onSummary);
  }, []);

  return (
    <div className="cg-page">
      <div className="cg-page__main">
        <ContractReceipt
          formatMoney={formatMoney}
          prefill={prefill}
          onConsumedPrefill={onConsumedPrefill}
          toast={toast}
          price={price}
          user={user}
        />
      </div>

      <aside className="cg-page__side cg-stagger">
        {/* Total payout — accent */}
        <div className="cp-side cp-side--accent">
          <div className="cp-side__label">К выплате</div>
          <div className="cp-side__value mono-nums">
            {summary.totalRub > 0 ? formatMoney(summary.totalRub) : '—'}
          </div>
          <div className="cp-side__sub">
            {summary.filledRowsCount > 0
              ? `${pluralRows(summary.filledRowsCount)} из ${summary.rowsCount}`
              : 'Заполните хотя бы одну позицию'}
          </div>
        </div>

        {/* Weights */}
        <div className="cp-side">
          <div className="cp-side__title">Веса</div>
          <div className="cp-side__rows">
            <div className="cp-side__row">
              <span className="cp-side__k">Лом, г</span>
              <span className="cp-side__v">{summary.totalGross ? summary.totalGross.toFixed(2) : '—'}</span>
            </div>
            <div className="cp-side__row">
              <span className="cp-side__k">Чистое, г</span>
              <span className="cp-side__v cp-side__v--em">{summary.totalNet ? summary.totalNet.toFixed(3) : '—'}</span>
            </div>
          </div>
        </div>

        {/* Gold rate */}
        {price?.goldRubPerGram != null && (
          <div className="cp-side">
            <div className="cp-side__title">Курс сейчас</div>
            <div className="cp-side__rows">
              <div className="cp-side__row">
                <span className="cp-side__k">Чистое золото</span>
                <span className="cp-side__v cp-side__v--em">{formatMoney(price.goldRubPerGram)} / г</span>
              </div>
              <div className="cp-side__row">
                <span className="cp-side__k">Источник</span>
                <span className="cp-side__v">{quoteSourceLabel(price)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Hint */}
        <div className="cp-side cp-side--hint">
          <svg className="cp-side__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            <path d="M7 11l5 5 5-5" />
            <path d="M12 16V4" />
          </svg>
          <div>
            <div className="cp-side__hint-title">Скачать PDF</div>
            <p className="cp-side__hint-text">
              Договор попадёт в учёт автоматически. Клиент добавится в базу — найдёте его в разделе «Клиенты».
            </p>
          </div>
        </div>
      </aside>

      <style>{`
        .cp-side {
          background: var(--bg-panel-solid);
          border: 1px solid var(--stroke-soft);
          border-radius: 18px;
          padding: 18px 16px;
          display: flex;
          flex-direction: column;
          gap: 0;
          transition: box-shadow 240ms;
        }
        .cp-side--accent {
          background: linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 80%, #000) 100%);
          border-color: transparent;
          color: #fff;
        }
        .cp-side__label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; opacity: 0.75; margin-bottom: 6px; }
        .cp-side__value { font-size: clamp(1.4rem, 3vw, 1.8rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
        .cp-side__sub { font-size: 0.78rem; margin-top: 6px; opacity: 0.75; }
        .cp-side__title { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 10px; }
        .cp-side__rows { display: flex; flex-direction: column; gap: 8px; }
        .cp-side__row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
        .cp-side__k { font-size: 0.82rem; color: var(--text-muted); }
        .cp-side__v { font-size: 0.9rem; font-weight: 600; }
        .cp-side__v--em { color: var(--accent); }
        .cp-side--hint { flex-direction: row; gap: 12px; align-items: flex-start; }
        .cp-side__icon { flex-shrink: 0; margin-top: 2px; color: var(--emerald); }
        .cp-side__hint-title { font-size: 0.85rem; font-weight: 700; margin-bottom: 4px; }
        .cp-side__hint-text { font-size: 0.78rem; color: var(--text-muted); line-height: 1.5; margin: 0; }
      `}</style>
    </div>
  );
}

function pluralRows(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${n} позиций`;
  if (mod10 === 1) return `${n} позиция`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} позиции`;
  return `${n} позиций`;
}

function quoteSourceLabel(price) {
  if (!price) return '—';
  if (price.source === 'xaut') return 'XAUT';
  if (price.source === 'moex') return 'Мосбиржа';
  return 'ЦБ РФ';
}
