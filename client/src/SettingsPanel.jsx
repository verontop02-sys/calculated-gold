import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useToast } from './ToastContext.jsx';
import { isAdminOrSuperProfile, isSuperAdminRole, isUserManagerRole, roleLabel } from './roles.js';
import { SkeletonCard, SkeletonRow } from './Skeleton.jsx';
import { EmptyState } from './EmptyState.jsx';

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
        <div className="settings settings-boot glass">
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
      {isSuper && settings && (
        <>
          <div className="glass block">
            <h2 className="block-title">Политика выкупа</h2>
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

          <div className="glass block">
            <h2 className="block-title">Поправки по пробам, %</h2>
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
      <div className="glass block">
        <h2 className="block-title">Доступы</h2>
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
        <div className="glass block">
          <h2 className="block-title">Подтверждения по СМС (поле)</h2>
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
        .settings { display: flex; flex-direction: column; gap: 14px; animation: fadeIn 0.35s ease; }
        .settings-boot { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 48px 24px; text-align: center; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .block { padding: 20px 18px 22px; }
        .block-title { font-family: var(--font-display); font-size: 1.25rem; font-weight: 600; margin: 0 0 6px; }
        .block-desc { margin: 0 0 16px; line-height: 1.45; }
        .block-desc strong { color: var(--gold); font-weight: 600; }
        .users-note { color: var(--warn-text) !important; background: var(--warn-bg); padding: 10px 12px; border-radius: var(--radius-sm); border: 1px solid var(--warn-border); }
        .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .field-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
        .save-btn { width: 100%; transition: background 0.3s, box-shadow 0.3s, color 0.2s; }
        .save-btn--ok { background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%) !important; color: #0a1a0e !important; box-shadow: 0 4px 20px rgba(74,222,128,0.35) !important; }
        .grid-adj { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        @media (min-width: 480px) { .grid-adj { grid-template-columns: repeat(3, 1fr); } }
        .adj-cell { display: flex; flex-direction: column; gap: 4px; }
        .adj-cell .prob { font-size: 0.75rem; color: var(--gold); font-weight: 500; }
        .user-list { list-style: none; margin: 0 0 16px; padding: 0; }
        .user-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--stroke); }
        .user-row:last-child { border-bottom: none; }
        .user-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
        .user-email { word-break: break-all; font-size: 0.9rem; }
        .user-actions { flex-shrink: 0; display: flex; align-items: flex-start; }
        .role-badge-btn { background: none; border: 1px dashed var(--stroke); border-radius: 999px; padding: 3px 10px; font-size: 0.75rem; cursor: pointer; transition: border-color 0.2s, color 0.2s; text-align: left; }
        .role-badge-btn:hover:not(:disabled) { border-color: var(--stroke-strong); color: var(--text); }
        .role-badge-btn:disabled { opacity: 0.5; cursor: default; }
        .role-change-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
        .role-chip { padding: 4px 12px; border-radius: 999px; font-size: 0.75rem; font-weight: 500; border: 1px solid var(--stroke); background: transparent; color: var(--text-muted); cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s; }
        .role-chip:hover:not(:disabled):not(.role-chip--active) { background: var(--gold-soft); color: var(--text); border-color: var(--stroke-strong); }
        .role-chip--active { background: var(--gold-soft); color: var(--gold); border-color: var(--stroke-strong); font-weight: 600; cursor: default; }
        .confirm-row { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .btn-ghost.danger { color: var(--danger); }
        .btn-ghost.small { padding: 7px 12px; font-size: 0.8rem; }
        .new-user { display: flex; flex-direction: column; gap: 10px; }
        /* Базовые стили таблицы — глобальный класс .cg-table в index.css */
        .err-msg { color: var(--danger); font-size: 0.9rem; margin: 12px 0 0; text-align: center; padding: 10px 12px; border-radius: var(--radius-sm); background: rgba(248, 113, 113, 0.08); border: 1px solid rgba(248, 113, 113, 0.25); }
        @media (max-width: 400px) {
          .user-row { flex-direction: column; align-items: stretch; }
          .user-actions { justify-content: flex-start; }
          .confirm-row { justify-content: flex-start; }
        }
      `}</style>
    </div>
  );
}
