/**
 * Отправка email после подтверждения сделки.
 * RESEND_API_KEY + DEAL_RECEIPT_EMAIL_FROM — env-переменные.
 */

function formatMoney(n) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(Number(n || 0));
}

function formatDate(iso) {
  if (!iso) return new Date().toLocaleDateString('ru-RU');
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Moscow',
  });
}

/** Красивый HTML-чек для клиента */
function buildClientReceiptHtml({ contractNo, sellerName, totalRub, rows, phone, date }) {
  const amount = formatMoney(totalRub);
  const dt = date ? formatDate(date) : formatDate(null);
  const contract = contractNo || '—';
  const seller = sellerName || '—';

  const probeLabels = { '375': '375 (9 кт)', '585': '585 (14 кт)', '750': '750 (18 кт)', '999': '999 (24 кт)', '925': '925 (серебро)' };

  const filledRows = Array.isArray(rows)
    ? rows.filter((r) => {
        const hasName = String(r?.itemName || r?.item_name || '').trim().length > 0;
        const hasProbe = String(r?.probe || '').replace(/\D/g, '').length > 0;
        const hasWeight = String(r?.weightGross || r?.weight_gross || '').trim().length > 0;
        const hasPrice = r?.priceRub != null && Number(r.priceRub) > 0;
        return hasName || hasProbe || hasWeight || hasPrice;
      })
    : [];

  const rowsHtml = filledRows.length > 0
    ? filledRows.map((r) => {
        const probe = String(r?.probe || '').replace(/\D/g, '');
        const probeLabel = probeLabels[probe] || (probe ? `проба ${probe}` : '—');
        const wg = String(r?.weightGross || r?.weight_gross || '').trim() || '—';
        const wn = String(r?.weightNet || r?.weight_net || '').trim() || '—';
        const price = r?.priceRub != null && Number(r.priceRub) > 0 ? formatMoney(r.priceRub) : '—';
        const name = String(r?.itemName || r?.item_name || '').trim() || '—';
        return `
          <tr style="border-bottom:1px solid #f0e8d8;">
            <td style="padding:9px 10px;font-size:13px;color:#3d2b0e;">${name}</td>
            <td style="padding:9px 10px;font-size:13px;color:#3d2b0e;text-align:center;">${probeLabel}</td>
            <td style="padding:9px 10px;font-size:13px;color:#3d2b0e;text-align:center;">${wg} / ${wn} г</td>
            <td style="padding:9px 10px;font-size:13px;color:#3d2b0e;text-align:right;font-weight:600;">${price}</td>
          </tr>`;
      }).join('')
    : `<tr><td colspan="4" style="padding:14px 10px;color:#999;text-align:center;font-size:13px;">Нет позиций</td></tr>`;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Чек по сделке REAKTIVO</title>
</head>
<body style="margin:0;padding:0;background:#f7f0e6;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f0e6;padding:32px 0;">
  <tr>
    <td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#b8860b 0%,#e8c547 50%,#b8860b 100%);padding:28px 32px;text-align:center;">
            <p style="margin:0;font-size:22px;font-weight:800;color:#1a1000;letter-spacing:0.08em;text-transform:uppercase;">REAKTIVO PRO</p>
            <p style="margin:6px 0 0;font-size:13px;color:#4a3000;opacity:0.85;">Ювелирный учёт &amp; аналитика</p>
          </td>
        </tr>

        <!-- Title row -->
        <tr>
          <td style="padding:24px 32px 8px;border-bottom:2px solid #f0e8d8;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#1a1000;">✅ Чек по сделке</p>
            <p style="margin:4px 0 0;font-size:13px;color:#888;">Договор № ${contract} от ${dt}</p>
          </td>
        </tr>

        <!-- Summary -->
        <tr>
          <td style="padding:16px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:50%;padding:0 8px 12px 0;vertical-align:top;">
                  <p style="margin:0;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.06em;">Продавец</p>
                  <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#1a1000;">${seller}</p>
                </td>
                <td style="width:50%;padding:0 0 12px 8px;vertical-align:top;">
                  <p style="margin:0;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.06em;">Телефон</p>
                  <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#1a1000;">${phone || '—'}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Items table -->
        <tr>
          <td style="padding:0 32px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #f0e8d8;">
              <thead>
                <tr style="background:#fdf6e8;">
                  <th style="padding:9px 10px;font-size:11px;color:#888;text-align:left;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Изделие</th>
                  <th style="padding:9px 10px;font-size:11px;color:#888;text-align:center;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Проба</th>
                  <th style="padding:9px 10px;font-size:11px;color:#888;text-align:center;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Вес брутто/нетто</th>
                  <th style="padding:9px 10px;font-size:11px;color:#888;text-align:right;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Сумма</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </td>
        </tr>

        <!-- Total -->
        <tr>
          <td style="padding:0 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#fdf6e0,#fff9ec);border-radius:12px;border:2px solid #e8c547;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0;font-size:13px;color:#888;">Итого к получению:</p>
                  <p style="margin:4px 0 0;font-size:26px;font-weight:800;color:#b8860b;">${amount}</p>
                </td>
                <td style="padding:16px 20px;text-align:right;">
                  <span style="background:#b8860b;color:#fff;font-size:12px;font-weight:700;padding:5px 12px;border-radius:20px;letter-spacing:0.04em;">ПОДТВЕРЖДЕНО</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#fdf6e8;padding:16px 32px;text-align:center;border-top:1px solid #f0e8d8;">
            <p style="margin:0;font-size:12px;color:#aaa;">Это автоматическое письмо системы REAKTIVO PRO. Не отвечайте на него.</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Красивый HTML для письма оператору с прикреплённым PDF */
function buildOperatorReceiptHtml({ contractNo, sellerName, totalRub, dealId, date }) {
  const amount = formatMoney(totalRub);
  const dt = date ? formatDate(date) : formatDate(null);
  const contract = contractNo || '—';
  const seller = sellerName || '—';
  const shortId = dealId ? String(dealId).slice(0, 8).toUpperCase() : '—';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Подтверждённая сделка</title>
</head>
<body style="margin:0;padding:0;background:#f7f0e6;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f0e6;padding:32px 0;">
  <tr>
    <td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#b8860b 0%,#e8c547 50%,#b8860b 100%);padding:22px 28px;">
            <p style="margin:0;font-size:20px;font-weight:800;color:#1a1000;letter-spacing:0.06em;">REAKTIVO PRO</p>
            <p style="margin:4px 0 0;font-size:12px;color:#4a3000;opacity:0.8;">Новая подтверждённая сделка</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:24px 28px;">
            <p style="margin:0 0 18px;font-size:15px;font-weight:600;color:#1a1000;">✅ Клиент подтвердил сделку кодом из СМС</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;border:1px solid #f0e8d8;overflow:hidden;">
              <tr style="background:#fdf6e8;">
                <td style="padding:10px 14px;font-size:12px;color:#888;font-weight:600;width:45%;">Договор №</td>
                <td style="padding:10px 14px;font-size:13px;color:#1a1000;font-weight:600;">${contract}</td>
              </tr>
              <tr style="border-top:1px solid #f0e8d8;">
                <td style="padding:10px 14px;font-size:12px;color:#888;font-weight:600;">Продавец</td>
                <td style="padding:10px 14px;font-size:13px;color:#1a1000;">${seller}</td>
              </tr>
              <tr style="border-top:1px solid #f0e8d8;">
                <td style="padding:10px 14px;font-size:12px;color:#888;font-weight:600;">Дата</td>
                <td style="padding:10px 14px;font-size:13px;color:#1a1000;">${dt}</td>
              </tr>
              <tr style="border-top:1px solid #f0e8d8;background:#fffbef;">
                <td style="padding:12px 14px;font-size:12px;color:#888;font-weight:600;">Итого</td>
                <td style="padding:12px 14px;font-size:18px;font-weight:800;color:#b8860b;">${amount}</td>
              </tr>
              <tr style="border-top:1px solid #f0e8d8;">
                <td style="padding:10px 14px;font-size:12px;color:#888;font-weight:600;">ID сделки</td>
                <td style="padding:10px 14px;font-size:12px;color:#aaa;font-family:monospace;">${shortId}…</td>
              </tr>
            </table>
            <p style="margin:18px 0 0;font-size:13px;color:#666;line-height:1.5;">
              📎 К письму прикреплён <strong>PDF-договор</strong>. Откройте его для просмотра или сохраните в архив.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#fdf6e8;padding:14px 28px;border-top:1px solid #f0e8d8;text-align:center;">
            <p style="margin:0;font-size:11px;color:#bbb;">Автоматическое уведомление REAKTIVO PRO. Не отвечайте на него.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

async function resendSend(payload) {
  const key = (process.env.RESEND_API_KEY || '').trim();
  const from = (process.env.DEAL_RECEIPT_EMAIL_FROM || '').trim();
  if (!key || !from) return null;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, ...payload }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(j?.message || `Resend HTTP ${res.status}`);
    err.body = j;
    throw err;
  }
  return j;
}

