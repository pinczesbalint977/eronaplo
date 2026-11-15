import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, RefreshCw, Scale, Utensils } from 'lucide-react';
import { dateLabel, number, today } from '../lib/workouts';
import { healthWeekSummary, validateBody, validateNutrition, weekDates, weekSunday } from '../lib/health';
import './health-journal.css';

const blankDay = { calories: '', protein: '', carbs: '', fat: '' };
const blankBody = { weight: '', waist: '', neck: '' };
const nutritionFields = [ ['calories', 'Kalória', 'kcal', 20000], ['protein', 'Fehérje', 'g', 2000], ['carbs', 'Szénhidrát', 'g', 2000], ['fat', 'Zsír', 'g', 2000] ];
const bodyFields = [ ['weight', 'Testsúly', 'kg', 20, 500], ['waist', 'Derékbőség', 'cm', 20, 300], ['neck', 'Nyakkörfogat', 'cm', 10, 100] ];
const same = (first, second) => Object.keys(second).every((key) => String(first?.[key] ?? '') === String(second[key]));
const formValues = (record, defaults) => Object.fromEntries(Object.keys(defaults).map((key) => [key, record?.[key] ?? '']));

function shiftWeek(sunday, weeks) {
  const date = new Date(sunday + 'T12:00:00');
  date.setDate(date.getDate() + weeks * 7);
  return weekSunday(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
}

export default function HealthJournal({ journal }) {
  const current = today();
  const [sunday, setSunday] = useState(() => weekSunday(current));
  const dates = weekDates(sunday);
  const [date, setDate] = useState(current);
  const [records, setRecords] = useState(null);
  const [dayForm, setDayForm] = useState(blankDay);
  const [bodyForm, setBodyForm] = useState(blankBody);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const request = useRef(0);
  const alive = useRef(true);
  const previousDay = records?.days.find((entry) => entry.date === date);
  const dirty = records && (!same(previousDay, dayForm) || !same(records.body, bodyForm));
  const summary = healthWeekSummary(records?.days || []);
  const busy = loading || Boolean(pending);
  const canMeasure = sunday <= current;
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current++; }; }, []);

  async function load(refresh = false) {
    const revision = ++request.current;
    setLoading(true); setError(''); setNotice('');
    try {
      const value = await journal.loadWeek(sunday, { refresh });
      if (!alive.current || revision !== request.current) return;
      setRecords(value);
      setBodyForm(formValues(value.body, blankBody));
    } catch (reason) {
      if (alive.current && revision === request.current && reason.name !== 'AbortError') setError(reason.message || 'A heti napló nem tölthető be.');
    } finally {
      if (alive.current && revision === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    setRecords(null);
    setDate(dates.includes(current) ? current : dates[0]);
    setDayForm(blankDay); setBodyForm(blankBody);
    void load();
    return () => { request.current++; };
  }, [sunday, journal.loadWeek]);
  useEffect(() => { setDayForm(formValues(previousDay, blankDay)); }, [date, previousDay]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function changeWeek(next) {
    if (busy || (dirty && !window.confirm('Elhagyod ezt a hetet? A nem mentett naplóértékek elvesznek.'))) return;
    setSunday(next);
  }
  function changeDate(next) {
    if (!same(previousDay, dayForm) && !window.confirm('Másik napot választasz? A napi, nem mentett értékek elvesznek.')) return;
    setDate(next); setError(''); setNotice('');
  }
  function selectWeek(value) {
    if (!value) return;
    try {
      const next = weekSunday(value);
      if (next < '2000-01-09' || next > weekSunday(current)) throw new Error('Invalid week');
      changeWeek(next);
    }
    catch { setError('Érvényes, 2000 utáni dátumot válassz.'); }
  }
  async function save(event, kind) {
    event.preventDefault();
    if (busy || !records) return;
    setError(''); setNotice('');
    try {
      const values = kind === 'day' ? validateNutrition({ date, ...dayForm }) : validateBody({ date: sunday, ...bodyForm });
      if (values.date > current) throw new Error('Jövőbeli napra még nem menthetsz adatot.');
      setPending(kind);
      if (kind === 'day') {
        const entry = await journal.saveDay(values, previousDay);
        if (!alive.current) return;
        setRecords((old) => ({ ...old, days: [...old.days.filter((day) => day.date !== date), entry].sort((a, b) => a.date.localeCompare(b.date)) }));
      } else {
        const body = await journal.saveBody(values, records.body);
        if (!alive.current) return;
        setRecords((old) => ({ ...old, body }));
        setBodyForm(formValues(body, blankBody));
      }
      setNotice(kind === 'day' ? 'A napi bevitel elmentve.' : 'A heti mérés elmentve.');
    } catch (reason) {
      if (alive.current && reason.name !== 'AbortError') setError(reason.message || 'A mentés nem sikerült. A beírt értékek megmaradtak.');
    } finally { if (alive.current) setPending(''); }
  }
  async function exportWeek() {
    if (busy || !records) return;
    setPending('pdf'); setError(''); setNotice('');
    try {
      const { generateHealthPdf } = await import('../lib/healthPdf');
      const blob = await generateHealthPdf({ sunday, days: records.days, body: records.body });
      if (!alive.current) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `eronaplo-heti-naplo-${sunday}.pdf`;
      document.body.append(link); link.click(); link.remove();
      // Safari may need time to consume the download; no personal data is cached.
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice('A heti PDF elkészült. A jelentés a mentett értékeket tartalmazza.');
    } catch (reason) { if (alive.current) setError(reason.message || 'A PDF létrehozása nem sikerült.'); }
    finally { if (alive.current) setPending(''); }
  }

  return <div className="health-journal">
    <div className="page-heading"><div><span className="eyebrow">A FEJLŐDÉSED NAPLÓJA</span><h1>Testsúly és étkezés<span className="accent">.</span></h1><p>A YAZIO-ban mért napi értékek és a vasárnapi testméretek, egy helyen.</p></div>
      <button className="button button-secondary" disabled={busy || !records || !summary.days && !records.body} onClick={exportWeek}><Download size={18} />{pending === 'pdf' ? 'PDF készítése…' : 'Heti PDF letöltése'}</button>
    </div>
    <div className="card health-week-picker"><button className="icon-button" aria-label="Előző hét" disabled={busy || sunday <= '2000-01-09'} onClick={() => changeWeek(shiftWeek(sunday, -1))}><ChevronLeft /></button>
      <label>Hét vasárnapja<input type="date" aria-label="Hét vasárnapja" value={sunday} min="2000-01-09" max={weekSunday(current)} disabled={busy} onChange={(event) => selectWeek(event.target.value)} /></label>
      <button className="icon-button" aria-label="Következő hét" disabled={busy || sunday >= weekSunday(current)} onClick={() => changeWeek(shiftWeek(sunday, 1))}><ChevronRight /></button>
      <span className="muted small">{dateLabel(dates[0])} – {dateLabel(sunday)}</span>
      <button className="text-button" disabled={busy} onClick={() => { if (!dirty || window.confirm('Újratöltöd a mentett adatokat? A nem mentett értékek elvesznek.')) void load(true); }}><RefreshCw size={15} />Adatok frissítése</button>
    </div>
    {loading && <p role="status" className="health-feedback">Heti napló betöltése…</p>}
    {error && <p className="form-error health-feedback" role="alert">{error}</p>}
    {notice && <p className="health-feedback" role="status">{notice}</p>}
    {!loading && records && <>
      <div className="health-grid">
        <section className="card health-panel" aria-label="Napi bevitel"><div className="health-panel-heading"><Utensils size={21} /><div><span className="small-label">YAZIO ALAPJÁN</span><h2>Napi bevitel</h2></div></div>
          <p className="muted small">Másold át a napi összesítést. Itt csak naplózunk, nincs kalória- vagy tápanyagszámítás.</p>
          <form className="edit-form" onSubmit={(event) => save(event, 'day')}>
            <label>Nap<select aria-label="Napi bevitel dátuma" value={date} disabled={Boolean(pending)} onChange={(event) => changeDate(event.target.value)}>{dates.map((day) => <option key={day} value={day} disabled={day > current}>{dateLabel(day, { weekday: 'long', month: 'short', day: 'numeric' })}</option>)}</select></label>
            <div className="health-input-grid">{nutritionFields.map(([key, label, unit, max]) => <label key={key}>{label} ({unit})<input type="number" inputMode="decimal" step="0.1" min="0" max={max} required disabled={Boolean(pending)} value={dayForm[key]} onChange={(event) => setDayForm((old) => ({ ...old, [key]: event.target.value }))} /></label>)}</div>
            <button type="submit" className="button button-primary" disabled={Boolean(pending) || date > current}>{pending === 'day' ? 'Mentés…' : 'Napi bevitel mentése'}</button>
          </form>
        </section>
        <section className="card health-panel" aria-label="Vasárnapi mérés"><div className="health-panel-heading"><Scale size={22} /><div><span className="small-label">HETENTE EGYSZER</span><h2>Vasárnapi mérés</h2></div></div>
          <p className="muted small">{dateLabel(sunday, { year: 'numeric', month: 'long', day: 'numeric' })}. A derék és a nyak mérőszalaggal mért körfogata, cm-ben.</p>
          <form className="edit-form" onSubmit={(event) => save(event, 'body')}>
            {bodyFields.map(([key, label, unit, min, max]) => <label key={key}>{label} ({unit})<input type="number" inputMode="decimal" step="0.1" min={min} max={max} required disabled={Boolean(pending) || !canMeasure} value={bodyForm[key]} onChange={(event) => setBodyForm((old) => ({ ...old, [key]: event.target.value }))} /></label>)}
            {!canMeasure && <p className="muted small">A heti mérést vasárnaptól tudod rögzíteni. Korábbi hetet bármikor kitölthetsz.</p>}
            <button type="submit" className="button button-primary" disabled={Boolean(pending) || !canMeasure}>{pending === 'body' ? 'Mentés…' : 'Heti mérés mentése'}</button>
          </form>
        </section>
      </div>
      <section className="card health-panel health-summary" aria-label="Heti összesítés"><div className="health-panel-heading"><div><span className="small-label">HÉTFŐTŐL VASÁRNAPIG</span><h2>Heti összesítés</h2></div><span className="muted small">{summary.days}/7 nap rögzítve</span></div>
        <div className="health-days">{dates.map((day, index) => {
          const entry = records.days.find((row) => row.date === day);
          return <article className={day === date ? 'health-day is-selected' : 'health-day'} key={day}><button className="text-button" disabled={Boolean(pending) || day > current} onClick={() => changeDate(day)} aria-label={`${day} napi bevitel`}>{['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'][index]}<span className="muted small">{dateLabel(day, { month: 'short', day: 'numeric' })}</span></button>
            {entry ? <dl>{nutritionFields.map(([key, label, unit]) => <div key={key}><dt>{label}</dt><dd>{number(entry[key])} {unit}</dd></div>)}</dl> : <p className="muted small">Nincs rögzítve</p>}</article>;
        })}</div>
        <p className="health-average">{summary.days ? <>Rögzített napok átlaga: <strong>{number(summary.average.calories)} kcal</strong> · fehérje {number(summary.average.protein)} g · szénhidrát {number(summary.average.carbs)} g · zsír {number(summary.average.fat)} g.</> : 'Még nincs napi bevitel ezen a héten.'}</p>
        <p className="muted small">A hiányzó napok nem számítanak nullának. A PDF kizárólag a mentett adatokat tartalmazza.{dirty && ' Van még nem mentett módosításod.'}</p>
      </section>
    </>}
  </div>;
}
