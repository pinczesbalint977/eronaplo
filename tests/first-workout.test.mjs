import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Run the real hook logic against tiny React/Firestore adapters. No network,
// emulator account or real user data is involved in these read-budget checks.
const source = readFileSync(new URL('../src/hooks/useJournal.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export function useJournal', 'function useJournal');
const document = (date, id = date, extra = {}) => ({
  id, metadata: { hasPendingWrites: false },
  data: () => ({ date, exercise: 'Próba', weight: 40, reps: 10, sets: 3, ...extra }),
});
const recent = () => Array.from({ length: 100 }, (_, index) => document('2026-11-15', `recent-${index}`));
const snapshot = (docs) => ({ docs, size: docs.length, metadata: { fromCache: false },
  docChanges: () => docs.map((doc) => ({ type: 'added', doc })) });

function setup(parents, responses = []) {
  const reads = [];
  const cleanups = [];
  let active = true;
  let logouts = 0;
  const dependencies = {
    useCallback: (callback) => callback,
    useEffect: (callback) => { cleanups.push(callback()); },
    useRef: (value) => ({ current: value }), useState: (value) => [value, () => {}],
    collection: (_db, _users, uid, kind) => ({ uid, kind }),
    getDocsFromServer: async (request) => {
      reads.push(request);
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return snapshot(typeof response === 'function' ? await response() : response || []);
    },
    limit: (count) => ({ limit: count }), orderBy: (field, direction) => ({ field, direction }),
    onSnapshot: (request, _options, callback) => {
      callback(snapshot(request.kind === 'workouts' ? parents : []));
      return () => {};
    },
    query: (reference, ...constraints) => ({ ...reference, constraints }),
    startAfter: (cursor) => ({ cursor }), where: () => ({}), db: {},
    writeJournalBatch: () => { throw new Error('First-date reads must never write.'); },
    previousWorkout: () => null,
    useAuth: () => ({ logout: () => { logouts++; }, isSessionActive: () => active }),
  };
  const hook = new Function(...Object.keys(dependencies), `${source}; return useJournal;`)(...Object.values(dependencies));
  return { journal: hook('unit-person'), reads, logouts: () => logouts,
    deactivate: () => { active = false; }, cleanup: () => cleanups.forEach((cleanup) => cleanup?.()) };
}

test('first workout comes from fully loaded legacy parents with zero additional reads', async (context) => {
  const fixture = setup([document('2026-11-15'), document('2020-01-01')]);
  context.after(fixture.cleanup);
  assert.equal(await fixture.journal.getFirstWorkoutDate(), '2020-01-01');
  assert.equal(await fixture.journal.getFirstWorkoutDate(), '2020-01-01');
  assert.equal(fixture.reads.length, 0);
});

test('empty history has no training start and requires no extra query', async (context) => {
  const fixture = setup([]);
  context.after(fixture.cleanup);
  assert.equal(await fixture.journal.getFirstWorkoutDate(), null);
  assert.equal(fixture.reads.length, 0);
});

test('first workout skips drafts in fully loaded history', async (context) => {
  const fixture = setup([document('2010-01-01', 'draft', { status: 'draft' }), document('2021-02-03')]);
  context.after(fixture.cleanup);
  assert.equal(await fixture.journal.getFirstWorkoutDate(), '2021-02-03');
  assert.equal(fixture.reads.length, 0);
});

test('hundred-parent window finds the actual first date with one small parent query', async (context) => {
  const fixture = setup(recent(), [[document('2019-07-01')]]);
  context.after(fixture.cleanup);
  assert.equal(await fixture.journal.getFirstWorkoutDate(), '2019-07-01');
  assert.deepEqual(fixture.reads, [{ uid: 'unit-person', kind: 'workouts', constraints: [
    { field: 'date', direction: 'asc' }, { limit: 1 },
  ] }]);
});

test('concurrent calls and revisiting the Overview reuse the same first-date cache', async (context) => {
  let complete;
  const fixture = setup(recent(), [() => new Promise((resolve) => { complete = resolve; })]);
  context.after(fixture.cleanup);
  const first = fixture.journal.getFirstWorkoutDate();
  const second = fixture.journal.getFirstWorkoutDate();
  assert.equal(fixture.reads.length, 1);
  complete([document('2019-07-01')]);
  assert.deepEqual(await Promise.all([first, second]), ['2019-07-01', '2019-07-01']);
  assert.equal(await fixture.journal.getFirstWorkoutDate(), '2019-07-01');
  assert.equal(fixture.reads.length, 1);
});

test('older draft parents are skipped without reading workout-set children', async (context) => {
  const fixture = setup(recent(), [[document('2010-01-01', 'draft', { status: 'draft' })],
    [document('2019-07-01'), document('2020-01-01')]]);
  context.after(fixture.cleanup);
  assert.equal(await fixture.journal.getFirstWorkoutDate(), '2019-07-01');
  assert.equal(fixture.reads.length, 2);
  assert.ok(fixture.reads.every((request) => request.kind === 'workouts'));
  assert.equal(fixture.reads[1].constraints.at(-1).limit, 10);
});

test('failed reads can retry while permission denial triggers logout', async (context) => {
  const network = Object.assign(new Error('offline'), { code: 'unavailable' });
  const denied = Object.assign(new Error('denied'), { code: 'permission-denied' });
  const fixture = setup(recent(), [network, [document('2020-01-01')]]);
  const blocked = setup(recent(), [denied]);
  context.after(fixture.cleanup); context.after(blocked.cleanup);
  await assert.rejects(fixture.journal.getFirstWorkoutDate(), { code: 'unavailable' });
  assert.equal(fixture.logouts(), 0);
  assert.equal(await fixture.journal.getFirstWorkoutDate(), '2020-01-01');
  assert.equal(fixture.reads.length, 2);
  await assert.rejects(blocked.journal.getFirstWorkoutDate(), { code: 'permission-denied' });
  assert.equal(blocked.logouts(), 1);
});

test('ended sessions cannot receive a late first-date response or read cached personal data', async (context) => {
  let complete;
  const fixture = setup(recent(), [() => new Promise((resolve) => { complete = resolve; })]);
  context.after(fixture.cleanup);
  const pending = fixture.journal.getFirstWorkoutDate();
  fixture.deactivate(); complete([document('2020-01-01')]);
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(fixture.journal.getFirstWorkoutDate(), { name: 'AbortError' });
});
