import { useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, BarChart3, CalendarDays, Check, CheckCircle2, ChevronRight, Dumbbell, Eye, EyeOff, Flame, LayoutDashboard, LockKeyhole, LogOut, Pencil, Plus, Settings2, ShieldCheck, Trash2, TrendingUp, WifiOff, X } from 'lucide-react';
import { useAuth } from './auth/AuthContext';
import { firebaseConfigured, setupError } from './lib/firebase';
import { useJournal } from './hooks/useJournal';
import { aggregate, completedSets, maxWeight, dateLabel, number, today, volume } from './lib/workouts';
import PwaControls from './components/PwaControls';
import SessionEditor from './components/SessionEditor';
import PlanEditor from './components/PlanEditor';
import SessionJournal, { SessionCard } from './components/SessionJournal';
import { groupSessions, parsePlan } from './lib/sessions';
import HistoryBudget from './components/HistoryBudget';

const NAV = [
  { to: '/', label: 'Áttekintés', icon: LayoutDashboard },
  { to: '/naplo', label: 'Edzésnapló', icon: Dumbbell },
  { to: '/tervek', label: 'Edzéstervek', icon: CalendarDays },
  { to: '/statisztika', label: 'Fejlődés', icon: BarChart3 },
];
function Brand({ small = false }) { return <div className={`brand ${small ? 'brand-small' : ''}`}><span className="brand-mark"><Dumbbell size={23} strokeWidth={2.5} /></span><span>ERŐ<span className="brand-light">NAPLÓ</span><span className="brand-dot">.</span></span></div>; }
function Spinner({ label = 'Betöltés…' }) { return <div className="loading-screen" role="status"><Brand /><span className="spinner" /><p>{label}</p></div>; }

