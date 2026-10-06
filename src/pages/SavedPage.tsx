import { useMemo, useState, type FormEvent } from 'react';
import { Compass, Download, FolderPlus, RefreshCw, Trash2, X } from 'lucide-react';
import type { Study } from '../../shared/types';
import { api } from '../lib/api';
import { excerpt, timeAgo } from '../lib/format';
import { Link, useDocumentTitle, useRouter } from '../lib/router';
import { ROUTES } from '../lib/routes';
import { useLibrary, type SavedStudy } from '../state/library';
import { useResearch } from '../state/research';
import { useToast } from '../state/toast';
import { CiteDialog, type CiteTarget } from '../components/CiteDialog';
import { StudyCard } from '../components/StudyCard';
import { Callout, Dialog, EmptyState } from '../components/ui';

type Tab = 'studies' | 'topics' | 'searches';

export default function SavedPage() {
  useDocumentTitle('Saved');
  const lib = useLibrary();
  const toast = useToast();
  const { start } = useResearch();
  const { navigate } = useRouter();
  const [tab, setTab] = useState<Tab>('studies');
  const [rawFilter, setFilter] = useState<string>('all');
  // A collection can disappear (deleted here or in another tab); fall back instead of showing an empty, broken view.
  const filter = rawFilter === 'all' || rawFilter === 'none' || lib.data.collections.some((c) => c.id === rawFilter) ? rawFilter : 'all';
  const [cite, setCite] = useState<CiteTarget | null>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [delCollection, setDelCollection] = useState<string | null>(null);

  const visible = useMemo(
    () => lib.data.studies.filter((s) => filter === 'all' || (filter === 'none' ? s.collectionIds.length === 0 : s.collectionIds.includes(filter))),
    [lib.data.studies, filter],
  );
  const explore = (t: string) => { start(t, { origin: 'text' }); navigate(`${ROUTES.research}?q=${encodeURIComponent(t)}`); };

  const addCollection = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    lib.createCollection(newName);
    setNewName('');
    toast('Collection created');
  };

  const reverify = async (s: SavedStudy) => {
    setBusy(s.studyId);
    try {
      const { study } = await api.study(s.studyId);
      lib.updateStudyMetadata(s.studyId, study);
      toast('Metadata re-checked against the scholarly sources');
    } catch {
      toast('Could not reach the scholarly sources. Your saved record is unchanged.');
    } finally {
      setBusy(null);
    }
  };

  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: 'studies', label: 'Studies', n: lib.data.studies.length },
    { id: 'topics', label: 'Topics', n: lib.data.topics.length },
    { id: 'searches', label: 'Searches', n: lib.data.queries.length },
  ];
  const isEmpty = lib.count === 0;

  return (
    <div className="page">
      <header className="pagehead">
        <h1>Saved research</h1>
        <p className="muted">Your personal library. Items are stored in this browser only (local storage) and hold verified metadata, not AI-generated text. Accounts and cloud sync are not available yet.</p>
      </header>
      {lib.persistFailed && <Callout tone="warn" title="Your browser blocked saving">Saved items will be lost when you close this tab. Check that site data or private browsing is not restricted.</Callout>}

      {isEmpty ? (
        <EmptyState title="Your research library is empty." action={<Link to={ROUTES.app} className="btn btn--primary">Find studies to save</Link>}>
          <p>Save a study, topic or search to build your personal research collection. Use the Save button on any result.</p>
        </EmptyState>
      ) : (
        <>
          <div role="tablist" aria-label="Saved items" className="tabs">
            {tabs.map((t) => (
              <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} className="tabs__tab" onClick={() => setTab(t.id)}
                onKeyDown={(e) => {
                  const i = tabs.findIndex((x) => x.id === tab);
                  const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
                  if (next < 0) return;
                  e.preventDefault();
                  setTab(tabs[next].id);
                  // Roving tabindex: focus must move with the selection or keyboard users get stranded.
                  document.getElementById(`tab-${tabs[next].id}`)?.focus();
                }}>
                {t.label} <span className="tabs__n">{t.n}</span>
              </button>
            ))}
          </div>

          {tab === 'studies' && (
            <div role="tabpanel" id="panel-studies" aria-labelledby="tab-studies" className="saved">
              <div className="saved__tools">
                <div className="chips chips--filters" role="group" aria-label="Collections">
                  {[{ id: 'all', name: 'All' }, { id: 'none', name: 'Uncategorised' }, ...lib.data.collections.map((c) => ({ id: c.id, name: c.name }))].map((c) => (
                    <button key={c.id} type="button" className="chip chip--btn" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>{c.name}</button>
                  ))}
                </div>
                <form onSubmit={addCollection} className="inline-form">
                  <label className="sr-only" htmlFor="new-col">New collection name</label>
                  <input id="new-col" className="input input--sm" placeholder="New collection" maxLength={60} value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <button type="submit" className="btn btn--sm" disabled={!newName.trim()}><FolderPlus size={15} aria-hidden="true" /> Add</button>
                </form>
                {filter !== 'all' && filter !== 'none' && (
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => setDelCollection(filter)}><Trash2 size={15} aria-hidden="true" /> Delete collection</button>
                )}
                <button type="button" className="btn btn--sm" disabled={!visible.length} onClick={() => setCite({ title: 'Export bibliography', studies: visible.map((v) => v.metadata as Study), query: filter === 'all' ? 'saved' : lib.data.collections.find((c) => c.id === filter)?.name })}>
                  <Download size={15} aria-hidden="true" /> Export bibliography
                </button>
              </div>

              {visible.length === 0 ? (
                <EmptyState title={lib.data.studies.length ? 'No saved studies in this collection.' : 'No saved studies yet.'}>
                  <p>{lib.data.studies.length ? 'Choose another collection, or add studies to this one from the “Collections” menu on a saved study.' : 'Save a study from your results and it will appear here with its verified metadata.'}</p>
                </EmptyState>
              ) : (
                <ol className="stack">
                  {visible.map((s, i) => (
                    <li key={s.studyId}>
                      <StudyCard
                        study={s.metadata as Study} index={i} compact onCite={(x) => setCite({ title: 'Cite this study', studies: [x] })}
                        extra={
                          <>
                            <details className="menu">
                              <summary className="btn">Collections{s.collectionIds.length ? ` (${s.collectionIds.length})` : ''}</summary>
                              <div className="menu__body">
                                {lib.data.collections.length === 0 ? <p className="small muted">Create a collection above first.</p> : lib.data.collections.map((c) => (
                                  <label key={c.id} className="check">
                                    <input type="checkbox" checked={s.collectionIds.includes(c.id)} onChange={(e) => lib.setStudyCollections(s.studyId, e.target.checked ? [...s.collectionIds, c.id] : s.collectionIds.filter((x) => x !== c.id))} />
                                    <span>{c.name}</span>
                                  </label>
                                ))}
                              </div>
                            </details>
                            <button type="button" className="btn" disabled={busy === s.studyId} onClick={() => reverify(s)}><RefreshCw size={16} aria-hidden="true" /> {busy === s.studyId ? 'Checking…' : 'Re-verify'}</button>
                            <button type="button" className="btn btn--ghost" onClick={() => { lib.removeStudy(s.studyId); toast('Removed from your library'); }}><X size={16} aria-hidden="true" /> Remove</button>
                          </>
                        }
                      />
                      <p className="small muted saved__when">Saved {timeAgo(s.savedAt)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {tab === 'topics' && (
            <div role="tabpanel" id="panel-topics" aria-labelledby="tab-topics">
              {lib.data.topics.length === 0 ? (
                <EmptyState title="No saved topics yet."><p>Save a topic from the topic overview or a related-topic card. Saved topics keep only the name; explore one to run a fresh search.</p></EmptyState>
              ) : (
                <ul className="list">
                  {lib.data.topics.map((t) => (
                    <li key={t.name} className="list__item">
                      <div><strong>{t.name}</strong><span className="small muted"> · saved {timeAgo(t.savedAt)}</span></div>
                      <div className="row">
                        <button type="button" className="btn btn--sm" onClick={() => explore(t.name)}><Compass size={15} aria-hidden="true" /> Explore</button>
                        <button type="button" className="btn btn--sm btn--ghost" onClick={() => lib.toggleTopic(t.name)} aria-label={`Remove saved topic ${t.name}`}><X size={15} aria-hidden="true" /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'searches' && (
            <div role="tabpanel" id="panel-searches" aria-labelledby="tab-searches">
              {lib.data.queries.length === 0 ? (
                <EmptyState title="No saved searches yet."><p>Use “Save search” on the Research page to keep a query you want to return to.</p></EmptyState>
              ) : (
                <ul className="list">
                  {lib.data.queries.map((q) => (
                    <li key={q.text} className="list__item">
                      <div><strong>{excerpt(q.text, 140)}</strong><span className="small muted"> · saved {timeAgo(q.savedAt)}</span></div>
                      <div className="row">
                        <button type="button" className="btn btn--sm" onClick={() => explore(q.text)}>Search again</button>
                        <button type="button" className="btn btn--sm btn--ghost" onClick={() => lib.toggleQuery(q.text)} aria-label={`Remove saved search ${excerpt(q.text, 40)}`}><X size={15} aria-hidden="true" /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      <CiteDialog target={cite} onClose={() => setCite(null)} />
      <Dialog open={!!delCollection} onClose={() => setDelCollection(null)} title="Delete this collection?">
        <p>The collection “{lib.data.collections.find((c) => c.id === delCollection)?.name}” will be removed. The studies inside it stay in your library.</p>
        <div className="row mt14">
          <button type="button" className="btn btn--danger" onClick={() => { if (delCollection) lib.deleteCollection(delCollection); setDelCollection(null); setFilter('all'); toast('Collection deleted'); }}>Delete collection</button>
          <button type="button" className="btn" onClick={() => setDelCollection(null)}>Cancel</button>
        </div>
      </Dialog>
    </div>
  );
}
