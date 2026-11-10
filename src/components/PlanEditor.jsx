import { useId, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { EXERCISES } from '../lib/workouts';
import { encodePlan, MAX_PLAN_EXERCISES, newPlanItem, parsePlan } from '../lib/sessions';
import './session-pages.css';

export default function PlanEditor({ journal, item, close, done, Modal }) {
  const [name, setName] = useState(item?.name || '');
  const [items, setItems] = useState(() => {
    const parsed = parsePlan(item?.exercises);
    return parsed.length ? parsed : [newPlanItem()];
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const listId = useId();
  const suggestions = [...new Set([...EXERCISES, ...journal.workouts.map((entry) => entry.exercise)])];
  function change(id, field, value) {
    setItems((current) => current.map((row) => row.id === id ? {
      ...row, ...(field === 'totalSets' ? { sets: Number(value) - 1, warmupSets: 1 } : { [field]: value }),
    } : row));
  }
  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setError('');
    if (!name.trim() || name.trim().length > 80) {
      setError('Az edzésterv neve 1–80 karakter lehet.'); return;
    }
    const exerciseNames = items.map((row) => String(row.name).trim().replace(/\s+/g, ' ').toLocaleLowerCase('hu-HU'));
    if (new Set(exerciseNames).size !== exerciseNames.length) {
      setError('Minden gyakorlat csak egyszer szerepelhet az edzéstervben.'); return;
    }
    let exercises;
    try {
      exercises = encodePlan(items.map((row) => ({ ...row, warmupSets: Number(row.warmupSets), sets: Number(row.sets), reps: Number(row.reps) })));
    } catch (reason) { setError(reason.message); return; }
    setPending(true);
    try {
      await journal.save('plans', { name: name.trim(), exercises }, item?.id);
      done(item ? 'Az edzésterv módosításait mentettük.' : 'Az edzésterved elkészült.');
    } catch (reason) {
      setError(reason.message || 'A mentés nem sikerült. Ellenőrizd az internetkapcsolatot.');
      setPending(false);
    }
  }
  return <Modal title={item ? 'Edzésterv szerkesztése' : 'Új edzésterv'} close={() => !pending && close()}>
    <form onSubmit={submit} className="edit-form plan-editor">
      <label>Edzésterv neve<input autoFocus name="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Pl. Alsótest – A nap" required maxLength={80} disabled={pending} /></label>
      <div className="plan-editor-items">
        {items.map((row, index) => <fieldset key={row.id} className="plan-editor-row" disabled={pending}>
          <legend>{index + 1}. gyakorlat</legend>
          <label>Gyakorlat neve<input value={row.name} onChange={(event) => change(row.id, 'name', event.target.value)} list={listId} placeholder="Pl. Guggolás" required maxLength={100} /></label>
          <div className="plan-defaults">
            <label><span>Sorozatok</span><input type="number" min="1" max="20" step="1" inputMode="numeric" value={Number(row.sets) + Number(row.warmupSets)} onChange={(event) => change(row.id, 'totalSets', event.target.value)} required /></label>
            <label><span>Ismétléscél</span><input type="number" min="1" max="100" step="1" inputMode="numeric" value={row.reps} onChange={(event) => change(row.id, 'reps', event.target.value)} required /></label>
          </div>
          <div className="plan-row-actions"><button type="button" className="icon-button delete-button" aria-label={`${index + 1}. gyakorlat eltávolítása`} onClick={() => setItems((current) => current.filter((entry) => entry.id !== row.id))} disabled={items.length === 1 || pending}><Trash2 size={18} /></button></div>
        </fieldset>)}
      </div>
      <datalist id={listId}>{suggestions.map((exercise) => <option key={exercise} value={exercise} />)}</datalist>
      <button type="button" className="button button-secondary" onClick={() => setItems((current) => [...current, newPlanItem()])} disabled={pending || items.length >= MAX_PLAN_EXERCISES}><Plus size={18} />Gyakorlat hozzáadása ({items.length}/{MAX_PLAN_EXERCISES})</button>
      <p className="field-help">Az első sorozat mindig bemelegítő; a többi munkasorozat. Az ismétléscél a munkasorozatokra vonatkozik. Legfeljebb 20 sorozatot és tervenként 10 gyakorlatot adhatsz meg.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={close} disabled={pending}>Mégse</button><button type="submit" className="button button-primary" disabled={pending}>{pending ? 'Mentés…' : item ? 'Módosítások mentése' : 'Edzésterv mentése'}<Check size={18} /></button></div>
    </form>
  </Modal>;
}
