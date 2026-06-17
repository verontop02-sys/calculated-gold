import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { roleLabel, isSuperAdminRole } from './roles.js';
import { getShowHints, setShowHints, resetDismissedHints } from './PageHint.jsx';

const INSTRUCTIONS_KEY = 'cg_show_instructions';

export function getShowInstructions() {
  try {
    return localStorage.getItem(INSTRUCTIONS_KEY) !== '0';
  } catch {
    return true;
  }
}
export function setShowInstructions(on) {
  try {
    localStorage.setItem(INSTRUCTIONS_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function Profile({ open, onClose, user, formatMoney, onSignOut, onReplayInstructions, onNameChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [instrOn, setInstrOn] = useState(getShowInstructions);
  const [hintsOn, setHintsOn] = useState(getShowHints);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameErr, setNameErr] = useState('');

  const displayName = data?.user?.displayName || null;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setData(null);
    setEditingName(false);
    setNameErr('');
    api
      .profileMe()
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open]);

  // Esc для закрытия
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const toggleInstr = useCallback(() => {
    setInstrOn((v) => {
      const next = !v;
      setShowInstructions(next);
      return next;
    });
  }, []);

  const toggleHints = useCallback(() => {
    setHintsOn((v) => {
      const next = !v;
      setShowHints(next);
      if (next) resetDismissedHints();
      return next;
    });
  }, []);

  async function saveName() {
    setNameErr('');
    const val = nameVal.trim();
    if (val.length > 80) { setNameErr('Максимум 80 символов'); return; }
    setNameBusy(true);
    try {
      await api.updateDisplayName(val || null);
      setData((prev) => prev ? { ...prev, user: { ...prev.user, displayName: val || null } } : prev);
      onNameChange?.(val || null);
      setEditingName(false);
    } catch (e) {
      setNameErr(e?.message || 'Не удалось сохранить');
    } finally {
      setNameBusy(false);
    }
  }

  const stats = data?.stats;
  const recent = data?.recent || [];

  const initials = useMemo(() => {
    const src = displayName || user?.email || '?';
    return src.trim().slice(0, 1).toUpperCase();
  }, [displayName, user?.email]);

  if (!open) return null;

  return (
    <div className="pf-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Профиль">
      <div className="pf-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Шапка */}
        <div className="pf-hero">
          <button type="button" className="pf-close" onClick={onClose} aria-label="Закрыть">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div className="pf-avatar">{initials}</div>
          <div className="pf-id">
            {editingName && isSuperAdminRole(user?.role) ? (
              <div className="pf-name-edit">
                <input
                  className="pf-name-input"
                  value={nameVal}
                  onChange={(e) => setNameVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                  maxLength={80}
                  placeholder="Ваше имя"
                  autoFocus
                  disabled={nameBusy}
                />
                <div className="pf-name-btns">
                  <button type="button" className="pf-name-save" onClick={saveName} disabled={nameBusy}>
                    {nameBusy ? '…' : 'Сохранить'}
                  </button>
                  <button type="button" className="pf-name-cancel" onClick={() => setEditingName(false)} disabled={nameBusy}>
                    Отмена
                  </button>
                </div>
                {nameErr && <span className="pf-name-err">{nameErr}</span>}
              </div>
            ) : (
              <div className="pf-name-row">
                <span className="pf-name">{displayName || user?.email || '—'}</span>
                {isSuperAdminRole(user?.role) && (
                  <button
                    type="button"
                    className="pf-name-pencil"
                    title="Переименовать"
                    onClick={() => { setNameVal(displayName || ''); setEditingName(true); setNameErr(''); }}
                    aria-label="Изменить имя"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                )}
              </div>
            )}
            <div className="pf-email">{user?.email || '—'}</div>
            <span className="pf-role">{roleLabel(user?.role)}</span>
          </div>
          {stats?.firstDealAt && (
            <div className="pf-since">В системе с {fmtDate(stats.firstDealAt)}</div>
          )}
        </div>

        {/* Статистика */}
        <div className="pf-section">
          <div className="pf-section__title">Моя статистика</div>
          {loading ? (
            <div className="pf-skel-grid">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="pf-skel" />)}
            </div>
          ) : (
            <div className="pf-stats">
              <div className="pf-stat pf-stat--accent">
                <span className="pf-stat__label">Оборот</span>
                <span className="pf-stat__value mono-nums">{formatMoney(stats?.totalRub || 0)}</span>
              </div>
              <div className="pf-stat">
                <span className="pf-stat__label">Сделок</span>
                <span className="pf-stat__value mono-nums">{stats?.dealsCount || 0}</span>
              </div>
              <div className="pf-stat">
                <span className="pf-stat__label">Средний чек</span>
                <span className="pf-stat__value mono-nums">{formatMoney(stats?.avg || 0)}</span>
              </div>
              <div className="pf-stat">
                <span className="pf-stat__label">Крупнейшая</span>
                <span className="pf-stat__value mono-nums">{formatMoney(stats?.maxDealRub || 0)}</span>
              </div>
              <div className="pf-stat pf-stat--wide">
                <span className="pf-stat__label">Золота через меня</span>
                <span className="pf-stat__value pf-stat__value--sm mono-nums">
                  {(stats?.totalGross || 0).toFixed(2)} г лом · {(stats?.totalNet || 0).toFixed(3)} г чист.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Последние сделки */}
        <div className="pf-section">
          <div className="pf-section__title">Мои последние сделки</div>
          {loading ? (
            <div className="pf-skel-list">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="pf-skel pf-skel--row" />)}</div>
          ) : recent.length > 0 ? (
            <div className="pf-deals">
              {recent.map((d) => (
                <div key={d.id} className="pf-deal">
                  <div className="pf-deal__main">
                    <span className="pf-deal__name">{d.seller_name || 'Без имени'}</span>
                    <span className="pf-deal__meta">
                      {d.contract_no ? `№ ${d.contract_no}` : 'Договор'} · {fmtDateTime(d.created_at)}
                    </span>
                  </div>
                  <span className="pf-deal__sum mono-nums">{formatMoney(Number(d.total_rub) || 0)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="pf-empty">Сделок пока нет — оформите первый договор.</div>
          )}
        </div>

        {/* Настройки профиля */}
        <div className="pf-section">
          <div className="pf-section__title">Настройки</div>
          <div className="pf-setting">
            <div className="pf-setting__text">
              <div className="pf-setting__name">Подсказки при входе</div>
              <div className="pf-setting__desc">Показывать обучающее окно при следующем входе</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={instrOn}
              className={`pf-switch${instrOn ? ' pf-switch--on' : ''}`}
              onClick={toggleInstr}
            >
              <span className="pf-switch__knob" />
            </button>
          </div>
          <div className="pf-setting">
            <div className="pf-setting__text">
              <div className="pf-setting__name">Подсказки на страницах</div>
              <div className="pf-setting__desc">Краткие пояснения вверху разделов</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={hintsOn}
              className={`pf-switch${hintsOn ? ' pf-switch--on' : ''}`}
              onClick={toggleHints}
            >
              <span className="pf-switch__knob" />
            </button>
          </div>
          {onReplayInstructions && (
            <button type="button" className="pf-link-btn" onClick={() => { onReplayInstructions(); onClose?.(); }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Показать инструкции сейчас
            </button>
          )}
        </div>

        {/* Выход */}
        <button type="button" className="pf-signout" onClick={() => { onSignOut?.(); onClose?.(); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Выйти из системы
        </button>
      </div>

      <style>{`
        .pf-overlay {
          position: fixed; inset: 0; z-index: 95;
          background: rgba(0,0,0,0.5); backdrop-filter: blur(6px);
          display: flex; align-items: stretch; justify-content: flex-end;
          animation: pfFade 240ms ease both;
        }
        @keyframes pfFade { from { opacity: 0; } }
        .pf-drawer {
          width: 100%; max-width: 440px; height: 100%;
          background: var(--bg-panel-solid);
          border-left: 1px solid var(--stroke-soft);
          overflow-y: auto; overflow-x: hidden;
          padding: 0 20px 28px;
          display: flex; flex-direction: column; gap: 18px;
          box-shadow: -16px 0 60px rgba(0,0,0,0.3);
          animation: pfSlide 360ms cubic-bezier(0.22,1,0.36,1) both;
        }
        @keyframes pfSlide { from { transform: translateX(60px); opacity: 0; } }

        /* Hero */
        .pf-hero {
          position: relative; margin: 0 -20px;
          padding: 26px 20px 22px;
          background: linear-gradient(150deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 70%, #000) 100%);
          color: #fff;
          display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center;
        }
        .pf-close {
          position: absolute; top: 14px; right: 14px;
          border: none; background: rgba(255,255,255,0.18); backdrop-filter: blur(4px);
          color: #fff; border-radius: 10px; padding: 7px; cursor: pointer; display: flex;
          transition: background 160ms;
        }
        .pf-close:hover { background: rgba(255,255,255,0.32); }
        .pf-avatar {
          width: 72px; height: 72px; border-radius: 50%;
          background: rgba(255,255,255,0.2); border: 2px solid rgba(255,255,255,0.5);
          display: flex; align-items: center; justify-content: center;
          font-size: 1.9rem; font-weight: 800; font-family: var(--font-display);
        }
        .pf-id { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 100%; }
        .pf-name-row { display: flex; align-items: center; gap: 7px; }
        .pf-name { font-size: 1.1rem; font-weight: 700; line-height: 1.2; }
        .pf-name-pencil {
          border: none; background: rgba(255,255,255,0.18); color: #fff;
          border-radius: 6px; padding: 4px 5px; cursor: pointer; display: flex;
          transition: background 150ms; flex-shrink: 0;
        }
        .pf-name-pencil:hover { background: rgba(255,255,255,0.35); }
        .pf-name-edit { display: flex; flex-direction: column; gap: 7px; width: 100%; max-width: 280px; }
        .pf-name-input {
          width: 100%; padding: 9px 12px; border-radius: 9px;
          border: 1.5px solid rgba(255,255,255,0.5); background: rgba(255,255,255,0.12);
          color: #fff; font-size: 0.96rem; font-weight: 600; text-align: center;
          outline: none; box-sizing: border-box;
          transition: border-color 0.15s, background 0.15s;
        }
        .pf-name-input:focus { border-color: #fff; background: rgba(255,255,255,0.2); }
        .pf-name-input::placeholder { color: rgba(255,255,255,0.5); }
        .pf-name-btns { display: flex; gap: 8px; justify-content: center; }
        .pf-name-save, .pf-name-cancel {
          padding: 7px 16px; border-radius: 8px; font-size: 0.82rem; font-weight: 700; cursor: pointer; border: none; transition: opacity 0.15s;
        }
        .pf-name-save { background: #fff; color: var(--accent); }
        .pf-name-cancel { background: rgba(255,255,255,0.18); color: #fff; }
        .pf-name-save:disabled, .pf-name-cancel:disabled { opacity: 0.5; cursor: not-allowed; }
        .pf-name-err { font-size: 0.76rem; color: #fca5a5; text-align: center; }
        .pf-email { font-size: 0.86rem; opacity: 0.85; word-break: break-all; line-height: 1.2; }
        .pf-role {
          font-size: 0.74rem; font-weight: 600; padding: 3px 12px; border-radius: 999px;
          background: rgba(255,255,255,0.2);
        }
        .pf-since { font-size: 0.74rem; opacity: 0.85; }

        /* Sections */
        .pf-section { display: flex; flex-direction: column; gap: 10px; }
        .pf-section__title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; color: var(--text-muted); }

        /* Stats */
        .pf-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .pf-stat {
          padding: 14px; border-radius: 14px;
          border: 1px solid var(--stroke-soft); background: var(--bg-elevated);
          display: flex; flex-direction: column; gap: 4px;
        }
        .pf-stat--accent { background: linear-gradient(145deg, var(--accent-soft), var(--bg-elevated) 70%); border-color: color-mix(in srgb, var(--accent) 30%, transparent); }
        .pf-stat--wide { grid-column: 1 / -1; }
        .pf-stat__label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 600; }
        .pf-stat__value { font-size: 1.2rem; font-weight: 800; color: var(--text-strong); letter-spacing: -0.02em; font-family: var(--font-display); }
        .pf-stat--accent .pf-stat__value { color: var(--accent); }
        .pf-stat__value--sm { font-size: 0.9rem; }

        /* Deals */
        .pf-deals { display: flex; flex-direction: column; gap: 6px; }
        .pf-deal {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 11px 13px; border-radius: 12px;
          border: 1px solid var(--stroke-soft); background: var(--bg-elevated);
        }
        .pf-deal__main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .pf-deal__name { font-size: 0.86rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pf-deal__meta { font-size: 0.72rem; color: var(--text-muted); }
        .pf-deal__sum { font-size: 0.92rem; font-weight: 700; color: var(--accent); flex-shrink: 0; font-family: var(--font-display); }
        .pf-empty { font-size: 0.84rem; color: var(--text-muted); padding: 8px 0; }

        /* Setting toggle */
        .pf-setting {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 14px; border-radius: 14px;
          border: 1px solid var(--stroke-soft); background: var(--bg-elevated);
        }
        .pf-setting__name { font-size: 0.88rem; font-weight: 600; }
        .pf-setting__desc { font-size: 0.74rem; color: var(--text-muted); margin-top: 2px; }
        .pf-switch {
          flex-shrink: 0; width: 46px; height: 26px; border-radius: 999px;
          border: none; background: var(--stroke-strong); cursor: pointer; position: relative;
          transition: background 220ms cubic-bezier(0.22,1,0.36,1);
        }
        .pf-switch--on { background: var(--accent); }
        .pf-switch__knob {
          position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%;
          background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.25);
          transition: transform 220ms cubic-bezier(0.22,1,0.36,1);
        }
        .pf-switch--on .pf-switch__knob { transform: translateX(20px); }

        .pf-link-btn {
          display: flex; align-items: center; gap: 8px; justify-content: center;
          width: 100%; padding: 11px; border-radius: 12px;
          border: 1px solid var(--stroke-soft); background: transparent;
          color: var(--text-muted); font-size: 0.84rem; font-weight: 600; cursor: pointer;
          transition: all 180ms;
        }
        .pf-link-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }

        .pf-signout {
          margin-top: auto;
          display: flex; align-items: center; gap: 8px; justify-content: center;
          width: 100%; padding: 13px; border-radius: 12px;
          border: 1px solid var(--crimson); background: var(--crimson-soft);
          color: var(--crimson); font-size: 0.88rem; font-weight: 600; cursor: pointer;
          transition: all 180ms;
        }
        .pf-signout:hover { background: var(--crimson); color: #fff; }

        /* Skeletons */
        .pf-skel-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .pf-skel-list { display: flex; flex-direction: column; gap: 6px; }
        .pf-skel { height: 64px; border-radius: 14px; background: var(--surface); animation: pfPulse 1.4s ease infinite; }
        .pf-skel--row { height: 48px; }
        @keyframes pfPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }

        @media (max-width: 480px) {
          .pf-drawer { max-width: 100%; }
        }
      `}</style>
    </div>
  );
}