/**
 * Письмо оператору с PDF-договором (после подтверждения клиентом).
 * Теперь содержит красивый HTML-body + прикреплённый PDF.
 */
export async function sendDealReceiptEmailIfConfigured({ toEmail, subject, pdfBuffer, filename, dealInfo }) {
  const key = (process.env.RESEND_API_KEY || '').trim();
  const from = (process.env.DEAL_RECEIPT_EMAIL_FROM || '').trim();
  if (!key || !from || !toEmail) {
    if (toEmail) console.info('[email deal receipt] skip: RESEND_API_KEY or DEAL_RECEIPT_EMAIL_FROM or recipient missing');
    return { sent: false, reason: 'not_configured' };
  }
  const buf = pdfBuffer && Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer || []);
  const b64 = buf.toString('base64');
  const html = buildOperatorReceiptHtml({
    contractNo: dealInfo?.contractNo || dealInfo?.contract_no,
    sellerName: dealInfo?.sellerName || dealInfo?.seller_name,
    totalRub: dealInfo?.totalRub || dealInfo?.total_rub,
    dealId: dealInfo?.id,
    date: dealInfo?.createdAt || dealInfo?.created_at,
  });
  const j = await resendSend({
    to: [toEmail],
    subject: subject || 'Подтверждённая сделка: квитанция (PDF)',
    html,
    attachments: [{ filename: filename || 'dogovor-kvitanciya.pdf', content: b64 }],
  });
  return { sent: true, id: j?.id };
}

