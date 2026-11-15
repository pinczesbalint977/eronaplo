import { useCallback, useEffect, useMemo, useRef } from 'react';
import { collection, doc, getDocFromServer, getDocsFromServer, limit, orderBy, query, where } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import { db } from '../lib/firebase';
import { validateBody, validateNutrition, weekDates, weekSunday } from '../lib/health';
import { writeJournalBatch } from '../lib/writeJournal';

const cancelled = () => new DOMException('A művelet megszakadt.', 'AbortError');
const denied = (reason) => ['permission-denied', 'unauthenticated'].includes(reason.code);
const copyWeek = ({ days, body }) => ({ days: days.map((day) => ({ ...day })), body: body ? { ...body } : null });
const documentValue = (snapshot) => ({ ...snapshot.data(), id: snapshot.id });
const MAX_CACHED_WEEKS = 12;

// Mounted once inside PrivateApp. No listeners or reads until this page asks
// for a week; changing routes retains only this account's memory cache.
export function useHealthJournal(uid) {
  const { isSessionActive, logout } = useAuth();
  const current = useRef(null);
  useEffect(() => {
    const model = { uid, alive: true, controller: new AbortController(), weeks: new Map() };
    current.current = model;
    return () => {
      model.alive = false;
      model.controller.abort();
      model.weeks.clear();
      if (current.current === model) current.current = null;
    };
  }, [uid]);

  const check = useCallback((model) => {
    if (!model || !model.alive || model.uid !== uid || current.current !== model
      || model.controller.signal.aborted || !isSessionActive(uid)) {
      model?.weeks.clear();
      throw cancelled();
    }
  }, [uid, isSessionActive]);

  const fail = useCallback((model, reason) => {
    if (denied(reason)) {
      model.weeks.clear();
      model.controller.abort();
      void logout();
    }
    throw reason;
  }, [logout]);

  const entryFor = useCallback((model, sunday) => {
    const entry = model.weeks.get(sunday) || { data: null, request: null, saving: null, revision: 0 };
    model.weeks.delete(sunday);
    model.weeks.set(sunday, entry);
    while (model.weeks.size > MAX_CACHED_WEEKS) model.weeks.delete(model.weeks.keys().next().value);
    return entry;
  }, []);

  const loadWeek = useCallback(async (sunday, { refresh = false } = {}) => {
    const model = current.current;
    check(model);
    const dates = weekDates(sunday);
    if (weekSunday(sunday) !== sunday) throw new Error('A hét vasárnapjának dátumát válaszd ki.');
    const entry = entryFor(model, sunday);
    if (entry.saving) {
      // The save continuation updates this cache before later load waiters run.
      await entry.saving;
      check(model);
    }
    if (entry.request) {
      const data = await entry.request;
      check(model);
      return copyWeek(data);
    }
    if (entry.data && !refresh) return copyWeek(entry.data);
    const revision = entry.revision;
    const request = (async () => {
      try {
        const [days, body] = await Promise.all([
          getDocsFromServer(query(collection(db, 'users', uid, 'nutritionDays'),
            where('date', '>=', dates[0]), where('date', '<=', sunday), orderBy('date'), limit(7))),
          getDocFromServer(doc(db, 'users', uid, 'bodyWeeks', sunday)),
        ]);
        check(model);
        // A late read cannot replace a save that was already confirmed locally.
        if (entry.revision === revision) entry.data = {
          days: days.docs.map(documentValue), body: body.exists() ? documentValue(body) : null,
        };
        return entry.data;
      } catch (reason) {
        if (model.weeks.get(sunday) === entry && !entry.data) model.weeks.delete(sunday);
        return fail(model, reason);
      }
    })().finally(() => { if (entry.request === request) entry.request = null; });
    entry.request = request;
    const data = await request;
    check(model);
    return copyWeek(data);
  }, [uid, check, entryFor, fail]);

  const save = useCallback(async (kind, input, previous) => {
    const model = current.current;
    check(model);
    const values = kind === 'nutritionDays' ? validateNutrition(input) : validateBody(input);
    const sunday = weekSunday(values.date);
    const entry = entryFor(model, sunday);
    // Finish an explicit refresh before submitting so it cannot overwrite the
    // confirmed save, and never retry an uncertain write automatically.
    if (entry.request) await entry.request;
    if (!entry.data) await loadWeek(sunday);
    check(model);
    let saving;
    try {
      saving = writeJournalBatch({ uid, isSessionActive, signal: model.controller.signal,
        operations: [{ kind, id: previous?.id, createId: values.date, values, previous }],
      });
      entry.saving = saving;
      const batch = await saving;
      check(model);
      const result = batch.results[0];
      const confirmedAt = new Date(batch.commitTime || Date.now());
      const saved = result.unchanged && previous ? { ...previous } : {
        ...values, id: result.id, createdAt: previous?.createdAt || confirmedAt, updatedAt: confirmedAt,
      };
      entry.revision += 1;
      // A normal edit has a loaded week. If invoked without one, invalidate
      // rather than pretending the other six days are known to be empty.
      if (entry.data) entry.data = kind === 'nutritionDays'
        ? { ...entry.data, days: [...entry.data.days.filter((day) => day.date !== saved.date), saved].sort((a, b) => a.date.localeCompare(b.date)) }
        : { ...entry.data, body: saved };
      return { ...saved };
    } catch (reason) {
      return fail(model, reason);
    } finally {
      if (entry.saving === saving) entry.saving = null;
    }
  }, [uid, isSessionActive, check, entryFor, fail, loadWeek]);

  const saveDay = useCallback((values, previous) => save('nutritionDays', values, previous), [save]);
  const saveBody = useCallback((values, previous) => save('bodyWeeks', values, previous), [save]);
  return useMemo(() => ({ loadWeek, saveDay, saveBody }), [loadWeek, saveDay, saveBody]);
}
