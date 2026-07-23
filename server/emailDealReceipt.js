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
          <tr style="border-bottom:1px solid #ecedf1;">
            <td style="padding:11px 12px;font-size:13px;color:#16181d;">${name}</td>
            <td style="padding:11px 12px;font-size:13px;color:#16181d;text-align:center;">${probeLabel}</td>
            <td style="padding:11px 12px;font-size:13px;color:#16181d;text-align:center;">${wg} / ${wn} г</td>
            <td style="padding:11px 12px;font-size:13px;color:#16181d;text-align:right;font-weight:700;">${price}</td>
          </tr>`;
      }).join('')
    : `<tr><td colspan="4" style="padding:14px 12px;color:#9aa0aa;text-align:center;font-size:13px;">Нет позиций</td></tr>`;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Чек по сделке REAKTIVO</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:32px 0;">
  <tr>
    <td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(20,22,40,0.10);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#f0437a 0%,#e02d5f 55%,#c22052 100%);padding:30px 32px;text-align:center;">
            <p style="margin:0;font-size:23px;font-weight:800;color:#ffffff;letter-spacing:0.10em;">REAKTIVO <span style="opacity:0.85;">PRO</span></p>
            <p style="margin:7px 0 0;font-size:13px;color:#ffffff;opacity:0.85;">Оценка и выкуп · ваш чек</p>
          </td>
        </tr>

        <!-- Title row -->
        <tr>
          <td style="padding:24px 32px 12px;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#16181d;">Чек по сделке</p>
            <p style="margin:5px 0 0;font-size:13px;color:#8a8f99;">Договор № ${contract} · ${dt}</p>
          </td>
        </tr>

        <!-- Payout — green block -->
        <tr>
          <td style="padding:0 32px 18px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#12824f,#0f7a4a);border-radius:16px;">
              <tr>
                <td style="padding:20px 22px;">
                  <p style="margin:0;font-size:12px;color:#d6f5e6;text-transform:uppercase;letter-spacing:0.08em;">Сумма к получению</p>
                  <p style="margin:6px 0 0;font-size:30px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${amount}</p>
                </td>
                <td style="padding:20px 22px;text-align:right;vertical-align:middle;">
                  <span style="background:rgba(255,255,255,0.22);color:#ffffff;font-size:12px;font-weight:700;padding:6px 14px;border-radius:20px;letter-spacing:0.04em;">ПОДТВЕРЖДЕНО</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Summary -->
        <tr>
          <td style="padding:0 32px 4px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:50%;padding:0 8px 14px 0;vertical-align:top;">
                  <p style="margin:0;font-size:11px;color:#9aa0aa;text-transform:uppercase;letter-spacing:0.06em;">Продавец</p>
                  <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#16181d;">${seller}</p>
                </td>
                <td style="width:50%;padding:0 0 14px 8px;vertical-align:top;">
                  <p style="margin:0;font-size:11px;color:#9aa0aa;text-transform:uppercase;letter-spacing:0.06em;">Телефон</p>
                  <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#16181d;">${phone || '—'}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Items table -->
        <tr>
          <td style="padding:0 32px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px;overflow:hidden;border:1px solid #ecedf1;">
              <thead>
                <tr style="background:#f7f3f4;">
                  <th style="padding:10px 12px;font-size:11px;color:#8a8f99;text-align:left;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Изделие</th>
                  <th style="padding:10px 12px;font-size:11px;color:#8a8f99;text-align:center;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Проба</th>
                  <th style="padding:10px 12px;font-size:11px;color:#8a8f99;text-align:center;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Вес бр./нетто</th>
                  <th style="padding:10px 12px;font-size:11px;color:#8a8f99;text-align:right;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Сумма</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#faf9fa;padding:16px 32px;text-align:center;border-top:1px solid #ecedf1;">
            <p style="margin:0;font-size:12px;color:#aab0ba;">Автоматическое письмо REAKTIVO PRO. Отвечать на него не нужно.</p>
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
<body style="margin:0;padding:0;background:#f4f4f6;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:32px 0;">
  <tr>
    <td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(20,22,40,0.10);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#f0437a 0%,#e02d5f 55%,#c22052 100%);padding:24px 28px;">
            <p style="margin:0;font-size:20px;font-weight:800;color:#ffffff;letter-spacing:0.07em;">REAKTIVO <span style="opacity:0.85;">PRO</span></p>
            <p style="margin:4px 0 0;font-size:12px;color:#ffffff;opacity:0.85;">Новая подтверждённая сделка</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:24px 28px;">
            <p style="margin:0 0 18px;font-size:15px;font-weight:600;color:#16181d;">Клиент подтвердил сделку кодом из СМС</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px;border:1px solid #ecedf1;overflow:hidden;">
              <tr style="background:#f7f3f4;">
                <td style="padding:11px 14px;font-size:12px;color:#8a8f99;font-weight:600;width:45%;">Договор №</td>
                <td style="padding:11px 14px;font-size:13px;color:#16181d;font-weight:600;">${contract}</td>
              </tr>
              <tr style="border-top:1px solid #ecedf1;">
                <td style="padding:11px 14px;font-size:12px;color:#8a8f99;font-weight:600;">Продавец</td>
                <td style="padding:11px 14px;font-size:13px;color:#16181d;">${seller}</td>
              </tr>
              <tr style="border-top:1px solid #ecedf1;">
                <td style="padding:11px 14px;font-size:12px;color:#8a8f99;font-weight:600;">Дата</td>
                <td style="padding:11px 14px;font-size:13px;color:#16181d;">${dt}</td>
              </tr>
              <tr style="border-top:1px solid #ecedf1;background:#eef7f1;">
                <td style="padding:13px 14px;font-size:12px;color:#0f7a4a;font-weight:600;">Итого</td>
                <td style="padding:13px 14px;font-size:18px;font-weight:800;color:#12824f;">${amount}</td>
              </tr>
              <tr style="border-top:1px solid #ecedf1;">
                <td style="padding:11px 14px;font-size:12px;color:#8a8f99;font-weight:600;">ID сделки</td>
                <td style="padding:11px 14px;font-size:12px;color:#aab0ba;font-family:monospace;">${shortId}…</td>
              </tr>
            </table>
            <p style="margin:18px 0 0;font-size:13px;color:#6b655a;line-height:1.5;">
              К письму прикреплён <strong style="color:#16181d;">PDF-договор</strong>. Откройте для просмотра или сохраните в архив.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#faf9fa;padding:14px 28px;border-top:1px solid #ecedf1;text-align:center;">
            <p style="margin:0;font-size:11px;color:#aab0ba;">Автоматическое уведомление REAKTIVO PRO. Отвечать не нужно.</p>
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

/**
 * Письмо клиенту fintech-кабинета о решении по его заявке (KYC).
 * decision: 'approved' | 'rejected' | 'blocked'. Best-effort — вызывающий код не должен
 * падать, если почта не настроена или Resend вернул ошибку.
 */
export async function sendFintechDecisionEmailIfConfigured({ toEmail, fullName, decision, rejectReason, cabinetUrl }) {
  const key = (process.env.RESEND_API_KEY || '').trim();
  const from = (process.env.DEAL_RECEIPT_EMAIL_FROM || '').trim();
  if (!key || !from || !toEmail) {
    if (toEmail) console.info('[email fintech decision] skip: RESEND_API_KEY or DEAL_RECEIPT_EMAIL_FROM missing');
    return { sent: false, reason: 'not_configured' };
  }

  const approved = decision === 'approved';
  const name = String(fullName || '').trim();
  const greeting = name ? `Здравствуйте, ${name}!` : 'Здравствуйте!';
  const url = String(cabinetUrl || '').trim();

  const subject = approved
    ? 'Ваш счёт Reaktivo Invest открыт — добро пожаловать!'
    : decision === 'blocked'
      ? 'Доступ к Reaktivo Invest приостановлен'
      : 'Заявка Reaktivo Invest: требуются уточнения';

  const statusBadge = approved
    ? '<span style="background:rgba(255,255,255,0.22);color:#ffffff;font-size:12px;font-weight:700;padding:6px 14px;border-radius:20px;letter-spacing:0.04em;">ОДОБРЕНО</span>'
    : '<span style="background:rgba(255,255,255,0.22);color:#ffffff;font-size:12px;font-weight:700;padding:6px 14px;border-radius:20px;letter-spacing:0.04em;">ТРЕБУЕТСЯ ВНИМАНИЕ</span>';

  const heroBg = approved
    ? 'linear-gradient(135deg,#12824f,#0f7a4a)'
    : 'linear-gradient(135deg,#b45309,#92400e)';

  const heroText = approved
    ? 'Документы проверены — золотой счёт активен'
    : decision === 'blocked'
      ? 'Доступ к операциям временно приостановлен'
      : 'Заявка отклонена — можно загрузить документы повторно';

  const bodyText = approved
    ? 'Теперь вам доступны покупка золота от 1 грамма, отслеживание стоимости портфеля и история операций в личном кабинете.'
    : decision === 'blocked'
      ? 'Для уточнения деталей свяжитесь с менеджером Reaktivo.'
      : 'Проверьте комментарий модератора ниже, загрузите документы ещё раз — и заявка автоматически уйдёт на повторную проверку.';

  const reasonHtml = !approved && rejectReason
    ? `<tr><td style="padding:0 32px 18px;">
         <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf2f2;border:1px solid #f5c6c6;border-radius:12px;">
           <tr><td style="padding:14px 18px;">
             <p style="margin:0;font-size:11px;color:#b23c3c;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Комментарий модератора</p>
             <p style="margin:6px 0 0;font-size:14px;color:#16181d;">${String(rejectReason)}</p>
           </td></tr>
         </table>
       </td></tr>`
    : '';

  const ctaHtml = url
    ? `<tr><td style="padding:4px 32px 26px;" align="center">
         <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#f0437a 0%,#e02d5f 55%,#c22052 100%);color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 34px;border-radius:12px;">Открыть кабинет</a>
       </td></tr>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:32px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(20,22,40,0.10);">
      <tr>
        <td style="background:linear-gradient(135deg,#f0437a 0%,#e02d5f 55%,#c22052 100%);padding:30px 32px;text-align:center;">
          <p style="margin:0;font-size:23px;font-weight:800;color:#ffffff;letter-spacing:0.10em;">REAKTIVO <span style="opacity:0.85;">INVEST</span></p>
          <p style="margin:7px 0 0;font-size:13px;color:#ffffff;opacity:0.85;">Инвестиции в золото · статус заявки</p>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 32px 12px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#16181d;">${greeting}</p>
          <p style="margin:8px 0 0;font-size:14px;color:#5c6270;line-height:1.55;">${bodyText}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 32px 18px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:${heroBg};border-radius:16px;">
            <tr>
              <td style="padding:20px 22px;">
                <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:0.08em;">Статус заявки</p>
                <p style="margin:6px 0 0;font-size:19px;font-weight:800;color:#ffffff;letter-spacing:-0.01em;">${heroText}</p>
              </td>
              <td style="padding:20px 22px;text-align:right;vertical-align:middle;">${statusBadge}</td>
            </tr>
          </table>
        </td>
      </tr>
      ${reasonHtml}
      ${ctaHtml}
      <tr>
        <td style="padding:0 32px 28px;">
          <p style="margin:0;font-size:12px;color:#9aa0aa;line-height:1.6;">Это автоматическое письмо сервиса Reaktivo Invest. Если вы не подавали заявку — просто проигнорируйте его или сообщите нам.</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const j = await resendSend({ to: [toEmail], subject, html });
  return { sent: true, id: j?.id };
}
