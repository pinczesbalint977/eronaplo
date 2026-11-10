import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encodeSessionNotes } from '../src/lib/sessions.js';
import { aggregate, compareSet, completedSets, getSets, maxWeight, previousWorkout, volume, workoutSummary } from '../src/lib/workouts.js';

const set = (weight = 100, reps = 8, completed = true) => ({ weight, reps, completed });
const entry = (overrides = {}) => ({ id: 'one', exercise: 'Guggolás', date: '2026-11-07', status: 'completed', setResults: [set()], ...overrides });
const legacy = (overrides = {}) => ({ id: 'legacy', exercise: 'Guggolás', date: '2026-10-01', weight: 45.5, reps: 8, sets: 4, ...overrides });

describe('Per-set workout helpers', () => {
  it('expands legacy entries without migration and keeps their familiar summary', () => {
    assert.deepEqual(getSets(legacy()), Array.from({ length: 4 }, () => set(45.5, 8)));
    assert.equal(workoutSummary(legacy()), '4 × 8 ismétlés · 45,5 kg');
    assert.equal(volume(legacy()), 1456);
    assert.equal(maxWeight(legacy()), 45.5);
  });

  it('counts completed sets only, including completed rows in a draft', () => {
    const partial = entry({ status: 'draft', setResults: [set(20, 10), set(500, 10, false), set(30, 5)] });
    const empty = entry({ exercise: 'Evezés', date: '2026-11-08', status: 'draft', setResults: [set(1000, 100, false)] });
    assert.equal(volume(partial), 350);
    assert.equal(maxWeight(partial), 30);
    assert.equal(maxWeight(empty), 0);
    assert.equal(completedSets(partial).length, 2);
    assert.match(workoutSummary(partial), /2\/3 teljesített sorozat.*30 kg/);
    assert.deepEqual(aggregate([partial, empty, legacy()]), { days: 2, sets: 6, volume: 1806, exercises: 1 });
    assert.deepEqual(aggregate([empty]), { days: 0, sets: 0, volume: 0, exercises: 0 });
  });

  it('finds the closest earlier completed day without a seven-day limit', () => {
    const old = entry({ date: '2026-09-01', setResults: [set(60)] });
    const latest = legacy({ date: '2026-10-01' });
    const entries = [old, latest,
      entry({ date: '2026-11-08' }), // same day
      entry({ date: '2026-11-09' }), // future
      entry({ date: '2026-11-07', status: 'draft' }),
      entry({ date: '2026-11-06', setResults: [set(90), set(90, 8, false)] }),
      entry({ date: '2026-11-05', exercise: 'Evezés' }),
    ];
    assert.deepEqual(previousWorkout(entries, '  GUGGOLÁS ', '2026-11-08'), { date: '2026-10-01', setResults: getSets(latest) });
    assert.equal(previousWorkout(entries, 'Felhúzás', '2026-11-08'), null);
    assert.equal(previousWorkout([latest], 'Guggolás', '2026-11-08', 'legacy'), null);
  });

  it('normalizes internal whitespace and groups matching documents in creation order with stable ID ties', () => {
    const entries = [
      entry({ id: 'z', exercise: '  Vállból   NYOMÁS ', createdAt: { seconds: 2, nanoseconds: 0 }, setResults: [set(30)] }),
      entry({ id: 'b', exercise: 'Vállból nyomás', createdAt: { toMillis: () => 1000 }, setResults: [set(20), set(22)] }),
      entry({ id: 'a', exercise: 'Vállból nyomás', createdAt: { seconds: 1 }, setResults: [set(10)] }),
    ];
    assert.deepEqual(previousWorkout(entries, 'vállból nyomás', '2026-11-08'), {
      date: '2026-11-07', setResults: [set(10), set(20), set(22), set(30)],
    });
    assert.deepEqual(entries.map(({ id }) => id), ['z', 'b', 'a']);
  });

  it('uses the latest separate session when an exercise was done in two plans on one day', () => {
    const notes = (sessionId) => encodeSessionNotes({ sessionId, planId: 'p', planName: 'Mell', position: 0, exerciseCount: 1 });
    const entries = [entry({ id: 'early', createdAt: new Date(1000), notes: notes('early'), setResults: [set(20)] }),
      entry({ id: 'late', createdAt: new Date(2000), notes: notes('late'), setResults: [set(60), set(65)] })];
    assert.deepEqual(previousWorkout(entries, 'Guggolás', '2026-11-08').setResults, [set(60), set(65)]);
  });

  it('returns independent per-set copies for reading and prefilling', () => {
    const original = entry();
    getSets(original)[0].weight = 900;
    completedSets(original)[0].reps = 99;
    previousWorkout([original], 'Guggolás', '2026-11-08').setResults[0].completed = false;
    assert.deepEqual(original.setResults, [set()]);
  });

  it('compares completed rows without calling mixed weight/repetition changes progress', () => {
    const baseline = set();
    assert.equal(compareSet(set(105), baseline), 'up');
    assert.equal(compareSet(set(100, 9), baseline), 'up');
    assert.equal(compareSet(set(105, 9), baseline), 'up');
    assert.equal(compareSet(set(95), baseline), 'down');
    assert.equal(compareSet(set(100, 7), baseline), 'down');
    assert.equal(compareSet(set(), baseline), 'equal');
    assert.equal(compareSet(set(105, 6), baseline), 'mixed');
    assert.equal(compareSet(set(95, 10), baseline), 'mixed');
    assert.equal(compareSet(set(105, 8, false), baseline), null);
    assert.equal(compareSet(set(), undefined), null);
    assert.equal(compareSet(set(), set(100, 8, false)), null);
  });
});
