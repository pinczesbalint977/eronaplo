import { decodeSessionNotes } from './sessions.js';

export const EXERCISES = ['Guggolás', 'Fekvenyomás', 'Felhúzás', 'Vállból nyomás', 'Evezés', 'Lehúzás mellhez', 'Lábtolás', 'Bicepsz hajlítás', 'Tricepsz letolás', 'Kitörés'];

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const number = (value) => new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 }).format(value);
export const dateLabel = (date, options = { month: 'long', day: 'numeric' }) => new Intl.DateTimeFormat('hu-HU', options).format(new Date(`${date}T12:00:00`));

// Always return copies: prefilling an editor must never change the source entry.
export function getSets(entry) {
  if (Array.isArray(entry?.setResults)) {
    return entry.setResults.map(({ weight, reps, completed, ...rest }) => ({
      weight, reps, completed, ...(Object.hasOwn(rest, 'type') ? { type: rest.type } : {}),
    }));
  }
  if (!Number.isInteger(entry?.sets) || entry.sets < 1 || entry.sets > 20) return [];
  return Array.from({ length: entry.sets }, () => ({ weight: entry.weight, reps: entry.reps, completed: true }));
}

// Rows written before set types existed are working sets.
export const getSetType = (row) => row?.type === 'warmup' ? 'warmup' : 'work';

// The first displayed row is always the warmup; stored rows remain untouched.
export function getPositionedSets(entryOrRows) {
  const rows = Array.isArray(entryOrRows) ? entryOrRows : getSets(entryOrRows);
  return rows.map((row, index) => ({ ...row, type: index === 0 ? 'warmup' : 'work' }));
}

export function getPlannedWorkSets(entry) {
  const planned = entry?.plannedWorkSets;
  const rows = getSets(entry);
  return Number.isInteger(planned) && rows.length > 0 && planned === rows.length
    && !rows.some((row) => row.type === 'warmup') ? planned - 1 : planned;
}

export function prefillPlanSets(planItem, previous) {
  const priorRows = getPositionedSets(previous);
  return Array.from({ length: planItem.sets + 1 }, (_, index) => ({
    weight: priorRows[index]?.weight ?? '',
    reps: priorRows[index]?.reps ?? planItem.reps,
    completed: false,
    type: index === 0 ? 'warmup' : 'work',
    touched: false,
  }));
}

export function getWeightRecommendation(entry, prescription = {}) {
  const feedback = getWeightFeedback(entry, prescription);
  return feedback.kind === 'info' ? null : feedback;
}

// A current plan can supply the next workout's goal without changing saved history.
export function getWeightFeedback(entry, prescription = {}) {
  const info = (message) => ({ kind: 'info', message });
  if (!entry || entry.incomplete || entry.metadata?.incomplete) {
    return info('Az előző edzés adatai hiányosak, ezért még nincs súlyajánlás.');
  }
  if (entry.status !== 'completed') {
    return info('Az előző edzés nincs befejezve, ezért még nincs súlyajánlás.');
  }
  const plannedWorkSets = prescription.plannedWorkSets ?? getPlannedWorkSets(entry);
  const targetReps = prescription.targetReps ?? entry.targetReps;
  if (!Number.isInteger(plannedWorkSets) || plannedWorkSets < 1 || plannedWorkSets > 20
    || !Number.isInteger(targetReps) || targetReps < 1 || targetReps > 100) {
    return info('A munkasorozatok száma vagy az ismétléscél hiányzik vagy nem megfelelő, ezért nincs súlyajánlás.');
  }
  const work = getPositionedSets(entry).slice(1);
  if (work.length < plannedWorkSets || work.some((row) => row.completed !== true)) {
    return info('Az előző edzésben nem teljesült minden szükséges munkasorozat, ezért még nincs súlyajánlás.');
  }
  if (work.some((row) => !Number.isFinite(row.weight) || row.weight < 0 || row.weight > 1000
    || !Number.isInteger(row.reps) || row.reps < 1 || row.reps > 100)) {
    return info('Az előző munkasorozatok adatai hiányosak vagy nem megfelelőek, ezért nincs súlyajánlás.');
  }
  if (work.some((row) => row.weight !== work[0].weight)) {
    return info('Az előző munkasorozatokban eltérő súlyok szerepeltek, ezért nincs egységes súlyajánlás.');
  }
  if (work.every((row) => row.reps >= targetReps)) {
    return {
      kind: 'increase',
      message: plannedWorkSets === 3 && targetReps === 10 && work.length === 3
        ? 'Múltkor mindhárom munkasorozatban megvolt a 10 ismétlés. Emelj, ha úgy érzed!'
        : `Múltkor minden munkasorozatban megvolt az előírt ${targetReps} ismétlés. Emelj, ha úgy érzed!`,
    };
  }
  return {
    kind: 'maintain',
    message: `Érdemes lehet megtartanod ezt a súlyt az előírt ${targetReps} ismétléses célig.`,
  };
}

