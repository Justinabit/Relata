import { useEffect, useState } from 'react';
import type { Study } from '../../shared/types';
import { api, isAbort } from '../lib/api';
import { Callout, Dialog, EmptyState } from './ui';
import { StudyCard } from './StudyCard';

export function RelatedStudiesDialog({ study, onClose, onCite }: { study: Study; onClose: () => void; onCite: (s: Study) => void }) {
  const [target, setTarget] = useState(study);
  const [result, setResult] = useState<{ studies: Study[]; partial: boolean } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    setResult(null); setError('');
    api.related(target.id, ctrl.signal).then((data) => { if (!ctrl.signal.aborted) setResult(data); }).catch((err) => {
      if (!isAbort(err) && !ctrl.signal.aborted) setError(err.message || 'Related studies could not be retrieved.');
    });
    return () => ctrl.abort();
  }, [target.id, attempt]);
  return <Dialog open onClose={onClose} title="Related studies" wide>
    <p>{target.title}</p>
    <p className="small muted">Related works and references reported by OpenAlex, checked against the scholarly sources. Up to 10 studies. References may be outside your search date range.</p>
    {!result && !error && <p role="status" aria-busy="true">Loading related studies…</p>}
    {error && <Callout tone="danger" title="Related studies unavailable" action={<button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>Try again</button>}>{error}</Callout>}
    {result?.partial && <Callout tone="warn">Some related records could not be retrieved. The available verified records are shown below.</Callout>}
    {result && !result.studies.length && <EmptyState title="No related studies found."><p>OpenAlex did not provide related records that could be verified.</p></EmptyState>}
    {result && <ol className="stack">{result.studies.map((s) => <li key={s.id}><StudyCard study={s} compact onCite={onCite} onRelated={setTarget} /></li>)}</ol>}
  </Dialog>;
}
