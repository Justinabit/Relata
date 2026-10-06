import { useId, useState } from 'react';
import { AlertTriangle, Bookmark, BookmarkCheck, ChevronDown, Copy, ExternalLink, Quote, ShieldCheck, Unlock } from 'lucide-react';
import type { Study } from '../../shared/types';
import { authorsLine, formatDate, nf, sourceLabel, typeLabel } from '../lib/format';
import { copyText } from '../lib/export';
import type { InsightState } from '../state/research';
import { useLibrary } from '../state/library';
import { useToast } from '../state/toast';
import { AITag, Badge, Skeleton, VerifiedTag } from './ui';

interface Props {
  study: Study;
  index?: number;
  insight?: InsightState;
  insightsExpected?: boolean;
  onCite: (s: Study) => void;
  /** Saved view: no AI blocks, metadata only. */
  compact?: boolean;
  extra?: React.ReactNode;
}

function DoiBadge({ s }: { s: Study }) {
  switch (s.verification.doi) {
    case 'verified':
      return <Badge tone="ok" icon={<ShieldCheck size={13} aria-hidden="true" />} title="This DOI was found in Crossref and matched to this record.">Verified DOI</Badge>;
    case 'not-in-crossref':
      return <Badge tone="warn" title="OpenAlex lists this DOI, but Crossref has no record of it. It may be registered with another DOI agency.">DOI not found in Crossref</Badge>;
    case 'unchecked':
      return <Badge tone="warn" title="Crossref could not be reached to check this DOI.">DOI unchecked</Badge>;
    default:
      return <Badge title="The source record has no DOI.">No DOI</Badge>;
  }
}