export const completedSets = (entry) => getSets(entry).filter((set) => set.completed === true);
export const volume = (entry) => completedSets(entry).reduce((sum, set) => sum + set.weight * set.reps, 0);
export const maxWeight = (entry) => Math.max(0, ...completedSets(entry).map((set) => set.weight));

export function workoutSummary(entry) {
  if (!Array.isArray(entry.setResults)) return `${entry.sets} × ${entry.reps} ismétlés · ${number(entry.weight)} kg`;
  const done = completedSets(entry);
  return done.length
    ? `${done.length}/${entry.setResults.length} teljesített sorozat · max. ${number(maxWeight(entry))} kg`
    : `0/${entry.setResults.length} teljesített sorozat`;
}

const exerciseKey = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('hu-HU');
const createdTime = (entry) => {
  const value = entry.createdAt;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000 + (value.nanoseconds || 0) / 1e6;
  if (value instanceof Date) return value.getTime();
  return typeof value === 'number' ? value : 0;
};

// Callers supply only the signed-in user's namespace. No cross-user query is used.
export function previousWorkout(entries, exercise, beforeDate, excludeId) {
  const name = exerciseKey(exercise);
  const eligible = entries.filter((entry) => {
    if ((excludeId !== undefined && entry.id === excludeId) || entry.date >= beforeDate || exerciseKey(entry.exercise) !== name) return false;
    const sets = getSets(entry);
    return sets.length > 0 && sets.every((set) => set.completed === true)
      && (!Array.isArray(entry.setResults) || entry.status === 'completed');
  });
  if (!eligible.length) return null;
  const date = eligible.reduce((latest, entry) => entry.date > latest ? entry.date : latest, eligible[0].date);
  const sameDay = eligible.filter((entry) => entry.date === date).sort((a, b) => {
    const time = createdTime(a) - createdTime(b);
    if (time) return time;
    const first = String(a.id || '');
    const second = String(b.id || '');
    return first < second ? -1 : first > second ? 1 : 0;
  });
  // Two plans on one date remain separate: use the most recent saved session.
  const session = decodeSessionNotes(sameDay.at(-1).notes);
  const selected = sameDay.filter((entry) => session
    ? decodeSessionNotes(entry.notes)?.sessionId === session.sessionId
    : !decodeSessionNotes(entry.notes));
  const result = { date, setResults: selected.flatMap(getSets) };
  if (selected.length === 1) {
    const saved = selected[0];
    for (const field of ['plannedWorkSets', 'targetReps', 'incomplete', 'metadata']) {
      if (Object.hasOwn(saved, field)) result[field] = saved[field];
    }
    // Older snapshots sometimes counted every untyped row as a work set.
    if (Object.hasOwn(saved, 'plannedWorkSets')) result.plannedWorkSets = getPlannedWorkSets(saved);
  }
  return result;
}

export function compareSet(current, previous) {
  if (current?.completed !== true || !previous || previous.completed === false) return null;
  if (![current.weight, current.reps, previous.weight, previous.reps].every(Number.isFinite)) return null;
  const weight = Math.sign(current.weight - previous.weight);
  const reps = Math.sign(current.reps - previous.reps);
  if (weight === 0 && reps === 0) return 'equal';
  if (weight >= 0 && reps >= 0) return 'up';
  if (weight <= 0 && reps <= 0) return 'down';
  return 'mixed';
}

export function aggregate(entries) {
  const finished = entries.filter((entry) => completedSets(entry).length > 0);
  return {
    days: new Set(finished.map((e) => e.date)).size,
    sets: finished.reduce((sum, e) => sum + completedSets(e).length, 0),
    volume: entries.reduce((sum, e) => sum + volume(e), 0),
    exercises: new Set(finished.map((e) => e.exercise)).size,
  };
}
