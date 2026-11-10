import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, Minus, Plus, Trash2 } from 'lucide-react';
import { compareSet, dateLabel, getSets, getPlannedWorkSets, getPositionedSets, number, prefillPlanSets, previousWorkout, today } from '../lib/workouts';
import { encodePlan, encodeSessionNotes, MAX_PLAN_EXERCISES, parsePlan, workoutNote } from '../lib/sessions';
import WeightRecommendation from './WeightRecommendation';

const validatedSets = (rows) => rows.map((row, index) => {
  const weight = Number(row.weight), reps = Number(row.reps);
  if (row.weight === '' || row.reps === '' || !Number.isFinite(weight) || weight < 0 || weight > 1000
    || !Number.isInteger(reps) || reps < 1 || reps > 100
    || (row.type !== undefined && !['warmup', 'work'].includes(row.type))) {
    throw new Error('Minden sorozathoz adj meg 0–1000 kg súlyt és 1–100 egész ismétlést.');
  }
  return { weight, reps, completed: true, type: index === 0 ? 'warmup' : 'work' };
});

export default function SessionEditor({ journal, item, initialDate, initialPlanId, close, done, Modal }) {
  const [sessionId] = useState(() => item && !item.legacy ? item.id : crypto.randomUUID());
  const [planId, setPlanId] = useState(item?.planId || initialPlanId || '');
  const [date, setDate] = useState(item?.date || initialDate || today());
  const [exercises, setExercises] = useState(() => item ? item.entries.map((entry) => ({
    key: entry.id, id: entry.id, name: entry.exercise, defaultReps: entry.targetReps ?? getSets(entry)[0]?.reps ?? 10,
    plannedWorkSets: getPlannedWorkSets(entry), targetReps: entry.targetReps,
    rows: getPositionedSets(entry).map((row) => ({ ...row, touched: row.completed })), previous: null, note: workoutNote(entry),
  })) : []);
  const [notes, setNotes] = useState(item ? workoutNote(item.entries[0]) : '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyStates, setHistoryStates] = useState({});
  const revision = useRef(0);
  const plan = journal.plans.find((entry) => entry.id === planId);
  const planName = item?.planName || plan?.name || '';

  // Template changes are snapshots for future workouts; existing sessions keep their exercises.
  useEffect(() => {
    if (item) return;
    setError('');
    if (!plan) { setExercises([]); return; }
    try {
      const items = parsePlan(plan.exercises);
      // Validate saved templates before using counts to allocate editable rows.
      encodePlan(items);
      setExercises(items.map((exercise, index) => {
        const previous = previousWorkout(journal.workouts, exercise.name, date);
        return { key: exercise.id, createId: `${sessionId}_${index}`, name: exercise.name,
          defaultReps: exercise.reps, plannedWorkSets: exercise.sets, targetReps: exercise.reps,
          rows: prefillPlanSets(exercise, previous), previous, note: '' };
      }));
    } catch (reason) {
      setExercises([]);
      setError(reason.message || 'Az edzésterv adatai nem megfelelőek. Javítsd az edzéstervek között.');
    }
  }, [planId, plan?.exercises, item]);

  const historyKey = JSON.stringify([planId, date, exercises.map(({ key, name }) => [key, name])]);
  useEffect(() => {
    const controller = new AbortController();
    const request = ++revision.current;
    setHistoryStates(Object.fromEntries(exercises.map((exercise) => [exercise.key, { loading: true, error: '' }])));
    if (!exercises.length || !date) { setHistoryLoading(false); return () => controller.abort(); }
    setHistoryLoading(true);
    const update = (key, previous) => {
      if (controller.signal.aborted || revision.current !== request) return;
      setExercises((current) => current.map((exercise) => {
        if (exercise.key !== key) return exercise;
        return { ...exercise, previous, rows: exercise.rows.map((row, index) => {
          const old = previous?.setResults[index];
          return item || row.touched ? row : { ...row, weight: old?.weight ?? '', reps: old?.reps ?? exercise.defaultReps };
        }) };
      }));
    };
    // The journal shares cached history pages across exercises; typing never fetches data.
    Promise.allSettled(exercises.map(async (exercise) => {
      let error = '';
      try {
        update(exercise.key, previousWorkout(journal.workouts, exercise.name, date, exercise.id));
        if (journal.lookupPrevious && journal.hasOlder) {
          const previous = await journal.lookupPrevious(exercise.name, date, exercise.id, { signal: controller.signal });
          update(exercise.key, previous);
        }
      } catch (reason) {
        if (reason.name !== 'AbortError') error = 'Az előzmény ellenőrzése nem sikerült. Ennél a gyakorlatnál most nem adható biztos súlyajánlás.';
      } finally {
        if (!controller.signal.aborted && revision.current === request) {
          setHistoryStates((current) => ({ ...current, [exercise.key]: { loading: false, error } }));
        }
      }
    })).then(() => {
      if (controller.signal.aborted || revision.current !== request) return;
      setHistoryLoading(false);
    });
    return () => controller.abort();
  }, [historyKey]);

  function change(key, index, field, value) {
    setExercises((current) => current.map((exercise) => exercise.key !== key ? exercise : {
      ...exercise, rows: exercise.rows.map((row, i) => i === index ? { ...row, [field]: value, touched: true } : row),
    }));
  }
  function resize(key, index) {
    setExercises((current) => current.map((exercise) => {
      if (exercise.key !== key) return exercise;
      if (index !== undefined) return { ...exercise, rows: exercise.rows.filter((_, i) => i !== index) };
      const count = exercise.rows.length;
      const old = exercise.previous?.setResults[count];
      return { ...exercise, rows: [...exercise.rows, { weight: old?.weight ?? '', reps: old?.reps ?? exercise.defaultReps,
        type: count === 0 ? 'warmup' : 'work', touched: false, completed: false }] };
    }));
  }
  async function submit(event) {
    event.preventDefault();
    if (pending || historyLoading) return;
    setError('');
    try {
      if (!planName || !exercises.length || exercises.length > MAX_PLAN_EXERCISES || item?.incomplete
        || exercises.some((exercise) => !exercise.name || !exercise.rows.length || exercise.rows.length > 20)) {
        throw new Error('Válassz egy 1–10 gyakorlatot tartalmazó edzéstervet. Hiányos edzéshez előbb töltsd be a régebbi adatokat.');
      }
      const entries = exercises.map((exercise, position) => ({ id: exercise.id, createId: exercise.createId,
        values: { exercise: exercise.name, date, status: 'completed', setResults: validatedSets(exercise.rows),
          ...(Number.isInteger(exercise.plannedWorkSets) && exercise.plannedWorkSets > 0 && Number.isInteger(exercise.targetReps)
            ? { plannedWorkSets: exercise.plannedWorkSets, targetReps: exercise.targetReps } : {}),
          notes: encodeSessionNotes({ sessionId, planId: item?.planId || planId, planName, position,
            exerciseCount: exercises.length, note: item?.legacy ? exercise.note : notes.trim() }),
        },
      }));
      setPending(true);
      await journal.saveSession(entries);
      done(item ? 'Az edzés módosításait mentettük.' : 'Edzés elmentve a naptárba. Szép munka!');
    } catch (reason) { setError(reason.message || 'Az edzés mentése nem sikerült.'); setPending(false); }
  }
  return <Modal title={item ? 'Edzés szerkesztése' : 'Edzés rögzítése'} close={() => !pending && close()} wide>
    <form className="edit-form session-editor" onSubmit={submit}>
      {item ? <div className="session-plan-name"><span className="small-label">EDZÉSTERV</span><h3>{planName}</h3><p className="muted small">A mentett edzés gyakorlatai; a terv későbbi módosításai ezt nem írják át.</p></div>
        : <label>Edzésterv<select aria-label="Edzésterv" autoFocus value={planId} required disabled={pending} onChange={(event) => setPlanId(event.target.value)}><option value="">Válassz edzéstervet…</option>{journal.plans.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>}
      {!item && !journal.plans.length && <p className="form-error">Először hozz létre egy edzéstervet a gyakorlataiddal. <NavLink to="/tervek" className="text-button" onClick={close}>Edzéstervek megnyitása</NavLink></p>}
      <label>Edzés dátuma<input type="date" value={date} onChange={(event) => setDate(event.target.value)} min="2000-01-01" max={today()} required disabled={pending} /></label>
      {exercises.map((exercise) => <section className="session-exercise" key={exercise.key} aria-label={exercise.name}>
        <h3>{exercise.name}</h3>
        <p className="series-history">{historyStates[exercise.key]?.loading ? 'Korábbi eredmények keresése…' : exercise.previous ? <>Előző befejezett edzés: <strong>{dateLabel(exercise.previous.date, { year: 'numeric', month: 'long', day: 'numeric' })}</strong></> : 'Még nincs korábbi eredmény'}</p>
        {historyStates[exercise.key]?.error && <p className="form-error" role="alert">{historyStates[exercise.key].error}</p>}
        {exercise.previous && <WeightRecommendation enabled={!historyStates[exercise.key]?.loading && !historyStates[exercise.key]?.error} entry={{
          ...exercise.previous, id: exercise.key + exercise.previous.date, exercise: exercise.name, status: 'completed',
        }} prescription={{
          plannedWorkSets: exercise.plannedWorkSets ?? exercise.previous.plannedWorkSets ?? Math.max(3, exercise.previous.setResults.length - 1),
          targetReps: exercise.targetReps ?? exercise.previous.targetReps ?? exercise.defaultReps,
        }} />}
        <div className="series-columns" aria-hidden="true"><span>#</span><span>Előző edzés</span><span>Mai edzés</span></div>
        {Array.from({ length: Math.max(exercise.rows.length, exercise.previous?.setResults.length || 0) }, (_, index) => {
          const row = exercise.rows[index], old = exercise.previous?.setResults[index];
          const comparison = row && row.touched && row.weight !== '' && row.reps !== '' ? compareSet({ weight: Number(row.weight), reps: Number(row.reps), completed: true }, old) : null;
          const indicator = comparison === 'up' ? { Icon: ArrowUp, text: 'Fejlődés' } : comparison === 'down' ? { Icon: ArrowDown, text: 'Kevesebb' } : comparison ? { Icon: Minus, text: comparison === 'equal' ? 'Azonos' : 'Eltérő eredmény' } : null;
          return <div className={index === 0 ? 'series-row is-warmup' : 'series-row'} key={index}>
            <div className="series-index"><strong>{index + 1}.</strong>{row && <button className="icon-button" type="button" aria-label={exercise.name + ' ' + (index + 1) + '. sorozat törlése'} disabled={pending || exercise.rows.length === 1} onClick={() => resize(exercise.key, index)}><Trash2 size={14} /></button>}</div>
            <div className="series-previous"><span className={index === 0 ? 'set-kind-badge warmup' : 'set-kind-badge work'}>{index === 0 ? 'Bemelegítő' : 'Munka'}</span><span>{old ? number(old.weight) + ' kg × ' + old.reps : '—'}</span>{indicator && <span className={'series-comparison ' + comparison} role="status"><indicator.Icon size={15} />{indicator.text}</span>}</div>
            <div className="series-current">{row ? <div className="series-inputs"><label><span aria-hidden="true">kg</span><input aria-label={exercise.name + ' ' + (index + 1) + '. sorozat súlya'} type="number" inputMode="decimal" step="any" min="0" max="1000" required value={row.weight} onChange={(event) => change(exercise.key, index, 'weight', event.target.value)} disabled={pending} /></label><label><span aria-hidden="true">ism.</span><input aria-label={exercise.name + ' ' + (index + 1) + '. sorozat ismétlése'} type="number" inputMode="numeric" step="1" min="1" max="100" required value={row.reps} onChange={(event) => change(exercise.key, index, 'reps', event.target.value)} disabled={pending} /></label></div> : <p className="muted small">Nincs mai sorozat</p>}</div>
          </div>;
        })}
        <button className="text-button" type="button" disabled={pending || exercise.rows.length >= 20} onClick={() => resize(exercise.key)}><Plus size={16} />Sorozat hozzáadása</button>
      </section>)}
      {exercises.length > 0 && <><p className="field-help series-help">Az első sorozat mindig bemelegítő, a többi munkasorozat. Az ajánlás az előző befejezett edzés alapján jelenik meg; a mai mezőket nem változtatja meg. Mentéskor a megmaradt sorozatokat elvégzettként rögzítjük, a ki nem végzetteket töröld.</p><label>Megjegyzés (opcionális)<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={300} rows={2} disabled={pending || item?.legacy} /></label></>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button button-secondary" disabled={pending} onClick={close}>Mégse</button><button type="submit" className="button button-primary" disabled={pending || historyLoading || !exercises.length}>{pending ? 'Mentés…' : item ? 'Módosítások mentése' : 'Edzés mentése'}<Check size={18} /></button></div>
    </form>
  </Modal>;
}
