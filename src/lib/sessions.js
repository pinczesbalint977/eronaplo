export const MAX_PLAN_EXERCISES = 10;

const SESSION_PREFIX = 'ERONAPLO_SESSION_V1:';
const validInteger = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const legacyId = (value, index) => {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.codePointAt(0), 16777619);
  return `legacy-${index}-${(hash >>> 0).toString(36)}`;
};

export function newPlanItem(name = '', sets = 3, reps = 10, warmupSets = 1) {
  return { id: crypto.randomUUID().slice(0, 8), name, sets, reps, warmupSets };
}

// Parsing never truncates an older plan: the editor can explain any invalid limits.
export function parsePlan(exercisesString) {
  if (typeof exercisesString !== 'string' || !exercisesString.trim()) return [];
  try {
    const parsed = JSON.parse(exercisesString);
    if (parsed?.version === 1 && Array.isArray(parsed.items)
      && parsed.items.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
      return parsed.items.map((item, index) => ({
        id: typeof item.id === 'string' && item.id ? item.id : legacyId(JSON.stringify(item), index),
        name: item.name ?? '', sets: item.sets ?? 3, reps: item.reps ?? 10,
        warmupSets: Object.hasOwn(item, 'warmupSets') ? item.warmupSets : 0,
      }));
    }
  } catch { /* Older plans contain ordinary multiline text. */ }
  return exercisesString.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const match = line.match(/^(.*?)\s*(?:[—–-]\s*)?(\d+)\s*[×xX*]\s*(\d+)\s*(?:ismétlés)?\s*$/u);
    return {
      id: legacyId(line, index),
      name: match && match[1].trim() ? match[1].trim() : line,
      sets: match && match[1].trim() ? Number(match[2]) : 3,
      reps: match && match[1].trim() ? Number(match[3]) : 10,
      warmupSets: 0,
    };
  });
}

export function encodePlan(items) {
  if (!Array.isArray(items) || !validInteger(items.length, 1, MAX_PLAN_EXERCISES)) {
    throw new Error(`Az edzéstervben 1–${MAX_PLAN_EXERCISES} gyakorlat szerepelhet.`);
  }
  const ids = new Set();
  const normalized = items.map((item) => {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) {
      throw new Error('A gyakorlatok azonosítóinak egyedinek kell lenniük.');
    }
    ids.add(item.id);
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > 100) {
      throw new Error('A gyakorlat neve 1–100 karakter lehet.');
    }
    const warmupSets = item.warmupSets === undefined ? 0 : item.warmupSets;
    if (!validInteger(item.sets, 1, 20) || !validInteger(item.reps, 1, 100)
      || !validInteger(warmupSets, 0, 19) || item.sets + warmupSets > 20) {
      throw new Error('Gyakorlatonként 1–20 sorozat és 1–100 ismétlés adható meg.');
    }
    return { id: item.id, name: item.name.trim(), sets: item.sets, reps: item.reps, warmupSets };
  });
  const result = JSON.stringify({ version: 1, items: normalized });
  if (result.length > 4000) throw new Error('Az edzésterv túl hosszú. Rövidítsd a gyakorlatok nevét.');
  return result;
}

const validMetadata = (value) => value && typeof value === 'object' && !Array.isArray(value)
  && typeof value.sessionId === 'string' && value.sessionId.length > 0
  && typeof value.planId === 'string' && typeof value.planName === 'string' && value.planName.trim().length > 0
  && validInteger(value.exerciseCount, 1, MAX_PLAN_EXERCISES)
  && validInteger(value.position, 0, value.exerciseCount - 1)
  && typeof value.note === 'string';

export function encodeSessionNotes({ sessionId, planId, planName, position, exerciseCount, note = '' }) {
  const metadata = { sessionId, planId, planName, position, exerciseCount, note };
  if (!validMetadata(metadata)) throw new Error('Az edzés adatai hiányosak. Nyisd meg újra az edzést.');
  const result = SESSION_PREFIX + JSON.stringify(metadata);
  if (result.length > 1000) throw new Error('A megjegyzés túl hosszú. Rövidítsd le, hogy az edzéssel együtt elférjen.');
  return result;
}

export function decodeSessionNotes(notes) {
  if (typeof notes !== 'string' || notes.length > 1000 || !notes.startsWith(SESSION_PREFIX)) return null;
  try {
    const parsed = JSON.parse(notes.slice(SESSION_PREFIX.length));
    if (!validMetadata(parsed)) return null;
    const { sessionId, planId, planName, position, exerciseCount, note } = parsed;
    return { sessionId, planId, planName, position, exerciseCount, note };
  } catch { return null; }
}

export function workoutNote(entry) {
  return decodeSessionNotes(entry?.notes)?.note ?? (typeof entry?.notes === 'string' ? entry.notes : '');
}

const createdTime = (entry) => {
  const value = entry.createdAt;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000 + (value.nanoseconds || 0) / 1e6;
  if (value instanceof Date) return value.getTime();
  return typeof value === 'number' ? value : 0;
};
const compareCreated = (a, b) => createdTime(a) - createdTime(b) || String(a.id || '').localeCompare(String(b.id || ''));

// Group only the supplied user-scoped records; plan edits never change snapshots.
export function groupSessions(workouts) {
  const groups = new Map();
  for (const entry of workouts) {
    const metadata = decodeSessionNotes(entry.notes);
    const key = JSON.stringify([metadata ? 'session' : 'legacy', metadata?.sessionId, entry.date]);
    if (!groups.has(key)) groups.set(key, {
      id: metadata?.sessionId ?? `legacy-${entry.date}`,
      date: entry.date,
      planId: metadata?.planId ?? '',
      planName: metadata?.planName ?? 'Korábbi edzés',
      entries: [], legacy: !metadata, incomplete: false,
    });
    groups.get(key).entries.push(entry);
  }
  for (const group of groups.values()) {
    group.entries.sort(group.legacy ? compareCreated : (a, b) => (
      decodeSessionNotes(a.notes).position - decodeSessionNotes(b.notes).position || compareCreated(a, b)
    ));
    if (!group.legacy) {
      const first = decodeSessionNotes(group.entries[0].notes);
      group.incomplete = group.entries.length !== first.exerciseCount || group.entries.some((entry, index) => {
        const metadata = decodeSessionNotes(entry.notes);
        return metadata.exerciseCount !== first.exerciseCount || metadata.position !== index
          || metadata.planId !== first.planId || metadata.planName !== first.planName;
      });
    }
  }
  return [...groups.values()].sort((a, b) => String(b.date).localeCompare(String(a.date))
    || compareCreated(b.entries[0], a.entries[0]) || a.id.localeCompare(b.id));
}
