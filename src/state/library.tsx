import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Study } from '../../shared/types';
import { readJson, removeKey, writeJson } from '../lib/storage';

/**
 * FUTURE(auth): `LibraryStore` is the persistence boundary. Today it is backed by localStorage.
 * With accounts, implement the same interface against the API (saved studies, topics, searches,
 * collections, notes, tags) and swap it in `LibraryProvider` — the UI does not change.
 * Saved items hold *verified metadata only*; AI-generated text is never stored as study data.
 */
export type StoredStudy = Omit<Study, 'abstract' | 'keywords'> & { abstract: null; keywords: string[] };
export interface SavedStudy { studyId: string; savedAt: string; metadata: StoredStudy; collectionIds: string[] }
export interface SavedTopic { name: string; savedAt: string }
export interface SavedQuery { text: string; savedAt: string }
export interface Collection { id: string; name: string; createdAt: string }
export interface LibraryData { version: 1; studies: SavedStudy[]; topics: SavedTopic[]; queries: SavedQuery[]; collections: Collection[] }

const KEY = 'relata:library:v1';
const EMPTY: LibraryData = { version: 1, studies: [], topics: [], queries: [], collections: [] };

export interface LibraryStore {
  load(): LibraryData;
  save(data: LibraryData): boolean;
  clear(): void;
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => typeof v === 'string' && v.length > 0;

/** Keeps only well-formed entries so one bad record cannot crash the Saved page or the nav badge. */
export function sanitizeLibrary(raw: Partial<Record<keyof LibraryData, unknown>>): LibraryData {
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const seen = new Set<string>();
  const studies = list(raw.studies).filter((s): s is SavedStudy => {
    if (!isObj(s) || !str(s.studyId) || seen.has(s.studyId as string) || !isObj(s.metadata)) return false;
    const m = s.metadata;
    if (!str(m.title) || !Array.isArray(m.authors) || !Array.isArray(m.sources) || !isObj(m.verification) || !isObj(m.openAccess)) return false;
    seen.add(s.studyId as string);
    return true;
  }).map((s) => ({ ...s, savedAt: str(s.savedAt) ? s.savedAt : new Date(0).toISOString(), collectionIds: Array.isArray(s.collectionIds) ? s.collectionIds.filter(str) : [] }));
  const topics = list(raw.topics).filter((t): t is SavedTopic => isObj(t) && str(t.name));
  const queries = list(raw.queries).filter((q): q is SavedQuery => isObj(q) && str(q.text));
  const collections = list(raw.collections).filter((c): c is Collection => isObj(c) && str(c.id) && str(c.name));
  return { version: 1, studies, topics, queries, collections };
}

export const localLibraryStore: LibraryStore = {
  load: () => sanitizeLibrary(readJson<LibraryData>(KEY, EMPTY)),
  save: (d) => writeJson(KEY, d),
  clear: () => removeKey(KEY),
};

interface Value {
  data: LibraryData;
  persistFailed: boolean;
  isStudySaved(id: string): boolean;
  toggleStudy(study: Study): boolean;
  updateStudyMetadata(id: string, study: Study): void;
  removeStudy(id: string): void;
  setStudyCollections(id: string, collectionIds: string[]): void;
  isTopicSaved(name: string): boolean;
  toggleTopic(name: string): boolean;
  isQuerySaved(text: string): boolean;
  toggleQuery(text: string): boolean;
  createCollection(name: string): string;
  renameCollection(id: string, name: string): void;
  deleteCollection(id: string): void;
  clearAll(): void;
  count: number;
}
const Ctx = createContext<Value | null>(null);
const norm = (s: string) => s.trim().toLowerCase();

export function LibraryProvider({ children, store = localLibraryStore }: { children: ReactNode; store?: LibraryStore }) {
  const [data, setData] = useState<LibraryData>(() => store.load());
  const [persistFailed, setPersistFailed] = useState(false);
  const ref = useRef(data);
  ref.current = data;

  const commit = useCallback(
    (fn: (d: LibraryData) => LibraryData) => {
      const next = fn(ref.current);
      ref.current = next;
      setData(next);
      setPersistFailed(!store.save(next));
    },
    [store],
  );

  // Keep multiple tabs in sync.
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key === KEY) setData(store.load());
    };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, [store]);

  const value = useMemo<Value>(() => ({
    data,
    persistFailed,
    count: data.studies.length + data.topics.length + data.queries.length,
    isStudySaved: (id) => data.studies.some((s) => s.studyId === id),
    toggleStudy: (study) => {
      const exists = ref.current.studies.some((s) => s.studyId === study.id);
      commit((d) =>
        exists
          ? { ...d, studies: d.studies.filter((s) => s.studyId !== study.id) }
          : { ...d, studies: [{ studyId: study.id, savedAt: new Date().toISOString(), metadata: { ...study, abstract: null }, collectionIds: [] }, ...d.studies] },
      );
      return !exists;
    },
    updateStudyMetadata: (id, study) =>
      commit((d) => ({ ...d, studies: d.studies.map((s) => (s.studyId === id ? { ...s, metadata: { ...study, abstract: null } } : s)) })),
    removeStudy: (id) => commit((d) => ({ ...d, studies: d.studies.filter((s) => s.studyId !== id) })),
    setStudyCollections: (id, collectionIds) => commit((d) => ({ ...d, studies: d.studies.map((s) => (s.studyId === id ? { ...s, collectionIds } : s)) })),
    isTopicSaved: (name) => data.topics.some((t) => norm(t.name) === norm(name)),
    toggleTopic: (name) => {
      const exists = ref.current.topics.some((t) => norm(t.name) === norm(name));
      commit((d) => ({ ...d, topics: exists ? d.topics.filter((t) => norm(t.name) !== norm(name)) : [{ name, savedAt: new Date().toISOString() }, ...d.topics] }));
      return !exists;
    },
    isQuerySaved: (text) => data.queries.some((q) => norm(q.text) === norm(text)),
    toggleQuery: (text) => {
      const exists = ref.current.queries.some((q) => norm(q.text) === norm(text));
      commit((d) => ({ ...d, queries: exists ? d.queries.filter((q) => norm(q.text) !== norm(text)) : [{ text, savedAt: new Date().toISOString() }, ...d.queries] }));
      return !exists;
    },
    createCollection: (name) => {
      const id = 'c_' + Math.random().toString(36).slice(2, 10);
      commit((d) => ({ ...d, collections: [...d.collections, { id, name: name.trim().slice(0, 60), createdAt: new Date().toISOString() }] }));
      return id;
    },
    renameCollection: (id, name) => commit((d) => ({ ...d, collections: d.collections.map((c) => (c.id === id ? { ...c, name: name.trim().slice(0, 60) } : c)) })),
    deleteCollection: (id) =>
      commit((d) => ({ ...d, collections: d.collections.filter((c) => c.id !== id), studies: d.studies.map((s) => ({ ...s, collectionIds: s.collectionIds.filter((x) => x !== id) })) })),
    clearAll: () => {
      store.clear();
      ref.current = EMPTY;
      setData(EMPTY);
      setPersistFailed(false);
    },
  }), [data, persistFailed, commit, store]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLibrary(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error('LibraryProvider missing');
  return v;
}
