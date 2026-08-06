import { useEffect, useState } from 'react';
import { setShowInstructions } from './Profile.jsx';

const STEPS = [
  {
    title: 'Добро пожаловать в REAKTIVO PRO',
    text: 'Это рабочая панель оценки и выкупа золота. Покажем за минуту, где что находится.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 17l-6.3 4.4L8 14 2 9.4h7.6z"/></svg>
    ),
  },
  {
    title: 'Дашборд и калькулятор',
    text: 'На дашборде — живой курс золота, ключевые показатели и последние сделки. В калькуляторе быстро считаете выкуп по весу и пробе, затем переходите в договор.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
    ),
  },
  {
    title: 'Договор и фото изделия',
    text: 'Заполняете позиции лома, при необходимости прикладываете фото изделия. После «Скачать PDF» сделка автоматически попадает в учёт, а клиент — в базу.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>
    ),
  },
  {
    title: 'Аналитика и AI-аналитик',
    text: 'В аналитике — обороты, графики и крупнейшие сделки. Строка AI Grok подскажет выводы и прогнозы по выбранному периоду.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>
    ),
  },
  {
    title: 'Ваш профиль',
    text: 'Нажмите на своё имя слева внизу (или на иконку в меню на телефоне) — там ваша статистика, сделки и настройки. Эти подсказки можно включить снова в профиле.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    ),
  },
];

export function Instructions({ open, onClose }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function finish() {
    onClose?.();
  }
  function dontShowAgain() {
    setShowInstructions(false);
    onClose?.();
  }

  return (
    <div className="in-overlay" role="dialog" aria-modal="true" aria-label="Инструкции">
      <div className="in-modal">
        <button type="button" className="in-skip" onClick={dontShowAgain}>Пропустить</button>

        <div className="in-icon" key={step}>{s.icon}</div>
        <h2 className="in-title" key={`t${step}`}>{s.title}</h2>
        <p className="in-text" key={`x${step}`}>{s.text}</p>

        <div className="in-dots" role="tablist" aria-label="Шаги">
          {STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`in-dot${i === step ? ' in-dot--active' : ''}`}
              onClick={() => setStep(i)}
              aria-label={`Шаг ${i + 1}`}
            />
          ))}
        </div>

        <div className="in-actions">
          {step > 0 ? (
            <button type="button" className="in-btn in-btn--ghost" onClick={() => setStep((v) => v - 1)}>Назад</button>
          ) : (
            <button type="button" className="in-btn in-btn--ghost" onClick={dontShowAgain}>Больше не показывать</button>
          )}
          {isLast ? (
            <button type="button" className="in-btn in-btn--accent" onClick={finish}>Начать работу</button>
          ) : (
            <button type="button" className="in-btn in-btn--accent" onClick={() => setStep((v) => v + 1)}>Далее</button>
          )}
        </div>
      </div>

      <style>{`
        .in-overlay {
          position: fixed; inset: 0; z-index: 110;
          background: rgba(0,0,0,0.6); backdrop-filter: blur(10px);
          display: flex; align-items: center; justify-content: center; padding: 20px;
          animation: inFade 240ms ease both;
        }
        @keyframes inFade { from { opacity: 0; } }
        .in-modal {
          position: relative; width: 100%; max-width: 440px;
          background: var(--bg-panel-solid);
          border: 1px solid var(--stroke-soft);
          border-radius: 24px;
          padding: 40px 28px 24px;
          text-align: center;
          box-shadow: var(--shadow-pop);
          animation: inUp 420ms cubic-bezier(0.22,1,0.36,1) both;
          overflow: hidden;
        }
        .in-modal::before {
          content: ''; position: absolute; top: -100px; left: 50%; transform: translateX(-50%);
          width: 280px; height: 240px; border-radius: 50%;
          background: radial-gradient(ellipse at center, var(--accent-soft), transparent 70%);
          filter: blur(40px); pointer-events: none;
        }
        @keyframes inUp { from { transform: translateY(24px) scale(0.97); opacity: 0; } }
        .in-skip {
          position: absolute; top: 16px; right: 18px; z-index: 2;
          border: none; background: transparent; color: var(--text-muted);
          font-size: 0.8rem; font-weight: 600; cursor: pointer;
          transition: color 160ms;
        }
        .in-skip:hover { color: var(--text); }
        .in-icon {
          position: relative; z-index: 1;
          width: 72px; height: 72px; margin: 0 auto 20px;
          border-radius: 20px; background: var(--accent-soft); color: var(--text-strong);
          display: flex; align-items: center; justify-content: center;
          animation: inPop 500ms cubic-bezier(0.34,1.56,0.64,1) both;
        }
        .in-icon svg { width: 34px; height: 34px; }
        @keyframes inPop { from { transform: scale(0.5); opacity: 0; } }
        .in-title {
          position: relative; z-index: 1;
          font-family: var(--font-display); font-size: 1.3rem; font-weight: 700;
          margin: 0 0 10px; letter-spacing: -0.02em; color: var(--text-strong);
          animation: inFadeUp 420ms cubic-bezier(0.22,1,0.36,1) both;
        }
        .in-text {
          font-size: 0.92rem; line-height: 1.55; color: var(--text-muted);
          margin: 0 0 22px; min-height: 72px;
          animation: inFadeUp 480ms cubic-bezier(0.22,1,0.36,1) both;
        }
        @keyframes inFadeUp { from { transform: translateY(10px); opacity: 0; } }
        .in-dots { display: flex; gap: 7px; justify-content: center; margin-bottom: 22px; }
        .in-dot {
          width: 8px; height: 8px; border-radius: 999px; border: none; padding: 0;
          background: var(--stroke-strong); cursor: pointer;
          transition: all 240ms cubic-bezier(0.22,1,0.36,1);
        }
        .in-dot--active { width: 24px; background: var(--accent); }
        .in-actions { display: flex; gap: 10px; }
        .in-btn {
          flex: 1; padding: 13px; border-radius: 12px; font-size: 0.88rem; font-weight: 600; cursor: pointer;
          transition: all 180ms cubic-bezier(0.22,1,0.36,1);
        }
        .in-btn--ghost { border: 1px solid var(--stroke-soft); background: transparent; color: var(--text-muted); }
        .in-btn--ghost:hover { border-color: var(--text-muted); color: var(--text); }
        .in-btn--accent { border: none; background: var(--accent-grad); color: #fff; box-shadow: 0 4px 16px var(--accent-glow); }
        .in-btn--accent:hover { transform: translateY(-1px); box-shadow: 0 6px 22px var(--accent-glow); }
      `}</style>
    </div>
  );
}
