import { collection, doc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { journalChanges } from './journalChanges';

const FIELDS = {
  workouts: ['exercise', 'weight', 'reps', 'sets', 'date', 'notes'],
  plans: ['name', 'exercises'],
};
const SET_WORKOUT_FIELDS = ['exercise', 'date', 'notes', 'setResults', 'status'];

function failure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requireSession(uid, isSessionActive) {
  if (!isSessionActive?.(uid) || auth?.currentUser?.uid !== uid) {
    throw failure('unauthenticated', 'A munkamenet lezárult. Jelentkezz be újra, majd ellenőrizd a naplót.');
  }
}

function fieldValue(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isSafeInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(fieldValue) } };
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fieldValue(item)])) } };
  }
  throw failure('invalid-argument', 'A megadott adatok formátuma nem megfelelő. Ellenőrizd a mezőket.');
}

// Token refresh has its own SDK network policy. Race it against our deadline as
// well, so an offline refresh cannot leave a save button waiting indefinitely.
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

function apiFailure(status) {
  switch (status) {
    case 'PERMISSION_DENIED':
      return failure('permission-denied', 'A fiókodnak nincs jogosultsága ehhez a művelethez.');
    case 'UNAUTHENTICATED':
      return failure('unauthenticated', 'A munkamenet lejárt. Jelentkezz be újra.');
    case 'INVALID_ARGUMENT':
      return failure('invalid-argument', 'A megadott adatok nem menthetők. Ellenőrizd a mezőket.');
    case 'NOT_FOUND':
    case 'FAILED_PRECONDITION':
    case 'ALREADY_EXISTS':
      return failure('failed-precondition', 'A bejegyzés időközben megváltozott vagy már nem létezik. Frissítsd a naplót.');
    case 'RESOURCE_EXHAUSTED':
      return failure('resource-exhausted', 'A Firebase ingyenes használati kerete most kimerült. Próbáld meg később.');
    default:
      return failure('unavailable', 'Nem érkezett visszaigazolás a Firebase-től. Ellenőrizd a naplót, mielőtt újra mentenél.');
  }
}

