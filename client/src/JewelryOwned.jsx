import { formatJewelryPrice, jewelryStatusHint, jewelryStatusLabel } from './jewelryCatalog.js';

function formatWhen(at) {
  if (!at) return '';
  try {
    return new Date(at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

function formatMeta(order) {
  const bits = [];
  if (order.form) bits.push(order.form);
  if (order.assay) bits.push(`проба ${order.assay}`);
  if (order.weightG != null) bits.push(`${String(order.weightG).replace('.', ',')} г`);
  return bits.join(' · ');
}

export function JewelryOwnedCard({ order }) {
  const status = jewelryStatusLabel(order.status);
  return (
    <article className="cpx-owned-card">
      <div className="cpx-owned-top">
        <span className={`cpx-owned-status cpx-owned-status--${order.status || 'stored'}`}>{status}</span>
      </div>
      <h3 className="cpx-owned-title">{order.title}</h3>
      <p className="cpx-owned-meta">{formatMeta(order) || 'Ювелирное изделие'}</p>
      <p className="cpx-owned-hint">{jewelryStatusHint(order.status)}</p>
      <div className="cpx-owned-foot">
        <strong>{formatJewelryPrice(order.priceRub)}</strong>
        <span>{formatWhen(order.at)}</span>
      </div>
    </article>
  );
}

export function JewelryOwnedList({ orders, emptyText = 'Пока нет оплаченных изделий.' }) {
  if (!orders?.length) {
    return <p className="cpx-muted" style={{ margin: 0 }}>{emptyText}</p>;
  }
  return (
    <div className="cpx-owned-grid">
      {orders.map((order) => (
        <JewelryOwnedCard key={order.id || `${order.title}-${order.at}`} order={order} />
      ))}
    </div>
  );
}
