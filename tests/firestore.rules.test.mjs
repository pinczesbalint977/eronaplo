import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

// Synthetic emulator-only identities; never import or export production users.
const FIRST = 'test-person-one';
const SECOND = 'test-person-two';
const THIRD = 'test-person-three';
const OUTSIDER = 'test-person-outsider';
let environment;

const workout = (overrides = {}) => ({
  exercise: 'Guggolás',
  weight: 42.5,
  reps: 10,
  sets: 3,
  date: '2026-11-08',
  notes: '',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
});

const plan = (overrides = {}) => ({
  name: 'Teljes test',
  exercises: 'Guggolás 3 × 10\nFekvenyomás 3 × 8',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
});

const setWorkout = (overrides = {}) => ({
  exercise: 'Guggolás',
  date: '2026-11-08',
  notes: '',
  setResults: [{ weight: 42.5, reps: 10, completed: true }],
  status: 'completed',
  setCount: Array.isArray(overrides.setResults) ? overrides.setResults.length : 1,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
});

function database(uid) {
  return uid
    ? environment.authenticatedContext(uid).firestore()
    : environment.unauthenticatedContext().firestore();
}

function workoutRef(uid = FIRST, id = 'entry', db = database(uid)) {
  return doc(db, 'users', uid, 'workouts', id);
}

async function adminSet(path, data) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

