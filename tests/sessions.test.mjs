import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PLAN_EXERCISES, newPlanItem, parsePlan, encodePlan, encodeSessionNotes, decodeSessionNotes, workoutNote, groupSessions } from '../src/lib/sessions.js';

const snapshot = (overrides = {}) => ({ sessionId: 'session-a', planId: 'plan-a', planName: 'Lábnap 🏋️', position: 0, exerciseCount: 2, note: 'Jól ment! őű', ...overrides });
const entry = (id, metadata = {}, overrides = {}) => ({ id, date: '2026-11-08', exercise: 'Guggolás', notes: encodeSessionNotes(snapshot(metadata)), createdAt: { seconds: 1 }, ...overrides });

describe('Structured plans', () => {
  it('roundtrips stable IDs, order and Unicode with independent objects', () => {
    const items = [newPlanItem('Guggolás 🏋️', 4, 8), newPlanItem('Evezés', 3, 10)];
    assert.equal(items[0].id.length, 8);
    assert.notEqual(items[0].id, items[1].id);
    const encoded = encodePlan(items);
    assert.deepEqual(parsePlan(encoded), items);
    const parsed = parsePlan(encoded);
    parsed[0].name = 'Másik';
    assert.equal(items[0].name, 'Guggolás 🏋️');
    assert.equal(parsePlan(encoded)[0].name, 'Guggolás 🏋️');
  });

  it('preserves all older exercises and derives repeatable distinct IDs', () => {
    const text = ' Guggolás — 4 × 8\r\nEvezés 3x12\nVállból nyomás\nGuggolás — 4 × 8';
    const parsed = parsePlan(text);
    assert.deepEqual(parsed.map(({ name, sets, reps }) => ({ name, sets, reps })), [
      { name: 'Guggolás', sets: 4, reps: 8 }, { name: 'Evezés', sets: 3, reps: 12 },
      { name: 'Vállból nyomás', sets: 3, reps: 10 }, { name: 'Guggolás', sets: 4, reps: 8 },
    ]);
    assert.deepEqual(parsePlan(text), parsed);
    assert.equal(new Set(parsed.map(({ id }) => id)).size, 4);
    const oversized = parsePlan(Array.from({ length: 11 }, (_, i) => `Gyakorlat ${i}`).join('\n'));
    assert.equal(oversized.length, 11);
    assert.throws(() => encodePlan(oversized), /1–10/);
    assert.deepEqual(parsePlan('  '), []);
    assert.deepEqual(parsePlan(null), []);
  });

  it('validates counts, names, IDs and the persisted string limit', () => {
    assert.equal(MAX_PLAN_EXERCISES, 10);
    const item = newPlanItem('Guggolás');
    assert.throws(() => encodePlan([]), /1–10/);
    assert.throws(() => encodePlan([item, item]), /egyedinek/);
    for (const change of [{ name: '' }, { name: 'a'.repeat(101) }, { sets: 0 }, { sets: 21 }, { sets: 2.5 }, { reps: 101 }, { reps: '10' }]) {
      assert.throws(() => encodePlan([{ ...item, ...change }]));
    }
    const hugeIds = Array.from({ length: 10 }, (_, i) => ({ ...item, id: `${i}${'a'.repeat(400)}` }));
    assert.throws(() => encodePlan(hugeIds), /túl hosszú/);
  });
});

describe('Session snapshots', () => {
  it('keeps saved names and notes independent from later plan edits', () => {
    const plan = { id: 'plan-a', name: 'Lábnap 🏋️', items: [newPlanItem('Guggolás')] };
    const saved = entry('one');
    plan.name = 'Új név';
    plan.items[0].name = 'Új gyakorlat';
    assert.deepEqual(decodeSessionNotes(saved.notes), snapshot());
    assert.equal(workoutNote(saved), 'Jól ment! őű');
    assert.equal(groupSessions([saved])[0].planName, 'Lábnap 🏋️');
  });

  it('accepts ordinary notes safely and rejects malformed or oversized metadata', () => {
    for (const notes of ['', 'Régi szöveg őű', null, '{"sessionId":"a"}', 'ERONAPLO_SESSION_V1:{', 'ERONAPLO_SESSION_V1:{}']) {
      assert.equal(decodeSessionNotes(notes), null);
      assert.equal(workoutNote({ notes }), notes ?? '');
    }
    assert.throws(() => encodeSessionNotes(snapshot({ note: 'ő'.repeat(1000) })), /megjegyzés túl hosszú/);
    assert.throws(() => encodeSessionNotes(snapshot({ position: 2 })), /hiányosak/);
    assert.throws(() => encodeSessionNotes(snapshot({ exerciseCount: 0 })), /hiányosak/);
  });

  it('separates two same-day sessions and orders exercises without modifying input', () => {
    const entries = [entry('second', { position: 1 }), entry('other', { sessionId: 'session-b', exerciseCount: 1 }), entry('first')];
    const groups = groupSessions(entries);
    assert.equal(groups.length, 2);
    const session = groups.find(({ id }) => id === 'session-a');
    assert.deepEqual(session.entries.map(({ id }) => id), ['first', 'second']);
    assert.equal(session.incomplete, false);
    assert.equal(session.legacy, false);
    assert.deepEqual(entries.map(({ id }) => id), ['second', 'other', 'first']);
  });

  it('groups older records by date with creation-time and ID ordering', () => {
    const entries = [
      entry('z', {}, { notes: 'Régi', date: '2026-10-01', createdAt: { seconds: 2 } }),
      entry('b', {}, { notes: '', date: '2026-10-01', createdAt: { toMillis: () => 1000 } }),
      entry('a', {}, { notes: '', date: '2026-10-01', createdAt: new Date(1000) }),
      entry('new', { exerciseCount: 1 }),
    ];
    const groups = groupSessions(entries);
    assert.equal(groups[0].date, '2026-11-08');
    assert.deepEqual(groups[1], { id: 'legacy-2026-10-01', date: '2026-10-01', planId: '', planName: 'Korábbi edzés', entries: [entries[2], entries[1], entries[0]], legacy: true, incomplete: false });
  });

  it('flags missing, duplicate or inconsistent members and isolates date boundaries', () => {
    assert.equal(groupSessions([entry('a')])[0].incomplete, true);
    assert.equal(groupSessions([entry('a'), entry('b')])[0].incomplete, true);
    assert.equal(groupSessions([entry('a'), entry('b', { position: 1, planName: 'Másik' })])[0].incomplete, true);
    assert.equal(groupSessions([entry('a'), entry('b', { position: 1, exerciseCount: 3 })])[0].incomplete, true);
    const split = groupSessions([entry('a'), entry('b', { position: 1 }, { date: '2026-11-07' })]);
    assert.equal(split.length, 2);
    assert.ok(split.every(({ incomplete }) => incomplete));
    assert.equal(groupSessions([]).length, 0);
  });
});
