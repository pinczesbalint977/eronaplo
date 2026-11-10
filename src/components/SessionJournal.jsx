import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Dumbbell, Pencil, Plus, Trash2 } from 'lucide-react';
import { groupSessions, MAX_PLAN_EXERCISES, workoutNote } from '../lib/sessions';
import { dateLabel, today, workoutSummary } from '../lib/workouts';
import './session-pages.css';

const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const fullDate = (date) => dateLabel(date, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

export function SessionCard({ session, onEdit, onDelete }) {
  const incomplete = session.incomplete || session.entries.some((entry) => entry.metadata?.incomplete);
  const tooMany = session.entries.length > MAX_PLAN_EXERCISES;
  return <article className="card session-card">
    <div className="card-heading session-heading"><div><span className="small-label">{dateLabel(session.date, { year: 'numeric', month: 'long', day: 'numeric' })}</span><h2>{session.planName}</h2><p className="small muted">{session.entries.length} gyakorlat{session.entries.some((entry) => entry.status === 'draft') ? ' · Folyamatban' : ''}</p></div>
      {(onEdit || onDelete) && <div className="entry-actions">
        {onEdit && <button type="button" className="icon-button" disabled={incomplete || tooMany} onClick={() => onEdit(session)} aria-label={`${session.planName} edzés szerkesztése`}><Pencil size={18} /></button>}
        {onDelete && <button type="button" className="icon-button delete-button" disabled={incomplete} onClick={() => onDelete(session)} aria-label={`${session.planName} teljes edzés törlése`}><Trash2 size={18} /></button>}
      </div>}
    </div>
    {incomplete && <p className="session-notice" role="status">Az edzés még hiányosan van betöltve. Töltsd be a régebbi edzéseket a szerkesztéshez vagy törléshez.</p>}
    {!incomplete && tooMany && onEdit && <p className="session-notice">Ez a korábbi edzés több mint 10 gyakorlatot tartalmaz, ezért itt nem szerkeszthető.</p>}
    <div className="entry-list">{session.entries.map((entry) => <div className="entry" key={entry.id}>
      <span className="exercise-icon"><Dumbbell size={19} /></span><div className="entry-info"><h3>{entry.exercise}</h3><p>{workoutSummary(entry)}{entry.status === 'draft' && ' · Folyamatban'}</p>{workoutNote(entry) && <p className="entry-note">{workoutNote(entry)}</p>}</div>
    </div>)}</div>
  </article>;
}

export default function SessionJournal({ journal, onAdd, onEdit, onDelete }) {
  const current = today();
  const [params] = useSearchParams();
  const requested = params.get('nap');
  const initial = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(requested || '')
    && requested >= '1900-01-01' ? requested : current;
  const [selected, setSelected] = useState(initial);
  const [month, setMonth] = useState(initial.slice(0, 7));
  const sessions = useMemo(() => groupSessions(journal.workouts), [journal.workouts]);
  const sessionDates = useMemo(() => new Set(sessions.map((session) => session.date)), [sessions]);
  const selectedSessions = sessions.filter((session) => session.date === selected);
  const start = new Date(`${month}-01T12:00:00`);
  const offset = (start.getDay() + 6) % 7;
  const days = new Date(start.getFullYear(), start.getMonth() + 1, 0, 12).getDate();
  const cells = Array.from({ length: Math.ceil((days + offset) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= days ? `${month}-${String(day).padStart(2, '0')}` : null;
  });
  function changeMonth(direction) {
    const next = new Date(start.getFullYear(), start.getMonth() + direction, 1, 12);
    if (next.getFullYear() < 1900 || next.getFullYear() > 9999) return;
    const day = Math.min(Number(selected.slice(-2)), new Date(next.getFullYear(), next.getMonth() + 1, 0, 12).getDate());
    const key = dateKey(next).slice(0, 7);
    setMonth(key); setSelected(`${key}-${String(day).padStart(2, '0')}`);
  }
  return <>
    <div className="page-heading"><div><span className="eyebrow">MINDEN EDZÉS TÖRTÉNETE</span><h1>Edzésnapló<span className="accent">.</span></h1><p>Válassz napot, és nézd meg a teljes edzéseidet.</p></div><button type="button" className="button button-primary" disabled={selected > current} onClick={() => onAdd(selected)}><Plus size={19} />Edzés rögzítése</button></div>
    <div className="session-journal-layout">
      <section className="card session-calendar" aria-label="Edzésnaptár">
        <div className="calendar-heading"><h2 aria-live="polite">{dateLabel(`${month}-01`, { year: 'numeric', month: 'long' })}</h2><div><button type="button" className="icon-button" aria-label="Előző hónap" disabled={month === '1900-01'} onClick={() => changeMonth(-1)}><ChevronLeft size={20} /></button><button type="button" className="icon-button" aria-label="Következő hónap" disabled={month === '9999-12'} onClick={() => changeMonth(1)}><ChevronRight size={20} /></button></div></div>
        <label className="calendar-month"><span>Ugrás egy hónapra</span><input type="month" aria-label="Naptár hónapja" value={month} min="1900-01" max="9999-12" onChange={(event) => {
          const value = event.target.value;
          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || value < '1900-01') return;
          setMonth(value); setSelected(`${value}-01`);
        }} /></label>
        <div className="calendar-grid">{['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'].map((weekday) => <span key={weekday} className="calendar-weekday" aria-hidden="true">{weekday}</span>)}{cells.map((key, index) => key ? <button type="button" key={key} className={`calendar-day ${key === selected ? 'is-selected' : ''} ${key === current ? 'is-current' : ''} ${sessionDates.has(key) ? 'has-session' : ''}`} aria-label={key} title={fullDate(key)} aria-pressed={selected === key} aria-current={key === current ? 'date' : undefined} onClick={() => setSelected(key)}><span>{Number(key.slice(-2))}</span>{sessionDates.has(key) && <span className="calendar-marker" aria-hidden="true" />}</button> : <span key={`empty-${index}`} aria-hidden="true" />)}</div>
        <div className="calendar-footer"><span><i aria-hidden="true" />Rögzített edzés</span><button type="button" className="text-button" onClick={() => { setMonth(current.slice(0, 7)); setSelected(current); }}>Mai nap</button></div>
      </section>
      <section className="selected-sessions" aria-label="A kiválasztott nap edzései"><div className="selected-day-heading"><CalendarDays size={19} /><h2>{fullDate(selected)}</h2></div>{selectedSessions.length ? selectedSessions.map((session) => <SessionCard key={`${session.id}-${session.date}`} session={session} onEdit={onEdit} onDelete={onDelete} />) : <div className="card empty-state"><span className="empty-icon"><CalendarDays size={27} /></span><h3>{selected > current ? 'Ezt a napot még várjuk' : 'Erre a napra nincs betöltött edzés'}</h3><p>{selected > current ? 'Edzést a mai napra vagy egy korábbi napra rögzíthetsz.' : journal.hasOlder ? 'A korábbi edzéseket a lap tetején töltheted be.' : 'Válassz másik napot, vagy rögzíts egy edzést erre a napra.'}</p>{selected <= current && <button type="button" className="button button-secondary" onClick={() => onAdd(selected)}><Plus size={17} />Edzés rögzítése</button>}</div>}</section>
    </div>
  </>;
}
