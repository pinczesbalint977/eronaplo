import { useState } from 'react';
import { ArrowUpRight, Minus, X } from 'lucide-react';
import { getWeightFeedback } from '../lib/workouts';

export default function WeightRecommendation({ entry, enabled = true, prescription = {} }) {
  const [dismissed, setDismissed] = useState(null);
  const recommendation = enabled ? getWeightFeedback(entry, prescription) : null;
  const fingerprint = JSON.stringify([entry.id, entry.status, entry.setResults, entry.plannedWorkSets, entry.targetReps, prescription.plannedWorkSets, prescription.targetReps, entry.metadata, entry.notes]);
  if (!recommendation || dismissed === fingerprint) return null;
  const Icon = recommendation.kind === 'increase' ? ArrowUpRight : Minus;
  return <aside className={`weight-recommendation ${recommendation.kind === 'increase' ? 'increase' : 'maintain'}`} data-advice-kind={recommendation.kind} aria-label={`${entry.exercise} súlyajánlás`}>
    <div className="weight-recommendation-copy"><span className="weight-recommendation-label"><Icon size={15} aria-hidden="true" />Előző edzés alapján</span><p>{recommendation.message}</p><p className="weight-recommendation-advice">Tájékoztató ajánlás. A súlyról te döntesz.</p></div>
    <button type="button" className="icon-button" aria-label={`${entry.exercise} ajánlás elrejtése`} onClick={() => setDismissed(fingerprint)}><X size={16} /></button>
  </aside>;
}
