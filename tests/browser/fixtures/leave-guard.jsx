import React, { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, NavLink } from 'react-router-dom';
import SessionEditor from '../../../src/components/SessionEditor.jsx';

window.__fixtureSaves = [];
window.__saveMode = 'success';
const journal = {
  plans: [{ id: 'test-plan', name: 'Próbaedzés', exercises: JSON.stringify({ version: 1, items: [
    { id: 'bench', name: 'Fekvenyomás', sets: 4, reps: 10 },
  ] }) }],
  workouts: [{ id: 'old', exercise: 'Fekvenyomás', date: '2020-01-01', status: 'completed',
    setResults: [40, 60, 60, 60].map((weight) => ({ weight, reps: 10, completed: true })) }],
  saveSession: async (entries) => {
    if (window.__saveMode === 'fail') throw new Error('Próba mentési hiba');
    if (window.__saveMode === 'pending') await new Promise((resolve) => { window.__finishSave = resolve; });
    window.__fixtureSaves.push(entries);
  },
};
function Modal({ title, children, close }) {
  const ref = useRef(null);
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} aria-label={title} onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div><h2>{title}</h2><button aria-label="Ablak bezárása" onClick={close}>×</button>{children}</div>
  </dialog>;
}
function Fixture() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  return <><NavLink to="/masik">Másik oldal</NavLink><button onClick={() => setOpen(true)}>Új próbaedzés</button>
    <p role="status">{message}</p>
    {open && <SessionEditor journal={journal} initialDate="2022-01-01" initialPlanId="test-plan" Modal={Modal}
      close={() => setOpen(false)} done={(text) => { setMessage(text); setOpen(false); }} />}</>;
}
createRoot(document.getElementById('fixture-root')).render(<StrictMode><HashRouter><Fixture /></HashRouter></StrictMode>);
