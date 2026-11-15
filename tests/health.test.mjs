import test from 'node:test';
import assert from 'node:assert/strict';
import { weekSunday, weekDates, validateNutrition, validateBody, healthWeekSummary } from '../src/lib/health.js';

const food = { date: '2026-11-15', calories: 2250, protein: 150, carbs: 250, fat: 72.5 };
const body = { date: '2026-11-15', weight: 82.5, waist: 90, neck: 40 };

test('weeks start Monday and finish Sunday, including month/year boundaries and leap days', () => {
  assert.equal(weekSunday('2026-11-09'), '2026-11-15');
  assert.equal(weekSunday('2026-11-15'), '2026-11-15');
  assert.equal(weekSunday('2025-12-31'), '2026-01-04');
  assert.deepEqual(weekDates('2026-01-04'), ['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
  assert.equal(weekSunday('2024-02-29'), '2024-03-03');
});

test('invalid calendar dates and non-Sunday week ends are rejected', () => {
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '26-11-15', '', null, '1999-12-31']) assert.throws(() => weekSunday(date));
  assert.throws(() => weekDates('2026-11-14'));
});

test('nutrition stores Yazio values directly, supports zero and decimal grams, no calorie calculation', () => {
  assert.deepEqual(validateNutrition({ ...food, calories: '2250', protein: '150,5', fat: '0' }), { ...food, protein: 150.5, fat: 0 });
  assert.deepEqual(validateNutrition({ ...food, calories: 0, protein: 0, carbs: 0, fat: 0 }), { ...food, calories: 0, protein: 0, carbs: 0, fat: 0 });
});

test('nutrition rejects missing, invalid, out of range, and unknown fields', () => {
  for (const value of ['', null, true, NaN, Infinity, -1, 20001]) assert.throws(() => validateNutrition({ ...food, calories: value }));
  for (const key of ['protein', 'carbs', 'fat']) assert.throws(() => validateNutrition({ ...food, [key]: 2001 }));
  assert.throws(() => validateNutrition({ ...food, secret: 'extra' }));
  assert.throws(() => validateNutrition({ ...food, date: '2026-02-30' }));
  const incomplete = { ...food }; delete incomplete.protein;
  assert.throws(() => validateNutrition(incomplete));
});

test('weekly measurements use Sunday and normalize kg/cm decimal inputs without modifying originals', () => {
  const original = { ...body, weight: '82,5' };
  assert.deepEqual(validateBody(original), body);
  assert.equal(original.weight, '82,5');
  assert.throws(() => validateBody({ ...body, date: '2026-11-14' }));
  for (const [key, value] of [['weight', 19.9], ['weight', 501], ['waist', 19], ['waist', 301], ['neck', 9], ['neck', 101]]) assert.throws(() => validateBody({ ...body, [key]: value }));
  assert.throws(() => validateBody({ ...body, neck: '' }));
  assert.throws(() => validateBody({ ...body, extra: 1 }));
});

test('weekly totals and averages count only saved days, retaining legitimate zero values', () => {
  const zero = { ...food, date: '2026-11-14', calories: 0, protein: 0, carbs: 0, fat: 0 };
  assert.deepEqual(healthWeekSummary([food, zero]), { days: 2,
    total: { calories: 2250, protein: 150, carbs: 250, fat: 72.5 },
    average: { calories: 1125, protein: 75, carbs: 125, fat: 36.25 } });
  assert.deepEqual(healthWeekSummary([]), { days: 0, total: { calories: 0, protein: 0, carbs: 0, fat: 0 }, average: null });
});

test('duplicate day snapshots do not double count and decimal totals stay stable', () => {
  const first = { ...food, calories: 0.1 };
  const second = { ...food, date: '2026-11-14', calories: 0.2 };
  const result = healthWeekSummary([first, first, second]);
  assert.equal(result.days, 2);
  assert.equal(result.total.calories, 0.3);
  assert.equal(result.average.calories, 0.15);
});
