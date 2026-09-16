import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateMarket, economics, binaryPayoff } from '../public/model.mjs';

const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('every scenario conserves funds including fees, tokens and nonnegative available balances', () => {
  for (const scenario of ['baseline', 'thin', 'fees', 'shock']) {
    for (const seed of [0, 41, 1234]) {
      const r = simulateMarket(scenario, seed);
      assert.deepEqual(r.invariants, { cashConserved: true, inventoryConserved: true, noNegativeBalances: true });
      assert.equal(r.series.length, 49);
      assert.equal(r.agents, 96);
      assert.ok(r.fills > 0);
      assert.ok(r.fillRate > 0 && r.fillRate <= 1);
      assert.ok(r.concentration > 0 && r.concentration <= 1);
      assert.ok(r.series.every(p => p.price >= 0 && p.price <= 1 && p.volume >= 0));
      assert.ok(r.ledger.every(f => f.buyer !== f.seller && f.quantity > 0));
      near(r.accounting.collectedFees, 2 * r.feeRate * r.ledger.reduce((s, f) => s + f.price * f.quantity, 0));
    }
  }
});

test('same seed exactly replays, treatment preserves population and shock begins in round 20', () => {
  const baseline = simulateMarket('baseline', 41);
  assert.deepEqual(baseline, simulateMarket('baseline', 41));
  for (const scenario of ['thin', 'fees', 'shock']) {
    const variant = simulateMarket(scenario, 41);
    assert.deepEqual(variant.population, baseline.population);
    assert.notDeepEqual(variant.series, baseline.series);
  }
  const shock = simulateMarket('shock', 41);
  assert.deepEqual(shock.series.slice(0, 20), baseline.series.slice(0, 20));
  assert.ok(simulateMarket('thin', 41).orders < baseline.orders);
  assert.notDeepEqual(simulateMarket('baseline', 42).population, baseline.population);
});

test('fills consume submitted quantities at executable prices with real partial fills', () => {
  const result = simulateMarket();
  const perOrder = new Map();
  for (const fill of result.ledger) {
    for (const order of [fill.makerOrder, fill.takerOrder]) perOrder.set(order, (perOrder.get(order) || 0) + 1);
  }
  assert.ok([...perOrder.values()].some(count => count > 1), 'at least one order should fill across counterparties');
  near(result.fillRate, 2 * result.executedQuantity / result.requestedQuantity, 1e-8);
});

test('fee waterfall counts matched volume once and permits negative net contribution', () => {
  const e = economics({ volume: 1_000_000, feeRate: 0.02, creatorShare: 0.2, liquidityShare: 0.15, costRate: 0.003 });
  near(e.grossFees, 20_000);
  near(e.creatorRevenue, 4_000);
  near(e.liquidityRevenue, 3_000);
  near(e.operatingCosts, 3_000);
  near(e.retainedRevenue, 10_000);
  near(e.creatorRevenue + e.liquidityRevenue + e.operatingCosts + e.retainedRevenue, e.grossFees);
  assert.ok(economics({ volume: 100, feeRate: 0.001, costRate: 0.01 }).retainedRevenue < 0);
  assert.equal(economics({ volume: 0 }).retainedRevenue, 0);
  assert.throws(() => economics({ creatorShare: 0.8, liquidityShare: 0.3 }), RangeError);
});

test('price exit and binary settlement are alternative paths with correct fees and losses', () => {
  const trade = binaryPayoff({ quantity: 100, entry: 0.4, exit: 0.65, feeRate: 0.01, mode: 'exit' });
  near(trade.netPnl, 23.95);
  near(trade.totalFees, 1.05);
  const win = binaryPayoff({ quantity: 100, entry: 0.4, exit: 0.65, outcome: 1, feeRate: 0.01, mode: 'settlement' });
  near(win.netPnl, 59.6);
  near(win.exitFee, 0);
  const loss = binaryPayoff({ quantity: 100, entry: 0.4, outcome: 0, feeRate: 0.01, mode: 'settlement' });
  near(loss.netPnl, -40.4);
  near(loss.grossProceeds, 0);
  near(binaryPayoff({ quantity: 100, entry: 0.4, exit: 0.2, feeRate: 0.01 }).netPnl, -20.6);
  assert.equal(binaryPayoff({ quantity: 0 }).roiPercent, null);
});

test('invalid numerical scenarios fail instead of producing misleading outputs', () => {
  assert.throws(() => simulateMarket('unknown'), RangeError);
  assert.throws(() => simulateMarket('baseline', NaN), TypeError);
  assert.throws(() => economics({ volume: -1 }), RangeError);
  assert.throws(() => binaryPayoff({ entry: 1.1 }), RangeError);
  assert.throws(() => binaryPayoff({ outcome: 0.5 }), RangeError);
});
