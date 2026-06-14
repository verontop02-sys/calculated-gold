import { useEffect, useMemo, useState } from 'react';
import { SettingsPanel } from './SettingsPanel.jsx';
import { api } from './api.js';
import { calculateBuybackRange, mergeSettings } from './calc.js';

/**
 * Двухколоночный layout раздела «Настройки и доступы».
 * Справа — «живое превью»: при настройках, заданных в SettingsPanel,
 * за 5 г пробы 585 клиент получит столько-то — обновляется на лету.
 */
export function SettingsPage({ user, formatMoney, price }) {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    let alive = true;
    api.settings()
      .then((s) => { if (alive) setSettings(mergeSettings(s)); })
      .catch(() => { if (alive) setSettings(mergeSettings(null)); });
    function onSaved(e) {
      if (e?.detail?.settings) setSettings(mergeSettings(e.detail.settings));
    }
    window.addEventListener('cg:settings-saved', onSaved);
    return () => {
      alive = false;
      window.removeEventListener('cg:settings-saved', onSaved);
    };
  }, []);

  const goldRub = price?.goldRubPerGram;
  const buyPct = settings?.buybackPercentOfScrap ?? null;
  const halfPct = settings?.rangeHalfWidthPercent ?? null;

  const examples = useMemo(() => {
    if (!settings || !Number.isFinite(goldRub)) return null;
    const cases = [
      { weight: 5, purity: 585, label: '5 г · 585' },
      { weight: 10, purity: 750, label: '10 г · 750' },
      { weight: 3, purity: 999, label: '3 г · 999' },
    ];
    return cases.map((c) => {
      const r = calculateBuybackRange({
        weightGrams: c.weight,
        purityPerThousand: c.purity,
        goldRubPerGram: goldRub,
        settings,
      });
      return { ...c, r };
    });
  }, [settings, goldRub]);

  const helperBuy = buyPct != null ? Math.round(buyPct * 100) / 100 : null;

  return (
    <div className="cg-page">
      <div className="cg-page__main">
        <SettingsPanel user={user} />
      </div>

      <aside className="cg-page__side cg-stagger">
        <div className="cg-side-card cg-side-card--accent">
          <div className="cg-side-card__label">Текущая политика</div>
          <div className="cg-side-card__value mono-nums" style={{ fontSize: '1.7rem' }}>
            {helperBuy != null ? `${helperBuy}%` : '—'}
            <span className="cg-side-card__per">от биржи</span>
          </div>
          <div className="cg-side-card__sub">
            {halfPct != null ? `Коридор ±${halfPct}% от ориентира` : '—'}
          </div>
        </div>

        <div className="cg-side-card">
          <div className="cg-side-card__head">
            <span className="cg-side-card__title">Живое превью</span>
          </div>
          {goldRub == null ? (
            <div className="cg-side-card__sub">Курс недоступен — превью появится после загрузки котировки.</div>
          ) : examples ? (
            <div className="cg-side-card__rows">
              {examples.map((ex, i) => (
                <div key={i} className="cg-side-row">
                  <span className="cg-side-row__k">{ex.label}</span>
                  <span className="cg-side-row__v tone-gold">
                    {ex.r?.ok ? formatMoney(Math.round(ex.r.midRub)) : '—'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="cg-side-card__rows">
              {[0,1,2].map((i) => (
                <div key={i} className="cg-side-row">
                  <span className="cg-side-row__k">
                    <span aria-hidden style={{ display: 'inline-block', width: 90, height: 12, borderRadius: 4, background: 'linear-gradient(90deg, var(--stroke-soft) 0%, var(--stroke) 50%, var(--stroke-soft) 100%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease infinite' }} />
                  </span>
                  <span className="cg-side-row__v">
                    <span aria-hidden style={{ display: 'inline-block', width: 70, height: 12, borderRadius: 4, background: 'linear-gradient(90deg, var(--stroke-soft) 0%, var(--stroke) 50%, var(--stroke-soft) 100%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease infinite' }} />
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="cg-side-card__sub" style={{ marginTop: 10 }}>
            Это сумма-ориентир при текущем курсе {goldRub != null ? formatMoney(goldRub) : '—'} / г и заданной политике.
          </div>
        </div>

        <div className="cg-side-card cg-side-card--emerald cg-side-card--hint">
          <div className="cg-side-card__hint-icon" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h4l3-8 4 16 3-8h4" />
            </svg>
          </div>
          <div>
            <div className="cg-side-card__title">Что значит «коридор»</div>
            <p className="cg-side-card__hint-text">
              Полуширина коридора — это допустимый разброс относительно ориентира.
              При коридоре 1% продавец может предложить клиенту цену от <b>−1%</b> до <b>+1%</b> от середины.
            </p>
          </div>
        </div>

        <div className="cg-side-card">
          <div className="cg-side-card__title">Подсказка</div>
          <p className="cg-side-card__hint-text" style={{ marginTop: 8 }}>
            После сохранения политики или поправок изменения мгновенно применяются в калькуляторе и договоре у всех пользователей.
          </p>
        </div>
      </aside>
    </div>
  );
}
