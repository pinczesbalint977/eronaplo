const sameSet = (a, b) => a?.weight === b?.weight && a?.reps === b?.reps && a?.completed === b?.completed
  && (a?.type ?? 'work') === (b?.type ?? 'work');

// Work entirely from the already loaded private session; no extra read is needed.
export function journalChanges({ kind, values, previous, id, remove = false }) {
  const storedCount = Number.isInteger(previous?.setCount) ? previous.setCount : previous ? 0 : id ? 20 : 0;
  if (remove) return { changed: [], deleted: kind === 'workouts' ? Array.from({ length: storedCount }, (_, i) => i) : [], unchanged: false };
  if (kind !== 'workouts' || !Array.isArray(values?.setResults)) {
    return { changed: [], deleted: [], unchanged: Boolean(id && previous && Object.entries(values || {}).every(([key, value]) => previous[key] === value)) };
  }
  const rows = values.setResults;
  const completePrior = previous && Number.isInteger(previous.setCount) && !previous.metadata?.incomplete;
  const changed = rows.flatMap((row, index) => completePrior && sameSet(row, previous.setResults?.[index]) ? [] : [index]);
  const deleted = Array.from({ length: Math.max(0, storedCount - rows.length) }, (_, i) => rows.length + i);
  const sameParent = previous && ['exercise', 'date', 'notes', 'status', 'plannedWorkSets', 'targetReps']
    .every((field) => !Object.hasOwn(values, field) || previous[field] === values[field]) && previous.setCount === rows.length;
  return { changed, deleted, unchanged: Boolean(id && sameParent && !changed.length && !deleted.length) };
}
