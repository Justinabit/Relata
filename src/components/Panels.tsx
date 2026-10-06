import { type ReactNode } from 'react';
import { Bookmark, BookmarkCheck, ChevronDown, Compass, Info } from 'lucide-react';
import type { AIInfo, AnalyzeResponse, GapAnalysis, Aggregates, SearchResponse } from '../../shared/types';
import { SOURCE_CAPABILITIES } from '../../shared/capabilities';
import { nf, plural, sourceLabel, timeAgo, excerpt } from '../lib/format';
import type { Session } from '../state/research';
import { useHealth } from '../state/health';
import { useLibrary } from '../state/library';
import { useToast } from '../state/toast';
import { AITag, Badge, Callout, Section, Skeleton, VerifiedTag } from './ui';

export function TrustPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <details className="trust" open={defaultOpen}>
      <summary><Info size={16} aria-hidden="true" /> <span>How Research Results Work</span><ChevronDown size={16} aria-hidden="true" className="trust__chev" /></summary>
      <p>
        We use scholarly metadata sources to discover research. AI assists with topic analysis and summaries, but it does not create or invent research papers.
        Titles, authors, dates, DOIs and links come from OpenAlex and Crossref records. These are relevant studies found through the available sources and search strategy, not a complete list of everything written on your topic.
      </p>
    </details>
  );
}

export function AIStatusCallout({ ai, onlyIfProblem = true }: { ai: AIInfo; onlyIfProblem?: boolean }) {
  if (ai.status === 'ok' && onlyIfProblem) return null;
  if (ai.status === 'disabled') return null;
  return (
    <Callout tone="info" title={ai.status === 'not_configured' ? 'AI analysis is not set up on this server' : 'AI analysis is temporarily unavailable.'}>
      {ai.status === 'not_configured'
        ? 'Topic definitions, related-topic suggestions and study summaries need a Gemini or OpenAI key on the server. You can still search verified scholarly sources, and every result below is complete without AI.'
        : 'You can still search verified scholarly sources. Verified research results are still available.'}
    </Callout>
  );
}

/* ---------------- Topic overview ---------------- */

export function OverviewPanel({ session, onExplore }: { session: Session; onExplore: (q: string) => void }) {
  const a = session.analysis?.analysis ?? null;
  const plan = session.analysis?.plan;
  const lib = useLibrary();
  const toast = useToast();
  const { health } = useHealth();

  if (!session.analysis) return null;

  if (!a) {
    return (
      <Section title="Topic overview" hint="Key terms extracted from your input without AI." className="u-o1">
        <h3 className="overview__topic">{plan?.primaryQuery || session.input}</h3>
        {plan && plan.extractedKeywords.length > 0 && (
          <>
            <h4 className="label">Extracted keywords</h4>
            <KeywordChips items={plan.extractedKeywords} onExplore={onExplore} />
          </>
        )}
        <p className="muted small mt14">
          {health && !health.ai.anyConfigured
            ? 'AI analysis is not set up on this server, so no definition or related-topic suggestions are shown. Search results are unaffected.'
            : session.analysis.ai.status === 'disabled'
              ? 'AI analysis was turned off for this search, so no definition or related-topic suggestions are shown.'
              : 'Definitions and related-topic suggestions are unavailable without AI analysis right now. Search results are unaffected.'}
        </p>
      </Section>
    );
  }
  const saved = lib.isTopicSaved(a.mainTopic);
  return (
    <Section
      className="u-o1 overview"
      title="Topic overview"
      actions={
        <button type="button" className="btn btn--sm" aria-pressed={saved} onClick={() => toast(lib.toggleTopic(a.mainTopic) ? 'Topic saved' : 'Topic removed')}>
          {saved ? <BookmarkCheck size={15} aria-hidden="true" /> : <Bookmark size={15} aria-hidden="true" />} {saved ? 'Saved' : 'Save topic'}
        </button>
      }
    >
      <h3 className="overview__topic">{a.mainTopic}</h3>
      <p className="overview__fields">
        {a.academicField && <Badge tone="accent">{a.academicField}</Badge>}
        {a.relatedFields.map((f) => <Badge key={f}>{f}</Badge>)}
      </p>
      <div className="overview__cols">
        <div>
          <h4 className="label">Definition <AITag /></h4>
          <p>{a.definition}</p>
        </div>
        <div>
          <h4 className="label">In simple terms <AITag /></h4>
          <p>{a.simpleExplanation}</p>
        </div>
      </div>
      {a.concepts.length > 0 && (
        <details className="disclosure">
          <summary><span>Important concepts ({a.concepts.length})</span><ChevronDown size={16} aria-hidden="true" /></summary>
          <dl className="dl dl--concepts">
            {a.concepts.map((c) => (<div key={c.term}><dt>{c.term}</dt><dd>{c.explanation}</dd></div>))}
          </dl>
        </details>
      )}
      <h4 className="label mt14">Keywords <AITag /></h4>
      <KeywordChips items={[...a.keywords, ...a.synonyms.filter((s) => !a.keywords.includes(s))].slice(0, 14)} onExplore={onExplore} />
      <p className="overview__caption">AI-generated explanation from general knowledge, not drawn from a cited source. Check it against the original studies.</p>
    </Section>
  );
}

