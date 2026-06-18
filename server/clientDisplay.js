/**
 * Релей «экрана клиента» (покупательский дисплей) — in-memory, без БД.
 *
 * Оператор пушит готовый к показу `view` в комнату по короткому коду, а экраны
 * клиента (второй монитор / планшет) подписываются на эту комнату по SSE и
 * мгновенно отрисовывают зелёный экран. Данные тут не секретные — это ровно то,
 * что и так показывается клиенту, поэтому подписка публичная (ключ — код комнаты).
 *
 * Комнаты живут в памяти процесса и сами вычищаются по бездействию.
 */

const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // 6 часов без активности — комната удаляется
const MAX_ROOMS = 500;

/** code -> { mode, view, brandName, updatedAt, subscribers:Set<res> } */
const rooms = new Map();

function now() {
  return Date.now();
}

export function normalizeDisplayCode(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

function getOrCreateRoom(code) {
  let room = rooms.get(code);
  if (!room) {
    if (rooms.size >= MAX_ROOMS) evictOldest();
    room = { mode: 'idle', view: null, brandName: 'REAKTIVO PRO', updatedAt: now(), subscribers: new Set() };
    rooms.set(code, room);
  }
  return room;
}

function evictOldest() {
  let oldestCode = null;
  let oldestAt = Infinity;
  for (const [code, room] of rooms) {
    if (room.subscribers.size === 0 && room.updatedAt < oldestAt) {
      oldestAt = room.updatedAt;
      oldestCode = code;
    }
  }
  if (oldestCode) rooms.delete(oldestCode);
}

function snapshot(room) {
  return { mode: room.mode, view: room.view, brandName: room.brandName, updatedAt: room.updatedAt };
}

function fanout(room) {
  const msg = `data: ${JSON.stringify(snapshot(room))}\n\n`;
  for (const res of room.subscribers) {
    try { res.write(msg); } catch { room.subscribers.delete(res); }
  }
}

/** Оператор задаёт состояние комнаты и рассылает подписчикам. */
export function setDisplayState(code, { mode, view, brandName }) {
  const c = normalizeDisplayCode(code);
  if (!c) return { ok: false };
  const room = getOrCreateRoom(c);
  room.mode = mode === 'show' ? 'show' : 'idle';
  room.view = room.mode === 'show' ? (view || null) : null;
  if (brandName) room.brandName = String(brandName).slice(0, 60);
  room.updatedAt = now();
  fanout(room);
  return { ok: true, subscribers: room.subscribers.size };
}

/** Текущее состояние комнаты (для polling-fallback). */
export function getDisplayState(code) {
  const c = normalizeDisplayCode(code);
  const room = rooms.get(c);
  if (!room) return { mode: 'idle', view: null, brandName: 'REAKTIVO PRO', updatedAt: 0, subscribers: 0 };
  return { ...snapshot(room), subscribers: room.subscribers.size };
}

/**
 * Подписка экрана клиента (SSE). Сразу отдаёт текущее состояние,
 * затем шлёт обновления. Возвращает функцию отписки.
 */
export function subscribeDisplay(code, res) {
  const c = normalizeDisplayCode(code);
  if (!c) return () => {};
  const room = getOrCreateRoom(c);
  room.subscribers.add(res);
  try { res.write(`data: ${JSON.stringify(snapshot(room))}\n\n`); } catch { /* ignore */ }
  return () => {
    room.subscribers.delete(res);
    room.updatedAt = now();
  };
}

// Периодическая чистка пустых протухших комнат
setInterval(() => {
  const t = now();
  for (const [code, room] of rooms) {
    if (room.subscribers.size === 0 && t - room.updatedAt > ROOM_TTL_MS) {
      rooms.delete(code);
    }
  }
}, 30 * 60 * 1000).unref?.();
