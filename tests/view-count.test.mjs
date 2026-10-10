import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../public/assets/backer-view-count-core.js', import.meta.url), 'utf8');
const loadCore = () => { const context = { Date, RangeError, TypeError }; runInNewContext(source, context); return context.BackerViewCountCore; };
const core = loadCore();

test('preserves the historical schedule and October 10 anchor', () => {
  assert.equal(core.countAt('2026-08-19'), 2305);
  assert.equal(core.countAt('2026-08-20'), 2305);
  assert.equal(core.countAt('2026-10-09'), 2555);
  assert.equal(core.countAt('2026-10-10'), 2560);
  assert.equal(core.countAt('2026-10-10T23:59:59.999Z'), 2560);
  assert.equal(core.countAt('2026-10-11'), 2560 + core.dailyIncrement('2026-10-11'));
});

test('daily increments remain between 6 and 23 and exactly recur for 20 years', () => {
  let previous = core.BASE;
  const observed = new Set();
  for (let day = 1; day <= 365 * 20; day++) {
    const at = core.ANCHOR_UTC + day * core.DAY_MS;
    const addition = core.dailyIncrement(at);
    const value = core.countAt(at);
    assert.ok(Number.isInteger(addition) && addition >= 6 && addition <= 23);
    assert.equal(value, previous + addition);
    previous = value;
    observed.add(addition);
  }
  assert.equal(observed.size, 18);
});

test('counts are identical across times and timezone representations of a UTC day', () => {
  const value = core.countAt('2026-10-11T00:00:00.000Z');
  assert.equal(value, core.countAt('2026-10-11T08:00:00+08:00'));
  assert.equal(value, core.countAt('2026-10-10T17:00:00-07:00'));
  assert.equal(value, core.countAt('2026-10-11T23:59:59.999Z'));
  assert.equal(core.countAt('2026-10-11T07:59:59+08:00'), 2560);
});

test('fresh consumers and out-of-order requests get the same cumulative schedule', () => {
  const values = ['2036-06-29', '2026-10-12', '2030-01-01'].map(core.countAt);
  const fresh = loadCore();
  assert.deepEqual(['2036-06-29', '2026-10-12', '2030-01-01'].map(fresh.countAt), values);
});

test('rejects invalid or timezone-ambiguous inputs instead of displaying NaN', () => {
  for (const value of ['garbage', '2026-02-30', '2026-10-11T01:00:00', Infinity, NaN, new Date(NaN)]) {
    assert.throws(() => core.countAt(value), RangeError);
  }
  assert.throws(() => core.countAt({}), TypeError);
});

test('formats the reference count and schedules UTC midnight correctly', () => {
  assert.equal(core.formatCount(core.BASE), '2,560 views');
  assert.equal(core.millisecondsUntilNextDay('2026-10-10T23:59:59.000Z'), 1100);
  assert.equal(core.millisecondsUntilNextDay('2026-10-11T08:00:00+08:00'), core.DAY_MS + 100);
});
