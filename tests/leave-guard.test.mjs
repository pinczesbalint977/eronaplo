import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkoutLeaveGuard } from '../src/lib/leaveGuard.js';

function fakeBrowser() {
  const listeners = new Map();
  const entries = [
    { state: { idx: 6, key: 'plans' }, url: 'https://example.test/eronaplo/#/tervek' },
    { state: { idx: 7, key: 'journal', usr: { calendarDay: '2026-11-15' } }, url: 'https://example.test/eronaplo/#/naplo' },
  ];
  let position = 1, sequence = 0;
  const browser = {
    answer: false, confirmations: [], entries,
    crypto: { randomUUID: () => `test-guard-${++sequence}` },
    location: { href: entries[position].url },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    confirm(message) { browser.confirmations.push(message); return browser.answer; },
    dispatch(type, values = {}) {
      const event = {
        ...values, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        stopImmediatePropagation() {}, stopPropagation() {},
      };
      for (const listener of [...(listeners.get(type) || [])]) listener(event);
      return event;
    },
    listenerCount: () => [...listeners.values()].reduce((sum, group) => sum + group.size, 0),
    get position() { return position; },
  };
  browser.history = {
    get state() { return entries[position].state; },
    get length() { return entries.length; },
    pushState(state, unused, url) {
      entries.splice(position + 1);
      entries.push({ state: structuredClone(state), url: url ? new URL(url, browser.location.href).href : browser.location.href });
      position++;
      browser.location.href = entries[position].url;
    },
    replaceState(state, unused, url) {
      entries[position] = { state: structuredClone(state), url: url ? new URL(url, browser.location.href).href : browser.location.href };
      browser.location.href = entries[position].url;
    },
    go(delta) {
      const next = position + delta;
      if (next < 0 || next >= entries.length || next === position) return;
      position = next;
      browser.location.href = entries[position].url;
      browser.dispatch('popstate', { state: entries[position].state });
    },
    back() { this.go(-1); }, forward() { this.go(1); },
  };
  return browser;
}

function setup() {
  const browser = fakeBrowser();
  let pending = false, leaves = 0;
  const guard = createWorkoutLeaveGuard({
    browser, isPending: () => pending, onLeave: () => { leaves++; },
  });
  return { browser, guard, setPending: (value) => { pending = value; }, get leaves() { return leaves; } };
}

test('opening a workout adds one same-URL entry and preserves router state', () => {
  const { browser, guard } = setup();
  assert.equal(browser.position, 2);
  assert.equal(browser.history.length, 3);
  assert.equal(browser.location.href, browser.entries[1].url);
  assert.equal(browser.history.state.idx, 8);
  assert.equal(browser.history.state.key, 'journal');
  assert.deepEqual(browser.history.state.usr, { calendarDay: '2026-11-15' });
  assert.deepEqual(browser.entries[1].state, { idx: 7, key: 'journal', usr: { calendarDay: '2026-11-15' } });
  guard.dispose();
});

test('cancelling Back restores the workout entry, including repeated attempts', () => {
  const state = setup();
  for (let attempt = 0; attempt < 2; attempt++) {
    state.browser.history.back();
    assert.equal(state.browser.position, 2);
    assert.equal(state.browser.history.length, 3);
    assert.equal(state.leaves, 0);
  }
  assert.equal(state.browser.confirmations.length, 2);
  state.guard.dispose();
});

test('accepting Back closes the workout once at the original entry', () => {
  const state = setup();
  state.browser.answer = true;
  state.browser.history.back();
  assert.equal(state.leaves, 1);
  assert.equal(state.browser.position, 1);
  state.guard.dispose();
  assert.equal(state.browser.position, 1);
  assert.equal(state.browser.confirmations.length, 1);
});

test('cancelling an explicit close leaves the workout open', () => {
  const state = setup();
  assert.equal(state.guard.requestClose(), false);
  assert.equal(state.browser.position, 2);
  assert.equal(state.leaves, 0);
  assert.equal(state.browser.confirmations.length, 1);
  state.guard.dispose();
});

test('accepting an explicit close calls onLeave only once', () => {
  const state = setup();
  state.browser.answer = true;
  assert.equal(state.guard.requestClose(), true);
  state.guard.requestClose();
  assert.equal(state.leaves, 1);
  assert.equal(state.browser.confirmations.length, 1);
  state.guard.dispose();
  assert.equal(state.browser.position, 1);
});

test('saving blocks both Back and explicit close without discarding the workout', () => {
  const state = setup();
  state.setPending(true);
  state.browser.answer = true;
  assert.equal(state.guard.requestClose(), false);
  state.browser.history.back();
  assert.equal(state.browser.position, 2);
  assert.equal(state.leaves, 0);
  assert.equal(state.browser.confirmations.length, 0);
  state.setPending(false);
  assert.equal(state.guard.requestClose(), true);
  assert.equal(state.leaves, 1);
  state.guard.dispose();
});

test('refresh or document navigation receives the browser unload warning', () => {
  const { browser, guard } = setup();
  const event = browser.dispatch('beforeunload');
  assert.equal(event.defaultPrevented, true);
  assert.ok(Object.hasOwn(event, 'returnValue'));
  assert.equal(browser.confirmations.length, 0);
  guard.dispose();
  assert.equal(browser.dispatch('beforeunload').defaultPrevented, false);
});

test('successful save disposal restores history without confirmation or onLeave', () => {
  const state = setup();
  state.guard.dispose();
  state.guard.dispose();
  assert.equal(state.browser.position, 1);
  assert.equal(state.browser.history.state.idx, 7);
  assert.equal(state.browser.confirmations.length, 0);
  assert.equal(state.leaves, 0);
  assert.equal(state.browser.listenerCount(), 0);
});

test('opening and disposing repeatedly does not accumulate history or listeners', () => {
  const browser = fakeBrowser();
  for (let attempt = 0; attempt < 5; attempt++) {
    const guard = createWorkoutLeaveGuard({ browser, isPending: () => false, onLeave: () => {} });
    assert.equal(browser.position, 2);
    assert.equal(browser.history.length, 3);
    guard.dispose();
    assert.equal(browser.position, 1);
    assert.equal(browser.listenerCount(), 0);
  }
  assert.equal(browser.confirmations.length, 0);
});
