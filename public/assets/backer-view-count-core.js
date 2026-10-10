/* Backer scheduled public display. This is not a measured traffic counter. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BackerViewCountCore = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var DAY_MS = 86400000;
  var BASE = 2560;
  var ANCHOR_UTC = Date.UTC(2026, 9, 10);
  var LEGACY_BASE = 2305;
  var LEGACY_ANCHOR_UTC = Date.UTC(2026, 7, 20);
  var MIN_DAILY = 6;
  var MAX_DAILY = 23;
  var DISCLOSURE = 'Scheduled display: 2,560 on 10 October 2026 UTC, plus 6–23 after each completed UTC day. Not measured traffic.';
  var cumulative = [0];

  function timestamp(value) {
    if (value == null) return Date.now();
    if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
      throw new RangeError('Use an ISO date or a timestamp with an explicit timezone.');
    }
    if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) {
      throw new TypeError('Expected a Date, timestamp, or ISO date.');
    }
    var result = new Date(value).getTime();
    if (!Number.isFinite(result)) throw new RangeError('Invalid counter date.');
    if (typeof value === 'string') {
      var parts = value.slice(0, 10).split('-').map(Number);
      var calendar = new Date(0);
      calendar.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
      if (calendar.getUTCFullYear() !== parts[0] || calendar.getUTCMonth() !== parts[1] - 1 || calendar.getUTCDate() !== parts[2]) {
        throw new RangeError('Invalid calendar date.');
      }
    }
    return result;
  }

  function utcDay(value) { return Math.floor(timestamp(value) / DAY_MS); }

  // A fixed seed produces one reproducible pseudorandom addition per UTC day.
  // No browser storage, visitor identifier, network, or deployment date affects it.
  function incrementForIndex(dayIndex) {
    var hash = (dayIndex ^ 0x4241434b) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
    hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
    hash = (hash ^ (hash >>> 16)) >>> 0;
    return MIN_DAILY + (hash % (MAX_DAILY - MIN_DAILY + 1));
  }

  function dailyIncrement(value) {
    var index = utcDay(value) - ANCHOR_UTC / DAY_MS;
    if (index < 1) return index + ANCHOR_UTC / DAY_MS > LEGACY_ANCHOR_UTC / DAY_MS ? 5 : 0;
    return incrementForIndex(index);
  }

  function countAt(value) {
    var day = utcDay(value);
    var elapsed = day - ANCHOR_UTC / DAY_MS;
    if (elapsed <= 0) return LEGACY_BASE + Math.max(0, day - LEGACY_ANCHOR_UTC / DAY_MS) * 5;
    for (var index = cumulative.length; index <= elapsed; index++) {
      cumulative.push(cumulative[index - 1] + incrementForIndex(index));
    }
    return BASE + cumulative[elapsed];
  }

  function formatCount(value) {
    return Math.round(value).toLocaleString('en-US') + ' views';
  }

  function millisecondsUntilNextDay(value) {
    var now = timestamp(value);
    return (Math.floor(now / DAY_MS) + 1) * DAY_MS - now + 100;
  }

  return Object.freeze({
    VERSION: '2026-10-10', DAY_MS: DAY_MS, BASE: BASE, ANCHOR_UTC: ANCHOR_UTC,
    MIN_DAILY: MIN_DAILY, MAX_DAILY: MAX_DAILY, DISCLOSURE: DISCLOSURE,
    countAt: countAt, publicCountFallback: countAt, dailyIncrement: dailyIncrement,
    formatCount: formatCount, millisecondsUntilNextDay: millisecondsUntilNextDay
  });
});