function Login() {
  const { login, error } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState('');
  async function submit(event) {
    event.preventDefault(); setPending(true); setFormError('');
    const values = new FormData(event.currentTarget);
    try { await login(String(values.get('email')).trim(), String(values.get('password'))); }
    catch { setFormError('A bejelentkezés nem sikerült. Ellenőrizd az email-címet, a jelszót és az internetkapcsolatot.'); }
    finally { setPending(false); }
  }
  return <main className="login-page">
    <section className="login-story"><Brand /><div className="login-story-content"><span className="eyebrow"><span className="live-dot" /> A TE TEMPÓD. A TE FEJLŐDÉSED.</span><h1>Minden ismétlés<br />egy lépéssel <span>előrébb.</span></h1><p>A fejlődésed története, egy helyen. Tervezd meg az edzéseidet, rögzítsd a munkát, és lásd, mennyit erősödtél.</p><div className="login-art" aria-hidden="true"><div className="art-grid" /><div className="art-ring ring-one" /><div className="art-ring ring-two" /><Dumbbell className="art-dumbbell" strokeWidth={1.1} /><span className="art-caption">KÖVETKEZETESSÉG <span>→</span> FEJLŐDÉS</span></div></div><div className="login-foot"><ShieldCheck size={16} /><span>Személyes tér. Csak nektek.</span></div></section>
    <section className="login-panel"><div className="mobile-brand"><Brand /></div><div className="login-card"><span className="small-label">ÜDV ÚJRA AZ ERŐNAPLÓBAN</span><h2>Készen állsz a következőre?</h2><p className="muted">Jelentkezz be, és folytasd a saját utad.</p><form onSubmit={submit} className="login-form"><label>Email-cím<input name="email" type="email" placeholder="te@pelda.hu" autoComplete="username" required maxLength={254} disabled={pending || !firebaseConfigured} /></label><label>Jelszó<span className="password-input"><input name="password" type={showPassword ? 'text' : 'password'} placeholder="Add meg a jelszavad" autoComplete="current-password" required disabled={pending || !firebaseConfigured} /><button className="icon-button" type="button" aria-label={showPassword ? 'Jelszó elrejtése' : 'Jelszó megjelenítése'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></span></label>{(error || formError) && <p role="alert" className="form-error">{error || formError}</p>}{!firebaseConfigured && <div className="setup-notice" role="status"><Settings2 size={20} /><div><strong>A Firebase-kapcsolat beállításra vár</strong><p>{setupError || 'A beállítás lépéseit a projekt README.md útmutatójában találod.'}</p></div></div>}<button className="button button-primary login-submit" type="submit" disabled={pending || !firebaseConfigured}>{pending ? 'Bejelentkezés…' : 'Bejelentkezés'}<ArrowRight size={18} /></button></form><div className="login-security"><LockKeyhole size={17} /><span>Privát edzésnapló. Kizárólag az előre engedélyezett fiókokkal használható.</span></div><div className="login-device"><ArrowDownToLine size={19} /><div><strong>Mindig kéznél, a telefonodon is.</strong><p>Telepítsd a főképernyőre a böngésződ menüjéből.</p></div></div></div><p className="panel-foot">Kis lépések. Erős szokások.</p></section>
  </main>;
}

function Metric({ icon: Icon, label, value, unit, detail, accent }) { return <article className={`metric-card ${accent ? 'metric-accent' : ''}`}><div className="metric-top"><span>{label}</span><Icon size={19} /></div><p className="metric-value">{value}<span>{unit}</span></p><p className="metric-detail">{detail}</p></article>; }
function Empty({ icon: Icon = Dumbbell, title, children, action }) { return <div className="empty-state"><span className="empty-icon"><Icon size={28} /></span><h3>{title}</h3><p>{children}</p>{action}</div>; }


function Overview({ journal, onAdd }) {
  const current = today();
  const currentMonth = current.slice(0, 7);
  const monthEntries = journal.workouts.filter((e) => e.date.startsWith(currentMonth));
  const stats = aggregate(monthEntries);
  const sessions = groupSessions(journal.workouts);
  const todaysSessions = sessions.filter((session) => session.date === current);
  const weekdays = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];
  const weekStart = new Date(`${current}T12:00:00`); weekStart.setDate(weekStart.getDate() - (weekStart.getDay() + 6) % 7);
  return <><div className="page-heading"><div><span className="eyebrow">MINDEN EDZÉS SZÁMÍT</span><h1>A fejlődésed itt kezdődik<span className="accent">.</span></h1><p>Tedd bele a munkát. Mi segítünk követni.</p></div><button className="button button-primary" onClick={onAdd}><Plus size={19} />Edzés rögzítése</button></div>
    <div className="section-kicker"><span>EZ A HÓNAP</span><span>{dateLabel(current, { year: 'numeric', month: 'long' })}</span></div><div className="metrics-grid"><Metric icon={Flame} label="Edzésnapok" value={stats.days} unit="nap" detail="Minden alkalom egy újabb lépés." accent /><Metric icon={Dumbbell} label="Összterhelés" value={number(stats.volume)} unit="kg" detail="Súly × ismétlés × sorozat" /><Metric icon={Activity} label="Elvégzett sorozatok" value={stats.sets} unit="sorozat" detail={`${stats.exercises} különböző gyakorlat`} /></div>
    <div className="overview-grid"><section className="card today-card"><div className="card-heading"><div><span className="small-label">ITT ÉS MOST</span><h2>A mai edzésed</h2></div><span className="date-chip"><CalendarDays size={15} />{dateLabel(current)}</span></div>{todaysSessions.length ? <div className="overview-sessions">{todaysSessions.map((session) => <SessionCard key={session.id} session={session} />)}<button className="text-button" onClick={onAdd}><Plus size={16} />Új edzés hozzáadása</button></div> : <Empty title="Tiszta lap. Új lehetőségek." action={<button className="button button-secondary" onClick={onAdd}><Plus size={17} />Edzés hozzáadása</button>}>Válaszd ki az edzéstervedet, és rögzítsd a mai eredményeidet.</Empty>}</section><div className="overview-aside"><section className="card week-card"><div className="card-heading"><h2>Ez a heted</h2><Flame size={18} className="accent" /></div><div className="week-days">{weekdays.map((day, index) => { const d = new Date(weekStart); d.setDate(d.getDate() + index); const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; const done = journal.workouts.some((e) => e.date === key && completedSets(e).length); return <div key={day} className={`week-day ${key === current ? 'is-today' : ''} ${done ? 'is-done' : ''}`}><span>{day}</span><span className="day-circle">{done ? <Check size={17} /> : d.getDate()}</span></div>; })}</div><p className="muted small">{new Set(journal.workouts.filter((e) => e.date >= weekStart.toLocaleDateString('sv-SE') && e.date <= current && completedSets(e).length).map((e) => e.date)).size} edzésnap ezen a héten. Csak így tovább!</p></section><section className="motivation-card"><span className="small-label">EMLÉKEZTESD MAGAD</span><ArrowUpRight className="motivation-arrow" size={26} /><h2>Nem kell tökéletesnek lennie.<br /><span>Csak kezdd el.</span></h2><p>A következetesség a legerősebb gyakorlatod.</p></section></div></div>
    <section className="card recent-card"><div className="card-heading"><div><span className="small-label">LÉPÉSRŐL LÉPÉSRE</span><h2>Legutóbbi aktivitás</h2></div><NavLink to="/naplo" className="text-button">Teljes napló<ArrowRight size={16} /></NavLink></div>{sessions.length ? <div className="recent-rows">{sessions.slice(0, 4).map((session) => <NavLink to={"/naplo?nap=" + session.date} className="recent-row" key={session.id + session.date}><span className="date-box"><strong>{dateLabel(session.date, { day: 'numeric' }).replace('.', '')}</strong><small>{dateLabel(session.date, { month: 'short' })}</small></span><div><h3>{session.planName}</h3><p>{session.entries.length} gyakorlat · {number(session.entries.reduce((sum, entry) => sum + volume(entry), 0))} kg összterhelés</p></div><span className="completed"><CheckCircle2 size={15} />Rögzítve</span></NavLink>)}</div> : <p className="inline-empty">Az elmentett edzéseid itt és a naptárban jelennek meg.</p>}</section>
  </>;
}



