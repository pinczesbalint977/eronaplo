import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encodeSessionNotes } from '../src/lib/sessions.js';
import { aggregate, compareSet, completedSets, getSets, getSetType, getPositionedSets, getPlannedWorkSets, getWeightFeedback, getWeightRecommendation, maxWeight, prefillPlanSets, previousWorkout, volume, workoutSummary } from '../src/lib/workouts.js';

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

  it('positions and prefills the first row as warmup without adding or shifting historical rows', () => {
    const plan = { sets: 3, warmupSets: 1, reps: 10 };
    const previous = entry({ setResults: [set(80, 10), set(140, 10), set(140, 10), set(140, 10)] });
    const snapshot = structuredClone(previous);
    assert.deepEqual(prefillPlanSets(plan, previous), [
      { weight: 80, reps: 10, completed: false, type: 'warmup', touched: false },
      { weight: 140, reps: 10, completed: false, type: 'work', touched: false },
      { weight: 140, reps: 10, completed: false, type: 'work', touched: false },
      { weight: 140, reps: 10, completed: false, type: 'work', touched: false },
    ]);
    assert.deepEqual(previous, snapshot);
    assert.deepEqual(prefillPlanSets({ sets: 1, warmupSets: 1, reps: 10 }, legacy()).map(({ weight }) => weight), [45.5, 45.5]);
    assert.deepEqual(prefillPlanSets({ sets: 0, warmupSets: 1, reps: 10 }, null), [
      { weight: '', reps: 10, completed: false, type: 'warmup', touched: false },
    ]);
    const oldTypes = [{ ...set(80, 12), type: 'work' }, { ...set(140, 8), type: 'warmup' }];
    assert.deepEqual(getPositionedSets(oldTypes).map(({ type }) => type), ['warmup', 'work']);
    assert.deepEqual(oldTypes.map(({ type }) => type), ['work', 'warmup']);
    assert.deepEqual(prefillPlanSets(plan, oldTypes).map(({ weight, reps }) => [weight, reps]), [[80, 12], [140, 8], ['', 10], ['', 10]]);
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

  it('carries single-record prescriptions and corrects old all-row work counts conservatively', () => {
    const rows = [set(80, 10), set(140, 10), set(140, 10), set(140, 10)];
    const original = entry({ plannedWorkSets: 4, targetReps: 10, setResults: rows });
    assert.equal(getPlannedWorkSets(original), 3);
    assert.equal(getWeightRecommendation(original).kind, 'increase');
    const result = previousWorkout([original], original.exercise, '2026-11-08');
    assert.equal(result.plannedWorkSets, 3);
    assert.equal(result.targetReps, 10);
    assert.equal(original.plannedWorkSets, 4);
    assert.equal(getWeightRecommendation({ ...result, status: 'completed' }).kind, 'increase');
    const partial = entry({ plannedWorkSets: 3, targetReps: 10, setResults: [{ ...rows[0], type: 'warmup' }, ...rows.slice(1, 3)] });
    const previous = previousWorkout([partial], partial.exercise, '2026-11-08');
    assert.equal(previous.plannedWorkSets, 3);
    assert.equal(getWeightRecommendation({ ...previous, status: 'completed' }), null);
    const fourPrescribed = entry({ plannedWorkSets: 4, targetReps: 10, setResults: [{ ...rows[0], type: 'warmup' }, ...rows.slice(1)] });
    assert.equal(getPlannedWorkSets(fourPrescribed), 4);
    assert.equal(getWeightRecommendation(fourPrescribed), null);
    const noGoal = previousWorkout([entry({ setResults: rows })], original.exercise, '2026-11-08');
    assert.equal(Object.hasOwn(noGoal, 'plannedWorkSets'), false);
    assert.equal(Object.hasOwn(noGoal, 'targetReps'), false);
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
  const saved = (overrides = {}) => entry({ plannedWorkSets: 3, targetReps: 10, setResults: [set(80, 10), set(140, 10), set(140, 10), set(140, 10)], ...overrides });

  it('uses the exact default message after every work set meets the target without mutating input', () => {
    const original = saved();
    const snapshot = structuredClone(original);
    assert.deepEqual(getWeightRecommendation(original), {
      kind: 'increase',
      message: 'Múltkor mindhárom munkasorozatban megvolt a 10 ismétlés. Emelj, ha úgy érzed!',
    });
    assert.deepEqual(original, snapshot);
    assert.equal(getWeightRecommendation(saved({ setResults: [set(20), set(50.5, 11), set(50.5, 10), set(50.5, 12)] })).kind, 'increase');
  });

  it('ignores warmup weight, repetitions and completion when evaluating work', () => {
    const work = saved();
    assert.deepEqual(getWeightRecommendation({ ...work, setResults: [{ weight: '', reps: '', completed: false, type: 'work' }, ...work.setResults.slice(1)] }), getWeightRecommendation(work));
    assert.equal(getWeightRecommendation(saved({ setResults: [set(80, 10), set(140, 9), set(140, 10), set(140, 10)] })).kind, 'maintain');
    assert.equal(getWeightRecommendation(saved({ setResults: work.setResults.map((row) => ({ ...row, type: 'warmup' })) })).kind, 'increase');
  });

  it('uses saved custom counts and targets and requires every actual work row to reach the target', () => {
    const custom = saved({ plannedWorkSets: 2, targetReps: 8, setResults: [set(20, 5), set(0, 8), set(0, 9)] });
    assert.equal(getWeightRecommendation(custom).kind, 'increase');
    assert.match(getWeightRecommendation(custom).message, /8 ismétlés/);
    assert.doesNotMatch(getWeightRecommendation(custom).message, /mindhárom|kg/);
    const extra = { ...custom, setResults: [...custom.setResults, set(0, 7)] };
    assert.equal(getWeightRecommendation(extra).kind, 'maintain');
    assert.match(getWeightRecommendation(extra).message, /Érdemes lehet megtartanod.*8 ismétléses célig/);
    assert.equal(getWeightRecommendation({ ...custom, setResults: [set(0, 8)] }), null);
  });

  it('uses the current plan goal before stale historical counts and leaves history unchanged', () => {
    const original = saved({ plannedWorkSets: 4, setResults: [
      { ...set(80, 10), type: 'warmup' }, set(140, 10), set(140, 10), set(140, 10),
    ] });
    const snapshot = structuredClone(original);
    const prescription = { plannedWorkSets: 3, targetReps: 10 };
    assert.equal(getWeightRecommendation(original), null);
    assert.deepEqual(getWeightRecommendation(original, prescription), {
      kind: 'increase',
      message: 'Múltkor mindhárom munkasorozatban megvolt a 10 ismétlés. Emelj, ha úgy érzed!',
    });
    assert.deepEqual(getWeightFeedback(original, prescription), getWeightRecommendation(original, prescription));
    assert.deepEqual(original, snapshot);
    assert.deepEqual(prescription, { plannedWorkSets: 3, targetReps: 10 });
  });

  it('evaluates changed current repetition and work set goals instead of saved goals', () => {
    const original = saved();
    const current = getWeightRecommendation(original, { plannedWorkSets: 3, targetReps: 12 });
    assert.equal(current.kind, 'maintain');
    assert.match(current.message, /12 ismétléses célig/);
    assert.equal(getWeightRecommendation(original).kind, 'increase');
    assert.equal(getWeightRecommendation(original, { plannedWorkSets: 4, targetReps: 10 }), null);
    const shortage = getWeightFeedback(original, { plannedWorkSets: 4, targetReps: 10 });
    assert.equal(shortage.kind, 'info');
    assert.match(shortage.message, /munkasorozat/);
  });

  it('explains mixed weights and partial work with neutral feedback', () => {
    const mixed = saved({ setResults: [set(80, 10), set(140, 10), set(145, 10), set(140, 10)] });
    const partial = saved({ setResults: [set(80, 10), set(140, 10), set(140, 10), set(140, 10, false)] });
    for (const original of [mixed, partial]) {
      const snapshot = structuredClone(original);
      const feedback = getWeightFeedback(original);
      assert.equal(feedback.kind, 'info');
      assert.doesNotMatch(feedback.message, /Emelj|megtartanod|\bkg\b/i);
      assert.equal(getWeightRecommendation(original), null);
      assert.deepEqual(original, snapshot);
    }
    assert.match(getWeightFeedback(mixed).message, /eltérő súlyok/);
    assert.match(getWeightFeedback(partial).message, /nem teljesült.*munkasorozat/);
  });

  it('explains missing goals and incomplete data without making a weight recommendation', () => {
    assert.match(getWeightFeedback(saved({ targetReps: undefined })).message, /ismétléscél/);
    assert.match(getWeightFeedback(saved({ metadata: { incomplete: true } })).message, /hiányos/);
    assert.match(getWeightFeedback(null).message, /hiányos/);
    for (const original of [saved({ status: 'draft' }), saved({ plannedWorkSets: 0 }),
      saved({ setResults: [set(80, 10), set('140', 10), set(140, 10), set(140, 10)] })]) {
      assert.equal(getWeightFeedback(original).kind, 'info');
      assert.equal(getWeightRecommendation(original), null);
    }
  });

  it('suppresses advice for drafts, partial sessions, mixed weights and unfinished work', () => {
    for (const change of [
      { status: 'draft' }, { incomplete: true }, { metadata: { incomplete: true } },
      { setResults: [set(80, 10), set(50, 10), set(51, 10), set(50, 10)] },
      { setResults: [set(80, 10), set(50, 10), set(50, 10), set(50, 10, false)] },
      { setResults: [set(80, 10), set(50, 10), set(50, 10), set(50, 10), set(50, 10, false)] },
      { setResults: [{ ...set(80, 10), type: 'warmup' }, set(140, 10), set(140, 10)] },
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
      assert.equal(getWeightRecommendation(saved({ setResults: [set(80, 10), set(50, 10), set(50, 10), { ...set(50, 10), ...change }] })), null);
    }
  });
});
