import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Activity, ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCircle2, Dumbbell, Flame, Plus } from 'lucide-react';
import { aggregate, completedSets, dateLabel, number, today } from '../lib/workouts';
import { groupSessions } from '../lib/sessions';
import { healthWeekSummary, weekDates, weekSunday } from '../lib/health';
import { trainingAge } from '../lib/trainingAge';
import Metric from './Metric';
import './overview.css';
const nutrients = [['calories', 'Kalória', 'kcal'], ['protein', 'Fehérje', 'g'], ['carbs', 'Szénhidrát', 'g'], ['fat', 'Zsír', 'g']];
const measurements = [['weight', 'Testsúly', 'kg'], ['waist', 'Derékbőség', 'cm'], ['neck', 'Nyakkörfogat', 'cm']];

export default function Overview({ journal, healthJournal, onAdd, Empty }) {
  const current = today();
  const sunday = weekSunday(current);
  const dates = weekDates(sunday);
  const weekEntries = journal.workouts.filter((entry) => entry.date >= dates[0] && entry.date <= current);
  const stats = aggregate(weekEntries);
  const sessions = groupSessions(weekEntries);
  const [firstDate, setFirstDate] = useState(undefined);
  const [startError, setStartError] = useState(false);
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(false);
  useEffect(() => {
    let active = true;
    journal.getFirstWorkoutDate().then((date) => { if (active) { setFirstDate(date); setStartError(false); } })
      .catch(() => { if (active) setStartError(true); });
    return () => { active = false; };
  }, [journal.workouts, journal.getFirstWorkoutDate]);
  useEffect(() => {
    let active = true;
    setHealth(null); setHealthError(false);
    healthJournal.loadWeek(sunday).then((value) => { if (active) setHealth(value); })
      .catch(() => { if (active) setHealthError(true); });
    return () => { active = false; };
  }, [sunday, healthJournal.loadWeek]);
  const age = trainingAge(firstDate, current);
  const startDetail = startError ? 'A kezdés most nem tölthető be.' : firstDate === undefined ? 'Kezdés ellenőrzése…' : firstDate ? `Kezdés: ${dateLabel(firstDate)}` : 'Az első edzés mentése után számoljuk.';
  const nutrition = healthWeekSummary(health?.days || []);
  const incompleteWeek = journal.hasOlder && journal.workouts.length > 0
    && journal.workouts.every((entry) => entry.date >= dates[0]);
  return <>
    <div className="page-heading"><div><span className="eyebrow">MINDEN EDZÉS SZÁMÍT</span><h1>A fejlődésed itt kezdődik<span className="accent">.</span></h1><p>A heted edzésben, étkezésben és testméretekben.</p></div><button className="button button-primary" onClick={onAdd}><Plus size={19} />Edzés rögzítése</button></div>
    <div className="section-kicker"><span>EZ A HÉT</span><span>{dateLabel(dates[0])} – {dateLabel(sunday)}</span></div>
    <div className="metrics-grid">
      <Metric icon={Flame} label="Ennyi ideje edzel" value={age ? number(age.weeks) : '—'} unit="hét" detail={startDetail} accent />
      <Metric icon={CalendarDays} label="Hónapokban" value={age ? number(age.months) : '—'} unit="hónap" detail="Az első naplózott edzés óta eltelt teljes hónapok." />
      <Metric icon={Activity} label="Heti sorozatok" value={number(stats.sets)} unit="sorozat" detail={`${stats.exercises} különböző gyakorlat ezen a héten`} />
    </div>
    <section className="card overview-health" aria-label="Heti étkezés és testméretek">
      <div className="card-heading"><div><span className="small-label">AZ AKTUÁLIS HÉT MENTETT ADATAI</span><h2>Étkezés és testméretek</h2></div><NavLink to="/taplalkozas" className="text-button">Napló megnyitása<ArrowRight size={16} /></NavLink></div>
      {healthError ? <p className="inline-empty" role="alert">A heti napló most nem tölthető be. Próbáld újra a Test és étrend menüben.</p> : !health ? <p className="inline-empty" role="status">Heti napló betöltése…</p> : <div className="overview-health-content">
        <p className="muted small">{nutrition.days}/7 nap rögzítve. A heti összegek és napi átlagok csak a kitöltött napokból készülnek.</p>
        <div className="overview-nutrients">{nutrients.map(([key, label, unit]) => <article className="overview-health-value" key={key}><h3>{label} összesen</h3><p>{nutrition.days ? number(nutrition.total[key]) : '—'} <span>{unit}</span></p><small>Napi átlag: {nutrition.days ? number(nutrition.average[key]) : '—'} {unit}</small></article>)}</div>
        <p className="small-label overview-measurement-date">VASÁRNAPI MÉRÉS · {dateLabel(sunday)}</p>
        <div className="overview-measurements">{measurements.map(([key, label, unit]) => <article className="overview-health-value" key={key}><h3>{label}</h3><p>{health.body ? number(health.body[key]) : '—'} <span>{unit}</span></p></article>)}</div>
        {!health.body && <p className="muted small">Erre a hétre még nincs vasárnapi mérés.</p>}
      </div>}
    </section>
    {incompleteWeek && <div className="history-budget"><p>A teljes heti összesítéshez töltsd be a hét korábbi edzéseit is.</p><button className="button button-secondary" disabled={journal.loadingOlder} onClick={journal.loadOlder}>{journal.loadingOlder ? 'Betöltés…' : 'Hét korábbi edzéseinek betöltése'}</button></div>}
    <div className="overview-grid"><section className="card recent-card"><div className="card-heading"><div><span className="small-label">HÉTFŐTŐL VASÁRNAPIG</span><h2>Heti edzéseid</h2></div><NavLink to="/naplo" className="text-button">Teljes napló<ArrowRight size={16} /></NavLink></div>
      {sessions.length ? <div className="recent-rows">{sessions.map((session) => <NavLink to={'/naplo?nap=' + session.date} className="recent-row" key={session.id + session.date}><span className="date-box"><strong>{dateLabel(session.date, { day: 'numeric' }).replace('.', '')}</strong><small>{dateLabel(session.date, { month: 'short' })}</small></span><div><h3>{session.planName}</h3><p>{session.entries.length} gyakorlat · {session.entries.reduce((sum, entry) => sum + completedSets(entry).length, 0)} sorozat</p></div><span className="completed"><CheckCircle2 size={15} />Rögzítve</span></NavLink>)}</div>
        : <Empty title="Új hét. Új lehetőségek." action={<button className="button button-secondary" onClick={onAdd}><Plus size={17} />Edzés hozzáadása</button>}>Az ezen a héten elmentett edzéseid itt jelennek meg.</Empty>}
    </section><div className="overview-aside"><section className="card week-card"><div className="card-heading"><h2>Ez a heted</h2><Flame size={18} className="accent" /></div><div className="week-days">{dates.map((date, index) => {
      const done = weekEntries.some((entry) => entry.date === date && completedSets(entry).length);
      return <div key={date} className={`week-day ${date === current ? 'is-today' : ''} ${done ? 'is-done' : ''}`}><span>{['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'][index]}</span><span className="day-circle">{done ? <Check size={17} /> : Number(date.slice(-2))}</span></div>;
    })}</div><p className="muted small">Pipával jelöljük a hét rögzített edzéseit.</p></section><section className="motivation-card"><span className="small-label">EMLÉKEZTESD MAGAD</span><ArrowUpRight className="motivation-arrow" size={26} /><h2>Nem kell tökéletesnek lennie.<br /><span>Csak kezdd el.</span></h2><p>A következetesség a legerősebb gyakorlatod.</p></section></div></div>
  </>;
}