function Plans({ journal, onAdd, onEdit, onDelete, onStart }) {
  return <><div className="page-heading"><div><span className="eyebrow">A SAJÁT RUTINOD</span><h1>Edzésterveid<span className="accent">.</span></h1><p>Állítsd össze egyszer a gyakorlatokat, majd válaszd ki a tervet edzéskor.</p></div><button className="button button-primary" onClick={onAdd}><Plus size={19} />Új edzésterv</button></div>{journal.plans.length ? <div className="plans-grid">{journal.plans.map((plan, i) => <article key={plan.id} className="card plan-card"><div className="plan-top"><span className="plan-number">{String(i + 1).padStart(2, '0')}</span><div className="entry-actions"><button type="button" className="icon-button" aria-label={plan.name + ' terv szerkesztése'} onClick={() => onEdit(plan)}><Pencil size={18} /></button><button type="button" className="icon-button" aria-label={plan.name + ' terv törlése'} onClick={() => onDelete(plan)}><Trash2 size={18} /></button></div></div><h2>{plan.name}</h2><ol className="plan-exercise-list">{parsePlan(plan.exercises).map((exercise) => <li key={exercise.id}><span>{exercise.name}</span><small>{exercise.sets} × {exercise.reps}</small></li>)}</ol><button type="button" className="button button-primary" onClick={() => onStart(plan.id)}><Plus size={16} />Edzés indítása</button><span className="private-label"><LockKeyhole size={13} />Saját edzésterv</span></article>)}</div> : <section className="card"><Empty icon={CalendarDays} title="Először készíts egy edzéstervet" action={<button className="button button-primary" onClick={onAdd}><Plus size={17} />Első edzésterv létrehozása</button>}>Például: Mell nap. Add hozzá a gyakorlatokat és a tervezett sorozatokat. Később bármikor módosíthatod.</Empty></section>}</>;
}

