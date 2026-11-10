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
