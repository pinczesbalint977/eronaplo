import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { journalChanges } from '../src/lib/journalChanges.js';

// Inject the SDK boundary so commit payloads are checked without an emulator.
const source = readFileSync(new URL('../src/lib/writeJournal.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replaceAll('export async function ', 'async function ')
  .replaceAll('import.meta.env', 'env');
function harness({ ok = true } = {}) {
  const calls = [];
  let tokens = 0;
  const api = new Function('deps', `const { auth, db, collection, doc, journalChanges, navigator, env, fetch } = deps;
    ${source}\nreturn { writeJournal, writeJournalBatch };`)({
    auth: { currentUser: { uid: 'u', getIdToken: async () => { tokens += 1; return 'token'; } } },
    db: { app: { options: { projectId: 'demo' } } },
    collection: () => ({}), doc: () => ({ id: 'generated' }), journalChanges,
    navigator: { onLine: true }, env: { DEV: true, VITE_USE_EMULATORS: 'true' },
    fetch: async (url, request) => {
      const body = JSON.parse(request.body);
      calls.push({ url, request, ...body });
      return { ok, json: async () => ok
        ? { commitTime: '2026-11-08T10:00:00Z', writeResults: body.writes.map(() => ({})) }
        : { error: { status: 'PERMISSION_DENIED' } } };
    },
  });
  return { ...api, calls, tokens: () => tokens, uid: 'u', isSessionActive: () => true };
}
const plan = { name: 'A', exercises: 'Squat' };
const workout = { exercise: 'Squat', date: '2026-11-08', notes: '', status: 'completed',
  setResults: [{ weight: 60, reps: 10, completed: true }, { weight: 60, reps: 8, completed: true }] };

test('hydration preserves optional set roles and snapshots without adding fields to legacy rows', () => {
  const hookSource = readFileSync(new URL('../src/hooks/useJournal.js', import.meta.url), 'utf8');
  const hydrateSource = hookSource.slice(hookSource.indexOf('function hydrate('), hookSource.indexOf('// Firestore adds'));
  const hydrate = new Function(`${hydrateSource}; return hydrate;`)();
  const oldRow = { weight: 60, reps: 10, completed: true };
  const typedRow = { weight: 40, reps: 8, completed: false, type: 'warmup' };
  const parent = { id: 'entry', setCount: 2, plannedWorkSets: 3, targetReps: 10 };
  const hydrated = hydrate(parent, new Map([['entry_0', oldRow], ['entry_1', typedRow]]));
  assert.deepEqual(hydrated.setResults, [oldRow, typedRow]);
  assert.equal(Object.hasOwn(hydrated.setResults[0], 'type'), false);
  assert.equal(hydrated.plannedWorkSets, 3);
  assert.equal(hydrated.targetReps, 10);
  assert.equal(hydrated.metadata.incomplete, false);
  const legacy = { id: 'old', weight: 60, reps: 10, sets: 3 };
  assert.equal(hydrate(legacy, new Map()), legacy);
  assert.equal(hydrate(parent, new Map()).metadata.incomplete, true);
});

test('session creates, updates and deletes parents and set rows in one commit', async () => {
  const api = harness();
  const result = await api.writeJournalBatch({ ...api, operations: [
    { kind: 'workouts', values: workout, createId: 'new' },
    { kind: 'workouts', id: 'edit', values: { ...workout, setResults: workout.setResults.slice(0, 1) }, previous: { ...workout, setCount: 2 } },
    { kind: 'workouts', id: 'remove', remove: true, previous: { ...workout, setCount: 2 } },
  ] });
  assert.deepEqual(result.results, [{ id: 'new' }, { id: 'edit' }, { id: 'remove' }]);
  assert.equal(result.commitTime, '2026-11-08T10:00:00Z');
  assert.equal(api.calls.length, 1);
  assert.equal(api.tokens(), 1);
  const { writes, url } = api.calls[0];
  assert.equal(writes.length, 8);
  assert.equal(writes[0].currentDocument.exists, false);
  assert.ok(writes[0].update.name.endsWith('/workouts/new'));
  assert.equal(writes[3].currentDocument.exists, true);
  assert.ok(writes[4].delete.endsWith('/workoutSets/edit_1'));
  assert.ok(writes[7].delete.endsWith('/workoutSets/remove_1'));
  assert.ok(url.startsWith('/v1/'));
});

test('unchanged and empty batches skip token refresh and fetch', async () => {
  const api = harness();
  assert.deepEqual(await api.writeJournalBatch({ ...api, operations: [] }), { results: [] });
  assert.deepEqual(await api.writeJournalBatch({ ...api, operations: [{ kind: 'plans', id: 'p', values: plan, previous: plan }] }),
    { results: [{ id: 'p', unchanged: true }] });
  assert.equal(api.calls.length, 0);
  assert.equal(api.tokens(), 0);
});

test('batch rejects invalid later operations before submitting earlier changes', async () => {
  const api = harness();
  await assert.rejects(api.writeJournalBatch({ ...api, operations: [
    { kind: 'plans', values: plan, createId: 'valid' }, { kind: 'plans', values: plan, createId: 'invalid/id' },
  ] }), { code: 'invalid-argument' });
  assert.equal(api.calls.length, 0);
  assert.equal(api.tokens(), 0);
});

test('batch allows 500 writes and rejects more before requesting a token', async () => {
  const api = harness();
  const operations = Array.from({ length: 500 }, (_, index) => ({ kind: 'plans', values: plan, createId: `p${index}` }));
  await api.writeJournalBatch({ ...api, operations });
  assert.equal(api.calls[0].writes.length, 500);
  const rejected = harness();
  await assert.rejects(rejected.writeJournalBatch({ ...rejected, operations: [...operations, { kind: 'workouts', values: workout }] }), { code: 'invalid-argument' });
  assert.equal(rejected.calls.length, 0);
  assert.equal(rejected.tokens(), 0);
});

test('single operation wrapper preserves IDs, confirmation and no-op return shape', async () => {
  const api = harness();
  assert.deepEqual(await api.writeJournal({ ...api, kind: 'plans', values: plan, createId: 'stable' }),
    { id: 'stable', commitTime: '2026-11-08T10:00:00Z' });
  assert.deepEqual(await api.writeJournal({ ...api, kind: 'plans', id: 'stable', values: plan, previous: plan }),
    { id: 'stable', unchanged: true });
  assert.equal(api.calls.length, 1);
});

test('failed atomic commits reject the entire result', async () => {
  const api = harness({ ok: false });
  await assert.rejects(api.writeJournalBatch({ ...api, operations: [{ kind: 'workouts', values: workout }] }), { code: 'permission-denied' });
  assert.equal(api.calls.length, 1);
});

test('typed sets and independent target snapshots serialize in the same atomic commit without reads', async () => {
  const api = harness();
  const typed = { ...workout, plannedWorkSets: 4, targetReps: 10,
    setResults: workout.setResults.map((row, index) => ({ ...row, type: index ? 'work' : 'warmup' })) };
  await api.writeJournal({ ...api, kind: 'workouts', values: typed, createId: 'typed' });
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].request.method, 'POST');
  assert.ok(api.calls[0].url.endsWith('/documents:commit'));
  const { writes } = api.calls[0];
  assert.equal(writes.length, 3);
  assert.equal(writes[0].update.fields.setCount.integerValue, '2');
  assert.equal(writes[0].update.fields.plannedWorkSets.integerValue, '4');
  assert.equal(writes[0].update.fields.targetReps.integerValue, '10');
  assert.equal(writes[1].update.fields.type.stringValue, 'warmup');
  assert.equal(writes[2].update.fields.type.stringValue, 'work');
});

