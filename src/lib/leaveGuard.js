const marker = 'eronaploWorkoutGuard';
export const LEAVE_WORKOUT_MESSAGE = 'Biztosan vissza szeretnél lépni? A nem mentett edzésadatok elvesznek.';

// A same-URL entry catches mobile/browser Back before the document can be left.
// Only an opaque token is stored here; workout data stays in React memory.
export function createWorkoutLeaveGuard({ browser, isPending, onLeave }) {
  const token = browser.crypto.randomUUID();
  let disposed = false;
  let leaving = false;
  let restoring = false;
  const { history } = browser;
  const state = history.state || {};
  history.pushState({ ...state, ...(Number.isInteger(state.idx) ? { idx: state.idx + 1 } : {}), [marker]: token }, '', browser.location.href);

  const atGuard = () => history.state?.[marker] === token;
  function requestClose() {
    if (disposed || leaving || restoring || isPending()) return false;
    if (!browser.confirm(LEAVE_WORKOUT_MESSAGE)) return false;
    leaving = true;
    onLeave();
    return true;
  }
  function pop() {
    if (disposed || leaving) return;
    if (atGuard()) { restoring = false; return; }
    if (restoring) return;
    if (!requestClose()) {
      restoring = true;
      history.go(1);
    }
  }
  function beforeUnload(event) {
    if (leaving) return;
    event.preventDefault();
    event.returnValue = '';
  }
  browser.addEventListener('popstate', pop);
  browser.addEventListener('beforeunload', beforeUnload);
  return {
    requestClose,
    dispose() {
      if (disposed) return;
      disposed = true;
      browser.removeEventListener('popstate', pop);
      browser.removeEventListener('beforeunload', beforeUnload);
      if (atGuard()) history.back();
    },
  };
}
