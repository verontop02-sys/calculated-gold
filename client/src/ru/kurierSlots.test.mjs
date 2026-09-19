import test from 'node:test';
import assert from 'node:assert/strict';
import { pickNextCourierSlot } from './kurierSlots.js';

test('pickNextCourierSlot returns a working-hours slot', () => {
  const slot = pickNextCourierSlot(new Date(2026, 8, 21, 12, 0, 0));
  assert.ok(slot);
  assert.match(slot.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(slot.time, /^\d{2}:\d{2}$/);
});