test('unchanged typed rows and explicit work on legacy rows produce zero writes', async () => {
  const api = harness();
  const typed = { ...workout, plannedWorkSets: 2, targetReps: 10,
    setResults: workout.setResults.map((row) => ({ ...row, type: 'work' })) };
  await api.writeJournal({ ...api, kind: 'workouts', id: 'typed', values: typed, previous: { ...typed, setCount: 2 } });
  await api.writeJournal({ ...api, kind: 'workouts', id: 'legacy', values: { ...typed, plannedWorkSets: 2, targetReps: 10 },
    previous: { ...workout, plannedWorkSets: 2, targetReps: 10, setCount: 2 } });
  assert.equal(api.tokens(), 0);
  assert.equal(api.calls.length, 0);
});

test('role-only edits update one row and the parent; omitted snapshots stay outside the update mask', async () => {
  const api = harness();
  const next = { ...workout, setResults: workout.setResults.map((row, index) => index ? row : { ...row, type: 'warmup' }) };
  await api.writeJournal({ ...api, kind: 'workouts', id: 'entry', values: next,
    previous: { ...workout, plannedWorkSets: 3, targetReps: 10, setCount: 2 } });
  const { writes } = api.calls[0];
  assert.equal(writes.length, 2);
  assert.ok(writes[1].update.name.endsWith('/workoutSets/entry_0'));
  assert.equal(writes[1].update.fields.type.stringValue, 'warmup');
  for (const field of ['plannedWorkSets', 'targetReps']) {
    assert.equal(writes[0].updateMask.fieldPaths.includes(field), false);
    assert.equal(Object.hasOwn(writes[0].update.fields, field), false);
  }
});

