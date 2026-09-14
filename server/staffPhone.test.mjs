import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStaffPhone,
  parseStaffPhone,
  maskStaffPhone,
  formatStaffPhonePretty,
  staffPhoneE164,
} from './staffPhone.js';
import { resolveDeviceOtpDelivery } from './deviceTrust.js';

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
