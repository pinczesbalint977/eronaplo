import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  initializeAuth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  terminate,
} from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// These values identify the public Firebase web app; they are not admin secrets.
// Personal data access is enforced by firestore.rules, never by this config.
export const firebaseConfigured = Object.values(config).every(
  (value) => typeof value === 'string' && value.trim() && !value.includes('YOUR_'),
);

export let auth = null;
export let db = null;
export let setupError = '';
// Once the memory cache is closing, no callback may authorize another user in
// this document. A full navigation is required before creating private views.
export let privateMemoryClosing = false;
let discardPromise;

if (firebaseConfigured) {
  try {
    const app = initializeApp(config);
    // Firebase persists session tokens, never the user's password. Workout data
    // is deliberately NOT persisted to IndexedDB, localStorage, or Cache Storage.
    auth = initializeAuth(app, { persistence: browserLocalPersistence });
    db = initializeFirestore(app, { localCache: memoryLocalCache() });

    // An environment variable must never redirect a production build to emulators.
    if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      // The Vite proxy keeps emulator traffic on the page's origin in WebKit.
      connectFirestoreEmulator(db, window.location.hostname, Number(window.location.port || 80));
    }
  } catch {
    setupError = 'A Firebase beállítása nem sikerült. Ellenőrizd a projekt konfigurációját.';
  }
}

// A page reload after termination destroys the old in-memory cache and React
// drafts. The service worker can still load the public application shell offline.
export function discardPrivateMemoryAndReload() {
  privateMemoryClosing = true;
  if (!discardPromise) {
    discardPromise = (async () => {
      // Reload also destroys memory if SDK shutdown is delayed or fails.
      const fallback = window.setTimeout(() => window.location.reload(), 1500);
      try {
        if (db) await terminate(db);
      } catch {
        // No private data is persisted; discarding the document clears it.
      } finally {
        window.clearTimeout(fallback);
        window.location.reload();
      }
    })();
  }
  return discardPromise;
}
