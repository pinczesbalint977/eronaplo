import { useEffect, useRef, useState } from 'react';
import { collection, getDocsFromServer, limit, onSnapshot, orderBy, query, startAfter, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { writeJournalBatch } from '../lib/writeJournal';
import { previousWorkout } from '../lib/workouts';
import { useAuth } from '../auth/AuthContext';

const PAGE_SIZE = 100;
const key = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('hu-HU');
const documentValue = (item) => ({ ...item.data(), id: item.id });
const cancelled = () => new DOMException('Aborted', 'AbortError');
const denied = (error) => ['permission-denied', 'unauthenticated'].includes(error.code);
const loadError = 'Az adatok betöltése nem sikerült. Ellenőrizd az internetkapcsolatot, majd próbáld újra.';

function hydrate(entry, rows) {
  if (!Number.isInteger(entry.setCount)) return entry;
  let incomplete = false;
  const setResults = Array.from({ length: entry.setCount }, (_, index) => {
    const row = rows.get(`${entry.id}_${index}`);
    if (!row) incomplete = true;
    return row ? { weight: row.weight, reps: row.reps, completed: row.completed, ...(Object.hasOwn(row, 'type') ? { type: row.type } : {}) }
      : { weight: 0, reps: 1, completed: false };
  });
  return { ...entry, setResults, metadata: { incomplete } };
}

// Firestore adds the document ID in the same direction as date for tied dates.
const isOlder = (first, second) => !second || first.data().date < second.data().date
  || (first.data().date === second.data().date && first.id < second.id);

export function useJournal(uid) {
  const { logout, isSessionActive } = useAuth();
  const [workouts, setWorkouts] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const current = useRef(null);

  useEffect(() => {
    const model = {
      uid, alive: true, controller: new AbortController(), entries: new Map(), rows: new Map(),
      plans: [], groups: [], cursor: null, latestReady: false, plansReady: false, hydratedOnce: false,
      hasOlder: false, loadingOlder: false, lookupCache: new Map(), pageCache: new Map(), revision: 0,
    };
    current.current = model;
    setWorkouts([]); setPlans([]); setLoading(true); setError(''); setHasOlder(false); setLoadingOlder(false);
    const active = () => model.alive && isSessionActive(uid);
    model.check = (signal) => {
      if (!active() || model.controller.signal.aborted || signal?.aborted) throw cancelled();
    };
    model.publish = () => {
      if (!active()) return;
      setWorkouts([...model.entries.values()].map((entry) => hydrate(entry, model.rows))
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)));
      setHasOlder(model.hasOlder);
      if (model.latestReady && model.plansReady && model.groups.every((group) => group.ready)) model.hydratedOnce = true;
      setLoading(!model.hydratedOnce);
    };
    model.invalidate = () => { model.revision += 1; model.lookupCache.clear(); };
    model.fail = (reason, initial = false) => {
      if (!active()) return;
      if (denied(reason)) { void logout(); return; }
      setError(loadError);
      if (initial) setLoading(false);
    };
    model.readRows = async (entries, signal) => {
      const ids = entries.filter((entry) => Number.isInteger(entry.setCount)).map((entry) => entry.id);
      const rows = new Map();
      // Each request is scoped to this user's explicitly selected parent IDs.
      for (let index = 0; index < ids.length; index += 10) {
        model.check(signal);
        const snapshot = await getDocsFromServer(query(collection(db, 'users', uid, 'workoutSets'), where('workoutId', 'in', ids.slice(index, index + 10))));
        model.check(signal);
        snapshot.docs.forEach((item) => rows.set(item.id, documentValue(item)));
      }
      return rows;
    };
    model.page = async (cursor, signal) => {
      model.check(signal);
      const cacheKey = cursor ? `${cursor.data().date}:${cursor.id}` : 'first';
      const constraints = [orderBy('date', 'desc')];
      if (cursor) constraints.push(startAfter(cursor));
      if (!model.pageCache.has(cacheKey)) {
        model.pageCache.set(cacheKey, getDocsFromServer(query(collection(db, 'users', uid, 'workouts'), ...constraints, limit(PAGE_SIZE))).catch((reason) => { model.pageCache.delete(cacheKey); throw reason; }));
      }
      const snapshot = await model.pageCache.get(cacheKey);
      model.check(signal);
      return snapshot;
    };
    const subscribeGroup = (group) => {
      group.ready = false;
      group.unsubscribe = onSnapshot(query(collection(db, 'users', uid, 'workoutSets'), where('workoutId', 'in', group.ids)),
        { includeMetadataChanges: true }, (snapshot) => {
          if (!active() || !model.groups.includes(group) || snapshot.metadata.fromCache) return;
          for (const [id, row] of model.rows) if (group.ids.includes(row.workoutId)) model.rows.delete(id);
          snapshot.docs.filter((item) => !item.metadata.hasPendingWrites).forEach((item) => model.rows.set(item.id, documentValue(item)));
          group.ready = true; model.invalidate(); model.publish();
        }, (reason) => model.fail(reason, true));
    };
    model.syncGroups = (entries) => {
      const desired = new Set(entries.filter((entry) => Number.isInteger(entry.setCount)).map((entry) => entry.id));
      const groups = [];
      const changed = new Set();
      for (const group of model.groups) {
        const retained = group.ids.filter((id) => desired.has(id));
        retained.forEach((id) => desired.delete(id));
        if (retained.length !== group.ids.length) {
          group.unsubscribe();
          if (retained.length) { const replacement = { ids: retained }; groups.push(replacement); changed.add(replacement); }
        } else groups.push(group);
      }
      // Fill only groups with room; adding an entry leaves all other listeners intact.
      for (const id of desired) {
        let group = groups.find((item) => item.ids.length < 10);
        if (!group) { group = { ids: [] }; groups.push(group); changed.add(group); }
        else if (!changed.has(group)) {
          group.unsubscribe();
          const replacement = { ids: [...group.ids] };
          groups[groups.indexOf(group)] = replacement; group = replacement; changed.add(group);
        }
        group.ids.push(id);
      }
      model.groups = groups;
      changed.forEach(subscribeGroup);
    };
    const unsubscribeWorkouts = onSnapshot(query(collection(db, 'users', uid, 'workouts'), orderBy('date', 'desc'), limit(PAGE_SIZE)),
      { includeMetadataChanges: true }, (snapshot) => {
        if (!active() || snapshot.metadata.fromCache) return;
        const entries = snapshot.docs.filter((item) => !item.metadata.hasPendingWrites).map(documentValue);
        const boundary = snapshot.docs.at(-1);
        snapshot.docChanges().filter((change) => change.type === 'removed').forEach((change) => {
          if (snapshot.size < PAGE_SIZE || (boundary && isOlder(boundary, change.doc))) model.entries.delete(change.doc.id);
        });
        entries.forEach((entry) => model.entries.set(entry.id, entry));
        // A limit-query removal can simply mean the entry crossed the page boundary.
        // Retain it in memory; explicit deletes are evicted after the REST commit.
        const last = snapshot.docs.at(-1);
        if (last && isOlder(last, model.cursor)) model.cursor = last;
        if (!model.latestReady) model.hasOlder = snapshot.size === PAGE_SIZE;
        model.latestReady = true;
        model.invalidate(); model.syncGroups(entries); model.publish();
      }, (reason) => model.fail(reason, true));
    const unsubscribePlans = onSnapshot(query(collection(db, 'users', uid, 'plans'), orderBy('createdAt', 'desc')),
      { includeMetadataChanges: true }, (snapshot) => {
        if (!active() || snapshot.metadata.fromCache) return;
        model.plans = snapshot.docs.filter((item) => !item.metadata.hasPendingWrites).map(documentValue);
        model.plansReady = true; setPlans(model.plans); model.publish();
      }, (reason) => model.fail(reason, true));
    return () => {
      model.alive = false; model.controller.abort(); unsubscribeWorkouts(); unsubscribePlans();
      model.groups.forEach((group) => group.unsubscribe());
      model.entries.clear(); model.rows.clear(); model.lookupCache.clear(); model.pageCache.clear(); model.plans = []; model.groups = [];
      if (current.current === model) current.current = null;
    };
  }, [uid, logout, isSessionActive]);

  async function loadOlder() {
    const model = current.current;
    if (!model || !model.latestReady || !model.hasOlder || model.loadingOlder) return;
    model.check(); model.loadingOlder = true; setLoadingOlder(true);
    try {
      const snapshot = await model.page(model.cursor);
      const entries = snapshot.docs.map(documentValue);
      const rows = await model.readRows(entries.filter((entry) => !model.entries.has(entry.id)));
      model.check();
      entries.forEach((entry) => model.entries.set(entry.id, entry));
      rows.forEach((row, id) => model.rows.set(id, row));
      if (snapshot.docs.length && isOlder(snapshot.docs.at(-1), model.cursor)) model.cursor = snapshot.docs.at(-1);
      model.hasOlder = snapshot.size === PAGE_SIZE;
      model.invalidate(); model.publish();
    } catch (reason) {
      if (denied(reason)) void logout();
      throw reason;
    } finally {
      model.loadingOlder = false;
      if (current.current === model && model.alive) setLoadingOlder(false);
    }
  }

  async function lookupPrevious(exercise, beforeDate, excludeId, { signal } = {}) {
    const model = current.current;
    if (!model) throw cancelled();
    model.check(signal);
    const local = [...model.entries.values()].map((entry) => hydrate(entry, model.rows));
    const previous = previousWorkout(local, exercise, beforeDate, excludeId);
    if (!model.hasOlder || (previous && previous.date > model.cursor?.data().date)) return previous;
    const cacheKey = JSON.stringify([key(exercise), beforeDate, excludeId]);
    if (model.lookupCache.has(cacheKey)) return model.lookupCache.get(cacheKey);
    const revision = model.revision;
    const matches = (entry) => entry.id !== excludeId && entry.date < beforeDate && key(entry.exercise) === key(exercise)
      && (!Number.isInteger(entry.setCount) || entry.status === 'completed');
    let candidates = [...model.entries.values()].filter(matches);
    const rows = new Map(model.rows);
    let cursor = model.cursor;
    let exhausted = !model.hasOlder;
    try {
      for (;;) {
        model.check(signal);
        const date = candidates.reduce((latest, entry) => entry.date > latest ? entry.date : latest, '');
        // Strictly crossing the date finishes every tied-date page before returning.
        if (date && (exhausted || cursor?.data().date < date)) {
          const sameDay = candidates.filter((entry) => entry.date === date);
          const missing = sameDay.filter((entry) => Number.isInteger(entry.setCount) && hydrate(entry, rows).metadata.incomplete);
          const fetched = await model.readRows(missing, signal);
          fetched.forEach((row, id) => rows.set(id, row));
          const result = previousWorkout(sameDay.map((entry) => hydrate(entry, rows)), exercise, beforeDate, excludeId);
          if (result) {
            model.check(signal);
            if (revision === model.revision) model.lookupCache.set(cacheKey, result);
            return result;
          }
          candidates = candidates.filter((entry) => entry.date !== date);
          continue;
        }
        if (exhausted) {
          if (revision === model.revision) model.lookupCache.set(cacheKey, null);
          return null;
        }
        const snapshot = await model.page(cursor, signal);
        const entries = snapshot.docs.map(documentValue);
        candidates.push(...entries.filter(matches));
        if (snapshot.docs.length) cursor = snapshot.docs.at(-1);
        exhausted = snapshot.size < PAGE_SIZE;
      }
    } catch (reason) {
      if (denied(reason)) void logout();
      throw reason;
    }
  }

  async function commitOperations(operations) {
    const model = current.current;
    if (!model) throw cancelled();
    model.check();
    const prepared = operations.map((options) => ({ ...options, previous: options.kind === 'workouts'
      ? model.entries.has(options.id) ? hydrate(model.entries.get(options.id), model.rows) : options.previous
      : model.plans.find((plan) => plan.id === options.id) }));
    try {
      const batch = await writeJournalBatch({ uid: model.uid, operations: prepared, isSessionActive, signal: model.controller.signal });
      model.check();
      let workoutsChanged = false;
      let plansChanged = false;
      const confirmedAt = new Date(batch.commitTime || Date.now());
      prepared.forEach((options, index) => {
        const result = batch.results[index];
        if (result.unchanged) return;
        const { previous } = options;
        if (options.kind === 'workouts' && model.cursor
          && ((previous?.date && previous.date <= model.cursor.data().date)
            || (options.values?.date && options.values.date <= model.cursor.data().date))) model.pageCache.clear();
        const id = result.id;
        if (options.kind === 'workouts') {
          workoutsChanged = true;
          if (options.remove) model.entries.delete(id);
          else {
            const { setResults, ...values } = options.values;
            const existing = model.entries.get(id);
            model.entries.set(id, { ...existing, ...values, createdAt: existing?.createdAt || confirmedAt, updatedAt: confirmedAt,
              ...(setResults ? { setCount: setResults.length } : {}), id });
          }
          for (const [rowId, row] of model.rows) if (row.workoutId === id) model.rows.delete(rowId);
          if (!options.remove) options.values.setResults?.forEach((row, index) => {
            model.rows.set(`${id}_${index}`, { ...row, workoutId: id, index });
          });
        } else if (options.kind === 'plans') {
          plansChanged = true;
          const existing = model.plans.find((plan) => plan.id === id);
          model.plans = model.plans.filter((plan) => plan.id !== id);
          if (!options.remove) model.plans.unshift({ ...existing, ...options.values, id, createdAt: existing?.createdAt || confirmedAt, updatedAt: confirmedAt });
        }
      });
      if (workoutsChanged || plansChanged) model.invalidate();
      if (workoutsChanged) model.publish();
      if (plansChanged) setPlans(model.plans);
      return batch;
    } catch (reason) {
      if (denied(reason)) void logout();
      throw reason;
    }
  }
  async function commit(options) {
    const { results, commitTime } = await commitOperations([options]);
    return { ...results[0], ...(commitTime ? { commitTime } : {}) };
  }
  async function saveSession(entries, removedEntries = []) {
    const { results } = await commitOperations([
      ...entries.map(({ values, id, createId }) => ({ kind: 'workouts', values, id, createId })),
      ...removedEntries.map((entry) => ({ kind: 'workouts', id: entry.id, previous: entry, remove: true })),
    ]);
    return results.map((result) => result.id);
  }
  async function removeSession(entries) {
    const { results } = await commitOperations(entries.map((entry) => ({ kind: 'workouts', id: entry.id, previous: entry, remove: true })));
    return results.map((result) => result.id);
  }
  const save = (kind, values, id) => commit({ kind, values, id });
  const remove = (kind, id) => commit({ kind, id, remove: true });
  const ownSession = current.current?.uid === uid;
  return { workouts: ownSession ? workouts : [], plans: ownSession ? plans : [], loading: ownSession ? loading : true,
    error: ownSession ? error : '', save, remove, saveSession, removeSession,
    hasOlder: ownSession && hasOlder, loadingOlder, loadOlder, lookupPrevious };
}