before(async () => {
  const [host, rawPort] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  environment = await initializeTestEnvironment({
    projectId: 'demo-eronaplo',
    firestore: {
      host,
      port: Number(rawPort),
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await adminSet('access/allowedUsers', { uids: [FIRST, SECOND] });
});

after(async () => {
  if (environment) await environment.cleanup();
});

describe('Server-side authorization', () => {
  it('allows both approved identities to check access without an existing document', async () => {
    for (const uid of [FIRST, SECOND]) {
      const snapshot = await assertSucceeds(getDoc(doc(database(uid), 'users', uid, 'access', 'check')));
      assert.equal(snapshot.exists(), false);
    }
  });

  it('allows three approved identities to check access and manage only their own data', async () => {
    await adminSet('access/allowedUsers', { uids: [FIRST, SECOND, THIRD] });
    for (const uid of [FIRST, SECOND, THIRD]) {
      const db = database(uid);
      await assertSucceeds(getDoc(doc(db, 'users', uid, 'access', 'check')));
      const records = [
        ['workouts', 'entry', workout(), { weight: 45, updatedAt: serverTimestamp() }],
        ['plans', 'plan', plan(), { name: 'Updated plan', updatedAt: serverTimestamp() }],
        ['workoutSets', 'entry_0', { workoutId: 'entry', index: 0, weight: 40, reps: 8, completed: false }, { weight: 45, completed: true }],
      ];
      for (const [name, id, data, changes] of records) {
        const ref = doc(db, 'users', uid, name, id);
        await assertSucceeds(setDoc(ref, data));
        assert.equal((await assertSucceeds(getDoc(ref))).exists(), true);
        assert.equal((await assertSucceeds(getDocs(collection(db, 'users', uid, name)))).size, 1);
        await assertSucceeds(updateDoc(ref, changes));
        await assertSucceeds(deleteDoc(ref));
      }
    }
  });

  it('denies cross-user reads and writes between every pair of three approved identities', async () => {
    const approved = [FIRST, SECOND, THIRD];
    await adminSet('access/allowedUsers', { uids: approved });
    const records = [
      ['workouts', 'entry', workout(), { weight: 45, updatedAt: serverTimestamp() }],
      ['plans', 'plan', plan(), { name: 'Changed plan', updatedAt: serverTimestamp() }],
      ['workoutSets', 'entry_0', { workoutId: 'entry', index: 0, weight: 40, reps: 8, completed: false }, { completed: true }],
    ];
    for (const owner of approved) {
      for (const [name, id, data] of records) {
        await assertSucceeds(setDoc(doc(database(owner), 'users', owner, name, id), data));
      }
    }
    for (const actor of approved) {
      for (const owner of approved.filter((uid) => uid !== actor)) {
        const db = database(actor);
        await assertFails(getDoc(doc(db, 'users', owner, 'access', 'check')));
        for (const [name, id, data, changes] of records) {
          const ref = doc(db, 'users', owner, name, id);
          await assertFails(getDoc(ref));
          await assertFails(getDocs(collection(db, 'users', owner, name)));
          const otherId = name === 'workoutSets' ? 'other_0' : 'other';
          const otherData = name === 'workoutSets' ? { ...data, workoutId: 'other' } : data;
          await assertFails(setDoc(doc(db, 'users', owner, name, otherId), otherData));
          await assertFails(updateDoc(ref, changes));
          await assertFails(deleteDoc(ref));
        }
      }
    }
  });

  it('denies an unlisted fourth identity when three identities are approved', async () => {
    await adminSet('access/allowedUsers', { uids: [FIRST, SECOND, THIRD] });
    const db = database(OUTSIDER);
    await assertFails(getDoc(doc(db, 'users', OUTSIDER, 'access', 'check')));
    for (const [name, id, data] of [
      ['workouts', 'entry', workout()],
      ['plans', 'plan', plan()],
      ['workoutSets', 'entry_0', { workoutId: 'entry', index: 0, weight: 40, reps: 8, completed: false }],
    ]) {
      const ref = doc(db, 'users', OUTSIDER, name, id);
      await assertFails(getDoc(ref));
      await assertFails(getDocs(collection(db, 'users', OUTSIDER, name)));
      await assertFails(setDoc(ref, data));
      await assertFails(deleteDoc(ref));
    }
  });

  it('denies anonymous access checks and all private data operations', async () => {
    const db = database();
    await assertFails(getDoc(doc(db, 'users', FIRST, 'access', 'check')));
    await assertFails(getDocs(collection(db, 'users', FIRST, 'workouts')));
    await assertFails(setDoc(workoutRef(FIRST, 'entry', db), workout()));
    await assertFails(deleteDoc(workoutRef(FIRST, 'entry', db)));
  });

  it('denies even authenticated but unapproved identities their own namespace', async () => {
    const db = database(OUTSIDER);
    await assertFails(getDoc(doc(db, 'users', OUTSIDER, 'access', 'check')));
    await assertFails(getDocs(collection(db, 'users', OUTSIDER, 'workouts')));
    await assertFails(setDoc(workoutRef(OUTSIDER, 'entry', db), workout()));
    await assertFails(setDoc(doc(db, 'users', OUTSIDER, 'plans', 'plan'), plan()));
  });

  it('prevents either approved user from reading or mutating the other user data', async () => {
    for (const [attacker, owner] of [[FIRST, SECOND], [SECOND, FIRST]]) {
      const db = database(attacker);
      await assertFails(getDoc(doc(db, 'users', owner, 'access', 'check')));
      await assertFails(getDocs(collection(db, 'users', owner, 'workouts')));
      await assertFails(getDoc(workoutRef(owner, 'entry', db)));
      await assertFails(setDoc(workoutRef(owner, 'entry', db), workout()));
      await assertFails(deleteDoc(workoutRef(owner, 'entry', db)));
      await assertFails(getDocs(collection(db, 'users', owner, 'plans')));
      await assertFails(setDoc(doc(db, 'users', owner, 'plans', 'plan'), plan()));
    }
  });

  it('keeps the administrator-managed allowlist unreadable and unmodifiable', async () => {
    for (const uid of [undefined, FIRST, SECOND, OUTSIDER]) {
      const db = database(uid);
      const ref = doc(db, 'access', 'allowedUsers');
      await assertFails(getDoc(ref));
      await assertFails(getDocs(collection(db, 'access')));
      await assertFails(setDoc(ref, { uids: [uid || OUTSIDER, OUTSIDER] }));
      await assertFails(deleteDoc(ref));
    }
  });

  it('denies user root documents, access writes, unknown collections and group queries', async () => {
    const db = database(FIRST);
    await assertFails(setDoc(doc(db, 'users', FIRST), { role: 'admin' }));
    await assertFails(getDoc(doc(db, 'users', FIRST)));
    await assertFails(setDoc(doc(db, 'users', FIRST, 'access', 'check'), { allowed: true }));
    await assertFails(getDocs(collection(db, 'users', FIRST, 'access')));
    await assertFails(setDoc(doc(db, 'users', FIRST, 'unexpected', 'secret'), { value: 1 }));
    await assertFails(getDocs(collectionGroup(db, 'workouts')));
  });

  it('immediately revokes server access when an administrator removes an allowed identity', async () => {
    const db = database(FIRST);
    await assertSucceeds(setDoc(workoutRef(FIRST, 'entry', db), workout()));
    await adminSet('access/allowedUsers', { uids: [SECOND, OUTSIDER] });
    await assertFails(getDoc(doc(db, 'users', FIRST, 'access', 'check')));
    await assertFails(getDocs(collection(db, 'users', FIRST, 'workouts')));
    await assertFails(setDoc(workoutRef(FIRST, 'other', db), workout()));
  });

  it('fails closed when the allowlist document is absent', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), 'access', 'allowedUsers'));
    });
    await assertFails(getDoc(doc(database(FIRST), 'users', FIRST, 'access', 'check')));
    await assertFails(setDoc(workoutRef(), workout()));
  });

  it('fails closed unless allowlists contain two or three distinct nonempty strings', async () => {
    for (const uids of [
      [FIRST], [FIRST, SECOND, THIRD, OUTSIDER], [FIRST, FIRST], [FIRST, ''], [FIRST, 2], FIRST,
      [FIRST, SECOND, FIRST], [FIRST, SECOND, SECOND], [FIRST, FIRST, THIRD],
      [FIRST, SECOND, ''], [FIRST, SECOND, 3], [FIRST, SECOND, {}],
    ]) {
      await adminSet('access/allowedUsers', { uids });
      await assertFails(getDoc(doc(database(FIRST), 'users', FIRST, 'access', 'check')));
      await assertFails(setDoc(workoutRef(), workout()));
    }
  });
});

