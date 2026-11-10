import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import './PwaControls.css';

export default function PwaControls() {
  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || Boolean(navigator.standalone));
  const [registration, setRegistration] = useState(null);
  const [installError, setInstallError] = useState('');
  const [updateError, setUpdateError] = useState('');
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, value) { setRegistration(value); },
    onRegisterError() { setUpdateError('Az offline mód most nem kapcsolható be. Online továbbra is használhatod az alkalmazást.'); },
  });

  useEffect(() => {
    const capture = (event) => { event.preventDefault(); setInstallEvent(event); };
    const complete = () => { setInstalled(true); setInstallEvent(null); };
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', complete);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', complete);
    };
  }, []);

  useEffect(() => {
    if (!registration) return undefined;
    const check = () => {
      if (navigator.onLine && document.visibilityState === 'visible') registration.update().catch(() => {});
    };
    const interval = window.setInterval(check, 60 * 60 * 1000);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [registration]);

  async function install() {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
      setInstallEvent(null);
    } catch {
      setInstallError('A telepítést a böngésző menüjében is elindíthatod.');
    }
  }

  async function update() {
    try { await updateServiceWorker(true); }
    catch { setUpdateError('A frissítés nem sikerült. Csatlakozz az internethez, majd próbáld újra.'); }
  }

  return (
    <div className="pwa-controls">
      {needRefresh && (
        <aside className="pwa-banner" role="status">
          <div><strong>Új verzió érkezett</strong><p>Előbb mentsd az edzésedet. A frissítés újraindítja az alkalmazást.</p></div>
          <div className="pwa-actions">
            <button type="button" className="pwa-action" onClick={update}>Frissítés</button>
            <button type="button" className="pwa-dismiss" onClick={() => setNeedRefresh(false)}>Később</button>
          </div>
        </aside>
      )}
      {offlineReady && !needRefresh && (
        <aside className="pwa-banner" role="status">
          <p>Az alkalmazás váza már offline is betölthető. A belépéshez és az adatok szinkronizálásához internet szükséges.</p>
          <button type="button" className="pwa-dismiss" aria-label="Offline értesítés bezárása" onClick={() => setOfflineReady(false)}>Rendben</button>
        </aside>
      )}
      {updateError && <p className="pwa-message" role="status">{updateError}</p>}
      {!installed && (
        <details className="pwa-install">
          <summary>↗ Hozzáadás a főképernyőhöz</summary>
          <div>
            {installEvent && <button type="button" className="pwa-action" onClick={install}>Erőnapló telepítése</button>}
            <p><strong>Android · Chrome</strong><br />Menü (⋮) → Alkalmazás telepítése / Hozzáadás a főképernyőhöz.</p>
            <p><strong>iPhone · Safari</strong><br />Megosztás → Hozzáadás a Főképernyőhöz → Hozzáadás. Ha megjelenik, kapcsold be a „Megnyitás webalkalmazásként” lehetőséget.</p>
            {installError && <p role="status">{installError}</p>}
          </div>
        </details>
      )}
    </div>
  );
}
