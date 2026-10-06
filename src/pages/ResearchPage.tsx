import { useEffect, useState } from 'react';
import { Bookmark, BookmarkCheck, Download, FilterX, Pencil, RefreshCw } from 'lucide-react';
import type { Study } from '../../shared/types';
import { nf, excerpt } from '../lib/format';
import { Link, useDocumentTitle, useRouter } from '../lib/router';
import { ROUTES } from '../lib/routes';
import { useLibrary } from '../state/library';
import { useResearch } from '../state/research';
import { useSettings } from '../state/settings';
import { useToast } from '../state/toast';
import { CiteDialog, type CiteTarget } from '../components/CiteDialog';
import { FilterBar } from '../components/FilterBar';
import { AIStatusCallout, AuthorsPanel, GapsPanel, MethodPanel, OverviewPanel, RelatedTopicsPanel, ThemesPanel, TrustPanel } from '../components/Panels';
import { StudyCard } from '../components/StudyCard';
import { Callout, EmptyState, FilterSkeleton, RailSkeleton, Section, StudyCardSkeleton, TopicSkeleton } from '../components/ui';

export default function ResearchPage() {
  useDocumentTitle('Research');
  const { session: s, start, setFilters, loadMore, retry, insightsExpected } = useResearch();
  const { search, navigate } = useRouter();
  const lib = useLibrary();
  const { settings } = useSettings();
  const toast = useToast();
  const [cite, setCite] = useState<CiteTarget | null>(null);
  const q = search.get('q');

  // Deep link / reload / back-forward: (re)run the search that the URL describes.
  useEffect(() => {
    if (q && q.trim() !== s.input.trim()) start(q.trim(), { useAI: s.useAI });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const explore = (term: string) => {
    start(term, { origin: 'text', useAI: s.useAI });
    navigate(`${ROUTES.research}?q=${encodeURIComponent(term)}`);
  };

  if (s.phase === 'idle' && !q) {
    return (
      <div className="page">
        <EmptyState title="No research session yet" action={<Link to={ROUTES.app} className="btn btn--primary">Start a search</Link>}>
          <p>Enter a topic, question or document on the Search page. Relata will analyze it and list recent scholarly studies, related topics and the sources behind them.</p>
        </EmptyState>
      </div>
    );
  }

  const r = s.results;
  const loadingStudies = s.phase === 'analyzing' || s.phase === 'searching';
  const querySaved = lib.isQuerySaved(s.input);
  const directions = s.analysis?.analysis?.researchDirections ?? [];
  const showAIProblem = s.useAI && s.analysis && s.analysis.ai.status !== 'ok' && s.analysis.ai.status !== 'disabled';
  const winLabel = r?.window.label;
  const resetFilters = () => setFilters({ yearsBack: settings.yearsBack, openAccessOnly: false, type: 'any', sort: 'relevance', sources: ['openalex'] });
  const widen = () => setFilters({ yearsBack: s.filters.yearsBack < 10 ? 10 : s.filters.yearsBack === 10 ? 15 : 25 });
  const canWiden = s.filters.yearsBack < 25;

  return (
    <div className="page page--research">
      <header className="qbar">
        <div className="qbar__main">
          <p className="label">{s.origin === 'document' ? `Document · ${s.docName ?? 'uploaded file'}` : 'Researching'}</p>
          <h1 className="qbar__q">{excerpt(s.origin === 'document' && s.analysis ? s.analysis.plan.primaryQuery || s.input : s.input, 180)}</h1>
          {winLabel && <p className="qbar__window">Research window: <strong>{winLabel}</strong>{r?.window.outsideDefault && <span className="qbar__outside"> · Outside the default 10-year research window</span>}</p>}
        </div>
        <div className="qbar__actions">
          <Link to={ROUTES.app} className="btn btn--sm"><Pencil size={15} aria-hidden="true" /> New search</Link>
          {s.origin === 'text' && (
            <button type="button" className="btn btn--sm" aria-pressed={querySaved} onClick={() => toast(lib.toggleQuery(s.input) ? 'Search saved' : 'Saved search removed')}>
              {querySaved ? <BookmarkCheck size={15} aria-hidden="true" /> : <Bookmark size={15} aria-hidden="true" />} {querySaved ? 'Search saved' : 'Save search'}
            </button>
          )}
          <button type="button" className="btn btn--sm" disabled={!s.studies.length} onClick={() => setCite({ title: 'Export results', studies: s.studies, query: s.input })}>
            <Download size={15} aria-hidden="true" /> Export
          </button>
        </div>
      </header>

      <p className="sr-only" role="status" aria-live="polite">
        {s.phase === 'analyzing' ? 'Analyzing your topic' : s.phase === 'searching' ? 'Searching scholarly sources' : s.phase === 'done' ? `${s.studies.length} studies shown` : ''}
      </p>

      {s.analysis ? <FilterBar filters={s.filters} onChange={setFilters} defaultYears={settings.yearsBack} /> : s.phase === 'analyzing' ? <FilterSkeleton /> : null}
      <TrustPanel />
      {showAIProblem && s.analysis && <AIStatusCallout ai={s.analysis.ai} />}
      {s.insightsNote && !showAIProblem && <AIStatusCallout ai={s.insightsNote} />}
      {r?.notices.map((n) => <Callout key={n.code} tone={n.level === 'warning' ? 'warn' : 'info'}>{n.message}</Callout>)}

      <div className="dash">
        <div className="dash__main">
          {s.phase === 'analyzing' && !s.analysis ? <div className="u-o1"><TopicSkeleton /></div> : <OverviewPanel session={s} onExplore={explore} />}

          <Section
            className={`u-o3 studies ${s.refreshing ? 'studies--busy' : ''}`}
            title="Related Research"
            hint={r ? `These are relevant studies found through the available sources and search strategy. Showing ${nf.format(s.studies.length)} of ${nf.format(r.counts.eligible)} eligible records retrieved so far.` : 'Searching verified scholarly sources…'}
          >
            {s.phase === 'error' && (
              <Callout
                tone="danger" live="assertive"
                title={s.error?.code === 'RESEARCH_UNAVAILABLE' ? 'Research services are temporarily unavailable. Please try again later.' : 'The search could not be completed'}
                action={<button type="button" className="btn btn--sm" onClick={retry}><RefreshCw size={15} aria-hidden="true" /> Try again</button>}
              >
                {s.error?.code === 'RESEARCH_UNAVAILABLE' ? 'No results are shown because none could be verified. Relata never fills the gap with unverified or generated studies.' : s.error?.message}
              </Callout>
            )}

            {loadingStudies && <div className="stack" aria-busy="true"><StudyCardSkeleton /><StudyCardSkeleton /><StudyCardSkeleton /></div>}

            {s.phase === 'done' && r && s.studies.length === 0 && (
              <EmptyState
                title="No verified studies were found within the selected research window."
                action={
                  <div className="row row--wrap">
                    <button type="button" className="btn" onClick={resetFilters}><FilterX size={16} aria-hidden="true" /> Remove filters</button>
                    {canWiden && <button type="button" className="btn" onClick={widen}>Expand the date range</button>}
                  </div>
                }
              >
                <p>Nothing was shown because nothing could be verified. Suggestions:</p>
                <ul>
                  <li>Try broader keywords</li>
                  <li>Remove a filter, such as publication type or open access</li>
                  <li>Try related terminology or synonyms</li>
                  <li>Expand the date range (results outside the 10-year window are labelled)</li>
                </ul>
              </EmptyState>
            )}

            {s.studies.length > 0 && (
              <>
                <ol className="stack studies__list" aria-busy={s.refreshing}>
                  {s.studies.map((st: Study, i) => (
                    <li key={st.id}><StudyCard study={st} index={i % 10} insight={s.insights[st.id]} insightsExpected={insightsExpected} onCite={(x) => setCite({ title: 'Cite this study', studies: [x] })} /></li>
                  ))}
                </ol>
                <div className="more">
                  {s.loadMoreError && <Callout tone="danger" live="assertive" title="More results could not be loaded">{s.loadMoreError}</Callout>}
                  {r?.hasMore ? (
                    <button type="button" className="btn btn--lg" onClick={loadMore} disabled={s.loadingMore}>{s.loadingMore ? 'Loading more studies…' : 'Load more studies'}</button>
                  ) : (
                    <p className="small muted">End of the records retrieved for this search. To see different studies, change the keywords or filters.</p>
                  )}
                </div>
              </>
            )}
          </Section>
        </div>

        <aside className="dash__rail" aria-label="Topics, themes and search strategy">
          {s.phase === 'analyzing' && !s.analysis ? <div className="u-o2"><RailSkeleton rows={3} /></div> : <RelatedTopicsPanel session={s} onExplore={explore} />}
          {r && <ThemesPanel agg={r.aggregates} onExplore={explore} />}
          {loadingStudies && !r && <div className="u-o4"><RailSkeleton rows={2} /></div>}
          {r && <AuthorsPanel agg={r.aggregates} />}
          {r && <GapsPanel gaps={r.gaps} directions={directions} />}
          <MethodPanel session={s} />
        </aside>
      </div>

      <CiteDialog target={cite} onClose={() => setCite(null)} />
    </div>
  );
}
