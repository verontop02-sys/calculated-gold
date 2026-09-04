/**
 * Доступные дни и время для записи курьера — чистые функции без БД.
 * Клиент может выбрать любое время в пределах рабочего окна (не фиксированные
 * блоки) — сервер валидирует ту же логику по копии этих правил
 * (см. KURIER_* в server/index.js), клиенту не доверяем.
 */

/** Рабочее окно курьеров: самый ранний и самый поздний возможный визит. */
export const KURIER_BUSINESS_START_HOUR = 10;
export const KURIER_BUSINESS_END_HOUR = 20;
/** Последний визит должен начаться хотя бы за полчаса до конца рабочего дня. */
export const KURIER_LAST_START_MIN = KURIER_BUSINESS_END_HOUR * 60 - 30; // 19:30
export const KURIER_FIRST_START_MIN = KURIER_BUSINESS_START_HOUR * 60; // 10:00

export const KURIER_DAYS_AHEAD = 14;
/** Время должно начинаться не раньше, чем через это число часов от «сейчас». */
export const KURIER_MIN_LEAD_HOURS = 3;
/** Шаг для быстрых кнопок выбора времени (сам ввод — свободный, до минуты). */
export const KURIER_QUICK_STEP_MIN = 30;

const WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function startOfDay(d) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function minutesToTimeStr(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

/** Парсит «HH:MM» → минуты от начала суток, или null, если формат кривой. */
export function parseTimeToMinutes(time) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time || '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function roundUpToStep(min, step) {
  return Math.ceil(min / step) * step;
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

/** «Сегодня» пропадает из выбора, когда даже самый поздний визит (19:30) не набирает нужный запас часов. */
function isTodayTooLate(now) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const cutoffMin = KURIER_LAST_START_MIN - KURIER_MIN_LEAD_HOURS * 60;
  return nowMin >= cutoffMin;
}

/**
 * Список дней для выбора: сегодня (если не поздно) + KURIER_DAYS_AHEAD дней вперёд.
 * @returns {{ iso: string, date: Date, label: string }[]}
 */
export function getAvailableDays(now = new Date(), daysAhead = KURIER_DAYS_AHEAD) {
  const days = [];
  const start = isTodayTooLate(now) ? 1 : 0;
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

/** true, если день входит в допустимый диапазон записи (не позже cutoff «сегодня», не дальше daysAhead). */
export function isKurierDayAllowed(dayIso, now = new Date(), daysAhead = KURIER_DAYS_AHEAD) {
  const day = parseIsoDate(dayIso);
  if (!day) return false;
  const today = startOfDay(now);
  const diffDays = Math.round((startOfDay(day) - today) / 86_400_000);
  if (diffDays < 0 || diffDays > daysAhead) return false;
  if (diffDays === 0 && isTodayTooLate(now)) return false;
  return true;
}

/**
 * Минимально допустимое время (минуты от начала суток) для визита в данный день:
 * начало рабочего дня, либо «сейчас + KURIER_MIN_LEAD_HOURS», если день — сегодня.
 * Возвращает null, если день недоступен вовсе.
 */
export function getMinTimeMinForDay(dayIso, now = new Date()) {
  if (!isKurierDayAllowed(dayIso, now)) return null;
  const day = parseIsoDate(dayIso);
  const isToday = startOfDay(day).getTime() === startOfDay(now).getTime();
  if (!isToday) return KURIER_FIRST_START_MIN;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const earliest = roundUpToStep(nowMin + KURIER_MIN_LEAD_HOURS * 60, 5);
  return Math.min(Math.max(earliest, KURIER_FIRST_START_MIN), KURIER_LAST_START_MIN);
}

export function getMaxTimeMinForDay() {
  return KURIER_LAST_START_MIN;
}

export function getMinTimeStrForDay(dayIso, now = new Date()) {
  const min = getMinTimeMinForDay(dayIso, now);
  return min == null ? null : minutesToTimeStr(min);
}

export function getMaxTimeStrForDay() {
  return minutesToTimeStr(getMaxTimeMinForDay());
}

/**
 * Быстрые кнопки времени для дня — сетка с шагом KURIER_QUICK_STEP_MIN в допустимых
 * границах. Свободный ввод (поле «своё время») позволяет выбрать любую минуту.
 * @returns {string[]} массив «HH:MM»
 */
export function getQuickTimes(dayIso, now = new Date(), step = KURIER_QUICK_STEP_MIN) {
  const minMin = getMinTimeMinForDay(dayIso, now);
  if (minMin == null) return [];
  const maxMin = getMaxTimeMinForDay();
  const first = roundUpToStep(minMin, step);
  const out = [];
  for (let t = first; t <= maxMin; t += step) out.push(minutesToTimeStr(t));
  return out;
}

/** true, если конкретное время в конкретный день ещё можно выбрать прямо сейчас. */
export function isKurierTimeAllowed(dayIso, time, now = new Date()) {
  const minutes = parseTimeToMinutes(time);
  if (minutes == null) return false;
  const minMin = getMinTimeMinForDay(dayIso, now);
  if (minMin == null) return false;
  const maxMin = getMaxTimeMinForDay();
  return minutes >= minMin && minutes <= maxMin;
}

export function formatKurierTimeLabel(time) {
  const minutes = parseTimeToMinutes(time);
  return minutes == null ? '' : minutesToTimeStr(minutes);
}
