import test from 'node:test';
import assert from 'node:assert/strict';
import { trainingAge } from '../src/lib/trainingAge.js';

test('the first logged day has zero complete weeks and months', () => {
  assert.deepEqual(trainingAge('2026-11-15', '2026-11-15'), { weeks: 0, months: 0, days: 0 });
});

test('weeks become complete on the seventh day', () => {
  assert.deepEqual(trainingAge('2026-11-01', '2026-11-07'), { weeks: 0, months: 0, days: 6 });
  assert.deepEqual(trainingAge('2026-11-01', '2026-11-08'), { weeks: 1, months: 0, days: 7 });
});

test('calendar months wait for the anniversary date', () => {
  assert.deepEqual(trainingAge('2026-01-15', '2026-02-14'), { weeks: 4, months: 0, days: 30 });
  assert.deepEqual(trainingAge('2026-01-15', '2026-02-15'), { weeks: 4, months: 1, days: 31 });
});

test('month-end anniversaries clamp to the last day of a short month', () => {
  assert.deepEqual(trainingAge('2026-01-31', '2026-02-27'), { weeks: 3, months: 0, days: 27 });
  assert.deepEqual(trainingAge('2026-01-31', '2026-02-28'), { weeks: 4, months: 1, days: 28 });
  assert.deepEqual(trainingAge('2026-01-31', '2026-03-30'), { weeks: 8, months: 1, days: 58 });
  assert.deepEqual(trainingAge('2026-01-31', '2026-03-31'), { weeks: 8, months: 2, days: 59 });
});

test('leap-day anniversaries clamp correctly in a non-leap year', () => {
  assert.deepEqual(trainingAge('2024-02-29', '2025-02-27'), { weeks: 52, months: 11, days: 364 });
  assert.deepEqual(trainingAge('2024-02-29', '2025-02-28'), { weeks: 52, months: 12, days: 365 });
  assert.deepEqual(trainingAge('2024-01-31', '2024-02-29'), { weeks: 4, months: 1, days: 29 });
});

test('calendar years retain the actual leap-year day count', () => {
  assert.deepEqual(trainingAge('2025-01-01', '2026-01-01'), { weeks: 52, months: 12, days: 365 });
  assert.deepEqual(trainingAge('2024-01-01', '2025-01-01'), { weeks: 52, months: 12, days: 366 });
  assert.deepEqual(trainingAge('2025-12-28', '2026-01-04'), { weeks: 1, months: 0, days: 7 });
});

test('daylight-saving transitions do not shorten or lengthen elapsed weeks', () => {
  assert.deepEqual(trainingAge('2026-03-22', '2026-03-29'), { weeks: 1, months: 0, days: 7 });
  assert.deepEqual(trainingAge('2026-10-18', '2026-10-25'), { weeks: 1, months: 0, days: 7 });
});

test('missing, malformed, impossible and future dates produce no invented duration', () => {
  for (const bad of [undefined, null, '', '2026-2-01', '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '0000-01-01', 'not-a-date', 20261115, '2026-11-15T00:00:00Z']) {
    assert.equal(trainingAge(bad, '2026-11-15'), null);
    assert.equal(trainingAge('2026-01-01', bad), null);
  }
  assert.equal(trainingAge('2026-11-16', '2026-11-15'), null);
});
