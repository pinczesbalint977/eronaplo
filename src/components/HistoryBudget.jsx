import { useState } from 'react';

export default function HistoryBudget({ journal }) {
  const [error, setError] = useState('');
  if (journal.loading || journal.error || !journal.hasOlder) return null;
  return <aside className="history-budget">
    <p>{journal.workouts.length} betöltött bejegyzésből számolunk. A régebbi edzéseket külön töltheted be.</p>
    <button type="button" className="button button-secondary" disabled={journal.loadingOlder} onClick={async () => {
      setError('');
      try { await journal.loadOlder(); } catch { setError('A régebbi edzések betöltéséhez internetkapcsolat szükséges. Próbáld újra.'); }
    }}>{journal.loadingOlder ? 'Betöltés…' : 'Régebbi edzések betöltése'}</button>
    {error && <p role="alert">{error}</p>}
  </aside>;
}