function Progress({ journal }) {
  const stats = aggregate(journal.workouts);
  const names = [...new Set(journal.workouts.filter((e) => completedSets(e).length).map((e) => e.exercise))].sort((a,b) => a.localeCompare(b,'hu'));
  const [selected, setSelected] = useState('');
  const exercise = selected || names[0] || '';
  const entries = journal.workouts.filter((e) => e.exercise === exercise && completedSets(e).length);
  const grouped = [...new Set(entries.map((e) => e.date))].sort().slice(-8).map((date) => ({ date, weight: Math.max(...entries.filter((e) => e.date === date).map(maxWeight)) }));
  const chartMaxWeight = Math.max(1, ...grouped.map((e) => e.weight));
  const records = names.map((name) => ({ name, weight: Math.max(...journal.workouts.filter((e) => e.exercise === name).map(maxWeight)) }));
  return <><div className="page-heading"><div><span className="eyebrow">A MUNKA LÁTHATÓVÁ VÁLIK</span><h1>A fejlődésed<span className="accent">.</span></h1><p>Hasonlítsd magad ahhoz, aki tegnap voltál.</p></div><span className="period-chip">{journal.hasOlder ? 'Betöltött edzések' : 'Összes edzés'}</span></div><div className="metrics-grid"><Metric icon={Flame} label="Összes edzésnap" value={stats.days} unit="nap" detail="Az első edzésedtől a mai napig" accent /><Metric icon={TrendingUp} label="Megmozgatott súly" value={number(stats.volume)} unit="kg" detail="Az összes rögzített gyakorlatból" /><Metric icon={Activity} label="Összes sorozat" value={stats.sets} unit="sorozat" detail={`${stats.exercises} különböző gyakorlat`} /></div><section className="card chart-card"><div className="card-heading"><div><span className="small-label">EGYRE ERŐSEBBEN</span><h2>Használt súly alakulása</h2></div>{names.length > 0 && <label><span className="sr-only">Gyakorlat kiválasztása</span><select value={exercise} onChange={(e) => setSelected(e.target.value)}>{names.map((name) => <option key={name}>{name}</option>)}</select></label>}</div>{grouped.length ? <><div className="bar-chart" role="img" aria-label={`${exercise}: ${grouped.map((e) => `${dateLabel(e.date)} ${e.weight} kg`).join(', ')}`}>{grouped.map((entry) => <div className="bar-column" key={entry.date}><span className="bar-value">{number(entry.weight)} <small>kg</small></span><div className="bar-track"><div className="bar" style={{ height: `${Math.max(3, entry.weight / chartMaxWeight * 100)}%` }} /></div><span className="bar-label">{dateLabel(entry.date, { month: 'numeric', day: 'numeric' })}</span></div>)}</div><p className="small muted chart-note">Az utolsó 8 edzésnap legnagyobb rögzített súlya. A testsúlyos gyakorlatoknál a pluszsúlyt követjük.</p></> : <Empty icon={BarChart3} title="Minden fejlődés egy első edzéssel kezdődik">A grafikon az első rögzített gyakorlatod után jelenik meg.</Empty>}</section>{records.length > 0 && <section className="card records-card"><div className="card-heading"><h2>Egyéni legjobbak</h2><TrendingUp size={19} className="accent" /></div>{records.map((r) => <div className="record-row" key={r.name}><span>{r.name}</span><strong>{number(r.weight)} <small>kg</small></strong></div>)}</section>}</>;
}

function Modal({ title, children, close, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} className={wide ? "modal modal-wide" : "modal"} onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => { if (e.target === e.currentTarget) close(); }}><div className="modal-content"><div className="modal-heading"><div><span className="small-label">A KÖVETKEZŐ LÉPÉSED</span><h2>{title}</h2></div><button className="icon-button" onClick={close} type="button" aria-label="Ablak bezárása"><X size={22} /></button></div>{children}</div></dialog>;
}



function DeleteConfirmation({ target, journal, close, done }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function remove() { setPending(true); try { if (target.kind === 'session') await journal.removeSession(target.item.entries); else await journal.remove(target.kind, target.item.id); done('A bejegyzést töröltük.'); } catch (err) { setError(err.message || 'A törlés nem sikerült. Ellenőrizd az internetkapcsolatot.'); setPending(false); } }
  return <Modal title="Bejegyzés törlése" close={() => !pending && close()}><p className="delete-description">Biztosan törlöd ezt a bejegyzést: <strong>{target.item.planName || target.item.exercise || target.item.name}</strong>? A törlés végleges.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button button-secondary" onClick={close} disabled={pending}>Mégse</button><button className="button button-danger" onClick={remove} disabled={pending}>{pending ? 'Törlés…' : 'Végleges törlés'}<Trash2 size={17} /></button></div></Modal>;
}

