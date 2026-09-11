import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toIsoDob,
  isCompleteBirthDate,
  formatBirthDateDotted,
  isPassportCheckRequestId,
  interpretPassportMvdPayload,
} from './passportValidityCheck.js';
import { passportLineWithBirthDate } from './scrapContractPdf.js';

test('toIsoDob accepts dotted and ISO dates', () => {
  assert.equal(toIsoDob('15.03.1990'), '1990-03-15');
  assert.equal(toIsoDob('1990-03-15'), '1990-03-15');
  assert.equal(toIsoDob('15031990'), '1990-03-15');
  assert.equal(toIsoDob(''), '');
});

test('isCompleteBirthDate requires a real DD.MM.YYYY', () => {
  assert.equal(isCompleteBirthDate(''), false);
  assert.equal(isCompleteBirthDate('15.03'), false);
  assert.equal(isCompleteBirthDate('99.99.1990'), false);
  assert.equal(isCompleteBirthDate('15.03.1990'), true);
  assert.equal(isCompleteBirthDate('15031990'), true);
  assert.equal(formatBirthDateDotted('15031990'), '15.03.1990');
});

test('passport line gets date of birth appended once', () => {
  assert.equal(
    passportLineWithBirthDate('4510 123456 выдан 01.01.2015', '15.03.1990'),
    '4510 123456 выдан 01.01.2015, дата рождения 15.03.1990'
  );
  assert.equal(
    passportLineWithBirthDate('4510 123456, дата рождения 15.03.1990', '15.03.1990'),
    '4510 123456, дата рождения 15.03.1990'
  );
});

test('requestId accepts UUID v4', () => {
  assert.equal(isPassportCheckRequestId('b4c61a6b-34cc-430e-bbeb-a6518014bca4'), true);
  assert.equal(isPassportCheckRequestId('not-a-uuid'), false);
  assert.equal(isPassportCheckRequestId(''), false);
});

test('queued / in_progress / timeout stay pending so we can keep polling', () => {
  for (const state of ['queued', 'in_progress', 'restart', 'timeout']) {
    const out = interpretPassportMvdPayload({ state });
    assert.equal(out.kind, 'pending', state);
  }
});

test('complete Действительный → valid', () => {
  const out = interpretPassportMvdPayload({
    state: 'complete',
    finished: 1,
    results: {
      passport_mvd: {
        result: { status: 200, data: [{ status: 'Действительный' }] },
      },
    },
  });
  assert.equal(out.kind, 'ok');
  assert.equal(out.normalized, 'valid');
});

test('doc_status Не действительный → invalid', () => {
  const out = interpretPassportMvdPayload({
    state: 'complete',
    results: {
      passport_mvd: {
        result: { status: 200, data: [{ doc_status: 'Не действительный' }] },
      },
    },
  });
  assert.equal(out.kind, 'ok');
  assert.equal(out.normalized, 'invalid');
});

test('недействительный без пробела тоже invalid', () => {
  const out = interpretPassportMvdPayload({
    state: 'complete',
    results: {
      passport_mvd: {
        result: { status: 200, data: [{ status: 'Недействительный' }] },
      },
    },
  });
  assert.equal(out.normalized, 'invalid');
});

test('данные не найдены → not_found', () => {
  const out = interpretPassportMvdPayload({
    state: 'complete',
    results: {
      passport_mvd: {
        result: { status: 200, data: [{ doc_status: 'Данные не найдены' }] },
      },
    },
  });
  assert.equal(out.kind, 'ok');
  assert.equal(out.normalized, 'not_found');
});

test('result data without state is treated as finished', () => {
  const out = interpretPassportMvdPayload({
    results: {
      passport_mvd: {
        result: { status: 200, data: [{ status: 'Действительный' }] },
      },
    },
  });
  assert.equal(out.kind, 'ok');
  assert.equal(out.normalized, 'valid');
});

test('SMEV 500 is transient, not an invalid passport', () => {
  const out = interpretPassportMvdPayload({
    state: 'complete',
    results: {
      passport_mvd: {
        result: { status: 500, data: [{ error: 'внутренняя ошибка сервиса' }] },
      },
    },
  });
  assert.equal(out.kind, 'transient');
});
