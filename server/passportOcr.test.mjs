import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSeriesNumberFromText } from './passportOcr.js';

test('series and number with a space, as printed', () => {
  assert.equal(extractSeriesNumberFromText('45 10 123456'), '4510 123456');
  assert.equal(extractSeriesNumberFromText('4510 123456'), '4510 123456');
  assert.equal(extractSeriesNumberFromText('4510123456'), '4510 123456');
});

test('series and number on neighboring lines', () => {
  assert.equal(extractSeriesNumberFromText('45 10\n123456'), '4510 123456');
  assert.equal(extractSeriesNumberFromText('4510\n123456'), '4510 123456');
});

test('digits split one by one', () => {
  assert.equal(extractSeriesNumberFromText('4 5 1 0 1 2 3 4 5 6'), '4510 123456');
});

test('does not steal the issue date or department code', () => {
  const text = 'выдан 06.03.2014 код подразделения 770-076 отделением уфмс';
  assert.equal(extractSeriesNumberFromText(text), '');
  assert.equal(
    extractSeriesNumberFromText(`${text}\n45 10 123456`),
    '4510 123456',
  );
});