function prepareOperation({ uid, kind, values, id, createId, previous, remove = false }, databasePath) {
  if (!Object.hasOwn(FIELDS, kind) || typeof uid !== 'string' || uid.includes('/')
    || (id !== undefined && (typeof id !== 'string' || !id || id.includes('/')))
    || (createId !== undefined && (typeof createId !== 'string' || !createId || createId.includes('/')))
    || (remove && !id)) {
    throw failure('invalid-argument', 'A bejegyzés azonosítója vagy típusa nem megfelelő.');
  }

  const documentId = id || createId || doc(collection(db, 'users', uid, kind)).id;
  const documentName = `${databasePath}/documents/users/${uid}/${kind}/${documentId}`;
  let write;
  if (remove) {
    write = { delete: documentName, currentDocument: { exists: true } };
  } else {
    const expectedFields = kind === 'workouts' && values && Object.hasOwn(values, 'setResults')
      ? SET_WORKOUT_FIELDS : FIELDS[kind];
    if (!values || Object.keys(values).length !== expectedFields.length
      || !expectedFields.every((field) => Object.hasOwn(values, field))) {
      throw failure('invalid-argument', 'A mentendő adatok hiányosak. Ellenőrizd az űrlapot.');
    }
    const fields = Object.fromEntries(expectedFields.map((field) => [field, fieldValue(values[field])]));
    if (kind === 'workouts' && Array.isArray(values.setResults)) {
      fields.setCount = fieldValue(values.setResults.length);
      delete fields.setResults;
    }
    write = {
      update: { name: documentName, fields },
      currentDocument: { exists: Boolean(id) },
      updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
    };
    // Missing fields in an update mask are deleted, allowing legacy rows to be
    // edited into per-set entries without retaining an invalid mixed schema.
    if (id) write.updateMask = { fieldPaths: kind === 'workouts'
      ? [...new Set([...FIELDS.workouts, ...SET_WORKOUT_FIELDS, 'setCount'])] : expectedFields };
    else write.updateTransforms.push({ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' });
  }

  // Each set is a separately validated document; one atomic commit keeps the
  // exercise and its sets together without a long array validation in Rules.
  const changes = journalChanges({ kind, values, previous, id, remove });
  if (changes.unchanged) return { result: { id: documentId, unchanged: true }, writes: [] };
  const writes = [write];
  if (kind === 'workouts') {
    const sets = remove ? [] : values.setResults;
    if (remove || Array.isArray(sets)) {
      for (const index of [...changes.changed, ...changes.deleted]) {
        const name = `${databasePath}/documents/users/${uid}/workoutSets/${documentId}_${index}`;
        writes.push(changes.changed.includes(index) ? {
          update: { name, fields: Object.fromEntries(Object.entries({ workoutId: documentId, index, ...sets[index] }).map(([key, value]) => [key, fieldValue(value)])) },
        } : { delete: name });
      }
    }
  }
  return { result: { id: documentId }, writes };
}

/**
 * A single authenticated request, with no retry and no offline write queue.
 * Firebase ID tokens keep Firestore Security Rules in force for the REST API.
 * Read listeners stay on the SDK and see only server-confirmed changes.
 */
export async function writeJournalBatch({ uid, operations, isSessionActive, signal }) {
  requireSession(uid, isSessionActive);
  if (!navigator.onLine) {
    throw failure('unavailable', 'A mentéshez internetkapcsolat szükséges. Kapcsolódj az internethez, majd próbáld újra.');
  }
  if (!Array.isArray(operations) || operations.some((operation) => !operation || typeof operation !== 'object')) {
    throw failure('invalid-argument', 'A mentendő adatok hiányosak. Ellenőrizd az űrlapot.');
  }
  const databasePath = `projects/${db.app.options.projectId}/databases/(default)`;
  const prepared = operations.map((operation) => prepareOperation({ ...operation, uid }, databasePath));
  const writes = prepared.flatMap((operation) => operation.writes);
  const results = prepared.map((operation) => operation.result);
  if (!writes.length) return { results };
  if (writes.length > 500) {
    throw failure('invalid-argument', 'Egy mentés legfeljebb 500 dokumentumot módosíthat. Csökkentsd a gyakorlatok vagy sorozatok számát.');
  }

  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, 15_000);

  try {
    requireSession(uid, isSessionActive);
    const token = await abortable(auth.currentUser.getIdToken(), controller.signal);
    requireSession(uid, isSessionActive);
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const origin = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true'
      ? ''
      : 'https://firestore.googleapis.com';
    const response = await fetch(`${origin}/v1/${databasePath}/documents:commit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes }),
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    const result = await abortable(response.json(), controller.signal);
    if (!response.ok) throw apiFailure(result?.error?.status);
    requireSession(uid, isSessionActive);
    if (!result.commitTime || !Array.isArray(result.writeResults) || result.writeResults.length !== writes.length) {
      throw apiFailure('UNKNOWN');
    }
    return { results, commitTime: result.commitTime };
  } catch (error) {
    if (controller.signal.aborted) {
      throw failure(timedOut ? 'deadline-exceeded' : 'cancelled', timedOut
        ? 'Nem érkezett visszaigazolás a Firebase-től 15 másodpercen belül. Ellenőrizd a naplót, mielőtt újra mentenél.'
        : 'A művelet megszakadt. Ellenőrizd a naplót, mielőtt újra mentenél.');
    }
    if (error.code?.startsWith('auth/')) {
      if (['auth/user-token-expired', 'auth/invalid-user-token', 'auth/user-disabled'].includes(error.code)) {
        throw apiFailure('UNAUTHENTICATED');
      }
      throw apiFailure('UNAVAILABLE');
    }
    if (typeof error.code === 'string') throw error;
    throw apiFailure('UNAVAILABLE');
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener('abort', cancel);
  }
}

export async function writeJournal(options) {
  const { uid, isSessionActive, signal, ...operation } = options;
  const { results, commitTime } = await writeJournalBatch({ uid, operations: [operation], isSessionActive, signal });
  return { ...results[0], ...(commitTime ? { commitTime } : {}) };
}
