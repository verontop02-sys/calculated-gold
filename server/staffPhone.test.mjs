import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStaffPhone,
  parseStaffPhone,
  maskStaffPhone,
  formatStaffPhonePretty,
  staffPhoneE164,
  evaluateStaffPhoneBindAttempt,
  staffPhoneOtpHash,
  staffPhoneBindOtpKey,
} from './staffPhone.js';
import { resolveDeviceOtpDelivery, channelFromExistingOtp } from './deviceTrust.js';

test('staff phone accepts +7 / 8 / 10-digit mobile', () => {
  assert.equal(normalizeStaffPhone('+7 (916) 123-45-67'), '9161234567');
  assert.equal(normalizeStaffPhone('89161234567'), '9161234567');
  assert.equal(normalizeStaffPhone('9161234567'), '9161234567');
  assert.equal(normalizeStaffPhone('4951234567'), '');
  assert.equal(parseStaffPhone('').ok, false);
});

test('mask keeps last 4 digits', () => {
  assert.equal(maskStaffPhone('9161234567'), '+7 ••• •••-45-67');
  assert.equal(formatStaffPhonePretty('9161234567'), '+7 916 123-45-67');
  assert.equal(staffPhoneE164('9161234567'), '+79161234567');
});

test('device OTP prefers SMS when phone is set', () => {
  assert.equal(
    resolveDeviceOtpDelivery({ phoneNormalized: '9161234567', smsReady: true, emailReady: true }).mode,
    'sms'
  );
  assert.equal(
    resolveDeviceOtpDelivery({ phoneNormalized: '', smsReady: true, emailReady: true }).mode,
    'email'
  );
  assert.equal(
    resolveDeviceOtpDelivery({ phoneNormalized: '', smsReady: false, emailReady: false }).mode,
    'auto-trust'
  );
});

// Регресс: повторный запрос кода в течение окна отправки (кулдаун) не должен
// «переезжать» на другой канал — иначе экран расходится с тем, куда реально уехал код.
test('cooldown response reuses the channel the code was actually sent on', () => {
  const sentBySms = { channel: 'sms', destMasked: '+7 ••• •••-45-67', phoneNormalized: '9161234567' };
  const reused = channelFromExistingOtp(sentBySms, { userEmail: 'staff@reaktivo.ru' });
  assert.equal(reused.channel, 'sms');
  assert.equal(reused.destMasked, '+7 ••• •••-45-67');
  assert.equal(reused.needPhone, false);

  const sentByEmail = { channel: 'email', destMasked: 's•••@r•••.ru', phoneNormalized: null };
  const reusedEmail = channelFromExistingOtp(sentByEmail, { userEmail: 'staff@reaktivo.ru' });
  assert.equal(reusedEmail.channel, 'email');
  assert.equal(reusedEmail.needPhone, true);
});

test('cooldown reuse tolerates older OTP records without destMasked/phoneNormalized', () => {
  const legacySms = { channel: 'sms' };
  const out = channelFromExistingOtp(legacySms, { userEmail: 'staff@reaktivo.ru' });
  assert.equal(out.channel, 'sms');
  assert.equal(out.destMasked, 'телефон');
});

test('phone bind OTP key is scoped to requester + number', () => {
  assert.equal(
    staffPhoneBindOtpKey('admin-1', '9161234567'),
    'staff_phone_bind:admin-1:9161234567'
  );
});

test('phone bind OTP accepts the SMS code and rejects a wrong one', () => {
  const stored = {
    codeHash: staffPhoneOtpHash('123456'),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    attempts: 0,
  };
  assert.equal(evaluateStaffPhoneBindAttempt(stored, '123456').ok, true);
  const bad = evaluateStaffPhoneBindAttempt(stored, '000000');
  assert.equal(bad.ok, false);
  assert.match(bad.message, /Неверный код/);
  assert.equal(bad.nextStored.attempts, 1);
});

test('phone bind OTP requires a prior SMS request', () => {
  const missing = evaluateStaffPhoneBindAttempt(null, '123456');
  assert.equal(missing.ok, false);
  assert.match(missing.message, /не запрашивался/i);
});
