import { useEffect, useMemo, useState } from 'react';
import { clientApi, fintechApi } from './api.js';
import {
  addJewelryOrder,
  findJewelryItem,
  formatJewelryPrice,
  jewelryItemPrice,
  jewelryPayDescription,
  listJewelryOrders,
  listPublicJewelry,
  listSoonPlaceholders,
  mergeJewelryOrders,
  writePendingJewelryItem,
} from './jewelryCatalog.js';
import { JewelryOwnedList } from './JewelryOwned.jsx';

function withSbp(text) {
  return String(text || '').replace(/СБП/g, 'СБП');
}

function itemFromUrl() {
  try {
    const id = new URLSearchParams(window.location.search).get('item');
    return findJewelryItem(id);
  } catch {
    return null;
  }
}

export function JewelryShop({ quote: quoteProp, refreshKey = 0, onPayStart }) {
  const [picked, setPicked] = useState(() => itemFromUrl());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [quoteLocal, setQuoteLocal] = useState(quoteProp || null);
  const gold = quoteProp?.goldRubPerGram ?? quoteLocal?.goldRubPerGram;
  const [remoteOrders, setRemoteOrders] = useState([]);
  const items = useMemo(() => listPublicJewelry(), []);
  const soon = useMemo(() => listSoonPlaceholders(), []);
  const orders = useMemo(
    () => mergeJewelryOrders(remoteOrders, listJewelryOrders()),
    [remoteOrders, refreshKey],
  );

  useEffect(() => {
    if (quoteProp?.goldRubPerGram) return undefined;
    let alive = true;
    clientApi.buybackQuote('moex').then((q) => { if (alive) setQuoteLocal(q); }).catch(() => {});
    return () => { alive = false; };
  }, [quoteProp]);

  useEffect(() => {
    const fromUrl = itemFromUrl();
    if (fromUrl) setPicked(fromUrl);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const local = listJewelryOrders();
        if (local.length) {
          const synced = await fintechApi.syncJewelryOrders(local).catch(() => null);
          if (alive && synced?.orders) {
            setRemoteOrders(synced.orders);
            return;
          }
        }
        const out = await fintechApi.jewelryOrders();
        if (alive) setRemoteOrders(out?.orders || []);
      } catch {
        if (alive) setRemoteOrders([]);
      }
    })();
    return () => { alive = false; };
  }, [refreshKey]);

  async function pay(item) {
    const price = jewelryItemPrice(item, gold);
    if (!price) {
      setErr('Цена изделия ещё считается. Обновите страницу через несколько секунд.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const returnUrl = `${window.location.origin}/kabinet?item=${encodeURIComponent(item.id)}&topup=1`;
      writePendingJewelryItem({ ...item, priceRub: price });
      const out = await fintechApi.createTopup({
        rubAmount: price,
        returnUrl,
        description: jewelryPayDescription(item),
        jewelry: {
          id: item.id,
          title: item.title,
          assay: item.assay,
          weightG: item.weightG,
          form: item.form,
        },
      });
      if (!out.confirmationUrl) throw new Error('Нет ссылки на оплату');
      try {
        const raw = JSON.stringify({
          paymentId: out.paymentId,
          amountRub: out.amountRub,
          provider: out.provider || null,
          at: Date.now(),
        });
        sessionStorage.setItem('cpx_yookassa_pending_payment', raw);
        localStorage.setItem('cpx_yookassa_pending_payment', raw);
      } catch { /* ignore */ }
      onPayStart?.();
      window.location.href = out.confirmationUrl;
    } catch (e) {
      setErr(e?.message || 'Не удалось открыть оплату');
      setBusy(false);
    }
  }

  return (
    <div className="cpx-jewel">
      <div className="cpx-card cpx-owned-block">
        <h2 className="cpx-fin-side-title">Ваши изделия</h2>
        <p className="cpx-fin-side-sub">Оплаченные позиции с витрины. Можно забрать в отделении по запросу.</p>
        <JewelryOwnedList
          orders={orders}
          emptyText="Пока нет оплаченных изделий. Выберите позицию на витрине ниже."
        />
      </div>
      <div className="cpx-jewel-grid">
        {items.map((item) => {
          const price = jewelryItemPrice(item, gold);
          const on = picked?.id === item.id;
          return (
            <button
              type="button"
              key={item.id}
              className={`cpx-jewel-card${on ? ' is-on' : ''}`}
              onClick={() => setPicked(item)}
            >
              <span className="cpx-jewel-kind">Украшение</span>
              <strong>{item.title}</strong>
              <span className="cpx-muted">проба {item.assay} · {String(item.weightG).replace('.', ',')} г</span>
              <b>{formatJewelryPrice(price)}</b>
            </button>
          );
        })}
        {soon.map((slot) => (
          <div key={slot.id} className="cpx-jewel-card cpx-jewel-card--soon">
            <span className="cpx-jewel-kind">Новое</span>
            <strong>Скоро</strong>
            <span className="cpx-muted">Появится на витрине</span>
            <b>Скоро</b>
          </div>
        ))}
      </div>
      {picked && (
        <div className="cpx-card cpx-jewel-pay">
          <h2 className="cpx-fin-side-title">{picked.title}</h2>
          <p className="cpx-fin-side-sub">
            {picked.form}, проба {picked.assay}, {String(picked.weightG).replace('.', ',')} г. {picked.origin}.
            Клеймо, именник и бирка. Оплата только за это изделие.
          </p>
          <p className="cpx-jewel-price">
            {formatJewelryPrice(jewelryItemPrice(picked, gold))}
          </p>
          <button type="button" className="cpx-btn" disabled={busy} onClick={() => void pay(picked)}>
            {busy ? 'Переход к оплате…' : withSbp('Оплатить изделие картой / СБП')}
          </button>
          {err && <p className="cpx-err" style={{ marginTop: 10 }}>{err}</p>}
        </div>
      )}
    </div>
  );
}

export { addJewelryOrder, findJewelryItem };
