/**
 * Опционально: письмо с PDF после подтверждения клиентом.
 * RESEND_API_KEY + DEAL_RECEIPT_EMAIL_FROM + письмо на email из профиля клиента (если нет — только лог).
 */

export async function sendDealReceiptEmailIfConfigured({ toEmail, subject, pdfBuffer, filename }) {
  const key = (process.env.RESEND_API_KEY || '').trim();
  const from = (process.env.DEAL_RECEIPT_EMAIL_FROM || '').trim();
  if (!key || !from || !toEmail) {
    if (toEmail) console.info('[email deal receipt] skip: RESEND_API_KEY or DEAL_RECEIPT_EMAIL_FROM or recipient missing');
    return { sent: false, reason: 'not_configured' };
  }
  const buf = pdfBuffer && Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer || []);
  const b64 = buf.toString('base64');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [toEmail],
      subject: subject || 'Квитанция по сделке',
      attachments: [{ filename: filename || 'dogovor-kvitanciya.pdf', content: b64 }],
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(j?.message || `Resend HTTP ${res.status}`);
    err.body = j;
    throw err;
  }
  return { sent: true, id: j?.id };
}
