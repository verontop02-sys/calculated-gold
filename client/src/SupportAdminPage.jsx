import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';

/** Чат поддержки в панели: слева диалоги клиентов, справа переписка (как в онлайн-банке). */

function formatPhone(digitsRaw) {
  const d = String(digitsRaw || '').replace(/\D/g, '');
  if (d.length === 11) return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
  return d ? `+${d}` : '—';
}

function timeShort(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Сегодня';
  if (same(d, yest)) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function msgTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function SupportAdminPage({ toast }) {
  const [filter, setFilter] = useState('open'); // 'open' | ''
  const [threads, setThreads] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listErr, setListErr] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [dialog, setDialog] = useState(null); // { id, phone, status, messages }
  const [dialogLoading, setDialogLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const stickRef = useRef(true);

  const loadThreads = useCallback(async (silent = false) => {
    if (!silent) setListLoading(true);
    try {
      const out = await api.supportThreads(filter || undefined);
      setThreads(out.threads || []);
      setListErr('');
    } catch (e) {
      setListErr(e?.message || 'Не удалось загрузить диалоги');
    } finally {
      if (!silent) setListLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadThreads();
    const id = setInterval(() => loadThreads(true), 20_000);
    return () => clearInterval(id);
  }, [loadThreads]);

  const openThread = useCallback(async (threadId, silent = false) => {
    if (!silent) setDialogLoading(true);
    try {
      const out = await api.supportThread(threadId);
      setDialog(out);
      // Открыли диалог — непрочитанное по нему обнулилось на сервере.
      setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)));
    } catch (e) {
      toast?.(e?.message || 'Не удалось открыть диалог', 'error');
    } finally {
      if (!silent) setDialogLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!selectedId) return undefined;
    openThread(selectedId);
    const id = setInterval(() => openThread(selectedId, true), 10_000);
    return () => clearInterval(id);
  }, [selectedId, openThread]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [dialog?.messages]);

  function onScrollMessages() {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function sendReply() {
    const body = reply.trim();
    if (!body || sending || !dialog) return;
    setSending(true);
    try {
      const out = await api.supportReply(dialog.id, body);
      setReply('');
      stickRef.current = true;
      if (out?.message) {
        setDialog((prev) => (prev ? { ...prev, messages: [...prev.messages, out.message] } : prev));
      }
      loadThreads(true);
    } catch (e) {
      toast?.(e?.message || 'Не удалось отправить ответ', 'error');
    } finally {
      setSending(false);
    }
  }

  async function toggleStatus() {
    if (!dialog) return;
    const next = dialog.status === 'closed' ? 'open' : 'closed';
    try {
      await api.supportSetStatus(dialog.id, next);
      setDialog((prev) => (prev ? { ...prev, status: next } : prev));
      loadThreads(true);
      toast?.(next === 'closed' ? 'Диалог завершён' : 'Диалог снова открыт', 'success');
    } catch (e) {
      toast?.(e?.message || 'Не удалось изменить статус', 'error');
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  }

  const selectedThreadMeta = useMemo(
    () => threads.find((t) => t.id === selectedId) || null,
    [threads, selectedId]
  );

  const grouped = useMemo(() => {
    const out = [];
    let lastDay = '';
    for (const m of dialog?.messages || []) {
      const day = dayLabel(m.createdAt);
      if (day !== lastDay) {
        out.push({ type: 'day', key: `d-${day}-${m.id}`, label: day });
        lastDay = day;
      }
      out.push({ type: 'msg', key: m.id, msg: m });
    }
    return out;
  }, [dialog?.messages]);

  return (
    <div className="sup-page">
      {/* ── список диалогов ── */}
      <div className="sup-list-card">
        <div className="sup-list-head">
          <h2 className="sup-title">Поддержка</h2>
          <div className="sup-filter">
            <button
              type="button"
              className={`sup-filter-btn${filter === 'open' ? ' sup-filter-btn--on' : ''}`}
              onClick={() => setFilter('open')}
            >
              Открытые
            </button>
            <button
              type="button"
              className={`sup-filter-btn${filter === '' ? ' sup-filter-btn--on' : ''}`}
              onClick={() => setFilter('')}
            >
              Все
            </button>
          </div>
        </div>

        <div className="sup-threads">
          {listLoading && <p className="sup-muted">Загружаем…</p>}
          {listErr && <p className="sup-err">{listErr}</p>}
          {!listLoading && !threads.length && (
            <p className="sup-muted">
              {filter === 'open' ? 'Открытых диалогов нет — все вопросы закрыты.' : 'Клиенты ещё не писали в поддержку.'}
            </p>
          )}
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`sup-thread${t.id === selectedId ? ' sup-thread--on' : ''}`}
              onClick={() => setSelectedId(t.id)}
            >
              <span className="sup-thread-avatar" aria-hidden>
                {(t.fullName || 'К').trim().charAt(0).toUpperCase()}
              </span>
              <span className="sup-thread-main">
                <span className="sup-thread-top">
                  <span className="sup-thread-name">{t.fullName || formatPhone(t.phone)}</span>
                  <span className="sup-thread-time mono-nums">{timeShort(t.lastMessageAt)}</span>
                </span>
                <span className="sup-thread-bottom">
                  <span className="sup-thread-preview">
                    {t.lastMessageFrom === 'staff' && <span className="sup-thread-you">Вы: </span>}
                    {t.lastMessagePreview || 'Без сообщений'}
                  </span>
                  {t.unread > 0 && <span className="sup-thread-badge">{t.unread > 99 ? '99+' : t.unread}</span>}
                  {t.status === 'closed' && t.unread === 0 && <span className="sup-thread-closed">Закрыт</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── переписка ── */}
      <div className="sup-dialog-card">
        {!selectedId && (
          <div className="sup-dialog-empty">
            <span className="sup-dialog-empty-icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
              </svg>
            </span>
            <p>Выберите диалог слева, чтобы ответить клиенту.</p>
            <p className="sup-muted">Новые сообщения дублируются в Telegram, если настроен бот.</p>
          </div>
        )}

        {selectedId && (
          <>
            <div className="sup-dialog-head">
              <div className="sup-dialog-who">
                <span className="sup-thread-avatar sup-thread-avatar--lg" aria-hidden>
                  {(selectedThreadMeta?.fullName || 'К').trim().charAt(0).toUpperCase()}
                </span>
                <div>
                  <div className="sup-dialog-name">{selectedThreadMeta?.fullName || 'Клиент'}</div>
                  <div className="sup-dialog-phone mono-nums">{formatPhone(dialog?.phone || selectedThreadMeta?.phone)}</div>
                </div>
              </div>
              <div className="sup-dialog-actions">
                {dialog && (
                  <button type="button" className="sup-btn sup-btn--ghost" onClick={toggleStatus}>
                    {dialog.status === 'closed' ? 'Открыть снова' : 'Завершить диалог'}
                  </button>
                )}
              </div>
            </div>

            <div className="sup-messages" ref={listRef} onScroll={onScrollMessages}>
              {dialogLoading && <p className="sup-muted" style={{ textAlign: 'center' }}>Загружаем переписку…</p>}
              {!dialogLoading && !grouped.length && (
                <p className="sup-muted" style={{ textAlign: 'center', margin: 'auto' }}>Сообщений пока нет</p>
              )}
              {grouped.map((item) =>
                item.type === 'day' ? (
                  <div key={item.key} className="sup-day"><span>{item.label}</span></div>
                ) : (
                  <div key={item.key} className={`sup-msg${item.msg.sender === 'staff' ? ' sup-msg--staff' : ''}`}>
                    <div className="sup-bubble">
                      {item.msg.sender === 'staff' && item.msg.staffName && (
                        <span className="sup-msg-author">{item.msg.staffName}</span>
                      )}
                      <span className="sup-msg-text">{item.msg.body}</span>
                      <span className="sup-msg-time mono-nums">{msgTime(item.msg.createdAt)}</span>
                    </div>
                  </div>
                )
              )}
            </div>

            <div className="sup-compose">
              <textarea
                className="sup-input"
                rows={1}
                placeholder={dialog?.status === 'closed' ? 'Диалог завершён — ответ откроет его снова…' : 'Ответ клиенту…'}
                value={reply}
                maxLength={2000}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={sending}
              />
              <button
                type="button"
                className="sup-send"
                onClick={sendReply}
                disabled={sending || !reply.trim()}
                title="Отправить (Enter)"
                aria-label="Отправить ответ"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13" />
                  <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.sup-page {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  gap: 14px;
  height: calc(100dvh - 150px);
  min-height: 480px;
}
@media (max-width: 980px) {
  .sup-page { grid-template-columns: 1fr; height: auto; }
}

.sup-list-card,
.sup-dialog-card {
  background: var(--bg-panel-solid);
  border: 1px solid var(--stroke-soft);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}
@media (max-width: 980px) {
  .sup-list-card { max-height: 40dvh; }
  .sup-dialog-card { height: 62dvh; }
}

.sup-list-head {
  padding: 14px 16px;
  border-bottom: 1px solid var(--stroke-soft);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.sup-title { margin: 0; font-size: 1.02rem; font-weight: 700; color: var(--text-strong); }
.sup-filter { display: flex; gap: 4px; background: var(--surface); border: 1px solid var(--stroke-soft); border-radius: 10px; padding: 3px; }
.sup-filter-btn {
  border: none; background: transparent; cursor: pointer;
  padding: 6px 12px; border-radius: 8px;
  font-size: 0.76rem; font-weight: 700; color: var(--text-muted);
}
.sup-filter-btn--on { background: var(--bg-panel-solid); color: var(--text-strong); box-shadow: var(--shadow-card); }

.sup-threads { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
.sup-thread {
  display: flex; align-items: center; gap: 11px;
  width: 100%;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 12px;
  padding: 10px 11px;
  cursor: pointer;
  text-align: left;
  transition: background 0.14s, border-color 0.14s;
}
.sup-thread:hover { background: var(--surface); }
.sup-thread--on { background: var(--accent-soft); border-color: color-mix(in srgb, var(--accent) 22%, transparent); }
.sup-thread-avatar {
  width: 38px; height: 38px; border-radius: 50%;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  color: var(--accent);
  font-weight: 800; font-size: 0.94rem;
  display: flex; align-items: center; justify-content: center;
}
.sup-thread-avatar--lg { width: 42px; height: 42px; }
.sup-thread-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.sup-thread-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.sup-thread-name {
  font-size: 0.86rem; font-weight: 700; color: var(--text-strong);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sup-thread-time { flex-shrink: 0; font-size: 0.68rem; color: var(--text-dim); }
.sup-thread-bottom { display: flex; align-items: center; gap: 8px; }
.sup-thread-preview {
  flex: 1; min-width: 0;
  font-size: 0.78rem; color: var(--text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sup-thread-you { color: var(--text-dim); }
.sup-thread-badge {
  flex-shrink: 0;
  min-width: 19px; height: 19px;
  border-radius: 999px;
  padding: 0 6px;
  background: var(--accent);
  color: #fff;
  font-size: 0.66rem; font-weight: 800;
  display: inline-flex; align-items: center; justify-content: center;
}
.sup-thread-closed {
  flex-shrink: 0;
  font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--text-dim);
  border: 1px solid var(--stroke-soft);
  border-radius: 999px;
  padding: 2px 8px;
}

.sup-dialog-empty {
  margin: auto;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.88rem;
  padding: 30px;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.sup-dialog-empty p { margin: 0; }
.sup-dialog-empty-icon {
  width: 58px; height: 58px; border-radius: 18px;
  background: var(--accent-soft); color: var(--accent);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 8px;
}

.sup-dialog-head {
  padding: 12px 16px;
  border-bottom: 1px solid var(--stroke-soft);
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: var(--surface);
}
.sup-dialog-who { display: flex; align-items: center; gap: 11px; min-width: 0; }
.sup-dialog-name { font-size: 0.92rem; font-weight: 700; color: var(--text-strong); }
.sup-dialog-phone { font-size: 0.76rem; color: var(--text-muted); }
.sup-dialog-actions { display: flex; gap: 8px; flex-shrink: 0; }
.sup-btn {
  border: none; cursor: pointer;
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 0.8rem; font-weight: 700;
  background: var(--accent-grad); color: #fff;
}
.sup-btn--ghost {
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--stroke);
}
.sup-btn--ghost:hover { color: var(--text-strong); border-color: var(--stroke-strong); }

.sup-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background:
    radial-gradient(ellipse 90% 55% at 50% -10%, color-mix(in srgb, var(--accent-soft) 35%, transparent), transparent 70%);
}
.sup-day { display: flex; justify-content: center; margin: 8px 0 4px; }
.sup-day span {
  font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--text-dim);
  background: var(--surface);
  border: 1px solid var(--stroke-soft);
  border-radius: 999px;
  padding: 4px 12px;
}
.sup-msg { display: flex; }
.sup-msg--staff { justify-content: flex-end; }
.sup-bubble {
  max-width: min(74%, 560px);
  padding: 9px 12px 6px;
  border-radius: 14px 14px 14px 4px;
  background: var(--bg-panel-solid);
  border: 1px solid var(--stroke-soft);
  box-shadow: var(--shadow-card);
  display: flex; flex-direction: column; gap: 2px;
}
.sup-msg--staff .sup-bubble {
  border-radius: 14px 14px 4px 14px;
  background: color-mix(in srgb, var(--accent) 88%, #000);
  border-color: transparent;
}
.sup-msg-author { font-size: 0.68rem; font-weight: 700; color: rgba(255,255,255,0.85); }
.sup-msg-text { font-size: 0.86rem; color: var(--text); line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
.sup-msg--staff .sup-msg-text { color: #fff; }
.sup-msg-time { align-self: flex-end; font-size: 0.62rem; color: var(--text-dim); }
.sup-msg--staff .sup-msg-time { color: rgba(255,255,255,0.7); }

.sup-compose {
  display: flex; align-items: flex-end; gap: 10px;
  padding: 12px 14px;
  border-top: 1px solid var(--stroke-soft);
  background: var(--surface);
}
.sup-input {
  flex: 1;
  min-height: 42px; max-height: 130px;
  padding: 11px 13px;
  border-radius: 12px;
  border: 1px solid var(--stroke);
  background: var(--input-bg);
  color: var(--text);
  font-size: 0.86rem;
  font-family: inherit;
  line-height: 1.4;
  resize: none;
  outline: none;
  box-sizing: border-box;
}
.sup-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.sup-send {
  width: 42px; height: 42px; flex-shrink: 0;
  border: none; border-radius: 12px;
  background: var(--accent-grad); color: #fff;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 5px 16px var(--accent-glow);
  transition: filter 0.16s, transform 0.15s;
}
.sup-send:hover:not(:disabled) { filter: brightness(1.07); transform: translateY(-1px); }
.sup-send:disabled { opacity: 0.5; cursor: not-allowed; }

.sup-muted { font-size: 0.82rem; color: var(--text-dim); margin: 8px; }
.sup-err { font-size: 0.82rem; color: var(--danger); margin: 8px; }
`;
