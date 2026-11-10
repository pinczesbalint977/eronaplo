import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encodeSessionNotes } from '../src/lib/sessions.js';
import { aggregate, compareSet, completedSets, getSets, getSetType, getWeightRecommendation, maxWeight, prefillPlanSets, previousWorkout, volume, workoutSummary } from '../src/lib/workouts.js';

const set = (weight = 100, reps = 8, completed = true) => ({ weight, reps, completed });
const entry = (overrides = {}) => ({ id: 'one', exercise: 'Guggolás', date: '2026-11-07', status: 'completed', setResults: [set()], ...overrides });
const legacy = (overrides = {}) => ({ id: 'legacy', exercise: 'Guggolás', date: '2026-10-01', weight: 45.5, reps: 8, sets: 4, ...overrides });

describe('Per-set workout helpers', () => {
  it('preserves optional set types while treating legacy rows as working sets', () => {
    const original = entry({ setResults: [set(), { ...set(20), type: 'warmup' }, { ...set(50), type: 'work' }] });
    const copied = getSets(original);
    assert.deepEqual(copied, original.setResults);
    assert.equal(Object.hasOwn(copied[0], 'type'), false);
    assert.equal(getSetType(copied[0]), 'work');
    assert.equal(getSetType(copied[1]), 'warmup');
    copied[1].type = 'work';
    assert.equal(original.setResults[1].type, 'warmup');
  });

  it('prefills type groups by ordinal without shifting legacy work into new warmups', () => {
    const plan = { sets: 3, warmupSets: 2, reps: 10 };
    const previous = entry({ setResults: [set(60, 8), { ...set(20, 12), type: 'warmup' }, set(65, 9)] });
    const snapshot = structuredClone(previous);
    assert.deepEqual(prefillPlanSets(plan, previous), [
      { weight: 20, reps: 12, completed: false, type: 'warmup', touched: false },
      { weight: '', reps: 10, completed: false, type: 'warmup', touched: false },
      { weight: 60, reps: 8, completed: false, type: 'work', touched: false },
      { weight: 65, reps: 9, completed: false, type: 'work', touched: false },
      { weight: '', reps: 10, completed: false, type: 'work', touched: false },
    ]);
    assert.deepEqual(previous, snapshot);
    assert.deepEqual(prefillPlanSets({ sets: 1, warmupSets: 1, reps: 10 }, legacy()).map(({ weight }) => weight), ['', 45.5]);
    assert.deepEqual(prefillPlanSets({ sets: 1, warmupSets: 0, reps: 10 }, null), [
      { weight: '', reps: 10, completed: false, type: 'work', touched: false },
    ]);
  });
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

describe('Saved work set weight recommendations', () => {
  const saved = (overrides = {}) => entry({ plannedWorkSets: 3, targetReps: 10, setResults: [set(50, 10), set(50, 10), set(50, 10)], ...overrides });

  it('uses the exact default message after every work set meets the target without mutating input', () => {
    const original = saved();
    const snapshot = structuredClone(original);
    assert.deepEqual(getWeightRecommendation(original), {
      kind: 'increase',
      message: 'Szép munka! Mindhárom munkasorozatban elérted a 10 ismétlést. A következő edzésen érdemes lehet növelned a súlyt!',
    });
    assert.deepEqual(original, snapshot);
    assert.equal(getWeightRecommendation(saved({ setResults: [set(50.5, 11), set(50.5, 10), set(50.5, 12)] })).kind, 'increase');
  });

  it('ignores warmup weight, repetitions and completion when evaluating work', () => {
    const work = saved();
    assert.deepEqual(getWeightRecommendation({ ...work, setResults: [{ weight: '', reps: '', completed: false, type: 'warmup' }, ...work.setResults] }), getWeightRecommendation(work));
    assert.equal(getWeightRecommendation(saved({ setResults: [set(50, 10), set(50, 9), set(50, 10)] })).kind, 'maintain');
  });

  it('uses saved custom counts and targets and requires every actual work row to reach the target', () => {
    const custom = saved({ plannedWorkSets: 2, targetReps: 8, setResults: [set(0, 8), set(0, 9)] });
    assert.equal(getWeightRecommendation(custom).kind, 'increase');
    assert.match(getWeightRecommendation(custom).message, /8 ismétlést/);
    assert.doesNotMatch(getWeightRecommendation(custom).message, /Mindhárom|kg/);
    const extra = { ...custom, setResults: [...custom.setResults, set(0, 7)] };
    assert.equal(getWeightRecommendation(extra).kind, 'maintain');
    assert.match(getWeightRecommendation(extra).message, /Érdemes lehet megtartanod.*8 ismétléses célig/);
    assert.equal(getWeightRecommendation({ ...custom, setResults: [set(0, 8)] }), null);
  });

  it('suppresses advice for drafts, partial sessions, mixed weights and unfinished work', () => {
    for (const change of [
      { status: 'draft' }, { incomplete: true }, { metadata: { incomplete: true } },
      { setResults: [set(50, 10), set(51, 10), set(50, 10)] },
      { setResults: [{ ...set(50, 10), type: 'drop' }, set(50, 10), set(50, 10)] },
      { setResults: [{ ...set(50, 10), type: undefined }, set(50, 10), set(50, 10)] },
      { setResults: [set(50, 10), set(50, 10), set(50, 10, false)] },
      { setResults: [set(50, 10), set(50, 10), set(50, 10), set(50, 10, false)] },
    ]) assert.equal(getWeightRecommendation(saved(change)), null);
    assert.equal(getWeightRecommendation(legacy()), null);
    assert.equal(getWeightRecommendation(null), null);
  });

  it('rejects missing or invalid saved prescriptions and invalid work values', () => {
    for (const field of ['plannedWorkSets', 'targetReps']) {
      for (const value of [undefined, null, 0, -1, 1.5, '3', Infinity, NaN, field === 'plannedWorkSets' ? 21 : 101]) {
        assert.equal(getWeightRecommendation(saved({ [field]: value })), null);
      }
    }
    for (const change of [{ weight: -1 }, { weight: 1001 }, { weight: Infinity }, { weight: '50' }, { reps: 0 }, { reps: 101 }, { reps: 1.5 }, { reps: '10' }]) {
      assert.equal(getWeightRecommendation(saved({ setResults: [set(50, 10), set(50, 10), { ...set(50, 10), ...change }] })), null);
    }
  });
});
