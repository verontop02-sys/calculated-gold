import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api.js';
import { mergeSettings, calculateBuybackRange } from './calc.js';
import { ScrapCustomerDirectory } from './ScrapCustomerDirectory.jsx';
import { isUserManagerRole } from './roles.js';
import { PageHint } from './PageHint.jsx';

function emptyRow() {
  return {
    itemName: '',
    metal: 'Золото',
    probe: '',
    weightGross: '',
    weightNet: '',
    priceRub: '',
    photoFile: null,   // File | null
    photoUrl: '',      // Object URL для превью
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

function buildContractPayloadForSession({
  contractNo,
  customerId,
  sellerName,
  passportLine,
  address,
  phone,
  appraiserName,
  rows,
  totalRub,
  courierId,
}) {
  const base = {
    contractNo: String(contractNo || '').trim(),
    customerId: customerId || undefined,
    sellerName: String(sellerName || '').trim(),
    passportLine: String(passportLine || '').trim(),
    address: String(address || '').trim(),
    phone: String(phone || '').trim(),
    appraiserName: String(appraiserName || '').trim(),
    rows: rows.map((r) => ({
      itemName: r.itemName.trim(),
      metal: r.metal.trim(),
      probe: r.probe.trim(),
      weightGross: r.weightGross.trim(),
      weightNet: r.weightNet.trim(),
      priceRub: parseRowPrice(r.priceRub),
    })),
    totalRub,
  };
  if (courierId && /^[0-9a-f-]{36}$/i.test(String(courierId))) {
    return { ...base, courierId: String(courierId) };
  }
  return base;
}

function isGoldScrapMetal(metal) {
  const t = String(metal || '').trim().toLowerCase();
  if (!t) return true;
  if (/(серебр|паллад|платин|палладий)/.test(t)) return false;
  return true;
}

function parsePurityThousand(probe) {
  const d = String(probe || '').replace(/\D/g, '');
  if (!d) return 0;
  return parseInt(d.slice(0, 4), 10) || 0;
}

function parseGrossG(v) {
  return parseFloat(String(v || '').replace(/\s/g, '').replace(',', '.')) || 0;
}

export function ContractReceipt({ formatMoney, prefill, onConsumedPrefill, toast, price, user }) {
  const [contractNo, setContractNo] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [phone, setPhone] = useState('');
  const [passportLine, setPassportLine] = useState('');
  const [address, setAddress] = useState('');
  const [appraiserName, setAppraiserName] = useState('');
  const [rows, setRows] = useState(() => [emptyRow()]);
  const [customerId, setCustomerId] = useState(null);

  const [searchQ, setSearchQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHits, setSearchHits] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const searchTimer = useRef(null);
  const searchBoxRef = useRef(null);
  const phoneAutofillTimer = useRef(null);

  const [pdfBusy, setPdfBusy] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsLink, setSmsLink] = useState('');
  const [smsDev, setSmsDev] = useState('');
  const [fieldStaff, setFieldStaff] = useState([]);
  const [fieldCourierUid, setFieldCourierUid] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [baseOpen, setBaseOpen] = useState(false);
  const [settings, setSettings] = useState(null);
  const rowCalcTimers = useRef({});
  const firstCalcRef = useRef(false);

  const rowTotal = useMemo(() => sumRows(rows), [rows]);

  // Транслируем сводку текущего договора наружу — для боковой панели страницы.
  useEffect(() => {
    const filled = rows.filter(
      (r) => r.itemName || r.weightGross || r.weightNet || r.priceRub,
    ).length;
    const totalGross = rows.reduce((s, r) => s + (parseFloat(String(r.weightGross || '').replace(',', '.')) || 0), 0);
    const totalNet = rows.reduce((s, r) => s + (parseFloat(String(r.weightNet || '').replace(',', '.')) || 0), 0);
    window.dispatchEvent(new CustomEvent('cg:contract-summary', {
      detail: {
        rowsCount: rows.length,
        filledRowsCount: filled,
        totalRub: rowTotal,
        totalGross,
        totalNet,
        sellerName: '',
      },
    }));
  }, [rows, rowTotal]);

  useEffect(() => {
    let alive = true;
    api
      .settings()
      .then((s) => {
        if (alive) setSettings(mergeSettings(s));
      })
      .catch(() => {
        if (alive) setSettings(mergeSettings(null));
      });
    return () => {
      alive = false;
    };
  }, []);

  const applyCalcToRow = useCallback(
    (i) => {
      if (!settings || !price?.goldRubPerGram) return;
      setRows((prev) => {
        const row = prev[i];
        if (!row) return prev;
        if (!isGoldScrapMetal(row.metal)) return prev;
        const w = parseGrossG(row.weightGross);
        const purity = parsePurityThousand(row.probe);
        if (w <= 0 || purity <= 0) return prev;
        const r = calculateBuybackRange({
          weightGrams: w,
          purityPerThousand: purity,
          goldRubPerGram: price.goldRubPerGram,
          settings,
        });
        if (!r.ok) return prev;
        const pr = String(Math.round(r.midRub));
        const wn = r.fineGrams.toFixed(3).replace('.', ',');
        if (row.priceRub === pr && String(row.weightNet) === wn) return prev;
        return prev.map((x, j) => (j === i ? { ...x, priceRub: pr, weightNet: wn } : x));
      });
    },
    [settings, price]
  );

  const scheduleRowCalc = useCallback(
    (i) => {
      if (rowCalcTimers.current[i]) clearTimeout(rowCalcTimers.current[i]);
      rowCalcTimers.current[i] = setTimeout(() => {
        rowCalcTimers.current[i] = null;
        applyCalcToRow(i);
      }, 400);
    },
    [applyCalcToRow]
  );

  useEffect(() => {
    if (!settings || !price?.goldRubPerGram || firstCalcRef.current) return;
    firstCalcRef.current = true;
    for (let k = 0; k < 12; k++) {
      setTimeout(() => applyCalcToRow(k), 90 * k);
    }
  }, [settings, price, applyCalcToRow]);

  function patchRowAndMaybeCalc(i, patch) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    if (patch && ('probe' in patch || 'weightGross' in patch || 'metal' in patch)) {
      scheduleRowCalc(i);
    }
  }

  useEffect(() => {
    if (!prefill) return;
    if (typeof prefill.totalRub === 'number' && Number.isFinite(prefill.totalRub)) {
      const tr = Math.round(prefill.totalRub);
      const next = [emptyRow()];
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
    setRows((prev) => prev.length >= 3 ? prev : [...prev, emptyRow()]);
  }

  function removeRow(i) {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, j) => j !== i);
      if (prev[i]?.photoUrl) URL.revokeObjectURL(prev[i].photoUrl);
      return next;
    });
  }

  /** Полная очистка формы — для оформления следующего клиента. */
  function resetForm() {
    setRows((prev) => {
      for (const r of prev) if (r?.photoUrl) URL.revokeObjectURL(r.photoUrl);
      return [emptyRow()];
    });
    setContractNo('');
    setSellerName('');
    setPhone('');
    setPassportLine('');
    setAddress('');
    setAppraiserName('');
    setCustomerId(null);
    setSearchQ('');
    setSearchHits([]);
    setFieldCourierUid('');
    firstCalcRef.current = false;
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function finishAndReset() {
    setSmsOpen(false);
    resetForm();
    toast?.('Готово. Форма очищена для следующего клиента', 'success');
  }

  function handlePhotoChange(i, file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setRows((prev) =>
      prev.map((r, j) => {
        if (j !== i) return r;
        if (r.photoUrl) URL.revokeObjectURL(r.photoUrl);
        return { ...r, photoFile: file, photoUrl: url };
      }),
    );
  }

  function removePhoto(i) {
    setRows((prev) =>
      prev.map((r, j) => {
        if (j !== i) return r;
        if (r.photoUrl) URL.revokeObjectURL(r.photoUrl);
        return { ...r, photoFile: null, photoUrl: '' };
      }),
    );
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
    setTimeout(() => scheduleRowCalc(i), 200);
    toast?.('Подставлены металл и проба из позиции 1', 'success');
  }

  function duplicateRow(i) {
    setRows((prev) => {
      const row = prev[i];
      const copy = { ...row };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
    setTimeout(() => scheduleRowCalc(i + 1), 200);
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
    if (!appraiserName.trim()) {
      toast?.('Укажите ФИО эксперта-оценщика', 'error');
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
      const { blob, dealId } = await api.scrapContractPdf({
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

      // Асинхронно загружаем фотографии изделий (не блокируем PDF-скачивание)
      if (dealId) {
        rows.forEach((r, i) => {
          if (!r.photoFile) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const base64 = ev.target?.result;
            if (!base64) return;
            api.dealPhotoUpload(dealId, i, base64, r.photoFile.type).catch(() => {});
          };
          reader.readAsDataURL(r.photoFile);
        });
      }
    } catch (e) {
      toast?.(e?.message || 'Ошибка PDF', 'error');
    } finally {
      setPdfBusy(false);
    }
  }

  useEffect(() => {
    if (!isUserManagerRole(user?.role)) return;
    let alive = true;
    api
      .users()
      .then((list) => {
        if (!alive) return;
        const arr = Array.isArray(list) ? list : [];
        setFieldStaff(
          arr.filter((u) => ['courier', 'seller'].includes(String(u?.role || '').toLowerCase()))
        );
      })
      .catch(() => setFieldStaff([]));
    return () => {
      alive = false;
    };
  }, [user?.role]);

  async function sendSmsSession() {
    const fn = sellerName.trim();
    if (!fn) {
      toast?.('Укажите ФИО продавца', 'error');
      return;
    }
    if (!appraiserName.trim()) {
      toast?.('Укажите ФИО эксперта-оценщика', 'error');
      return;
    }
    if (!rowTotal || rowTotal <= 0) {
      toast?.('Укажите стоимость хотя бы в одной строке', 'error');
      return;
    }
    const digs = normalizePhoneDigits(phone);
    if (digs.length !== 10) {
      toast?.('Укажите телефон клиента (РФ, 10 цифр) для СМС', 'error');
      return;
    }
    setSmsBusy(true);
    try {
      const body = buildContractPayloadForSession({
        contractNo,
        customerId,
        sellerName,
        passportLine,
        address,
        phone,
        appraiserName,
        rows,
        totalRub: rowTotal,
        courierId: isUserManagerRole(user?.role) ? fieldCourierUid : undefined,
      });
      const r = await api.fieldDealSessionCreate(body);
      setSmsLink(r.confirmUrl || '');
      setSmsDev(r.devCodePreview || '');
      setSmsOpen(true);
      toast?.('Ссылка создана, СМС отправлена (или см. лог сервера в режиме заглушки)', 'success');
    } catch (e) {
      toast?.(e?.message || 'Не удалось отправить', 'error');
    } finally {
      setSmsBusy(false);
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
      <div className="contract-hero">
        <h2 className="contract-title">Договор-квитанция</h2>
        <p className="contract-lead">
          Заполните данные продавца и позиции. Сумма из калькулятора подставляется автоматически при переходе с расчёта.
        </p>
      </div>

      <PageHint id="contract" title="Как оформить договор">
        Найдите клиента по телефону или заполните вручную. Для золота укажите пробу и вес — стоимость подставится сама. К каждой позиции можно приложить <b>фото изделия</b>. Кнопка <b>«Скачать PDF»</b> сохраняет сделку в учёт и клиента в базу.
      </PageHint>

      <div className="contract-card" ref={searchBoxRef}>
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

      <div className="contract-card">
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

      <div className="contract-card">
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

      <div className="contract-card">
        <div className="contract-table-head">
          <div>
            <h3 className="contract-h3">Позиции (лом)</h3>
            <p className="muted small contract-pos-hint">
              Для <strong>золота</strong> — проба и вес, стоимость подставится автоматически. Серебро и другие металлы вводятся вручную.
            </p>
          </div>
        </div>
        <div className="contract-positions">
          {rows.map((r, i) => (
            <div key={i} className="contract-row-card">
              <div className="contract-row-toolbar">
                <span className="contract-row-num mono-nums">Позиция {i + 1}</span>
                <div className="contract-row-actions">
                  {i > 0 && (
                    <button type="button" className="btn-row-tool" onClick={() => applyFirstRowTemplate(i)}>
                      Как в 1-й
                    </button>
                  )}
                  <button type="button" className="btn-row-tool" onClick={() => duplicateRow(i)} title="Дублировать">
                    Дублировать
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    title="Удалить позицию"
                    onClick={() => removeRow(i)}
                    disabled={rows.length <= 1}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>

              <div className="contract-row-body">
                <div className="contract-row-fields">
                  <label className="field contract-row-full">
                    <span className="field-label">Наименование изделия</span>
                    <input
                      value={r.itemName}
                      onChange={(e) => updateRow(i, { itemName: e.target.value })}
                      placeholder="Лом ювелирных изделий"
                    />
                  </label>
                  <div className="contract-row-two">
                    <label className="field">
                      <span className="field-label">Металл</span>
                      <input value={r.metal} onChange={(e) => patchRowAndMaybeCalc(i, { metal: e.target.value })} />
                    </label>
                    <label className="field">
                      <span className="field-label">Проба</span>
                      <input
                        className="mono-nums"
                        inputMode="numeric"
                        value={r.probe}
                        onChange={(e) => patchRowAndMaybeCalc(i, { probe: e.target.value })}
                        placeholder="585"
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
                        onChange={(e) => patchRowAndMaybeCalc(i, { weightGross: e.target.value })}
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

                <div className="contract-row-photo">
                  {r.photoUrl ? (
                    <div className="crp-preview-wrap">
                      <img src={r.photoUrl} alt="Фото изделия" className="crp-preview" />
                      <button type="button" className="crp-remove" onClick={() => removePhoto(i)} title="Удалить фото">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ) : (
                    <label className="crp-upload" title="Загрузить фото изделия">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="crp-file-input"
                        onChange={(e) => handlePhotoChange(i, e.target.files?.[0])}
                      />
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="3"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <path d="M21 15l-5-5L5 21"/>
                      </svg>
                      <span>Фото</span>
                    </label>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button type="button" className="contract-add-pos-btn" onClick={addRow} disabled={rows.length >= 3} title={rows.length >= 3 ? 'Максимум 3 позиции в договоре' : undefined}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Добавить позицию
        </button>

        <div className="contract-total">
          <span className="muted">Итого по всем позициям</span>
          <span className="contract-total-value mono-nums">{formatMoney(rowTotal)}</span>
        </div>
      </div>

      <div className="contract-card">
        <label className="field">
          <span className="field-label">Эксперт-оценщик (ФИО) <span className="field-required" aria-hidden>*</span></span>
          <input
            value={appraiserName}
            onChange={(e) => setAppraiserName(e.target.value)}
            placeholder="Кто принял товар"
            required
          />
        </label>
      </div>

      {isUserManagerRole(user?.role) && fieldStaff.length > 0 && (
        <div className="contract-card">
          <label className="field">
            <span className="field-label">Сделку после СМС учитывать за сотрудника</span>
            <select
              className="contract-sms-select"
              value={fieldCourierUid}
              onChange={(e) => setFieldCourierUid(e.target.value)}
            >
              <option value="">— кто отправил ссылку (текущий пользователь) —</option>
              {fieldStaff.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.email} ({u.role})
                </option>
              ))}
            </select>
          </label>
          <p className="muted small" style={{ marginTop: 8 }}>
            Если не выбрано, в аналитике и KPI оператором будет тот, кто создал сессию подтверждения.
          </p>
        </div>
      )}

      <div className="contract-actions">
        <button type="button" className="btn-primary contract-pdf-btn" disabled={pdfBusy || smsBusy} onClick={handlePdf}>
          {pdfBusy ? 'Формируем PDF…' : 'Скачать PDF'}
        </button>
        <button
          type="button"
          className="btn-secondary contract-sms-btn"
          disabled={pdfBusy || smsBusy}
          onClick={sendSmsSession}
          title="Клиент откроет ссылку на телефоне и введёт код из СМС. Сделка попадёт в учёт после подтверждения."
        >
          {smsBusy ? 'Отправка…' : 'Ссылка + СМС клиенту'}
        </button>
        <button
          type="button"
          className="contract-reset-btn"
          disabled={pdfBusy || smsBusy}
          onClick={() => {
            if (rowTotal > 0 || sellerName.trim()) {
              if (!window.confirm('Очистить форму и начать новый договор? Несохранённые данные пропадут.')) return;
            }
            resetForm();
            toast?.('Форма очищена', 'success');
          }}
          title="Очистить всё и начать новый договор"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          Новый договор
        </button>
      </div>

      {smsOpen && typeof document !== 'undefined' && createPortal(
        <div className="contract-sms-overlay" role="dialog" aria-modal="true" aria-label="Ссылка для клиента">
          <div className="contract-sms-modal">
            <div className="csm-icon" aria-hidden>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            </div>
            <h3 className="csm-title">Ссылка отправлена клиенту</h3>
            <p className="csm-sub">Клиент откроет ссылку на телефоне и подтвердит сделку кодом из СМС. После подтверждения она автоматически попадёт в учёт и аналитику.</p>

            <div className="csm-steps">
              <div className="csm-step"><span className="csm-step__n">1</span> Клиент открывает ссылку</div>
              <div className="csm-step"><span className="csm-step__n">2</span> Вводит код из СМС</div>
              <div className="csm-step"><span className="csm-step__n">3</span> Сделка сохранена ✓</div>
            </div>

            <div className="csm-link-row">
              <input className="csm-link mono-nums" readOnly value={smsLink} onFocus={(e) => e.target.select()} />
              <button
                type="button"
                className="csm-copy"
                onClick={() => { if (smsLink) navigator.clipboard?.writeText(smsLink).then(() => toast?.('Ссылка скопирована', 'success')).catch(() => {}); }}
                title="Копировать ссылку"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>

            {smsDev && (
              <p className="csm-dev">Тест-код: <span className="mono-nums">{smsDev}</span></p>
            )}

            <div className="csm-actions">
              <button type="button" className="csm-btn csm-btn--ghost" onClick={() => setSmsOpen(false)}>
                Оставить открытым
              </button>
              <button type="button" className="csm-btn csm-btn--done" onClick={finishAndReset}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Готово, новый клиент
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        /* ── Contract page ── */
        .contract-page {
          display: flex; flex-direction: column; gap: 16px;
          animation: ctIn 440ms cubic-bezier(0.22,1,0.36,1) both;
        }
        @keyframes ctIn {
          from { opacity:0; transform: translate3d(0,14px,0); }
          to   { opacity:1; transform: translate3d(0,0,0); }
        }

        /* Hero */
        .contract-hero { padding: 22px 22px 18px; border-radius: 18px; }
        .contract-title {
          font-family: var(--font-display);
          font-size: clamp(1.3rem, 3vw, 1.6rem);
          font-weight: 700; margin: 0 0 6px; letter-spacing: -0.02em;
        }
        .contract-lead { margin: 0; font-size: 0.9rem; line-height: 1.5; color: var(--text-muted); }

        /* Cards */
        .contract-card {
          padding: 22px 20px;
          border-radius: 18px;
          border: 1px solid var(--stroke-soft);
          background: var(--bg-panel-solid);
          transition: box-shadow 260ms;
        }
        .contract-card:focus-within { box-shadow: 0 0 0 2px var(--accent-soft); }
        .contract-h3 {
          font-family: var(--font-display); font-size: 1rem; font-weight: 700;
          margin: 0 0 14px; letter-spacing: -0.01em;
        }
        .contract-hint { margin: 0 0 14px; line-height: 1.45; }

        /* Search */
        .contract-search-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
        .contract-search-header .contract-h3 { margin: 0; }
        .contract-search-wrap { position: relative; margin-top: 2px; }
        .contract-search-input { width: 100%; }
        .contract-search-busy { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; font-size: 0.78rem; }
        .contract-search-list {
          list-style: none; margin: 8px 0 0; padding: 0;
          border-radius: 14px; border: 1px solid var(--stroke-soft);
          background: var(--bg-elevated); max-height: 220px; overflow: auto;
          box-shadow: var(--shadow-pop);
        }
        .contract-search-item {
          width: 100%; text-align: left; padding: 11px 14px;
          border: none; background: transparent; cursor: pointer;
          display: flex; flex-direction: column; gap: 2px;
          border-bottom: 1px solid var(--stroke-soft);
          transition: background 160ms;
        }
        .contract-search-item:last-child { border-bottom: none; }
        .contract-search-item:hover { background: var(--accent-soft); }
        .contract-search-name { font-weight: 600; font-size: 0.9rem; }

        /* Grid layouts */
        .contract-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .contract-grid-one { grid-template-columns: 1fr; }
        @media (max-width: 520px) { .contract-grid { grid-template-columns: 1fr; } }
        .contract-fields { display: flex; flex-direction: column; gap: 12px; }
        .contract-seller-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; align-items: start; }
        .contract-span-2 { grid-column: 1 / -1; }
        @media (max-width: 560px) {
          .contract-seller-grid { grid-template-columns: 1fr; }
          .contract-span-2 { grid-column: 1; }
        }
        .contract-fields textarea, .contract-address-text {
          resize: vertical; min-height: 72px; font-family: inherit; line-height: 1.45;
        }
        .contract-address-text { font-size: 0.9rem; }
        .contract-save-btn { margin-top: 14px; width: 100%; }

        /* Positions */
        .contract-table-head { margin-bottom: 16px; }
        .contract-table-head .contract-h3 { margin: 0 0 4px; }
        .contract-pos-hint { margin: 0; line-height: 1.45; max-width: 44rem; font-size: 0.85rem; }
        .contract-pos-hint strong { color: var(--accent); font-weight: 600; }

        .contract-positions { display: flex; flex-direction: column; gap: 14px; }

        .contract-row-card {
          border: 1px solid var(--stroke-soft);
          border-radius: 16px;
          padding: 16px 16px 18px;
          background: var(--bg-elevated);
          transition: box-shadow 240ms;
          animation: ctIn 400ms cubic-bezier(0.22,1,0.36,1) both;
        }
        .contract-row-card:focus-within { box-shadow: 0 0 0 2px var(--accent-soft); }

        .contract-row-toolbar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 8px; margin-bottom: 14px; flex-wrap: wrap;
        }
        .contract-row-num {
          font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.14em;
          color: var(--text-muted); font-weight: 700; font-family: var(--font-display);
        }
        .contract-row-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .btn-row-tool {
          border: 1px solid var(--stroke-soft); background: var(--bg-panel-solid);
          color: var(--text-muted); font-size: 0.72rem; padding: 5px 12px;
          border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 160ms;
        }
        .btn-row-tool:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
        .btn-icon {
          border: none; background: transparent; color: var(--text-muted); cursor: pointer;
          line-height: 1; padding: 6px; border-radius: 8px; display: flex; align-items: center;
          transition: color 160ms, background 160ms;
        }
        .btn-icon:hover:not(:disabled) { color: var(--crimson); background: var(--crimson-soft); }
        .btn-icon:disabled { opacity: 0.3; cursor: not-allowed; }

        /* Row body: fields + photo side by side */
        .contract-row-body {
          display: grid;
          grid-template-columns: 1fr 112px;
          gap: 14px;
          align-items: start;
        }
        @media (max-width: 600px) {
          .contract-row-body { grid-template-columns: 1fr; }
        }
        .contract-row-fields { display: flex; flex-direction: column; gap: 10px; }

        .contract-row-full input { width: 100%; }
        .contract-row-two {
          display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px;
        }
        .contract-row-three {
          display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px 12px;
        }
        @media (max-width: 500px) {
          .contract-row-two { grid-template-columns: 1fr; }
          .contract-row-three { grid-template-columns: 1fr 1fr; }
        }
        .contract-row-two .field input,
        .contract-row-three .field input { width: 100%; }

        /* Photo upload */
        .contract-row-photo { display: flex; align-items: flex-start; }
        .crp-upload {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 6px; width: 100%; aspect-ratio: 1 / 1;
          border: 1.5px dashed var(--stroke-soft); border-radius: 14px;
          background: var(--bg-panel-solid); cursor: pointer;
          color: var(--text-muted); font-size: 0.7rem; font-weight: 600;
          transition: border-color 200ms, background 200ms, color 200ms;
          padding: 8px;
        }
        .crp-upload:hover { border-color: var(--accent); background: var(--accent-soft); color: var(--text-strong); }
        .crp-file-input { display: none; }
        .crp-preview-wrap {
          position: relative; width: 100%; aspect-ratio: 1 / 1; border-radius: 14px; overflow: hidden;
        }
        .crp-preview { width: 100%; height: 100%; object-fit: cover; display: block; }
        .crp-remove {
          position: absolute; top: 6px; right: 6px;
          border: none; background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
          color: #fff; border-radius: 50%; width: 26px; height: 26px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background 160ms;
        }
        .crp-remove:hover { background: var(--crimson); }

        /* Add position button */
        .contract-add-pos-btn {
          display: flex; align-items: center; gap: 8px; justify-content: center;
          width: 100%; margin-top: 14px; padding: 13px 16px;
          border: 1.5px dashed var(--stroke-soft); border-radius: 14px;
          background: transparent; color: var(--text-muted);
          font-size: 0.9rem; font-weight: 600; cursor: pointer;
          transition: all 200ms cubic-bezier(0.22,1,0.36,1);
        }
        .contract-add-pos-btn:hover:not(:disabled) {
          border-color: var(--accent); color: var(--accent);
          background: var(--accent-soft);
          transform: translateY(-1px);
        }
        .contract-add-pos-btn:disabled {
          opacity: 0.35; cursor: not-allowed;
        }

        /* Total */
        .contract-total {
          display: flex; justify-content: space-between; align-items: baseline;
          margin-top: 18px; padding-top: 14px;
          border-top: 1px solid var(--stroke-soft);
        }
        .contract-total-value {
          font-size: 1.25rem; font-weight: 700;
          color: var(--accent);
          font-family: var(--font-display);
        }

        /* Actions */
        .contract-actions { display: flex; flex-wrap: wrap; gap: 10px; padding-bottom: 8px; }
        .contract-pdf-btn, .contract-sms-btn {
          flex: 1 1 200px; min-width: 0; padding: 14px 16px; font-size: 0.95rem;
        }

        /* SMS overlay → completion modal */
        .contract-sms-overlay {
          position: fixed; inset: 0; z-index: 80;
          background: rgba(0,0,0,0.55); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center; padding: 16px;
          animation: ctFade 240ms ease both;
        }
        @keyframes ctFade { from { opacity: 0; } }
        .contract-sms-modal {
          width: 100%; max-width: 440px; padding: 28px 24px 24px;
          border-radius: 22px; border: 1px solid var(--stroke-soft);
          background: var(--bg-panel-solid);
          box-shadow: var(--shadow-pop);
          text-align: center;
          animation: ctIn 380ms cubic-bezier(0.22,1,0.36,1) both;
        }
        .csm-icon {
          width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 16px;
          display: flex; align-items: center; justify-content: center;
          background: var(--emerald-soft); color: var(--emerald);
          animation: csmPop 460ms cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes csmPop { from { transform: scale(0.5); opacity: 0; } }
        .csm-title { font-family: var(--font-display); font-size: 1.2rem; font-weight: 700; margin: 0 0 8px; color: var(--text-strong); }
        .csm-sub { font-size: 0.85rem; line-height: 1.5; color: var(--text-muted); margin: 0 0 18px; }
        .csm-steps { display: flex; flex-direction: column; gap: 8px; text-align: left; margin-bottom: 18px; }
        .csm-step { display: flex; align-items: center; gap: 10px; font-size: 0.84rem; color: var(--text); }
        .csm-step__n {
          width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: var(--accent-soft); color: var(--text-strong); font-size: 0.72rem; font-weight: 700;
        }
        .csm-link-row { display: flex; gap: 8px; margin-bottom: 6px; }
        .csm-link {
          flex: 1; min-width: 0; padding: 10px 12px; font-size: 0.78rem;
          border-radius: 11px; border: 1px solid var(--stroke-soft);
          background: var(--bg-elevated); color: var(--text);
        }
        .csm-copy {
          flex-shrink: 0; width: 42px; border-radius: 11px;
          border: 1px solid var(--stroke-soft); background: var(--bg-elevated);
          color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: all 160ms;
        }
        .csm-copy:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
        .csm-dev { font-size: 0.74rem; color: var(--text-dim); margin: 8px 0 0; }
        .csm-actions { display: flex; gap: 10px; margin-top: 18px; }
        .csm-btn {
          flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          padding: 13px; border-radius: 12px; font-size: 0.88rem; font-weight: 600; cursor: pointer;
          transition: all 180ms cubic-bezier(0.22,1,0.36,1);
        }
        .csm-btn--ghost { border: 1px solid var(--stroke-soft); background: transparent; color: var(--text-muted); }
        .csm-btn--ghost:hover { border-color: var(--text-muted); color: var(--text); }
        .csm-btn--done { border: none; background: linear-gradient(135deg, var(--emerald), var(--emerald-strong)); color: #fff; box-shadow: 0 4px 16px var(--emerald-soft); }
        .csm-btn--done:hover { transform: translateY(-1px); }

        .contract-sms-select { width: 100%; margin-top: 4px; }
        .btn-ghost.small { font-size: 0.78rem; padding: 6px 12px; flex-shrink: 0; }

        /* Reset / new contract button */
        .contract-reset-btn {
          display: inline-flex; align-items: center; gap: 7px; justify-content: center;
          flex: 0 0 auto; padding: 14px 18px; border-radius: 12px;
          border: 1px solid var(--stroke-soft); background: transparent;
          color: var(--text-muted); font-size: 0.9rem; font-weight: 600; cursor: pointer;
          transition: all 180ms cubic-bezier(0.22,1,0.36,1);
        }
        .contract-reset-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
        .contract-reset-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        /* Required field mark */
        .field-required { color: var(--danger, #ef4444); margin-left: 2px; font-weight: 700; }
      `}</style>
    </div>
  );
}
