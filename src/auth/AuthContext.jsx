import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db, discardPrivateMemoryAndReload, firebaseConfigured, privateMemoryClosing, setupError } from '../lib/firebase';
import { verifyAccess } from '../lib/verifyAccess';

const AuthContext = createContext(null);

function loginError(error) {
  switch (error?.code) {
    case 'auth/operation-not-allowed':
      return 'A Firebase-ben nincs engedélyezve az email/jelszavas belépés. Authentication → Sign-in method → Email/Password.';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return 'A Firebase API-kulcs hibás. Ellenőrizd a helyi Firebase-konfigurációt.';
    case 'auth/app-not-authorized':
    case 'auth/unauthorized-domain':
      return 'A Firebase nem engedélyezi ezt a webcímet. Ellenőrizd az Authentication engedélyezett domainjeit és az API-kulcs korlátozásait.';
    case 'auth/configuration-not-found':
      return 'A Firebase Authentication még nincs beállítva ehhez a projekthez.';
    case 'auth/user-disabled':
      return 'A Firebase-ben ez a fiók le van tiltva.';
    case 'auth/network-request-failed':
    case 'unavailable':
      return 'A bejelentkezéshez internetkapcsolat szükséges. Ellenőrizd a kapcsolatot, és próbáld újra.';
    case 'auth/too-many-requests':
      return 'Túl sok sikertelen próbálkozás. Várj néhány percet, majd próbáld újra.';
    case 'permission-denied':
      return 'Ehhez a fiókhoz nincs hozzáférés engedélyezve.';
    default:
      // Do not expose whether an email address has a Firebase account.
      return 'Sikertelen bejelentkezés. Ellenőrizd az email-címet és a jelszót.'
        + (import.meta.env.DEV && typeof error?.code === 'string' ? ` (${error.code})` : '');
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(auth && db));
  const [error, setError] = useState(setupError);
  const generation = useRef(0);
  const approvedUid = useRef(null);
  const signingOut = useRef(false);

  useEffect(() => {
    if (!auth || !db) return undefined;
    let active = true;
    const controller = new AbortController();
    const unsubscribe = onAuthStateChanged(auth, async (candidate) => {
      if (!active) return;
      if (signingOut.current || privateMemoryClosing) {
        setUser(null);
        setLoading(true);
        return;
      }
      const revision = ++generation.current;
      const previousUid = approvedUid.current;
      approvedUid.current = null;
      setUser(null);

      // A sign-out in another tab or an account switch must discard this tab's
      // previous user's cache and drafts as well.
      if (previousUid && previousUid !== candidate?.uid && !signingOut.current) {
        signingOut.current = true;
        ++generation.current;
        setLoading(true);
        await discardPrivateMemoryAndReload();
        return;
      }

      if (!candidate) {
        setLoading(signingOut.current);
        return;
      }

      setLoading(true);
      try {
        // This server-only probe never opens or reads from a local data cache.
        await verifyAccess(candidate, { signal: controller.signal });
        if (!active || signingOut.current || privateMemoryClosing
          || revision !== generation.current || auth.currentUser?.uid !== candidate.uid) return;
        approvedUid.current = candidate.uid;
        setError('');
        setUser(candidate);
      } catch (reason) {
        if (!active || signingOut.current || privateMemoryClosing || revision !== generation.current
          || auth.currentUser?.uid !== candidate.uid) return;
        setError(loginError(reason));
        // A valid Firebase identity alone never grants app access. No private
        // route has been mounted at this point.
        if (previousUid) {
          signingOut.current = true;
          ++generation.current;
          setLoading(true);
        }
        try {
          await signOut(auth);
        } catch {
          setError('A hozzáférés ellenőrzése sikertelen. Zárd be az alkalmazást, és próbáld újra internetkapcsolattal.');
        } finally {
          if (previousUid) await discardPrivateMemoryAndReload();
        }
      } finally {
        if (active && !signingOut.current && !privateMemoryClosing
          && revision === generation.current) setLoading(false);
      }
    }, () => {
      if (!active || signingOut.current || privateMemoryClosing) return;
      const hadPrivateData = Boolean(approvedUid.current);
      ++generation.current;
      approvedUid.current = null;
      setUser(null);
      setLoading(hadPrivateData);
      setError('A bejelentkezés állapota nem ellenőrizhető. Próbáld újra.');
      if (hadPrivateData) {
        signingOut.current = true;
        void discardPrivateMemoryAndReload();
      }
    });

    return () => {
      active = false;
      controller.abort();
      ++generation.current;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (email, password) => {
    if (signingOut.current || privateMemoryClosing) {
      throw new Error('A kijelentkezés befejezéséig várj egy pillanatot.');
    }
    setError('');
    if (!firebaseConfigured || !auth || !db) {
      const message = setupError || 'A bejelentkezéshez előbb be kell állítani a Firebase projektet.';
      setError(message);
      throw new Error(message);
    }
    try {
      // Recover cleanly if an earlier local persistence/sign-out operation failed.
      // Signing in with the same UID otherwise need not emit an auth-state event.
      if (auth.currentUser && !approvedUid.current) await signOut(auth);
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (reason) {
      const message = loginError(reason);
      setError(message);
      throw new Error(message);
    }
  }, []);

  const isSessionActive = useCallback((uid) => (
    typeof uid === 'string'
    && approvedUid.current === uid
    && !signingOut.current
    && !privateMemoryClosing
    && auth?.currentUser?.uid === uid
  ), []);

  const logout = useCallback(async () => {
    if (signingOut.current || privateMemoryClosing) return;
    ++generation.current;
    approvedUid.current = null;
    signingOut.current = true;
    // Hide protected routes and unmount every data subscription immediately,
    // before waiting for Firebase or any network operation.
    setUser(null);
    setLoading(true);
    setError('');
    try {
      await signOut(auth);
    } catch {
      signingOut.current = false;
      setLoading(false);
      setError('A kijelentkezés nem sikerült. Próbáld újra; a védett felületet lezártuk.');
      return;
    }
    await discardPrivateMemoryAndReload();
  }, []);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid || !db) return undefined;
    let active = true;
    let checking = false;
    const controller = new AbortController();
    const revalidate = async () => {
      if (!active || checking || !navigator.onLine
        || document.visibilityState !== 'visible' || !isSessionActive(uid)) return;
      checking = true;
      try {
        // Rules reject new requests immediately after an ACL change. Existing
        // listeners need not emit another event until their target changes, so
        // explicitly recheck access when returning to the app and every five minutes.
        await verifyAccess(auth.currentUser, { signal: controller.signal });
      } catch (reason) {
        if (active && isSessionActive(uid)
          && ['permission-denied', 'unauthenticated'].includes(reason.code)) {
          await logout();
        }
        // An unavailable network alone must not discard an already authorized
        // session's in-memory display. Writes still require server confirmation.
      } finally {
        checking = false;
      }
    };
    const onForeground = () => { void revalidate(); };
    const interval = window.setInterval(onForeground, 300_000);
    window.addEventListener('focus', onForeground);
    window.addEventListener('online', onForeground);
    document.addEventListener('visibilitychange', onForeground);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', onForeground);
      window.removeEventListener('online', onForeground);
      document.removeEventListener('visibilitychange', onForeground);
    };
  }, [user?.uid, isSessionActive, logout]);

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, isSessionActive }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('A useAuth csak AuthProvider alatt használható.');
  return context;
}
