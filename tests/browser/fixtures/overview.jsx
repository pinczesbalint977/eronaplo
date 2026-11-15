import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import Overview from '../../../src/components/Overview.jsx';
import '../../../src/styles.css';

const mode = new URLSearchParams(location.search).get('mode');
const entry = (id, date, count) => ({ id, exercise: id, date, status: 'completed',
  setCount: count, setResults: Array.from({ length: count }, () => ({ weight: 60, reps: 10, completed: true })) });
const journal = {
  workouts: mode === 'empty' ? [] : [entry('first', '2026-09-15', 1), entry('last-week', '2026-11-08', 2),
    entry('monday', '2026-11-09', 4), entry('sunday', '2026-11-15', 3), entry('future', '2026-11-16', 10)],
  hasOlder: false,
  getFirstWorkoutDate: async () => mode === 'empty' ? null : '2026-09-15',
};
const healthJournal = { loadWeek: async () => {
  if (mode === 'error') throw new Error('Fixture unavailable');
  return mode === 'empty' ? { days: [], body: null } : { days: [
    { date: '2026-11-09', calories: 2000, protein: 100, carbs: 200, fat: 60 },
    { date: '2026-11-15', calories: 2200, protein: 150, carbs: 250, fat: 70 },
  ], body: { date: '2026-11-15', weight: 80, waist: 90, neck: 40 } };
} };
const Empty = ({ title, children, action }) => <div className="empty-state"><h3>{title}</h3><p>{children}</p>{action}</div>;
createRoot(document.getElementById('fixture-root')).render(<StrictMode><HashRouter>
  <main className="main-content"><Overview journal={journal} healthJournal={healthJournal} Empty={Empty} onAdd={() => {}} /></main>
</HashRouter></StrictMode>);