/**
 * Чек клиенту на email (выбор на странице /podtverzhdenie/...).
 * Принимает структурированный payload или текст как fallback.
 */
export async function sendDealReceiptTextEmailIfConfigured({ toEmail, subject, text, html, payload, totalRub, createdAt }) {
  const key = (process.env.RESEND_API_KEY || '').trim();
  const from = (process.env.DEAL_RECEIPT_EMAIL_FROM || '').trim();
  if (!key || !from || !toEmail) {
    if (toEmail) console.info('[email deal receipt text] skip: RESEND_API_KEY or DEAL_RECEIPT_EMAIL_FROM or recipient missing');
    return { sent: false, reason: 'not_configured' };
  }

  let finalHtml = html;
  if (!finalHtml && payload) {
    finalHtml = buildClientReceiptHtml({
      contractNo: payload.contractNo,
      sellerName: payload.sellerName,
      totalRub: payload.totalRub ?? totalRub,
      rows: payload.rows,
      phone: payload.phone,
      date: createdAt,
    });
  }
  if (!finalHtml) {
    finalHtml = `<p style="font-family:Arial,sans-serif;font-size:14px;color:#333;">${text || ''}</p>`;
  }

  const j = await resendSend({
    to: [toEmail],
    subject: subject || 'Чек по сделке REAKTIVO',
    html: finalHtml,
    ...(text ? { text } : {}),
  });
  return { sent: true, id: j?.id };
}
