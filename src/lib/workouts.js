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

export function prefillPlanSets(planItem, previous) {
  const priorRows = Array.isArray(previous) ? previous : getSets(previous);
  const groups = {
    warmup: priorRows.filter((row) => getSetType(row) === 'warmup'),
    work: priorRows.filter((row) => getSetType(row) === 'work'),
  };
  return [['warmup', planItem.warmupSets ?? 0], ['work', planItem.sets]].flatMap(([type, count]) => (
    Array.from({ length: count }, (_, index) => ({
      weight: groups[type][index]?.weight ?? '',
      reps: groups[type][index]?.reps ?? planItem.reps,
      completed: false,
      type,
      touched: false,
    }))
  ));
}

export function getWeightRecommendation(entry) {
  if (entry?.status !== 'completed' || entry.incomplete || entry.metadata?.incomplete) return null;
  const { plannedWorkSets, targetReps } = entry;
  if (!Number.isInteger(plannedWorkSets) || plannedWorkSets < 1 || plannedWorkSets > 20
    || !Number.isInteger(targetReps) || targetReps < 1 || targetReps > 100) return null;
  const rows = getSets(entry);
  if (rows.some((row) => Object.hasOwn(row, 'type') && row.type !== 'warmup' && row.type !== 'work')) return null;
  const work = rows.filter((row) => getSetType(row) === 'work');
  if (work.length < plannedWorkSets || work.some((row) => row.completed !== true
    || !Number.isFinite(row.weight) || row.weight < 0 || row.weight > 1000
    || !Number.isInteger(row.reps) || row.reps < 1 || row.reps > 100
    || row.weight !== work[0].weight)) return null;
  if (work.every((row) => row.reps >= targetReps)) {
    return {
      kind: 'increase',
      message: plannedWorkSets === 3 && targetReps === 10 && work.length === 3
        ? 'Szép munka! Mindhárom munkasorozatban elérted a 10 ismétlést. A következő edzésen érdemes lehet növelned a súlyt!'
        : `Szép munka! Minden munkasorozatban elérted az előírt ${targetReps} ismétlést. A következő edzésen érdemes lehet növelned a súlyt!`,
    };
  }
  return {
    kind: 'maintain',
    message: `Érdemes lehet megtartanod ezt a súlyt, és az ismétlésszámot az előírt ${targetReps} ismétléses célig növelned.`,
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
  return { date, setResults: selected.flatMap(getSets) };
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
