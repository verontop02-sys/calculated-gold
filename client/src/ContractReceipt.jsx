import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { ScrapCustomerDirectory } from './ScrapCustomerDirectory.jsx';

function emptyRow() {
  return {
    itemName: '',
    metal: 'Золото',
    probe: '',
    weightGross: '',
    weightNet: '',
    priceRub: '',
  };
}

function parseRowPrice(v) {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function normalizePhoneDigits(v) {
  const digits = String(v || '').replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return digits.slice(1);
  }
  if (digits.length === 10) return digits;
  return digits;
}

function sumRows(rows) {
  let s = 0;
  for (const r of rows) s += Math.round(parseRowPrice(r.priceRub));
  return s;
}

export function ContractReceipt({ formatMoney, prefill, onConsumedPrefill, toast }) {
  const [contractNo, setContractNo] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [phone, setPhone] = useState('');
  const [passportLine, setPassportLine] = useState('');
  const [address, setAddress] = useState('');
  const [appraiserName, setAppraiserName] = useState('');
  const [rows, setRows] = useState(() => [emptyRow(), emptyRow(), emptyRow()]);
  const [customerId, setCustomerId] = useState(null);

  const [searchQ, setSearchQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHits, setSearchHits] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const searchTimer = useRef(null);
  const searchBoxRef = useRef(null);
  const phoneAutofillTimer = useRef(null);

  const [pdfBusy, setPdfBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [baseOpen, setBaseOpen] = useState(false);

  const rowTotal = useMemo(() => sumRows(rows), [rows]);

  useEffect(() => {
    if (!prefill) return;
    if (typeof prefill.totalRub === 'number' && Number.isFinite(prefill.totalRub)) {
      const tr = Math.round(prefill.totalRub);
      const next = [emptyRow(), emptyRow(), emptyRow()];
      if (prefill.weightGrams != null && prefill.purity != null) {
        next[0] = {
          itemName: prefill.itemName || 'Лом ювелирных изделий',
          metal: 'Золото',
          probe: String(prefill.purity),
          weightGross: String(prefill.weightGrams).replace('.', ','),
          weightNet:
            prefill.fineGrams != null
              ? String(Number(prefill.fineGrams).toFixed(3)).replace('.', ',')
              : '',
          priceRub: String(tr),
        };
      } else {
        next[0] = {
          ...emptyRow(),
          itemName: prefill.itemName || 'Лом ювелирных изделий',
          priceRub: String(tr),
        };
      }
      setRows(next);
    }
    onConsumedPrefill?.();
  }, [prefill, onConsumedPrefill]);

  function fillCustomer(c, fallbackPhone = '') {
    const phoneValue = String(c?.phone || '').trim() || String(fallbackPhone || '').trim();
    setCustomerId(c?.id || null);
    setSellerName(c?.full_name || '');
    setPhone(phoneValue);
    setPassportLine(c?.passport_line || '');
    setAddress(c?.address || '');
  }

  useEffect(() => {
    const onDoc = (e) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    const q = searchQ.trim();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearchBusy(true);
      try {
        const { customers } = await api.scrapCustomersSearch(q);
        const list = customers || [];
        setSearchHits(list);
        setSearchOpen(true);
        const qNorm = normalizePhoneDigits(q);
        if (qNorm.length >= 10) {
          const exact = list.find((c) => normalizePhoneDigits(c.phone) === qNorm);
          if (exact) {
            fillCustomer(exact, q);
            setSearchOpen(false);
            setSearchQ('');
            toast?.('Клиент найден по номеру, данные подставлены', 'success');
          }
        }
      } catch (e) {
        toast?.(e?.message || 'Ошибка поиска', 'error');
      } finally {
        setSearchBusy(false);
      }
    }, 320);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQ, toast]);

  useEffect(() => {
    const raw = phone.trim();
    const normalized = normalizePhoneDigits(raw);
    if (phoneAutofillTimer.current) clearTimeout(phoneAutofillTimer.current);
    if (normalized.length < 10) return;
    phoneAutofillTimer.current = setTimeout(async () => {
      try {
        const { customers } = await api.scrapCustomersSearch(raw);
        const list = customers || [];
        const exact = list.find((c) => normalizePhoneDigits(c.phone) === normalized);
        if (exact && exact.id !== customerId) {
          fillCustomer(exact, raw);
          toast?.('Данные клиента подставлены по телефону', 'success');
        }
      } catch {
        // Silent: фоновая автоподстановка не должна шуметь ошибками.
      }
    }, 320);
    return () => {
      if (phoneAutofillTimer.current) clearTimeout(phoneAutofillTimer.current);
    };
  }, [phone, customerId, toast]);

  function applyCustomer(c) {
    fillCustomer(c);
    setSearchOpen(false);
    setSearchQ('');
  }

  function updateRow(i, patch) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(i) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)));
  }

  /** Копирует металл, пробу и (если пусто) наименование из 1-й позиции — удобно для 2–3 строк */
  function applyFirstRowTemplate(i) {
    if (i === 0) return;
    setRows((prev) => {
      const first = prev[0];
      if (!first) return prev;
      return prev.map((row, j) => {
        if (j !== i) return row;
        return {
          ...row,
          metal: first.metal,
          probe: first.probe,
          itemName: row.itemName.trim() ? row.itemName : first.itemName,
        };
      });
    });
    toast?.('Подставлены металл и проба из позиции 1', 'success');
  }

  function duplicateRow(i) {
    setRows((prev) => {
      const row = prev[i];
      const copy = { ...row };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
    toast?.('Строка скопирована', 'success');
  }

  async function handleSaveCustomer() {
    const fn = sellerName.trim();
    if (!fn) {
      toast?.('Укажите ФИО продавца', 'error');
      return;
    }
    setSaveBusy(true);
    try {
      const { customer } = await api.saveScrapCustomer({
        id: customerId || undefined,
        full_name: fn,
        phone: phone.trim() || null,
        passport_line: passportLine.trim() || null,
        address: address.trim() || null,
      });
      if (customer?.id) setCustomerId(customer.id);
      toast?.('Данные клиента сохранены', 'success');
    } catch (e) {
      toast?.(e?.message || 'Не удалось сохранить', 'error');
    } finally {
      setSaveBusy(false);
    }
  }

  async function handlePdf() {
    const fn = sellerName.trim();
    if (!fn) {
      toast?.('Укажите ФИО продавца', 'error');
      return;
    }
    if (!rowTotal || rowTotal <= 0) {
      toast?.('Укажите стоимость хотя бы в одной строке', 'error');
      return;
    }
    setPdfBusy(true);
    try {
      const issueDate = (() => {
        try {
          return new Date().toLocaleDateString('ru-RU', {
            timeZone: 'Europe/Moscow',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          });
        } catch {
          return new Date().toLocaleDateString('ru-RU');
        }
      })();
      const blob = await api.scrapContractPdf({
        contractNo: contractNo.trim(),
        customerId: customerId || undefined,
        sellerName: fn,
        passportLine: passportLine.trim(),
        address: address.trim(),
        phone: phone.trim(),
        appraiserName: appraiserName.trim(),
        issueDate,
        rows: rows.map((r) => ({
          itemName: r.itemName.trim(),
          metal: r.metal.trim(),
          probe: r.probe.trim(),
          weightGross: r.weightGross.trim(),
          weightNet: r.weightNet.trim(),
          priceRub: parseRowPrice(r.priceRub),
        })),
        totalRub: rowTotal,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeNo = (contractNo.trim() || 'bez-nomera').replace(/[^\w\u0400-\u04FF-]+/g, '_');
      a.download = `dogovor-kvitanciya-${safeNo}.pdf`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast?.('PDF сформирован', 'success');
    } catch (e) {
      toast?.(e?.message || 'Ошибка PDF', 'error');
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="contract-page">
      <ScrapCustomerDirectory
        open={baseOpen}
        onClose={() => setBaseOpen(false)}
        formatMoney={formatMoney}
        onPick={fillCustomer}
        onCustomerDeleted={(id) => {
          if (id && id === customerId) setCustomerId(null);
        }}
        toast={toast}
      />
      <div className="glass contract-hero">
        <h2 className="contract-title">Договор-квитанция</h2>
        <p className="muted contract-lead">
          Заполните данные продавца и позиции. Сумма из калькулятора подставляется автоматически при переходе с расчёта.
        </p>
      </div>

      <div className="glass contract-card" ref={searchBoxRef}>
        <div className="contract-search-header">
          <h3 className="contract-h3">Поиск клиента</h3>
          <button type="button" className="btn-ghost small" onClick={() => setBaseOpen(true)}>
            База
          </button>
        </div>
        <p className="muted small contract-hint">По фамилии, имени или телефону — подставятся паспорт и адрес из базы.</p>
        <div className="contract-search-wrap">
          <input
            className="contract-search-input"
            placeholder="Начните вводить телефон или фамилию…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onFocus={() => searchHits.length && setSearchOpen(true)}
            autoComplete="off"
          />
          {searchBusy && <span className="contract-search-busy muted small">Ищем…</span>}
        </div>
        {searchOpen && searchHits.length > 0 && (
          <ul className="contract-search-list" role="listbox">
            {searchHits.map((c) => (
              <li key={c.id}>
                <button type="button" className="contract-search-item" onClick={() => applyCustomer(c)}>
                  <span className="contract-search-name">{c.full_name}</span>
                  {c.phone && <span className="muted small">{c.phone}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="glass contract-card">
        <h3 className="contract-h3">Реквизиты договора</h3>
        <p className="muted small" style={{ margin: '0 0 10px' }}>
          Дата в печатной форме вручную. Номер — только цифры.
        </p>
        <div className="contract-grid contract-grid-one">
          <label className="field">
            <span className="field-label">Номер договора (только цифры)</span>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              className="mono-nums"
              value={contractNo}
              onChange={(e) => {
                setContractNo(String(e.target.value).replace(/\D/g, ''));
              }}
              placeholder="например 142"
            />
          </label>
        </div>
      </div>

      <div className="glass contract-card">
        <h3 className="contract-h3">Продавец</h3>
        <div className="contract-fields contract-seller-grid">
          <label className="field">
            <span className="field-label">ФИО</span>
            <input value={sellerName} onChange={(e) => setSellerName(e.target.value)} placeholder="Как в паспорте" />
          </label>
          <label className="field">
            <span className="field-label">Телефон</span>
            <input
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7…"
            />
          </label>
          <label className="field contract-span-2">
            <span className="field-label">Паспорт (серия, номер, кем и когда выдан)</span>
            <input value={passportLine} onChange={(e) => setPassportLine(e.target.value)} />
          </label>
          <label className="field contract-span-2">
            <span className="field-label">Адрес регистрации</span>
            <textarea
              className="contract-address-text"
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Полный адрес"
            />
          </label>
        </div>
        <button type="button" className="btn-secondary contract-save-btn" disabled={saveBusy} onClick={handleSaveCustomer}>
          {saveBusy ? 'Сохраняем…' : 'Сохранить клиента в базу'}
        </button>
      </div>

      <div className="glass contract-card">
        <div className="contract-table-head">
          <div>
            <h3 className="contract-h3">Позиции (лом)</h3>
            <p className="muted small contract-pos-hint">
              Каждая позиция — отдельный блок: наименование на всю ширину, ниже три колонки (металл, проба и веса/цена).
              Из калькулятора подставляется только <strong>позиция 1</strong>; для остальных можно нажать «Как в 1-й».
            </p>
          </div>
          <button type="button" className="btn-ghost small" onClick={addRow}>
            + Позиция
          </button>
        </div>
        <div className="contract-positions">
          {rows.map((r, i) => (
            <div key={i} className="contract-row-card">
              <div className="contract-row-toolbar">
                <span className="contract-row-num mono-nums">№ {i + 1}</span>
                <div className="contract-row-actions">
                  {i > 0 && (
                    <button type="button" className="btn-row-tool" onClick={() => applyFirstRowTemplate(i)}>
                      Как в 1-й
                    </button>
                  )}
                  <button type="button" className="btn-row-tool" onClick={() => duplicateRow(i)} title="Дублировать строку">
                    Дублировать
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    title="Удалить позицию"
                    onClick={() => removeRow(i)}
                    disabled={rows.length <= 1}
                  >
                    ×
                  </button>
                </div>
              </div>
              <label className="field contract-row-full">
                <span className="field-label">Наименование изделия</span>
                <input
                  value={r.itemName}
                  onChange={(e) => updateRow(i, { itemName: e.target.value })}
                  placeholder="Например: лом ювелирных изделий"
                />
              </label>
              <div className="contract-row-two">
                <label className="field">
                  <span className="field-label">Металл</span>
                  <input value={r.metal} onChange={(e) => updateRow(i, { metal: e.target.value })} />
                </label>
                <label className="field">
                  <span className="field-label">Проба</span>
                  <input
                    className="mono-nums"
                    inputMode="numeric"
                    value={r.probe}
                    onChange={(e) => updateRow(i, { probe: e.target.value })}
                  />
                </label>
              </div>
              <div className="contract-row-three">
                <label className="field">
                  <span className="field-label">Вес общ., г</span>
                  <input
                    className="mono-nums"
                    inputMode="decimal"
                    value={r.weightGross}
                    onChange={(e) => updateRow(i, { weightGross: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Вес чист., г</span>
                  <input
                    className="mono-nums"
                    inputMode="decimal"
                    value={r.weightNet}
                    onChange={(e) => updateRow(i, { weightNet: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Стоимость, ₽</span>
                  <input
                    className="mono-nums"
                    inputMode="decimal"
                    value={r.priceRub}
                    onChange={(e) => updateRow(i, { priceRub: e.target.value })}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
        <div className="contract-total">
          <span className="muted">Итого по строкам</span>
          <span className="contract-total-value mono-nums">{formatMoney(rowTotal)}</span>
        </div>
      </div>

      <div className="glass contract-card">
        <label className="field">
          <span className="field-label">Эксперт-оценщик (ФИО)</span>
          <input value={appraiserName} onChange={(e) => setAppraiserName(e.target.value)} placeholder="Кто принял товар" />
        </label>
      </div>

      <div className="contract-actions">
        <button type="button" className="btn-primary contract-pdf-btn" disabled={pdfBusy} onClick={handlePdf}>
          {pdfBusy ? 'Формируем PDF…' : 'Скачать PDF'}
        </button>
      </div>

      <style>{`
        .contract-page { display: flex; flex-direction: column; gap: 14px; animation: fadeIn 0.35s ease; }
        .contract-hero { padding: 20px 18px; }
        .contract-title { font-family: var(--font-display); font-size: 1.35rem; font-weight: 600; margin: 0 0 8px; }
        .contract-lead { margin: 0; font-size: 0.88rem; line-height: 1.45; }
        .contract-card { padding: 18px 16px; }
        .contract-h3 { font-size: 0.95rem; font-weight: 600; margin: 0 0 10px; }
        .contract-hint { margin: 0 0 12px; line-height: 1.4; }
        .contract-search-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
        .contract-search-header .contract-h3 { margin: 0; }
        .contract-search-wrap { position: relative; }
        .contract-search-input { width: 100%; }
        .contract-search-busy { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; }
        .contract-search-list {
          list-style: none; margin: 10px 0 0; padding: 0;
          border-radius: var(--radius-sm); border: 1px solid var(--stroke);
          background: var(--bg-elevated); max-height: 220px; overflow: auto;
        }
        .contract-search-item {
          width: 100%; text-align: left; padding: 10px 12px;
          border: none; background: transparent; cursor: pointer;
          display: flex; flex-direction: column; gap: 2px;
          border-bottom: 1px solid var(--stroke);
        }
        .contract-search-item:last-child { border-bottom: none; }
        .contract-search-item:hover { background: var(--gold-soft); }
        .contract-search-name { font-weight: 600; font-size: 0.9rem; }
        .contract-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .contract-grid-one { grid-template-columns: 1fr; }
        @media (max-width: 520px) {
          .contract-grid { grid-template-columns: 1fr; }
        }
        .contract-fields { display: flex; flex-direction: column; gap: 12px; }
        .contract-seller-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px 14px;
          align-items: start;
        }
        .contract-span-2 { grid-column: 1 / -1; }
        @media (max-width: 560px) {
          .contract-seller-grid { grid-template-columns: 1fr; }
          .contract-span-2 { grid-column: 1; }
        }
        .contract-fields textarea,
        .contract-address-text {
          resize: vertical;
          min-height: 72px;
          font-family: inherit;
          line-height: 1.45;
        }
        .contract-address-text { font-size: 0.9rem; }
        .contract-save-btn { margin-top: 14px; width: 100%; }
        .contract-table-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }
        .contract-table-head .contract-h3 { margin: 0 0 6px; }
        .contract-pos-hint { margin: 0; line-height: 1.45; max-width: 42rem; }
        .contract-pos-hint strong { color: var(--gold); font-weight: 600; }
        .btn-ghost.small { font-size: 0.78rem; padding: 6px 10px; flex-shrink: 0; }
        .contract-positions { display: flex; flex-direction: column; gap: 12px; }
        .contract-row-card {
          border: 1px solid var(--stroke);
          border-radius: var(--radius-sm);
          padding: 12px 12px 14px;
          background: var(--input-bg);
        }
        .contract-row-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 10px;
          flex-wrap: wrap;
        }
        .contract-row-num { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-muted); font-weight: 600; }
        .contract-row-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .btn-row-tool {
          border: 1px solid var(--stroke);
          background: var(--surface);
          color: var(--text-muted);
          font-size: 0.72rem;
          padding: 5px 10px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
        }
        .btn-row-tool:hover { border-color: var(--gold); color: var(--gold); }
        .contract-row-full { margin-bottom: 10px; }
        .contract-row-full input { width: 100%; }
        .contract-row-two {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px 12px;
          margin-bottom: 10px;
        }
        .contract-row-three {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px 12px;
        }
        @media (max-width: 520px) {
          .contract-row-two { grid-template-columns: 1fr; }
          .contract-row-three { grid-template-columns: 1fr; }
        }
        .contract-row-two .field input,
        .contract-row-three .field input { width: 100%; }
        .btn-icon {
          border: none;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 1.1rem;
          line-height: 1;
          padding: 4px 8px;
          border-radius: 6px;
        }
        .btn-icon:hover:not(:disabled) { color: var(--danger); background: rgba(248,113,113,0.08); }
        .btn-icon:disabled { opacity: 0.35; cursor: not-allowed; }
        .contract-total {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid var(--stroke);
        }
        .contract-total-value { font-size: 1.15rem; font-weight: 700; color: var(--gold); }
        .contract-actions { padding-bottom: 8px; }
        .contract-pdf-btn { width: 100%; padding: 14px 16px; font-size: 0.95rem; }
      `}</style>
    </div>
  );
}