describe('Workout data validation and owner CRUD', () => {
  it('lets each approved owner create, list, read, update and delete their workouts', async () => {
    for (const uid of [FIRST, SECOND]) {
      const db = database(uid);
      const ref = workoutRef(uid, 'entry', db);
      await assertSucceeds(setDoc(ref, workout()));
      const saved = await assertSucceeds(getDoc(ref));
      assert.equal(saved.data().exercise, 'Guggolás');
      const list = await assertSucceeds(getDocs(collection(db, 'users', uid, 'workouts')));
      assert.equal(list.size, 1);
      await assertSucceeds(updateDoc(ref, { weight: 45, reps: 8, updatedAt: serverTimestamp() }));
      await assertSucceeds(deleteDoc(ref));
    }
  });

  it('accepts bodyweight exercise and sensible numeric boundaries', async () => {
    await assertSucceeds(setDoc(workoutRef(FIRST, 'bodyweight'), workout({ weight: 0, reps: 1, sets: 1 })));
    await assertSucceeds(setDoc(workoutRef(FIRST, 'upper'), workout({ weight: 1000, reps: 100, sets: 20 })));
  });

  it('rejects extra fields, missing fields and personal-password fields', async () => {
    await assertFails(setDoc(workoutRef(), workout({ password: 'NEVER-STORE-PASSWORDS' })));
    const missing = workout();
    delete missing.exercise;
    await assertFails(setDoc(workoutRef(), missing));
  });

  it('rejects invalid exercise, weight, repetition, set, date and note values', async () => {
    const invalid = [
      { exercise: '' }, { exercise: 'a'.repeat(101) }, { exercise: 2 },
      { weight: -1 }, { weight: 1001 }, { weight: '40' },
      { reps: 0 }, { reps: 101 }, { reps: 2.5 }, { reps: '10' },
      { sets: 0 }, { sets: 21 }, { sets: 1.5 },
      { date: '08/11/2026' }, { date: '2026-13-01' }, { date: '2026-11-00' },
      { notes: 'a'.repeat(1001) }, { notes: null },
    ];
    for (const overrides of invalid) {
      await assertFails(setDoc(workoutRef(), workout(overrides)));
    }
  });

  it('requires authoritative timestamps and preserves createdAt on update', async () => {
    const stale = Timestamp.fromDate(new Date('2020-01-01T00:00:00Z'));
    await assertFails(setDoc(workoutRef(), workout({ createdAt: stale })));
    await assertFails(setDoc(workoutRef(), workout({ updatedAt: stale })));
    await assertSucceeds(setDoc(workoutRef(), workout()));
    await assertFails(updateDoc(workoutRef(), { createdAt: stale, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(workoutRef(), { updatedAt: stale }));
    await assertFails(updateDoc(workoutRef(), { reps: 0, updatedAt: serverTimestamp() }));
  });
});

describe('Per-set workouts', () => {
  const parent = (count = 1) => ({ exercise: 'Bench press', date: '2020-01-06', notes: '', status: 'draft', setCount: count, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  const row = (index = 0, overrides = {}) => ({ workoutId: 'entry', index, weight: 60, reps: 10, completed: false, ...overrides });
  const rowRef = (uid = FIRST, index = 0) => doc(database(uid), 'users', uid, 'workoutSets', 'entry_' + index);
  it('both owners can create, read, edit and delete separate sets', async () => {
    for (const uid of [FIRST, SECOND]) {
      await assertSucceeds(setDoc(workoutRef(uid), parent()));
      await assertSucceeds(setDoc(rowRef(uid), row()));
      await assertSucceeds(getDoc(rowRef(uid)));
      await assertSucceeds(updateDoc(rowRef(uid), { completed: true, weight: 65 }));
      await assertSucceeds(deleteDoc(rowRef(uid)));
    }
  });
  it('denies cross-user and anonymous access to set data', async () => {
    await assertSucceeds(setDoc(rowRef(), row()));
    for (const uid of [SECOND, OUTSIDER, null]) {
      const ref = doc(database(uid), 'users', FIRST, 'workoutSets', 'entry_0');
      await assertFails(getDoc(ref));
      await assertFails(setDoc(ref, row()));
      await assertFails(deleteDoc(ref));
    }
  });
  it('atomically saves twenty different sets within the rules budget', async () => {
    const db = database(FIRST), batch = writeBatch(db);
    batch.set(doc(db, 'users', FIRST, 'workouts', 'entry'), parent(20));
    for (let i = 0; i < 20; i++) batch.set(doc(db, 'users', FIRST, 'workoutSets', 'entry_' + i), row(i, { weight: 50 + i, reps: 5 + i, completed: true }));
    await assertSucceeds(batch.commit());
    assert.equal((await assertSucceeds(getDocs(collection(db, 'users', FIRST, 'workoutSets')))).size, 20);
  });
  it('atomically saves a maximum ten-exercise session and rejects cross-user session writes', async () => {
    const sessionBatch = (actor, sessionId) => {
      const db = database(actor), batch = writeBatch(db);
      for (let position = 0; position < 10; position++) {
        const workoutId = `${sessionId}_${position}`;
        const notes = 'ERONAPLO_SESSION_V1:' + JSON.stringify({
          sessionId, planId: 'test-plan', planName: 'Maximum session', position, exerciseCount: 10, note: '',
        });
        batch.set(doc(db, 'users', FIRST, 'workouts', workoutId), {
          ...parent(20), exercise: `Exercise ${position + 1}`, status: 'completed', notes,
        });
        for (let index = 0; index < 20; index++) {
          batch.set(doc(db, 'users', FIRST, 'workoutSets', `${workoutId}_${index}`),
            row(index, { workoutId, weight: 50 + position, reps: 8, completed: true }));
        }
      }
      return batch;
    };
    await assertSucceeds(sessionBatch(FIRST, 'maximum-session').commit());
    await assertFails(sessionBatch(SECOND, 'cross-user-session').commit());
    const db = database(FIRST);
    assert.equal((await assertSucceeds(getDocs(collection(db, 'users', FIRST, 'workouts')))).size, 10);
    assert.equal((await assertSucceeds(getDocs(collection(db, 'users', FIRST, 'workoutSets')))).size, 200);
  });
  it('rejects malformed rows and invalid numeric bounds', async () => {
    for (const values of [
      { weight: -1 }, { weight: 1001 }, { weight: '60' }, { weight: true }, { weight: null },
      { reps: 0 }, { reps: 101 }, { reps: 1.5 }, { completed: 'true' }, { completed: 1 },
      { index: -1 }, { index: 20 }, { index: 0.5 }, { workoutId: 'different' }, { extra: 'bad' },
    ]) await assertFails(setDoc(rowRef(), row(0, values)));
    const missing = row(); delete missing.completed;
    await assertFails(setDoc(rowRef(), missing));
  });
  it('validates every slot independently, including the twentieth', async () => {
    for (let i = 0; i < 20; i++) {
      await assertFails(setDoc(rowRef(FIRST, i), row(i, { reps: 0 })));
      await assertFails(setDoc(rowRef(FIRST, i), row(i, { completed: 'false' })));
    }
  });
  it('validates parent metadata, counts and authoritative timestamps', async () => {
    for (const count of [0, 21, 1.5, '1']) await assertFails(setDoc(workoutRef(), parent(count)));
    for (const values of [{ status: 'invalid' }, { exercise: '' }, { extra: true }, { createdAt: Timestamp.fromMillis(0) }]) await assertFails(setDoc(workoutRef(), { ...parent(), ...values }));
    await assertSucceeds(setDoc(workoutRef(), parent()));
    await assertFails(updateDoc(workoutRef(), { createdAt: Timestamp.fromMillis(0), updatedAt: serverTimestamp() }));
  });
  it('converts a legacy entry without changing its creation timestamp', async () => {
    const ref = workoutRef();
    await assertSucceeds(setDoc(ref, workout()));
    const before = (await getDoc(ref)).data().createdAt;
    await assertSucceeds(updateDoc(ref, { weight: deleteField(), reps: deleteField(), sets: deleteField(), status: 'completed', setCount: 1, updatedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(rowRef(), row(0, { completed: true })));
    assert.equal((await getDoc(ref)).data().createdAt.toMillis(), before.toMillis());
  });
});

describe('Plan data validation and owner CRUD', () => {
  it('lets each owner create, read, update and delete their plans', async () => {
    for (const uid of [FIRST, SECOND]) {
      const db = database(uid);
      const ref = doc(db, 'users', uid, 'plans', 'plan');
      await assertSucceeds(setDoc(ref, plan()));
      await assertSucceeds(getDocs(collection(db, 'users', uid, 'plans')));
      await assertSucceeds(updateDoc(ref, { name: 'Új terv', updatedAt: serverTimestamp() }));
      await assertSucceeds(deleteDoc(ref));
    }
  });

  it('rejects invalid plan fields and additional data', async () => {
    const ref = doc(database(FIRST), 'users', FIRST, 'plans', 'plan');
    for (const overrides of [
      { name: '' }, { name: 'a'.repeat(81) }, { name: 1 },
      { exercises: '' }, { exercises: 'a'.repeat(4001) }, { exercises: [] },
      { password: 'NEVER-STORE-PASSWORDS' },
    ]) {
      await assertFails(setDoc(ref, plan(overrides)));
    }
    const missing = plan();
    delete missing.exercises;
    await assertFails(setDoc(ref, missing));
  });

  it('requires server timestamps and immutable creation time', async () => {
    const ref = doc(database(FIRST), 'users', FIRST, 'plans', 'plan');
    const stale = Timestamp.fromDate(new Date('2020-01-01T00:00:00Z'));
    await assertFails(setDoc(ref, plan({ updatedAt: stale })));
    await assertSucceeds(setDoc(ref, plan()));
    await assertFails(updateDoc(ref, { createdAt: stale, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { updatedAt: stale }));
  });
});
