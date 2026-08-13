import { readFileSync } from 'fs';
import { createHash } from 'crypto';

function loadEnv() {
  const raw = readFileSync(new URL('../.env', import.meta.url));
  for (const line of raw.toString('latin1').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2];
  }
}
loadEnv();

const TerminalKey = process.env.TBANK_TERMINAL_KEY;
const Password = process.env.TBANK_PASSWORD;
console.log('key', TerminalKey, 'passLen', Password?.length);

function token(params) {
  const data = { ...params, Password };
  delete data.Token;
  const keys = Object.keys(data).filter((k) => typeof data[k] !== 'object').sort();
  return createHash('sha256').update(keys.map((k) => String(data[k])).join('')).digest('hex');
}

const body = {
  TerminalKey,
  Amount: 1000,
  OrderId: `smoke${Date.now()}`,
  Description: 'Reaktivo smoke test',
  NotificationURL: process.env.TBANK_NOTIFICATION_URL,
  SuccessURL: 'https://reaktivo.pro/kabinet?topup=1',
  FailURL: 'https://reaktivo.pro/kabinet?topup_fail=1',
};
body.Token = token(body);

const res = await fetch('https://securepay.tinkoff.ru/v2/Init', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const j = await res.json();
console.log(JSON.stringify(j, null, 2));
if (!j.Success || !j.PaymentURL) process.exit(1);
console.log('OK PaymentURL', j.PaymentURL);