function PrivateApp({ user }) {
  const { logout } = useAuth();
  const journal = useJournal(user.uid);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const location = useLocation();
  const toastTimer = useRef(null);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  function done(message) { setModal(null); setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 4500); }
  async function signOut() { setLogoutPending(true); try { await logout(); } catch { setLogoutError('A kijelentkezés nem sikerült. Próbáld újra.'); setLogoutPending(false); } }
  return <div className="app-shell"><aside className="sidebar"><NavLink to="/" className="brand-link" aria-label="Erőnapló kezdőlap"><Brand small /></NavLink><span className="nav-caption">A SAJÁT TERED</span><nav aria-label="Fő navigáció">{NAV.map(({ to, label, icon: Icon }) => <NavLink end={to === '/'} key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={20} /><span>{label}</span><ChevronRight className="nav-chevron" size={15} /></NavLink>)}</nav><div className="sidebar-bottom"><div className="privacy-card"><ShieldCheck size={21} /><strong>Csak a te adataid.</strong><p>A saját naplódhoz kizárólag a te fiókod fér hozzá.</p></div><button className="logout-button" onClick={signOut} disabled={logoutPending}><LogOut size={18} />Kijelentkezés</button></div></aside><div className="main-wrap"><header className="topbar"><span className="desktop-breadcrumb">Saját edzésnaplóm <ChevronRight size={14} /><strong>{NAV.find((item) => item.to === location.pathname)?.label || 'Áttekintés'}</strong></span><span className="mobile-brand"><Brand small /></span><div className="topbar-user"><span className="private-status"><span className="live-dot" />Privát fiók</span><span className="avatar" title={user.email || 'Saját fiók'}>{user.email?.[0]?.toUpperCase() || 'É'}</span><button className="mobile-logout icon-button" onClick={signOut} aria-label="Kijelentkezés" disabled={logoutPending}><LogOut size={19} /></button></div></header><main className="main-content"><HistoryBudget journal={journal} />{logoutError && <p className="form-error" role="alert">{logoutError}</p>}{journal.error ? <div className="card"><Empty icon={WifiOff} title="Az adatok most nem érhetők el" action={<button className="button button-secondary" onClick={() => window.location.reload()}>Újrapróbálás</button>}>{journal.error}</Empty></div> : journal.loading ? <Spinner label="A saját naplód betöltése…" /> : <Routes><Route path="/" element={<Overview journal={journal} onAdd={() => setModal({ kind: 'workout' })} />} /><Route path="/naplo" element={<SessionJournal journal={journal} onAdd={(date) => setModal({ kind: 'workout', date })} onEdit={(item) => setModal({ kind: 'workout', item })} onDelete={(item) => setModal({ kind: 'delete', target: { kind: 'session', item } })} />} /><Route path="/tervek" element={<Plans journal={journal} onStart={(planId) => setModal({ kind: 'workout', planId })} onAdd={() => setModal({ kind: 'plan' })} onEdit={(item) => setModal({ kind: 'plan', item })} onDelete={(item) => setModal({ kind: 'delete', target: { kind: 'plans', item } })} />} /><Route path="/statisztika" element={<Progress journal={journal} />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>}<footer className="app-footer"><span>ERŐNAPLÓ <span className="accent">·</span> Lépésről lépésre, erősebben.</span><span><LockKeyhole size={12} />A saját fejlődésed. Privátban.</span></footer></main></div><nav className="bottom-nav" aria-label="Mobil navigáció">{NAV.map(({ to, label, icon: Icon }) => <NavLink end={to === '/'} to={to} key={to} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={21} /><span>{label}</span></NavLink>)}</nav>{modal?.kind === 'workout' && <SessionEditor journal={journal} item={modal.item} initialDate={modal.date} initialPlanId={modal.planId} Modal={Modal} close={() => setModal(null)} done={done} />}{modal?.kind === 'plan' && <PlanEditor journal={journal} item={modal.item} Modal={Modal} close={() => setModal(null)} done={done} />}{modal?.kind === 'delete' && <DeleteConfirmation target={modal.target} journal={journal} close={() => setModal(null)} done={done} />}{toast && <div role="status" className="toast"><CheckCircle2 size={19} />{toast}<button className="icon-button" aria-label="Értesítés bezárása" onClick={() => setToast('')}><X size={15} /></button></div>}</div>;
}

export default function App() {
  const { user, loading } = useAuth();
  return <>{loading ? <Spinner label="Biztonságos kapcsolat ellenőrzése…" /> : user ? <PrivateApp user={user} key={user.uid} /> : <Login />}<PwaControls /></>;
}
