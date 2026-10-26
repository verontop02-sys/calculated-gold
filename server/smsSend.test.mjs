import assert from 'node:assert/strict';
import test from 'node:test';
import { courierBookingSms } from './smsSend.js';

test('courier sms names the visit and the hour-before call', () => {
  const text = courierBookingSms({ dateLabel: '7 сентября', time: '14:00' });
  assert.equal(
    text,
    'Reaktivo — курьер забронирован. 7 сентября, 14:00. Курьер позвонит за 1 час до визита для подтверждения. https://reaktivo.ru/kurier/',
  );
  assert.equal(text.includes('1–2'), false);
  assert.equal(text.includes('1-2'), false);
});
