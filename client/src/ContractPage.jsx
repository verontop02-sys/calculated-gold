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
        <div className="cg-side-card cg-side-card--accent">
          <div className="cg-side-card__label">Сумма по позициям</div>
          <div className="cg-side-card__value mono-nums">
            {formatMoney(summary.totalRub)}
          </div>
          <div className="cg-side-card__sub">
            {summary.filledRowsCount > 0
              ? `${pluralRows(summary.filledRowsCount)} из ${summary.rowsCount}`
              : 'Добавьте хотя бы одну позицию'}
          </div>
        </div>

        <div className="cg-side-card">
          <div className="cg-side-card__head">
            <span className="cg-side-card__title">Веса</span>
          </div>
          <div className="cg-side-card__stats">
            <div className="cg-side-stat">
              <span className="cg-side-stat__k">Лом, г</span>
              <span className="cg-side-stat__v">{summary.totalGross ? summary.totalGross.toFixed(2) : '—'}</span>
            </div>
            <div className="cg-side-stat">
              <span className="cg-side-stat__k">Чистый, г</span>
              <span className="cg-side-stat__v tone-gold">{summary.totalNet ? summary.totalNet.toFixed(3) : '—'}</span>
            </div>
          </div>
        </div>

        {price?.goldRubPerGram != null && (
          <div className="cg-side-card">
            <div className="cg-side-card__head">
              <span className="cg-side-card__title">Курс сейчас</span>
            </div>
            <div className="cg-side-card__rows">
              <div className="cg-side-row">
                <span className="cg-side-row__k">Чистое золото</span>
                <span className="cg-side-row__v tone-gold">{formatMoney(price.goldRubPerGram)} / г</span>
              </div>
              <div className="cg-side-row">
                <span className="cg-side-row__k">Источник</span>
                <span className="cg-side-row__v">{quoteSourceLabel(price)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="cg-side-card cg-side-card--emerald cg-side-card--hint">
          <div className="cg-side-card__hint-icon" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              <path d="M7 11l5 5 5-5" />
              <path d="M12 16V4" />
            </svg>
          </div>
          <div>
            <div className="cg-side-card__title">Сохранение PDF</div>
            <p className="cg-side-card__hint-text">
              При нажатии «Сохранить и скачать PDF» договор автоматически попадает в учёт.
              Клиент уже сохранится в базу — позже найдёте его в «Клиенты».
            </p>
          </div>
        </div>
      </aside>
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
