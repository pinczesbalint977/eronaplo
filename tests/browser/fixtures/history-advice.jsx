import React from 'react';
import { createRoot } from 'react-dom/client';
import SessionEditor from '../../../src/components/SessionEditor.jsx';

const fastExercise = 'Fixture gyors gyakorlat';
const slowExercise = 'Fixture lassú gyakorlat';
const previous = (exercise, id) => ({
  id, exercise, date: '2021-02-03', status: 'completed', setCount: 4,
  plannedWorkSets: 3, targetReps: 10,
  setResults: [80, 140, 140, 140].map((weight, index) => ({
    weight, reps: 10, completed: true, type: index === 0 ? 'warmup' : 'work',
  })),
});
const fastPrevious = previous(fastExercise, 'fixture-fast-history');
const slowPrevious = previous(slowExercise, 'fixture-slow-history');
let rejectSlowHistory;
const slowHistory = new Promise((resolve, reject) => { rejectSlowHistory = reject; });
window.__rejectSlowHistory = () => rejectSlowHistory(new Error('Fixture history request failed'));
window.__historyFixtureWrites = [];

const journal = {
  plans: [{
    id: 'fixture-plan', name: 'Fixture terv',
    exercises: JSON.stringify({ version: 1, items: [
      { id: 'fixture-fast', name: fastExercise, sets: 4, reps: 10 },
      { id: 'fixture-slow', name: slowExercise, sets: 4, reps: 10 },
    ] }),
  }],
  workouts: [fastPrevious, slowPrevious],
  hasOlder: true,
  lookupPrevious: (exercise) => exercise === fastExercise ? Promise.resolve(fastPrevious) : slowHistory,
  saveSession: async (entries) => { window.__historyFixtureWrites.push(entries); return []; },
};

function Modal({ title, children }) {
  return <div role="dialog" aria-label={title}>{children}</div>;
}

createRoot(document.getElementById('fixture-root')).render(
  <SessionEditor journal={journal} initialDate="2022-02-04" initialPlanId="fixture-plan"
    close={() => {}} done={() => {}} Modal={Modal} />,
);
