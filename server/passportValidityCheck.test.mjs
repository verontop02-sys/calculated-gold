import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toIsoDob,
  isPassportCheckRequestId,
  interpretPassportMvdPayload,
} from './passportValidityCheck.js';

test('toIsoDob accepts dotted and ISO dates', () => {
  assert.equal(toIsoDob('15.03.1990'), '1990-03-15');
  assert.equal(toIsoDob('1990-03-15'), '1990-03-15');
  assert.equal(toIsoDob(''), '');
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
