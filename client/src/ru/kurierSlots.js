/**
 * Доступные дни и временные слоты для записи курьера — чистые функции без БД.
 * Реальной занятости курьеров тут нет: это просто бизнес-правило (за сколько
 * часов вперёд можно записаться, в какое окно), сервер валидирует их же копией
 * этого списка (см. KURIER_SLOT_WINDOWS в server/index.js) — клиенту не доверяем.
 */

export const KURIER_SLOT_WINDOWS = [
  { key: '10-12', label: '10:00–12:00', startHour: 10, endHour: 12 },
  { key: '12-14', label: '12:00–14:00', startHour: 12, endHour: 14 },
  { key: '14-16', label: '14:00–16:00', startHour: 14, endHour: 16 },
  { key: '16-18', label: '16:00–18:00', startHour: 16, endHour: 18 },
  { key: '18-20', label: '18:00–20:00', startHour: 18, endHour: 20 },
];

export const KURIER_DAYS_AHEAD = 14;
/** Сегодняшний день пропадает из выбора после этого часа — не успеем прислать курьера. */
export const KURIER_TODAY_CUTOFF_HOUR = 16;
/** Слот должен начинаться не раньше, чем через это время от «сейчас». */
export const KURIER_MIN_LEAD_HOURS = 3;

const WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function startOfDay(d) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function formatIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function formatRuDayLabel(d, now = new Date()) {
  const today = startOfDay(now);
  const target = startOfDay(d);
  const diffDays = Math.round((target - today) / 86_400_000);
  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Завтра';
  return `${WEEKDAY_SHORT[d.getDay()]}, ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

/**
 * Список дней для выбора: сегодня (если не поздно) + KURIER_DAYS_AHEAD дней вперёд.
 * @returns {{ iso: string, date: Date, label: string }[]}
 */
export function getAvailableDays(now = new Date(), daysAhead = KURIER_DAYS_AHEAD) {
  const days = [];
  const todayTooLate = now.getHours() >= KURIER_TODAY_CUTOFF_HOUR;
  const start = todayTooLate ? 1 : 0;
  for (let i = start; i <= daysAhead; i += 1) {
    const d = startOfDay(now);
    d.setDate(d.getDate() + i);
    days.push({ iso: formatIsoDate(d), date: d, label: formatRuDayLabel(d, now) });
  }
  return days;
}

/** Заголовки календаря: неделя с понедельника. */
export const KURIER_WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/**
 * Дни в сетке 7 колонок с пустыми ячейками в начале/конце, чтобы первая дата
 * встала в свой день недели (понедельник слева).
 * @returns {({ iso: string, date: Date, label: string } | null)[]}
 */
export function getCalendarGrid(days) {
  if (!Array.isArray(days) || days.length === 0) return [];
  const first = days[0].date;
  const mondayOffset = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: mondayOffset }, () => null);
  cells.push(...days);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Слоты для конкретного дня: все окна, кроме тех, что уже начались
 * или начнутся раньше, чем через KURIER_MIN_LEAD_HOURS от «сейчас».
 * @param {string} dayIso
 * @returns {{ key: string, label: string }[]}
 */
export function getAvailableSlots(dayIso, now = new Date()) {
  const day = parseIsoDate(dayIso);
  if (!day) return [];
  const isToday = startOfDay(day).getTime() === startOfDay(now).getTime();
  if (!isToday) return KURIER_SLOT_WINDOWS.map((w) => ({ key: w.key, label: w.label }));
  const minStart = new Date(now.getTime() + KURIER_MIN_LEAD_HOURS * 3_600_000);
  return KURIER_SLOT_WINDOWS
    .filter((w) => {
      const slotStart = new Date(day);
      slotStart.setHours(w.startHour, 0, 0, 0);
      return slotStart.getTime() >= minStart.getTime();
    })
    .map((w) => ({ key: w.key, label: w.label }));
}

export function isKurierSlotKey(key) {
  return KURIER_SLOT_WINDOWS.some((w) => w.key === key);
}

export function kurierSlotLabel(key) {
  return KURIER_SLOT_WINDOWS.find((w) => w.key === key)?.label || '';
}

/** true, если день входит в допустимый диапазон записи (не позже cutoff «сегодня», не дальше daysAhead). */
export function isKurierDayAllowed(dayIso, now = new Date(), daysAhead = KURIER_DAYS_AHEAD) {
  const day = parseIsoDate(dayIso);
  if (!day) return false;
  const today = startOfDay(now);
  const diffDays = Math.round((startOfDay(day) - today) / 86_400_000);
  if (diffDays < 0 || diffDays > daysAhead) return false;
  if (diffDays === 0 && now.getHours() >= KURIER_TODAY_CUTOFF_HOUR) return false;
  return true;
}

/** true, если конкретный слот в конкретный день ещё можно выбрать прямо сейчас. */
export function isKurierSlotAllowed(dayIso, slotKey, now = new Date()) {
  if (!isKurierDayAllowed(dayIso, now)) return false;
  if (!isKurierSlotKey(slotKey)) return false;
  return getAvailableSlots(dayIso, now).some((s) => s.key === slotKey);
}
