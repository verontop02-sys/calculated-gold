import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useToast } from './ToastContext.jsx';
import { isAdminOrSuperProfile, isSuperAdminRole, isUserManagerRole, roleLabel } from './roles.js';
import { SkeletonCard, SkeletonRow } from './Skeleton.jsx';
import { EmptyState } from './EmptyState.jsx';
import { PageHint } from './PageHint.jsx';

const ROLES_STAFF_FULL = ['courier', 'seller', 'admin', 'super_admin'];
const ROLES_FIELD_ONLY = ['courier', 'seller'];

export function SettingsPanel({ user }) {
  const toast = useToast();
  const isSuper = isSuperAdminRole(user?.role);
  const rolesForPicker = isSuper ? ROLES_STAFF_FULL : ROLES_FIELD_ONLY;
  const [settings, setSettings] = useState(null);
  const [users, setUsers] = useState([]);
  const [usersNote, setUsersNote] = useState('');
  const [userListStatus, setUserListStatus] = useState('loading');
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'courier' });
  const [saving, setSaving] = useState(false);
  const [savedSection, setSavedSection] = useState(null);
  const [err, setErr] = useState('');
  const [confirmDeleteUid, setConfirmDeleteUid] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [changingRoleUid, setChangingRoleUid] = useState(null);
  const [roleChangeBusy, setRoleChangeBusy] = useState(null);
  /** String drafts so users can clear fields and type new numbers (parseFloat('')||0 was snapping to 0). */
  const [buybackStr, setBuybackStr] = useState('');
  const [rangeStr, setRangeStr] = useState('');
  const [adjStr, setAdjStr] = useState(null);
  const [fieldLog, setFieldLog] = useState(null);
  const [fieldLogErr, setFieldLogErr] = useState('');

  const canManageUsers = userListStatus === 'ok';

  useEffect(() => {
    if (!isUserManagerRole(user?.role)) return;
    let alive = true;
    api
      .fieldDealSessions({ limit: 35 })
      .then((d) => {
        if (!alive) return;
        setFieldLog(d);
        setFieldLogErr('');
      })
      .catch((e) => {
        if (!alive) return;
        setFieldLog(null);
        setFieldLogErr(e?.message || 'Не удалось загрузить журнал');
      });
    return () => {
      alive = false;
    };
  }, [user?.role]);

  function canManageRow(u) {
    return isSuper || !isAdminOrSuperProfile(u.role);
  }

  const load = useCallback(async () => {
    setUsersNote('');
    setErr('');
    if (isSuper) {
      try {
        const s = await api.settings();
        setSettings(s);
      } catch (e) {
        setErr(e?.message || 'Не удалось загрузить настройки');
        setSettings(null);
        setUserListStatus('error');
        return;
      }
    }
    setUserListStatus('loading');
    try {
      const u = await api.users();
      setUsers(u);
      setUserListStatus('ok');
    } catch {
      setUsers([]);
      setUserListStatus('error');
      setUsersNote(
        'Список пользователей недоступен: API не отвечает или нет прав. Проверьте, что Node API доступен и в Supabase выполнена миграция.'
      );
    }
  }, [isSuper]);

  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  useEffect(() => {
    if (!settings) return;
    setBuybackStr(String(settings.buybackPercentOfScrap ?? ''));
    setRangeStr(String(settings.rangeHalfWidthPercent ?? ''));
    const o = {};
    for (const p of (settings.purityOrder || []).map(String)) {
      o[p] = String(settings.purityAdjustments[p] ?? 0);
    }
    setAdjStr(o);
  }, [settings]);

  function parseNum(raw, fallback = 0) {
    const n = parseFloat(String(raw ?? '').trim().replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }

  async function save(section) {
    if (!isSuper || !settings) return;
    setErr('');
    setSaving(true);
    setSavedSection(null);
    try {
      const probsKeys = (settings.purityOrder || []).map(String);
      const purityAdjustments = { ...settings.purityAdjustments };
      for (const p of probsKeys) {
        const raw = adjStr?.[p];
        purityAdjustments[p] = parseNum(raw, 0);
      }
      const patch = {
        buybackPercentOfScrap: parseNum(buybackStr, 0),
        rangeHalfWidthPercent: parseNum(rangeStr, 0),
        purityAdjustments,
      };
      const next = await api.saveSettings(patch);
      setSettings(next);
      window.dispatchEvent(new CustomEvent('cg:settings-saved', { detail: { settings: next } }));
      setSavedSection(section);
      toast('Настройки сохранены', 'success');
      setTimeout(() => setSavedSection(null), 2500);
    } catch (e) {
      setErr(e.message);
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function addUser(e) {
    e.preventDefault();
    if (!canManageUsers) {
      setErr(usersNote || 'Список пользователей не загружен.');
      return;
    }
    setErr('');
    try {
      await api.createUser(newUser.email, newUser.password, newUser.role);
      setNewUser({ email: '', password: '', role: 'courier' });
      await load();
      toast('Пользователь создан', 'success');
    } catch (ex) {
      setErr(ex.message);
      toast(ex.message, 'error');
    }
  }

  async function applyRoleChange(uid, newRole) {
    setRoleChangeBusy(uid);
    setErr('');
    try {
      await api.changeRole(uid, newRole);
      setUsers((prev) => prev.map((u) => u.uid === uid ? { ...u, role: newRole } : u));
      setChangingRoleUid(null);
      toast('Роль изменена', 'success');
    } catch (ex) {
      setErr(ex.message);
      toast(ex.message, 'error');
    } finally {
      setRoleChangeBusy(null);
    }
  }

  async function confirmDelete(uid) {
    if (!canManageUsers) return;
    setConfirmDeleteUid(null);
    setDeleting(true);
    setErr('');
    try {
      await api.deleteUser(uid);
      await load();
      toast('Пользователь удалён', 'success');
    } catch (ex) {
      setErr(ex.message);
      toast(ex.message, 'error');
    } finally {
      setDeleting(false);
    }
  }

  if (isSuper && !settings) {
    if (err) {
      return (
        <div className="settings settings-boot st-block">
          <div style={{ textAlign: 'center' }}>
            <p className="err-msg" style={{ marginBottom: 16 }}>{err}</p>
            <button type="button" className="btn-ghost" onClick={() => load()}>Повторить</button>
          </div>
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SkeletonCard rows={3} />
        <SkeletonCard rows={5} />
        <SkeletonCard rows={3} />
      </div>
    );
  }

  if (!isSuper && userListStatus === 'loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SkeletonCard rows={2} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} leftWidth="55%" rightWidth="25%" withAvatar />
          ))}
        </div>
      </div>
    );
  }

  const probs = isSuper && settings
    ? (() => {
        const nums = [...new Set((settings.purityOrder || []).map((p) => Number(p)).filter((p) => Number.isFinite(p)))];
        if (!nums.includes(900)) {
          const idx875 = nums.indexOf(875);
          if (idx875 >= 0) nums.splice(idx875 + 1, 0, 900);
          else nums.push(900);
        }
        return nums.map(String);
      })()
    : [];

  return (
    <div className="settings">
      <PageHint id="settings" title="Настройки и доступы">
        {isSuper
          ? 'Политика выкупа и поправки по пробам применяются у всех мгновенно. Здесь же управление пользователями и ролями.'
          : 'Создавайте курьеров и продавцов и управляйте их доступом. Политика выкупа настраивается супер-администратором.'}
      </PageHint>
      {isSuper && settings && (
        <>
          <div className="st-block st-in" style={{ '--d': '0ms' }}>
            <div className="st-block-head">
              <span className="st-icon st-icon--accent" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </span>
              <h2 className="block-title">Политика выкупа</h2>
            </div>
            <p className="muted small block-desc">
              Процент от стоимости чистого золота по курсу в верхней панели. Коридор — симметричный разброс вокруг ориентира.
            </p>
            <label className="field">
              <span className="field-label">Выкуп, % от биржевой стоимости</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={buybackStr}
                onChange={(e) => { setSavedSection(null); setBuybackStr(e.target.value); }}
                onBlur={() => {
                  const n = parseNum(buybackStr, 0);
                  setBuybackStr(String(n));
                  setSettings((s) => ({ ...s, buybackPercentOfScrap: Math.min(100, Math.max(0, n)) }));
                }}
              />
            </label>
            <label className="field">
              <span className="field-label">Полуширина коридора, %</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={rangeStr}
                onChange={(e) => { setSavedSection(null); setRangeStr(e.target.value); }}
                onBlur={() => {
                  const n = parseNum(rangeStr, 0);
                  setRangeStr(String(n));
                  setSettings((s) => ({ ...s, rangeHalfWidthPercent: Math.min(50, Math.max(0, n)) }));
                }}
              />
            </label>
            <button
              type="button"
              className={`btn-primary save-btn${savedSection === 'policy' ? ' save-btn--ok' : ''}`}
              disabled={saving}
              onClick={() => save('policy')}
            >
              {saving ? <><span className="spinner inline" /> Сохранение…</> : savedSection === 'policy' ? '✓ Сохранено' : 'Сохранить политику'}
            </button>
          </div>

          <div className="st-block st-in" style={{ '--d': '60ms' }}>
            <div className="st-block-head">
              <span className="st-icon st-icon--emerald" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 17l-6.3 4.4L8 14 2 9.4h7.6z"/></svg>
              </span>
              <h2 className="block-title">Поправки по пробам, %</h2>
            </div>
            <p className="muted small block-desc">Дополнительный множитель к сумме: +2 означает +2% к расчёту для этой пробы.</p>
            <div className="grid-adj">
              {probs.map((p) => (
                <label key={p} className="adj-cell">
                  <span className="prob">{p}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={adjStr?.[p] ?? String(settings.purityAdjustments[p] ?? 0)}
                    onChange={(e) => {
                      setSavedSection(null);
                      setAdjStr((prev) => ({ ...(prev || {}), [p]: e.target.value }));
                    }}
                    onBlur={() => {
                      const n = parseNum(adjStr?.[p], 0);
                      setAdjStr((prev) => ({ ...(prev || {}), [p]: String(n) }));
                      setSettings((s) => ({
                        ...s,
                        purityAdjustments: { ...s.purityAdjustments, [p]: n },
                      }));
                    }}
                  />
                </label>
              ))}
            </div>
            <button type="button" className={`btn-primary save-btn${savedSection === 'adj' ? ' save-btn--ok' : ''}`} style={{ marginTop: 14 }} disabled={saving} onClick={() => save('adj')}>
              {saving ? <><span className="spinner inline" /> Сохранение…</> : savedSection === 'adj' ? '✓ Сохранено' : 'Сохранить пробы'}
            </button>
          </div>
        </>
      )}

      {/* Доступы */}
      <div className="st-block st-in" style={{ '--d': '120ms' }}>
        <div className="st-block-head">
          <span className="st-icon st-icon--accent" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </span>
          <h2 className="block-title">Доступы</h2>
        </div>
        <p className="muted small block-desc">
          {isSuper ? (
            <>
              <strong>Супер-администраторов</strong> может быть несколько: добавьте пользователя с ролью «Супер-администратор» или смените роль существующему (как у вас сейчас). Первый вход в пустой проект сам получает супер-роль; дальше — только так. Полный доступ: политика выкупа, пробы, все роли (курс «Обновить сейчас» — у любого вошедшего).{' '}
            </>
          ) : (
            <>
              <strong>Администратор</strong> — как курьер в панели (калькулятор и курс, в том числе «Обновить сейчас»), плюс только этот блок: создание курьеров и продавцов. Политика выкупа и пробы — у супер-администратора.{' '}
            </>
          )}
          <strong>Продавец</strong> и <strong>курьер</strong> видят только калькулятор.
        </p>
        {usersNote && <p className="users-note muted small block-desc">{usersNote}</p>}

        {userListStatus === 'loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonRow key={i} leftWidth="55%" rightWidth="25%" withAvatar />
            ))}
          </div>
        )}

        {users.length === 0 && userListStatus !== 'loading' && (
          <EmptyState
            compact
            icon="users"
            title="Пока вы здесь один"
            description="Создайте первого курьера или продавца ниже — он сможет оформлять выкупы и заходить в систему по своей почте."
          />
        )}
        {users.length > 0 && (
          <ul className="user-list">
            {users.map((u) => (
              <li key={u.uid} className="user-row">
                <div className="user-info">
                  <strong className="user-email">{u.email}</strong>
                  {changingRoleUid === u.uid ? (
                    <span className="role-change-row">
                      {rolesForPicker.map((r) => (
                        <button
                          key={r}
                          type="button"
                          className={`role-chip${u.role === r ? ' role-chip--active' : ''}`}
                          disabled={roleChangeBusy === u.uid}
                          onClick={() => u.role !== r && applyRoleChange(u.uid, r)}
                        >
                          {roleChangeBusy === u.uid && u.role !== r
                            ? <span className="spinner inline" style={{ width: '0.7em', height: '0.7em', borderWidth: '1.5px' }} />
                            : roleLabel(r)}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="btn-ghost small"
                        style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                        onClick={() => setChangingRoleUid(null)}
                      >
                        ✕
                      </button>
                    </span>
                  ) : canManageRow(u) ? (
                    <button
                      type="button"
                      className="role-badge-btn muted small"
                      title="Нажмите, чтобы изменить роль"
                      disabled={!canManageUsers}
                      onClick={() => setChangingRoleUid(u.uid)}
                    >
                      {roleLabel(u.role)} ✎
                    </button>
                  ) : (
                    <span className="muted small" style={{ padding: '3px 0' }} title="Изменение только у супер-администратора">
                      {roleLabel(u.role)}
                    </span>
                  )}
                </div>
                <div className="user-actions">
                  {canManageRow(u) ? (
                    confirmDeleteUid === u.uid ? (
                      <span className="confirm-row">
                        <span className="muted small">Удалить?</span>
                        <button
                          type="button"
                          className="btn-ghost small danger"
                          disabled={deleting}
                          onClick={() => confirmDelete(u.uid)}
                        >
                          {deleting ? <span className="spinner inline" /> : 'Да'}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost small"
                          disabled={deleting}
                          onClick={() => setConfirmDeleteUid(null)}
                        >
                          Нет
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn-ghost small danger"
                        disabled={!canManageUsers || deleting}
                        onClick={() => setConfirmDeleteUid(u.uid)}
                      >
                        Удалить
                      </button>
                    )
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        <form className="new-user" onSubmit={addUser}>
          <input
            placeholder="Email пользователя"
            value={newUser.email}
            onChange={(e) => setNewUser((x) => ({ ...x, email: e.target.value }))}
            disabled={!canManageUsers}
            autoComplete="off"
          />
          <input
            type="password"
            placeholder="Пароль (мин. 6 символов)"
            value={newUser.password}
            onChange={(e) => setNewUser((x) => ({ ...x, password: e.target.value }))}
            disabled={!canManageUsers}
            autoComplete="new-password"
          />
          <select
            value={rolesForPicker.includes(newUser.role) ? newUser.role : rolesForPicker[0]}
            onChange={(e) => setNewUser((x) => ({ ...x, role: e.target.value }))}
            disabled={!canManageUsers}
          >
            {rolesForPicker.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary" disabled={!canManageUsers || !newUser.email || !newUser.password}>
            Добавить пользователя
          </button>
        </form>
      </div>

      {isUserManagerRole(user?.role) && (
        <div className="st-block st-in" style={{ '--d': '180ms' }}>
          <div className="st-block-head">
            <span className="st-icon st-icon--accent" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            </span>
            <h2 className="block-title">Подтверждения по СМС (поле)</h2>
          </div>
          <p className="muted small block-desc">
            Сессии со ссылкой для клиента: после ввода кода сделка попадает в «Сделки» и аналитику. Отменить можно только
            ожидающую сессию.
          </p>
          {fieldLogErr && <p className="muted small">{fieldLogErr}</p>}
          {fieldLog?.rows?.length > 0 && (
            <div className="cg-table-wrap cg-table-wrap--scroll">
              <table className="cg-table cg-table--compact">
                <thead>
                  <tr>
                    <th>Создано</th>
                    <th className="center">Статус</th>
                    <th className="num">Сумма ₽</th>
                    <th>Кто отправил</th>
                    <th>Сделка</th>
                    <th className="center" />
                  </tr>
                </thead>
                <tbody>
                  {fieldLog.rows.map((r) => {
                    const statusBadge =
                      r.status === 'confirmed' ? 'ok' : r.status === 'pending' ? 'gold' : r.status === 'cancelled' ? 'danger' : '';
                    return (
                      <tr key={r.id}>
                        <td className="num">{new Date(r.created_at).toLocaleString('ru-RU')}</td>
                        <td className="center">
                          {statusBadge ? <span className={`badge ${statusBadge}`}>{r.status}</span> : r.status}
                        </td>
                        <td className="num">{r.total_rub}</td>
                        <td>{r.creator_email || '—'}</td>
                        <td className="num">{r.scrap_deal_id ? `${String(r.scrap_deal_id).slice(0, 8)}…` : '—'}</td>
                        <td className="center">
                          {r.status === 'pending' ? (
                            <button
                              type="button"
                              className="btn-ghost small"
                              onClick={async () => {
                                try {
                                  await api.fieldDealSessionCancel(r.id);
                                  toast?.('Сессия отменена', 'success');
                                  const d = await api.fieldDealSessions({ limit: 35 });
                                  setFieldLog(d);
                                } catch (e) {
                                  toast?.(e?.message || 'Не удалось отменить', 'error');
                                }
                              }}
                            >
                              Отменить
                            </button>
                          ) : (
                            ''
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {fieldLog && (!fieldLog.rows || fieldLog.rows.length === 0) && !fieldLogErr && (
            <EmptyState
              compact
              icon="history"
              title="Сессий ещё не было"
              description="Сюда попадают истории подтверждения сделок курьерами по SMS-коду."
            />
          )}
        </div>
      )}

      {err && <p className="err-msg">{err}</p>}

      <style>{`
        .settings { display: flex; flex-direction: column; gap: 16px; }
        .settings-boot { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 48px 24px; text-align: center; }

        /* Entrance — только opacity + transform (GPU, без репейнтов) */
        .st-in {
          animation: stIn 440ms cubic-bezier(0.22,1,0.36,1) both;
          animation-delay: var(--d, 0ms);
          will-change: transform, opacity;
        }
        @keyframes stIn {
          from { opacity: 0; transform: translate3d(0,14px,0); }
          to { opacity: 1; transform: translate3d(0,0,0); }
        }

        /* Block card */
        .st-block {
          background: var(--bg-panel-solid);
          border: 1px solid var(--stroke-soft);
          border-radius: 18px;
          padding: 22px 20px;
          min-width: 0;
        }
        .st-block-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
        .st-icon {
          width: 38px; height: 38px; border-radius: 11px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .st-icon--accent { background: var(--accent-soft); color: var(--accent); }
        .st-icon--emerald { background: var(--emerald-soft); color: var(--emerald); }
        .block-title { font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; margin: 0; letter-spacing: -0.01em; color: var(--text-strong); }
        .block-desc { margin: 0 0 18px; line-height: 1.5; font-size: 0.84rem; color: var(--text-muted); }
        .block-desc strong { color: var(--accent); font-weight: 600; }
        .users-note { color: var(--warn-text) !important; background: var(--warn-bg); padding: 10px 12px; border-radius: 12px; border: 1px solid var(--warn-border); }

        /* Fields */
        .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .field-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); font-weight: 600; }
        .settings .field input,
        .settings .new-user input,
        .settings .new-user select,
        .adj-cell input {
          padding: 11px 13px; border-radius: 11px; border: 1px solid var(--stroke-soft);
          background: var(--bg-elevated); color: var(--text); font-family: inherit; font-size: 0.9rem;
          transition: border-color 180ms, box-shadow 180ms;
        }
        .settings .field input:focus,
        .settings .new-user input:focus,
        .settings .new-user select:focus,
        .adj-cell input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

        /* Save button */
        .save-btn { width: 100%; transition: background 0.3s, box-shadow 0.3s, color 0.2s, transform 0.18s; }
        .save-btn--ok { background: linear-gradient(135deg, var(--emerald) 0%, var(--emerald-strong) 100%) !important; color: #fff !important; box-shadow: 0 4px 20px var(--emerald-soft) !important; }

        /* Probe adjustments grid */
        .grid-adj { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        @media (min-width: 480px) { .grid-adj { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 720px) { .grid-adj { grid-template-columns: repeat(4, 1fr); } }
        .adj-cell { display: flex; flex-direction: column; gap: 5px; }
        .adj-cell .prob { font-size: 0.74rem; color: var(--accent); font-weight: 700; }
        .adj-cell input { text-align: center; }

        /* User list */
        .user-list { list-style: none; margin: 0 0 16px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
        .user-row {
          display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
          padding: 12px 14px; border-radius: 12px;
          border: 1px solid var(--stroke-soft); background: var(--bg-elevated);
          transition: box-shadow 200ms;
        }
        .user-row:hover { box-shadow: var(--shadow-pop); }
        .user-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
        .user-email { word-break: break-all; font-size: 0.88rem; font-weight: 600; }
        .user-actions { flex-shrink: 0; display: flex; align-items: flex-start; }
        .role-badge-btn { background: none; border: 1px dashed var(--stroke); border-radius: 999px; padding: 4px 12px; font-size: 0.74rem; cursor: pointer; transition: border-color 0.2s, color 0.2s; text-align: left; }
        .role-badge-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .role-badge-btn:disabled { opacity: 0.5; cursor: default; }
        .role-change-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
        .role-chip { padding: 5px 12px; border-radius: 999px; font-size: 0.74rem; font-weight: 600; border: 1px solid var(--stroke-soft); background: transparent; color: var(--text-muted); cursor: pointer; transition: all 0.16s; }
        .role-chip:hover:not(:disabled):not(.role-chip--active) { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
        .role-chip--active { background: var(--accent); color: #fff; border-color: var(--accent); font-weight: 700; cursor: default; }
        .confirm-row { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .btn-ghost.danger { color: var(--crimson); }
        .btn-ghost.small { padding: 7px 12px; font-size: 0.8rem; }
        .new-user { display: flex; flex-direction: column; gap: 10px; }

        .err-msg { color: var(--crimson); font-size: 0.88rem; margin: 12px 0 0; text-align: center; padding: 11px 14px; border-radius: 12px; background: var(--crimson-soft); border: 1px solid var(--crimson); }
        @media (max-width: 400px) {
          .user-row { flex-direction: column; align-items: stretch; }
          .user-actions { justify-content: flex-start; }
          .confirm-row { justify-content: flex-start; }
        }
      `}</style>
    </div>
  );
}
