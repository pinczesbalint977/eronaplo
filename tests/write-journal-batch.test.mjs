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
