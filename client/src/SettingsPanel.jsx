import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useToast } from './ToastContext.jsx';
import { roleLabel } from './roles.js';

export function SettingsPanel() {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [users, setUsers] = useState([]);
  const [usersNote, setUsersNote] = useState('');
  /** 'loading' | 'ok' | 'error' — список пользователей только при успешном API */
  const [userListStatus, setUserListStatus] = useState('loading');
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'courier' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const canManageUsers = userListStatus === 'ok';

  const load = useCallback(async () => {
    setUsersNote('');
    setErr('');
    try {
      const s = await api.settings();
      setSettings(s);
    } catch (e) {
      setErr(e?.message || 'Не удалось загрузить настройки');
      setSettings(null);
      setUserListStatus('error');
      return;
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
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  async function save() {
    setErr('');
    setSaving(true);
    try {
      const patch = {
        buybackPercentOfScrap: settings.buybackPercentOfScrap,
        rangeHalfWidthPercent: settings.rangeHalfWidthPercent,
        purityAdjustments: settings.purityAdjustments,
      };
      const next = await api.saveSettings(patch);
      setSettings(next);
      toast('Настройки сохранены', 'success');
    } catch (e) {
      setErr(e.message);
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function setAdj(prob, val) {
    const n = val === '' ? 0 : parseFloat(val);
    setSettings((s) => ({
      ...s,
      purityAdjustments: { ...s.purityAdjustments, [prob]: Number.isFinite(n) ? n : 0 },
    }));
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

  async function removeUser(uid) {
    if (!canManageUsers) return;
    if (!confirm('Удалить пользователя?')) return;
    setErr('');
    try {
      await api.deleteUser(uid);
      await load();
      toast('Пользователь удалён', 'success');
    } catch (ex) {
      setErr(ex.message);
      toast(ex.message, 'error');
    }
  }

  if (!settings) {
    return (
      <div className="settings settings-boot glass">
        {err ? <p className="err-msg">{err}</p> : (
          <>
            <div className="spinner" />
            <p className="muted">Загрузка настроек…</p>
          </>
        )}
      </div>
    );
  }

  const probs = (settings.purityOrder || []).map(String);

  return (
    <div className="settings">
      <div className="glass block">
        <h2 className="block-title">Политика выкупа</h2>
        <p className="muted small block-desc">Процент от расчётной ломовой стоимости. Коридор — симметричный разброс вокруг ориентира.</p>
        <label className="field">
          <span className="field-label">Выкуп, % от ломовой</span>
          <input type="number" min={0} max={100} step={0.5} value={settings.buybackPercentOfScrap} onChange={(e) => setSettings((s) => ({ ...s, buybackPercentOfScrap: parseFloat(e.target.value) || 0 }))} />
        </label>
        <label className="field">
          <span className="field-label">Полуширина коридора, %</span>
          <input type="number" min={0} max={50} step={0.5} value={settings.rangeHalfWidthPercent} onChange={(e) => setSettings((s) => ({ ...s, rangeHalfWidthPercent: parseFloat(e.target.value) || 0 }))} />
        </label>
        <button type="button" className="btn-primary" disabled={saving} onClick={save}>
          {saving ? (
            <>
              <span className="spinner inline" /> Сохранение…
            </>
          ) : (
            'Сохранить политику'
          )}
        </button>
      </div>

      <div className="glass block">
        <h2 className="block-title">Поправки по пробам, %</h2>
        <p className="muted small block-desc">Дополнительный множитель к сумме: +2 означает +2% к расчёту для этой пробы.</p>
        <div className="grid-adj">
          {probs.map((p) => (
            <label key={p} className="adj-cell">
              <span className="prob">{p}</span>
              <input type="number" step={0.1} value={settings.purityAdjustments[p] ?? 0} onChange={(e) => setAdj(p, e.target.value)} />
            </label>
          ))}
        </div>
        <button type="button" className="btn-primary" style={{ marginTop: 14 }} disabled={saving} onClick={save}>
          {saving ? (
            <>
              <span className="spinner inline" /> Сохранение…
            </>
          ) : (
            'Сохранить пробы'
          )}
        </button>
      </div>

      <div className="glass block">
        <h2 className="block-title">Доступы</h2>
        <p className="muted small block-desc">
          Администратор создаёт логины. <strong>Продавец</strong> и <strong>курьер</strong> видят только калькулятор и не могут добавлять пользователей.
        </p>
        {usersNote && <p className="users-note muted small block-desc">{usersNote}</p>}
        <ul className="user-list">
          {users.map((u) => (
            <li key={u.uid} className="user-row">
              <span>
                <strong>{u.email}</strong>
                <span className="muted small"> · {roleLabel(u.role)}</span>
              </span>
              <button type="button" className="btn-ghost small danger" disabled={!canManageUsers} onClick={() => removeUser(u.uid)}>
                Удалить
              </button>
            </li>
          ))}
        </ul>
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
          <select value={newUser.role} onChange={(e) => setNewUser((x) => ({ ...x, role: e.target.value }))} disabled={!canManageUsers}>
            <option value="courier">Курьер</option>
            <option value="seller">Продавец</option>
          </select>
          <button type="submit" className="btn-primary" disabled={!canManageUsers}>
            Добавить
          </button>
        </form>
      </div>

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
        .grid-adj { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        @media (min-width: 480px) { .grid-adj { grid-template-columns: repeat(3, 1fr); } }
        .adj-cell { display: flex; flex-direction: column; gap: 4px; }
        .adj-cell .prob { font-size: 0.75rem; color: var(--gold); font-weight: 500; }
        .user-list { list-style: none; margin: 0 0 16px; padding: 0; }
        .user-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--stroke); }
        .user-row:last-child { border-bottom: none; }
        .btn-ghost.danger { color: var(--danger); }
        .new-user { display: flex; flex-direction: column; gap: 10px; }
        .err-msg { color: var(--danger); font-size: 0.9rem; margin: 12px 0 0; text-align: center; padding: 10px 12px; border-radius: var(--radius-sm); background: rgba(248, 113, 113, 0.08); border: 1px solid rgba(248, 113, 113, 0.25); }
      `}</style>
    </div>
  );
}
