import { auth, db, privateMemoryClosing } from './firebase';

function accessError(code) {
  const error = new Error(code === 'permission-denied'
    ? 'Ehhez a fiókhoz nincs hozzáférés engedélyezve.'
    : 'A hozzáférés most nem ellenőrizhető. Internetkapcsolattal próbáld újra.');
  error.code = code;
  return error;
}

function checkCandidate(user) {
  if (!user?.uid || privateMemoryClosing || auth?.currentUser?.uid !== user.uid) {
    throw accessError('cancelled');
  }
}

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      signal.removeEventListener('abort', cancel);
      reject(accessError('unavailable'));
    };
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', cancel);
    });
  });
}

function statusError(status) {
  if (status === 'PERMISSION_DENIED' || status === 403) return accessError('permission-denied');
  if (status === 'UNAUTHENTICATED' || status === 401) return accessError('unauthenticated');
  return accessError('unavailable');
}

/**
 * Prove server-side access without opening a Firestore WebChannel or caching
 * documents. A successful batchGet names the exact permitted missing document.
 * An arbitrary 404 (including a nonexistent database) never grants access.
 */
export async function verifyAccess(user, { signal } = {}) {
  checkCandidate(user);
  if (!navigator.onLine || !db) throw accessError('unavailable');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const deadline = window.setTimeout(cancel, 15_000);

  try {
    const token = await abortable(user.getIdToken(), controller.signal);
    checkCandidate(user);
    if (controller.signal.aborted) throw accessError('unavailable');
    const databaseName = `projects/${db.app.options.projectId}/databases/(default)`;
    const documentName = `${databaseName}/documents/users/${user.uid}/access/check`;
    const origin = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true'
      ? ''
      : 'https://firestore.googleapis.com';
    const response = await fetch(`${origin}/v1/${databaseName}/documents:batchGet`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents: [documentName] }),
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    const result = await abortable(response.json(), controller.signal);
    checkCandidate(user);
    if (!response.ok) throw statusError(result?.error?.status || response.status);
    const nestedError = result?.error || (Array.isArray(result) && result[0]?.error);
    if (nestedError) throw statusError(nestedError.status || nestedError.code);
    const item = Array.isArray(result) && result.length === 1 ? result[0] : null;
    if (!item || typeof item.readTime !== 'string' || !item.readTime
      || (item.missing !== documentName && item.found?.name !== documentName)) {
      throw accessError('unavailable');
    }
  } catch (error) {
    if (controller.signal.aborted) throw accessError('unavailable');
    if (['auth/user-token-expired', 'auth/invalid-user-token', 'auth/user-disabled'].includes(error.code)) {
      throw accessError('unauthenticated');
    }
    if (typeof error.code === 'string' && error.code.startsWith('auth/')) throw accessError('unavailable');
    if (typeof error.code === 'string') throw error;
    throw accessError('unavailable');
  } finally {
    window.clearTimeout(deadline);
    signal?.removeEventListener('abort', cancel);
  }
}