test('snapshot-only edits write the parent and include both provided target fields in its mask', async () => {
  const api = harness();
  await api.writeJournal({ ...api, kind: 'workouts', id: 'entry', values: { ...workout, plannedWorkSets: 3, targetReps: 8 },
    previous: { ...workout, plannedWorkSets: 2, targetReps: 10, setCount: 2 } });
  const { writes } = api.calls[0];
  assert.equal(writes.length, 1);
  assert.ok(writes[0].updateMask.fieldPaths.includes('plannedWorkSets'));
  assert.ok(writes[0].updateMask.fieldPaths.includes('targetReps'));
  assert.equal(writes[0].update.fields.plannedWorkSets.integerValue, '3');
});

test('invalid snapshots, row roles and unknown fields reject before token refresh or network activity', async () => {
  const invalid = [
    { ...workout, plannedWorkSets: 3 }, { ...workout, targetReps: 10 },
    ...[0, 21, 1.5, '3', null].map((plannedWorkSets) => ({ ...workout, plannedWorkSets, targetReps: 10 })),
    ...[0, 101, 1.5, '10', null].map((targetReps) => ({ ...workout, plannedWorkSets: 3, targetReps })),
    { ...workout, extra: true },
    ...['invalid', '', null, 1, true].map((type) => ({ ...workout, setResults: [{ ...workout.setResults[0], type }] })),
    { ...workout, setResults: [{ ...workout.setResults[0], extra: true }] },
  ];
  for (const values of invalid) {
    const api = harness();
    await assert.rejects(api.writeJournal({ ...api, kind: 'workouts', values }), { code: 'invalid-argument' });
    assert.equal(api.tokens(), 0);
    assert.equal(api.calls.length, 0);
  }
});

test('target snapshot bounds are independent of actual rows and legacy parent/row shapes remain unchanged', async () => {
  const api = harness();
  await api.writeJournalBatch({ ...api, operations: [
    { kind: 'workouts', createId: 'minimum', values: { ...workout, plannedWorkSets: 1, targetReps: 1 } },
    { kind: 'workouts', createId: 'maximum', values: { ...workout, plannedWorkSets: 20, targetReps: 100 } },
    { kind: 'workouts', createId: 'old', values: workout },
    { kind: 'workouts', createId: 'numeric', values: { exercise: 'Squat', date: '2026-11-08', notes: '', weight: 40, reps: 10, sets: 3 } },
  ] });
  const { writes } = api.calls[0];
  assert.equal(writes.length, 10);
  assert.equal(Object.hasOwn(writes[6].update.fields, 'plannedWorkSets'), false);
  assert.equal(Object.hasOwn(writes[7].update.fields, 'type'), false);
  assert.equal(writes[9].update.fields.sets.integerValue, '3');
});