function KeywordChips({ items, onExplore }: { items: string[]; onExplore: (q: string) => void }) {
  return (
    <ul className="chips chips--btn" aria-label="Keywords. Select one to search it.">
      {items.map((k) => (
        <li key={k}><button type="button" className="chip chip--btn" onClick={() => onExplore(k)} title={`Search “${k}”`}>{k}</button></li>
      ))}
    </ul>
  );
}

/* ---------------- Related topics ---------------- */

export function RelatedTopicsPanel({ session, onExplore }: { session: Session; onExplore: (q: string) => void }) {
  const lib = useLibrary();
  const toast = useToast();
  const topics = session.analysis?.analysis?.relatedTopics ?? [];
  const win = session.results?.window.label;
  if (!session.analysis) return null;
  if (!topics.length) {
    return (
      <Section title="Related topics" className="u-o2 topics" headingLevel={2}>
        <p className="muted small">
          {session.analysis.analysis ? 'No related-topic suggestions were returned for this input.' : 'Related-topic cards are generated by AI analysis, which is not available for this search. The research themes panel shows topics tagged on the retrieved studies instead.'}
        </p>
      </Section>
    );
  }
  return (
    <Section title="Related topics" hint={<>Suggested by AI. Work counts come from OpenAlex{win ? ` (${win})` : ''}.</>} className="u-o2 topics">
      <ul className="topics__list">
        {topics.map((t) => {
          const count = session.topicCounts[t.name.toLowerCase()];
          const saved = lib.isTopicSaved(t.name);
          return (
            <li key={t.name} className="topic">
              <div className="topic__head">
                <h3 className="topic__name">{t.name}</h3>
                <button type="button" className="btn btn--icon btn--sm" aria-pressed={saved} aria-label={`${saved ? 'Remove saved topic' : 'Save topic'}: ${t.name}`} onClick={() => toast(lib.toggleTopic(t.name) ? 'Topic saved' : 'Topic removed')}>
                  {saved ? <BookmarkCheck size={15} aria-hidden="true" /> : <Bookmark size={15} aria-hidden="true" />}
                </button>
              </div>
              <p className="topic__def">{t.definition}</p>
              <p className="topic__rel"><span className="label label--inline">Relevance</span> {t.relevance}</p>
              <div className="topic__foot">
                <span className="topic__count">
                  {session.topicCountsState === 'loading' && count === undefined ? <Skeleton w={96} h={13} /> : typeof count === 'number' ? <>{nf.format(count)} works in OpenAlex</> : <span className="muted">Work count unavailable</span>}
                </span>
                <button type="button" className="btn btn--sm" onClick={() => onExplore(t.name)} aria-label={`Explore ${t.name}`}><Compass size={15} aria-hidden="true" /> Explore</button>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/* ---------------- Themes / authors ---------------- */

export function ThemesPanel({ agg, onExplore }: { agg: Aggregates; onExplore: (q: string) => void }) {
  if (!agg.themes.length) return null;
  const max = agg.themes[0].count;
  return (
    <Section title="Research themes" hint={<>Topic tags on the retrieved studies. <VerifiedTag>OpenAlex</VerifiedTag></>} className="u-o4" headingLevel={2}>
      <ul className="bars">
        {agg.themes.slice(0, 8).map((t) => (
          <li key={t.name}>
            <button type="button" className="bars__btn" onClick={() => onExplore(t.name)} title={`Search “${t.name}”`}>
              <span className="bars__name">{t.name}</span>
              <span className="bars__bar" aria-hidden="true"><i style={{ width: `${Math.max(8, (t.count / max) * 100)}%` }} /></span>
              <span className="bars__n">{plural(t.count, 'study', 'studies')}</span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function AuthorsPanel({ agg }: { agg: Aggregates }) {
  if (!agg.authors.length) return null;
  return (
    <Section title="Related authors" hint="Authors who appear in more than one retrieved study." className="u-o5">
      <ul className="plain">
        {agg.authors.map((a) => (
          <li key={a.orcid ?? a.name} className="author">
            <span>{a.orcid ? <a href={a.orcid} target="_blank" rel="noopener noreferrer">{a.name}<span className="sr-only"> (ORCID, opens in a new tab)</span></a> : a.name}</span>
            <span className="muted small">{plural(a.count, 'study', 'studies')}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ---------------- Gaps ---------------- */

export function GapsPanel({ gaps, directions }: { gaps: GapAnalysis; directions: string[] }) {
  return (
    <Section title="Possible research gaps" className="u-o6" hint="Optional. Based only on the studies retrieved by this search.">
      {gaps.available && gaps.signals.length > 0 && (
        <ul className="gaps">
          {gaps.signals.map((g) => <li key={g.concept}>{g.statement}</li>)}
        </ul>
      )}
      {(!gaps.available || gaps.signals.length === 0) && gaps.reason && <p className="muted small">{gaps.reason}</p>}
      {gaps.available && gaps.withAbstract < gaps.poolSize && (
        <p className="small muted mt8">Only {gaps.withAbstract} of {gaps.poolSize} retrieved records included abstract text, so concept matches rely partly on titles and topic tags.</p>
      )}
      {directions.length > 0 && (
        <details className="disclosure">
          <summary><span>Possible research directions <AITag /></span><ChevronDown size={16} aria-hidden="true" /></summary>
          <ul className="gaps">{directions.map((d) => <li key={d}>{d}</li>)}</ul>
          <p className="small muted">Suggestions only. They do not claim that a direction has or has not been studied.</p>
        </details>
      )}
      <p className="gaps__disclaimer">This is a preliminary literature-discovery signal, not a systematic literature review.</p>
    </Section>
  );
}

/* ---------------- Search strategy ---------------- */

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (<><dt>{k}</dt><dd>{children}</dd></>);
}

export function MethodPanel({ session }: { session: Session }) {
  const r: SearchResponse | null = session.results;
  const a: AnalyzeResponse | null = session.analysis;
  if (!a) return null;
  const aiKw = a.analysis?.keywords ?? [];
  const insightVals = Object.values(session.insights).filter((v): v is Exclude<typeof v, string> => typeof v === 'object');
  const cachedInsights = insightVals.filter((v) => v.fromCache).length;
  const rejectedTotal = r ? Object.values(r.counts.rejected).reduce((x, y) => x + y, 0) : 0;
  return (
    <details className="panel method u-o7">
      <summary className="panel__head method__sum">
        <h2 className="panel__title">How we searched</h2>
        <ChevronDown size={18} aria-hidden="true" className="method__chev" />
      </summary>
      <dl className="dl dl--method">
        <Row k="Original input">{session.origin === 'document' && session.docName ? <>Document “{session.docName}”: </> : null}{excerpt(session.input, 220)}</Row>
        <Row k="Searched as">
          <ul className="plain plain--tight">
            <li><strong>{a.plan.primaryQuery}</strong></li>
            {a.plan.expandedQueries.map((q) => <li key={q}>{q}</li>)}
          </ul>
        </Row>
        <Row k="Expanded keywords">{(aiKw.length ? aiKw : a.plan.extractedKeywords).join(' · ') || 'None'} {!aiKw.length && <span className="muted small">(extracted without AI)</span>}</Row>
        {a.analysis && a.analysis.concepts.length > 0 && <Row k="Related concepts">{a.analysis.concepts.map((c) => c.term).join(' · ')}</Row>}
        {r && <Row k="Research window">{r.window.label}{r.window.outsideDefault ? ' · outside the default 10-year window' : ''}</Row>}
        {r && (
          <Row k="Sources">
            <ul className="plain plain--tight">
              {r.sources.map((s, i) => (
                <li key={i}>
                  <strong>{sourceLabel(s.id)}</strong> <span className="muted">({s.role})</span>:{' '}
                  {s.status === 'ok' ? `${s.resultCount ?? 0} ${s.role === 'verification' ? 'DOIs verified' : s.role === 'enrichment' ? 'records enriched' : 'records retrieved'}` : s.status === 'skipped' ? 'skipped' : 'unavailable'}
                  {s.message ? <span className="muted">. {s.message}</span> : null}
                </li>
              ))}
              <li className="muted small">Searched: {r.filters.sources.map((s) => SOURCE_CAPABILITIES[s].label).join(', ')}. Crossref also checks the DOIs of OpenAlex records.</li>
            </ul>
          </Row>
        )}
        {r && (
          <Row k="Results">
            {nf.format(r.counts.retrieved)} records retrieved · {nf.format(r.counts.duplicatesRemoved)} duplicates merged · {nf.format(rejectedTotal)} excluded · {nf.format(r.counts.eligible)} eligible · <strong>{nf.format(session.studies.length)} displayed</strong>
            {rejectedTotal > 0 && (
              <ul className="plain plain--tight muted small">{Object.entries(r.counts.rejected).map(([why, n]) => <li key={why}>{n} × {why}</li>)}</ul>
            )}
          </Row>
        )}
        {r && r.crossrefVerification.checked > 0 && (
          <Row k="Crossref DOI check">{r.crossrefVerification.verified} found · {r.crossrefVerification.notFound} not found · {r.crossrefVerification.failed} could not be checked</Row>
        )}
        {r && <Row k="Ordering">Sorted by <strong>{{ relevance: 'search relevance (how strongly records match your search terms; not a quality measure)', newest: 'newest first', oldest: 'oldest first', cited: 'citation count (not a quality measure)' }[r.filters.sort]}</strong>.</Row>}
        {r && (
          <Row k="Data freshness">
            <ul className="plain plain--tight">
              <li>Scholarly metadata: <strong>{r.cache.metadata === 'cached' ? `cached (retrieved ${r.cache.cachedAt ? timeAgo(r.cache.cachedAt) : 'earlier'})` : `live (retrieved ${timeAgo(r.generatedAt)})`}</strong></li>
              <li>AI topic analysis: <strong>{a.ai.status === 'ok' ? `${a.ai.provider}${a.ai.fallbackUsed ? ' (fallback provider)' : ''}, ${a.cache.hit ? 'cached' : 'live'}` : a.ai.status === 'disabled' ? 'off' : 'unavailable'}</strong></li>
              {insightVals.length > 0 && <li>AI study notes: {insightVals.length} generated{cachedInsights ? `, ${cachedInsights} from cache` : ''}</li>}
            </ul>
          </Row>
        )}
      </dl>
    </details>
  );
}