export function StudyCard({ study: s, index = 0, insight, insightsExpected, onCite, compact, extra }: Props) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const titleId = useId();
  const lib = useLibrary();
  const toast = useToast();
  const saved = lib.isStudySaved(s.id);
  const conflicts = s.verification.conflicts;
  const ins = insight && typeof insight === 'object' ? insight : null;

  const save = () => toast(lib.toggleStudy(s) ? 'Saved to your library' : 'Removed from your library');
  const copyDoi = async () => s.doi && toast((await copyText(s.doi)) ? 'DOI copied' : 'Copy failed');

  return (
    <article className="study" aria-labelledby={titleId} style={{ ['--i' as string]: Math.min(index, 8) }}>
      <header className="study__head">
        <h3 id={titleId} className="study__title">
          {s.url ? (
            <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}<span className="sr-only"> (opens the source in a new tab)</span></a>
          ) : (
            s.title
          )}
        </h3>
        <p className="study__authors">{authorsLine(s)}</p>
        <p className="study__meta">
          <span>{s.publicationYear}</span>
          <span aria-hidden="true">·</span>
          <span className="study__venue">{s.journal ?? '[Source unavailable]'}</span>
        </p>
        <div className="badges" aria-label="Source indicators">
          <DoiBadge s={s} />
          {s.openAccess.isOa && <Badge tone="info" icon={<Unlock size={13} aria-hidden="true" />} title={s.openAccess.status ? `Open access status (OpenAlex): ${s.openAccess.status}` : 'Marked open access by OpenAlex'}>Open Access</Badge>}
          <Badge title={`Indexed by ${s.sources.map(sourceLabel).join(' and ')}`}>{s.sources.map(sourceLabel).join(' + ')}</Badge>
          <Badge>{typeLabel(s.type)}</Badge>
          {s.isRetracted && <Badge tone="danger" icon={<AlertTriangle size={13} aria-hidden="true" />} title="A source flags this work as retracted.">Retracted</Badge>}
          {conflicts.length > 0 && <Badge tone="warn" icon={<AlertTriangle size={13} aria-hidden="true" />} title="OpenAlex and Crossref disagree on some fields. See More details.">Metadata conflict detected</Badge>}
        </div>
      </header>

      {!compact && insightsExpected && (
        <div className="study__ai">
          <div className="study__block">
            <h4 className="study__label">Why this is relevant</h4>
            {insight === undefined || insight === 'loading' ? (
              <Skeletons lines={2} />
            ) : ins?.relevance ? (
              <p>{ins.relevance}</p>
            ) : (
              <p className="muted">A relevance note could not be generated from the available source information.</p>
            )}
          </div>
          <div className="study__block">
            <h4 className="study__label">Summary <AITag /></h4>
            {insight === undefined || insight === 'loading' ? (
              <Skeletons lines={3} />
            ) : insight === 'unavailable' ? (
              <p className="muted">An AI summary is unavailable for this study right now. The verified metadata above is unaffected.</p>
            ) : ins?.summary ? (
              <>
                <p>{ins.summary}</p>
                {ins.keyFindings.length > 0 && (
                  <>
                    <h5 className="study__sublabel">Key findings stated in the abstract</h5>
                    <ul className="study__findings">{ins.keyFindings.map((f) => <li key={f}>{f}</li>)}</ul>
                  </>
                )}
                <p className="study__caption">AI-generated summary based on available source metadata/content. Verify against the original source.</p>
              </>
            ) : (
              <p className="muted">A reliable summary could not be generated from the available source information.</p>
            )}
          </div>
        </div>
      )}

      {s.topics.length > 0 && (
        <p className="study__topics">
          <span className="study__label">Topics <VerifiedTag>OpenAlex</VerifiedTag></span>
          <span className="chips">{s.topics.slice(0, 4).map((t) => <span key={t.name} className="chip">{t.name}</span>)}</span>
        </p>
      )}

      <div className="study__actions">
        {s.url ? (
          <a className="btn btn--primary" href={s.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} aria-hidden="true" /> View study<span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <span className="btn btn--disabled" aria-disabled="true">Source link unavailable</span>
        )}
        <button type="button" className="btn" onClick={save} aria-pressed={saved}>
          {saved ? <BookmarkCheck size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />} {saved ? 'Saved' : 'Save'}
        </button>
        <button type="button" className="btn" onClick={() => onCite(s)}><Quote size={16} aria-hidden="true" /> Cite</button>
        {extra}
        <button type="button" className="btn btn--ghost study__more" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen((o) => !o)}>
          More details <ChevronDown size={16} aria-hidden="true" className={open ? 'rot' : ''} />
        </button>
      </div>

      <div id={detailsId} className="study__details" hidden={!open}>
        {open && (
          <>
            <dl className="dl">
              <dt>DOI</dt>
              <dd>
                {s.doi ? (<><code>{s.doi}</code> <button type="button" className="linklike" onClick={copyDoi}><Copy size={13} aria-hidden="true" /> Copy</button></>) : 'Not available from the source record'}
              </dd>
              <dt>Published</dt><dd>{formatDate(s)}</dd>
              <dt>Journal / source</dt><dd>{s.journal ?? 'Not available'}{s.publisher ? ` · ${s.publisher}` : ''}</dd>
              <dt>Publication type</dt><dd>{typeLabel(s.type)}{s.rawType ? ` (source type: ${s.rawType})` : ''}</dd>
              <dt>Citations</dt>
              <dd>{s.citationCount === null ? 'Not available' : `${nf.format(s.citationCount)} (${s.citationSource ? sourceLabel(s.citationSource) : 'source'})`} <span className="muted small">Citation count is not a measure of quality.</span></dd>
              <dt>Open access</dt>
              <dd>
                {s.openAccess.isOa === null ? 'Unknown (not reported by the source)' : s.openAccess.isOa ? `Yes${s.openAccess.status ? ` · ${s.openAccess.status}` : ''}` : 'Not marked open access'}
                {s.openAccess.url && <> · <a href={s.openAccess.url} target="_blank" rel="noopener noreferrer">Open-access copy<span className="sr-only"> (opens in a new tab)</span></a></>}
              </dd>
              <dt>Indexed by</dt><dd>{s.sources.map(sourceLabel).join(' + ')}</dd>
              <dt>Verified by</dt><dd>{s.verification.verifiedBy.map(sourceLabel).join(' + ')} · DOI check: {doiStatusText(s.verification.doi)}</dd>
              <dt>Record id</dt><dd><code>{s.openalexId ?? s.sourceId}</code></dd>
            </dl>
            {conflicts.length > 0 && (
              <div className="conflict" role="note">
                <p><strong>Metadata conflict detected.</strong> OpenAlex and Crossref disagree. Following the source-priority rule (DOI metadata / Crossref before OpenAlex), Crossref’s values are displayed.</p>
                <table className="table">
                  <thead><tr><th scope="col">Field</th><th scope="col">OpenAlex</th><th scope="col">Crossref</th></tr></thead>
                  <tbody>{conflicts.map((c) => <tr key={c.field}><th scope="row">{c.field}</th><td>{c.openalex}</td><td>{c.crossref}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            {s.abstract && (
              <details className="abstract">
                <summary>Abstract <VerifiedTag>{s.abstractSource ? sourceLabel(s.abstractSource) : 'Source'}</VerifiedTag></summary>
                <p>{s.abstract}</p>
              </details>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function doiStatusText(s: Study['verification']['doi']) {
  return { verified: 'found in Crossref', 'not-in-crossref': 'not found in Crossref', unchecked: 'could not be checked', 'no-doi': 'no DOI supplied' }[s];
}

function Skeletons({ lines }: { lines: number }) {
  return (
    <div aria-hidden="true" className="skels">
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} w={i === lines - 1 ? '62%' : '100%'} h={14} />)}
    </div>
  );
}
