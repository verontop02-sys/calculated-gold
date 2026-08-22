import { jewelryItemPrice, formatJewelryPrice, listPublicJewelry, listSoonPlaceholders } from './jewelryCatalog.js';

function SoonCard() {
  return (
    <div className="il-vitrine-card il-vitrine-card--soon" aria-label="Скоро">
      <div className="il-vitrine-card-top">
        <span className="il-vitrine-kind">Новое</span>
      </div>
      <h3 className="il-vitrine-title">Скоро</h3>
      <p className="il-vitrine-meta">Появится на витрине</p>
      <p className="il-vitrine-origin">Следите за обновлением каталога.</p>
      <div className="il-vitrine-foot">
        <strong>Скоро</strong>
      </div>
    </div>
  );
}

export function JewelryShowcase({ quote, limit, hrefForItem }) {
  const gold = quote?.goldRubPerGram;
  const jewels = listPublicJewelry();
  const soon = listSoonPlaceholders();
  const items = limit ? jewels.slice(0, limit) : jewels;
  return (
    <div className="il-vitrine-grid">
      {items.map((item) => {
        const price = jewelryItemPrice(item, gold);
        const href = hrefForItem ? hrefForItem(item) : `/kabinet?item=${encodeURIComponent(item.id)}`;
        return (
          <a className="il-vitrine-card" href={href} key={item.id}>
            <div className="il-vitrine-card-top">
              <span className="il-vitrine-kind">Украшение</span>
              <span className="il-vitrine-assay">{item.assay}</span>
            </div>
            <h3 className="il-vitrine-title">{item.title}</h3>
            <p className="il-vitrine-meta">
              {item.form} · {String(item.weightG).replace('.', ',')} г · проба {item.assay}
            </p>
            <p className="il-vitrine-origin">{item.origin}</p>
            <div className="il-vitrine-foot">
              <strong>{formatJewelryPrice(price)}</strong>
              <span>Оформить →</span>
            </div>
          </a>
        );
      })}
      {!limit && soon.map((slot) => (
        <SoonCard key={slot.id} />
      ))}
    </div>
  );
}
