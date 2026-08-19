/** Каталог: украшения с витрины. Позиции kind=bar скрыты с витрины. */

export const JEWELRY_CATALOG = [
  { id: 'bar-585-10', kind: 'bar', title: 'Изделие пробы 585', assay: 585, weightG: 10, form: 'изделие', origin: 'Клеймо, именник, бирка, ГИИС ДМДК', markup: 1.08 },
  { id: 'bar-585-20', kind: 'bar', title: 'Изделие пробы 585', assay: 585, weightG: 20, form: 'изделие', origin: 'Клеймо, именник, бирка, ГИИС ДМДК', markup: 1.08 },
  { id: 'bar-585-50', kind: 'bar', title: 'Изделие пробы 585', assay: 585, weightG: 50, form: 'изделие', origin: 'Клеймо, именник, бирка, ГИИС ДМДК', markup: 1.07 },
  { id: 'bar-750-10', kind: 'bar', title: 'Изделие пробы 750', assay: 750, weightG: 10, form: 'изделие', origin: 'Клеймо, именник, бирка, ГИИС ДМДК', markup: 1.08 },
  { id: 'bar-750-20', kind: 'bar', title: 'Изделие пробы 750', assay: 750, weightG: 20, form: 'изделие', origin: 'Клеймо, именник, бирка, ГИИС ДМДК', markup: 1.08 },
  { id: 'bar-900-10', kind: 'bar', title: 'Изделие пробы 900', assay: 900, weightG: 10, form: 'изделие', origin: 'Клеймо, именник, бирка, ГИИС ДМДК', markup: 1.08 },
  { id: 'bar-900-50', kind: 'bar', title: 'Изделие пробы 900', assay: 900, weightG: 50, form: 'изделие', origin: 'Клеймо, именник, бирка, ГИИС ДМДК', markup: 1.07 },
  { id: 'bar-900-100', kind: 'bar', title: 'Изделие пробы 900', assay: 900, weightG: 100, form: 'изделие', origin: 'Клеймо, именник, бирка, ГИИС ДМДК', markup: 1.06 },
  { id: 'ring-585-4-2', kind: 'jewel', title: 'Кольцо обручальное', assay: 585, weightG: 4.2, form: 'кольцо', origin: 'Выкуплено в отделении скупки Reaktivo', markup: 1.18 },
  { id: 'chain-585-8-6', kind: 'jewel', title: 'Цепь якорная', assay: 585, weightG: 8.6, form: 'цепь', origin: 'Выкуплено в отделении скупки Reaktivo', markup: 1.16 },
  { id: 'earrings-750-3-1', kind: 'jewel', title: 'Серьги с английским замком', assay: 750, weightG: 3.1, form: 'серьги', origin: 'Выкуплено в отделении скупки Reaktivo', markup: 1.2 },
  { id: 'bracelet-585-12-4', kind: 'jewel', title: 'Браслет панцирный', assay: 585, weightG: 12.4, form: 'браслет', origin: 'Выкуплено в отделении скупки Reaktivo', markup: 1.15 },
  { id: 'pendant-585-2-8', kind: 'jewel', title: 'Подвеска', assay: 585, weightG: 2.8, form: 'подвеска', origin: 'Выкуплено в отделении скупки Reaktivo', markup: 1.22 },
  { id: 'ring-750-5-4', kind: 'jewel', title: 'Кольцо печатное', assay: 750, weightG: 5.4, form: 'кольцо', origin: 'Выкуплено в отделении скупки Reaktivo', markup: 1.18 },
];

export function jewelryItemPrice(item, goldRubPerGram) {
  const g = Number(goldRubPerGram);
  if (!item || !Number.isFinite(g) || g <= 0) return null;
  const raw = g * (Number(item.assay) / 1000) * Number(item.weightG) * Number(item.markup || 1.1);
  return Math.round(raw / 10) * 10;
}

export function formatJewelryPrice(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(n));
}

export function jewelryPayDescription(item) {
  if (!item) return 'Оплата ювелирного изделия Reaktivo';
  return `Оплата ювелирного изделия: ${item.title}, проба ${item.assay}, ${String(item.weightG).replace('.', ',')} г`;
}

const ORDERS_KEY = 'cpx_jewelry_orders';
const PENDING_KEY = 'cpx_jewelry_pending';

export function listJewelryOrders() {
  try {
    const rows = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function jewelryStatusLabel(status) {
  if (status === 'ready') return 'Можно забрать';
  if (status === 'issued') return 'Выдано';
  return 'В хранении';
}

export function jewelryStatusHint(status) {
  if (status === 'ready') return 'Изделие готово к выдаче в отделении.';
  if (status === 'issued') return 'Изделие выдано.';
  return 'Можно забрать в отделении по запросу.';
}

export function normalizeJewelryOrder(raw) {
  if (!raw) return null;
  const title = String(raw.title || '').trim();
  if (!title) return null;
  return {
    id: raw.id || null,
    catalogId: raw.catalogId || raw.catalog_id || raw.itemId || null,
    title,
    assay: raw.assay != null ? Number(raw.assay) : null,
    weightG: raw.weightG != null ? Number(raw.weightG) : (raw.weight_g != null ? Number(raw.weight_g) : null),
    form: raw.form || null,
    priceRub: Number(raw.priceRub ?? raw.price_rub),
    status: raw.status || 'stored',
    at: raw.at || raw.paid_at || raw.created_at || null,
    paymentId: raw.paymentId || raw.payment_id || null,
  };
}

export function mergeJewelryOrders(serverRows, localRows) {
  const server = (serverRows || []).map(normalizeJewelryOrder).filter(Boolean);
  if (server.length) {
    return server.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  }
  return (localRows || [])
    .map(normalizeJewelryOrder)
    .filter(Boolean)
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
}

export function addJewelryOrder(order) {
  const rows = listJewelryOrders();
  const next = [{
    ...order,
    id: order.id || `ord-${Date.now()}`,
    status: order.status || 'stored',
  }, ...rows].slice(0, 40);
  try {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
  return next;
}

export function writePendingJewelryItem(item) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({
      id: item.id,
      title: item.title,
      assay: item.assay,
      weightG: item.weightG,
      form: item.form || null,
      priceRub: item.priceRub || null,
      at: Date.now(),
    }));
  } catch { /* ignore */ }
}

export function takePendingJewelryItem() {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function findJewelryItem(id) {
  const item = JEWELRY_CATALOG.find((x) => x.id === id) || null;
  if (item?.kind === 'bar') return null;
  return item;
}

export function listPublicJewelry() {
  return JEWELRY_CATALOG.filter((x) => x.kind === 'jewel');
}

/** Три одинаковые заглушки на месте скрытой линейки. */
export function listSoonPlaceholders() {
  return Array.from({ length: 3 }, (_, i) => ({
    id: `soon-${i}`,
    kind: 'soon',
    title: 'Скоро',
  }));
}
