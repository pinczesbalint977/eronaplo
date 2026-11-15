import { useEffect, useRef } from 'react';
import { createWorkoutLeaveGuard, LEAVE_WORKOUT_MESSAGE } from '../lib/leaveGuard';

export default function useWorkoutLeaveGuard({ enabled, pending, close }) {
  const latest = useRef({ pending, close });
  latest.current = { pending, close };
  const guard = useRef(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // StrictMode's first setup is cleaned up before this runs: no duplicate entry.
    queueMicrotask(() => {
      if (!cancelled) guard.current = createWorkoutLeaveGuard({
        browser: window,
        isPending: () => latest.current.pending,
        onLeave: () => latest.current.close(),
      });
    });
    return () => {
      cancelled = true;
      guard.current?.dispose();
      guard.current = null;
    };
  }, [enabled]);
  return {
    requestClose() {
      if (guard.current) return guard.current.requestClose();
      if (pending || (enabled && !window.confirm(LEAVE_WORKOUT_MESSAGE))) return false;
      close();
      return true;
    },
    saved() {
      guard.current?.dispose();
      guard.current = null;
    },
  };
}
