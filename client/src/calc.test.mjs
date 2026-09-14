import test from 'node:test';
import assert from 'node:assert/strict';
import { quotePerGram, quotePayout, quotePayoutRange, quoteBuybackPctLabel } from './calc.js';

const LIVE_LIKE = {
  goldRubPerGram: 11681.8,
  buybackPercentOfScrap: 85,
  rangeHalfWidthPercent: 1,
  perGram: { 375: 3724, 585: 5809, 750: 7447, 999: 9920 },
};

test('public payout uses office perGram, not 90% of spot', () => {
  const inflated = LIVE_LIKE.goldRubPerGram * 0.585 * 12 * 0.9;
  const actual = quotePayout(LIVE_LIKE, 585, 12);
  assert.equal(actual, 5809 * 12);
  assert.ok(actual < inflated);
  assert.ok(inflated - actual > 4000);
});

test('falls back to spot × purity × buyback% when perGram is missing', () => {
  const q = { goldRubPerGram: 10000, buybackPercentOfScrap: 85, perGram: {} };
  assert.equal(quotePerGram(q, 585), 10000 * 0.585 * 0.85);
});

test('unknown assay spans 375–999 office grams', () => {
  const r = quotePayoutRange(LIVE_LIKE, 'unknown', 10);
  assert.equal(r.low, 3724 * 10);
  assert.equal(r.high, 9920 * 10);
});

test('known assay uses office corridor, not ±3%', () => {
  const r = quotePayoutRange(LIVE_LIKE, 585, 10);
  assert.equal(r.mid, 58090);
  assert.ok(Math.abs(r.low - 58090 * 0.99) < 0.01);
  assert.ok(Math.abs(r.high - 58090 * 1.01) < 0.01);
});

test('percent label follows live policy', () => {
  assert.equal(quoteBuybackPctLabel(LIVE_LIKE), 'до 85%');
  assert.equal(quoteBuybackPctLabel(null), 'по курсу выкупа');
});
