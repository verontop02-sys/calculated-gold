import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBuybackRange,
  quoteForChannel,
  quotePerGram,
  quotePayout,
  quotePayoutRange,
  quoteBuybackPctLabel,
  buybackChannelForRole,
} from './calc.js';

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

const POLICY = {
  buybackPercentOfScrap: 85,
  rangeHalfWidthPercent: 1,
  purityAdjustments: { 585: 0 },
  buybackCoeffOffice: 1,
  buybackCoeffCourier: 1,
};

test('missing coefficient keeps the current payout', () => {
  const bare = {
    buybackPercentOfScrap: 85,
    rangeHalfWidthPercent: 0,
    purityAdjustments: { 999: 0 },
  };
  const r = calculateBuybackRange({
    weightGrams: 1,
    purityPerThousand: 1000,
    goldRubPerGram: 1000,
    settings: bare,
  });
  assert.equal(r.midRub, 850);
  assert.equal(r.buybackCoeff, 1);
  assert.equal(r.channel, 'office');
});

test('courier coefficient multiplies the payout and leaves the exchange base', () => {
  const office = calculateBuybackRange({
    weightGrams: 10,
    purityPerThousand: 585,
    goldRubPerGram: 10000,
    settings: { ...POLICY, buybackCoeffCourier: 0.9 },
    channel: 'office',
  });
  const courier = calculateBuybackRange({
    weightGrams: 10,
    purityPerThousand: 585,
    goldRubPerGram: 10000,
    settings: { ...POLICY, buybackCoeffCourier: 0.9 },
    channel: 'courier',
  });
  assert.equal(office.scrapRub, 58500);
  assert.equal(office.midRub, 58500 * 0.85);
  assert.equal(courier.midRub, office.midRub * 0.9);
  assert.equal(courier.buybackPct, 85);
});

test('quoteForChannel picks the courier map and keeps office perGram by default', () => {
  const q = {
    goldRubPerGram: 10000,
    buybackPercentOfScrap: 85,
    buybackCoeffOffice: 1,
    buybackCoeffCourier: 0.9,
    perGram: { 585: 5000 },
    perGramOffice: { 585: 5000 },
    perGramCourier: { 585: 4500 },
  };
  assert.equal(quotePayout(quoteForChannel(q, 'courier'), 585, 2), 9000);
  assert.equal(quotePayout(quoteForChannel(q, 'office'), 585, 2), 10000);
  assert.equal(quotePayout(q, 585, 2), 10000);
  assert.equal(quoteBuybackPctLabel(q, 'courier'), 'до 77%');
  assert.equal(quoteBuybackPctLabel({ buybackPercentOfScrap: 85, buybackCoeffCourier: 1 }, 'courier'), 'до 85%');
});

test('role picks the channel', () => {
  assert.equal(buybackChannelForRole('courier'), 'courier');
  assert.equal(buybackChannelForRole('seller'), 'office');
  assert.equal(buybackChannelForRole('super_admin'), 'office');
  assert.equal(buybackChannelForRole(''), 'office');
});
