import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journalChanges } from '../src/lib/journalChanges.js';

const values = { exercise: 'Bench', date: '2026-11-08', notes: '', status: 'completed', setResults: Array.from({length:4},()=>({weight:60,reps:10,completed:true})) };
const previous = { ...values, setCount: 4 };
test('new four-set exercise needs four row writes and no speculative deletes',()=>{
  assert.deepEqual(journalChanges({kind:'workouts',values}).changed,[0,1,2,3]);
  assert.deepEqual(journalChanges({kind:'workouts',values}).deleted,[]);
});
test('unchanged saves have no writes',()=>assert.equal(journalChanges({kind:'workouts',values,previous,id:'a'}).unchanged,true));
test('one changed set only rewrites that set',()=>{
  const next={...values,setResults:values.setResults.map((row,i)=>i===2?{...row,weight:65}:row)};
  assert.deepEqual(journalChanges({kind:'workouts',values:next,previous,id:'a'}).changed,[2]);
});
test('removing a row or exercise deletes only known row documents',()=>{
  assert.deepEqual(journalChanges({kind:'workouts',values:{...values,setResults:values.setResults.slice(0,3)},previous,id:'a'}).deleted,[3]);
  assert.deepEqual(journalChanges({kind:'workouts',previous,id:'a',remove:true}).deleted,[0,1,2,3]);
});
test('legacy conversion writes rows even when the old numeric values match',()=>{
  assert.deepEqual(journalChanges({kind:'workouts',values,previous:{exercise:'Bench',weight:60,reps:10,sets:4},id:'a'}).changed,[0,1,2,3]);
});
test('incomplete prior hydration cannot suppress a write',()=>assert.deepEqual(journalChanges({kind:'workouts',values,previous:{...previous,metadata:{incomplete:true}},id:'a'}).changed,[0,1,2,3]));
test('unchanged plan is a no-op',()=>assert.equal(journalChanges({kind:'plans',values:{name:'A',exercises:'Squat'},previous:{name:'A',exercises:'Squat'},id:'p'}).unchanged,true));

test('unchanged typed rows and their target snapshot are a no-op', () => {
  const typed = { ...values, plannedWorkSets: 3, targetReps: 10,
    setResults: values.setResults.map((row, index) => ({ ...row, type: index ? 'work' : 'warmup' })) };
  assert.deepEqual(journalChanges({ kind: 'workouts', id: 'a', values: typed, previous: { ...typed, setCount: 4 } }),
    { changed: [], deleted: [], unchanged: true });
});

test('missing legacy row type and explicit work are equivalent without a migration', () => {
  const typed = { ...values, setResults: values.setResults.map((row) => ({ ...row, type: 'work' })) };
  assert.equal(journalChanges({ kind: 'workouts', id: 'a', values: typed, previous }).unchanged, true);
  assert.equal(journalChanges({ kind: 'workouts', id: 'a', values, previous: { ...typed, setCount: 4 } }).unchanged, true);
});

test('changing only a row role rewrites that one row', () => {
  const next = { ...values, setResults: values.setResults.map((row, index) => index === 1 ? { ...row, type: 'warmup' } : row) };
  assert.deepEqual(journalChanges({ kind: 'workouts', values: next, previous, id: 'a' }),
    { changed: [1], deleted: [], unchanged: false });
});

test('target changes affect the parent without rewriting rows; old payloads preserve targets', () => {
  const stored = { ...previous, plannedWorkSets: 4, targetReps: 10 };
  assert.equal(journalChanges({ kind: 'workouts', values, previous: stored, id: 'a' }).unchanged, true);
  assert.deepEqual(journalChanges({ kind: 'workouts', values: { ...values, plannedWorkSets: 3, targetReps: 10 }, previous: stored, id: 'a' }),
    { changed: [], deleted: [], unchanged: false });
  assert.equal(journalChanges({ kind: 'workouts', values: { ...values, plannedWorkSets: 4, targetReps: 10 }, previous, id: 'a' }).unchanged, false);
});

test('deleting a row keeps the planned target independent of performed row count', () => {
  const target = { plannedWorkSets: 4, targetReps: 10 };
  const next = { ...values, ...target, setResults: values.setResults.slice(0, 3) };
  assert.deepEqual(journalChanges({ kind: 'workouts', values: next, previous: { ...previous, ...target }, id: 'a' }),
    { changed: [], deleted: [3], unchanged: false });
});
