import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AIInfo, AnalyzeResponse, SearchFilters, SearchResponse, Study, StudyInsight } from '../../shared/types';
import { reconcileFilters } from '../../shared/capabilities';
import { searchConcepts } from '../../shared/search';
import { api, ApiError, isAbort } from '../lib/api';
import { useSettings } from './settings';

export type Phase = 'idle' | 'analyzing' | 'searching' | 'done' | 'error';
export type InsightState = StudyInsight | 'loading' | 'unavailable';

export interface Session {
  phase: Phase;
  input: string;
  origin: 'text' | 'document';
  docName: string | null;
  useAI: boolean;
  error: { code: string; message: string } | null;
  analysis: AnalyzeResponse | null;
  filters: SearchFilters;
  results: SearchResponse | null;
  studies: Study[];
  refreshing: boolean;
  loadingMore: boolean;
  loadMoreError: string | null;
  insights: Record<string, InsightState>;
  insightsNote: AIInfo | null;
  topicCounts: Record<string, number | null>;
  topicCountsState: 'idle' | 'loading' | 'done' | 'unavailable';
}

interface Value {
  session: Session;
  start: (text: string, opts?: { origin?: 'text' | 'document'; docName?: string | null; useAI?: boolean }) => void;
  setFilters: (patch: Partial<SearchFilters>) => void;
  loadMore: () => void;
  retry: () => void;
  reset: () => void;
  /** True when AI-generated per-study notes are expected for this session. */
  insightsExpected: boolean;
}

const Ctx = createContext<Value | null>(null);

const INSIGHT_CHUNK = 10;

function initial(filters: SearchFilters): Session {
  return {
    phase: 'idle', input: '', origin: 'text', docName: null, useAI: true, error: null, analysis: null, filters, results: null, studies: [],
    refreshing: false, loadingMore: false, loadMoreError: null, insights: {}, insightsNote: null, topicCounts: {}, topicCountsState: 'idle',
  };
}

export function topicTextFor(s: Pick<Session, 'input' | 'analysis'>): string {
  if (s.input.length <= 300) return s.input;
  return s.analysis?.analysis?.mainTopic ?? s.analysis?.plan.primaryQuery ?? s.input.slice(0, 300);
}

/**
 * Drops the "loading" placeholders. When a request is aborted (filters changed, search retried)
 * its studies would otherwise stay marked as loading forever and never be summarised again.
 */
const withoutLoading = (insights: Record<string, InsightState>): Record<string, InsightState> =>
  Object.fromEntries(Object.entries(insights).filter(([, v]) => v !== 'loading'));

const errMessage = (e: unknown) =>
  e instanceof ApiError ? { code: e.code, message: e.message } : { code: 'UNKNOWN', message: 'Something went wrong. Please try again.' };

export function ResearchProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const defaultFilters = useMemo<SearchFilters>(
    () => ({ yearsBack: settings.yearsBack, sources: ['openalex'], openAccessOnly: false, type: 'any', sort: 'relevance' }),
    [settings.yearsBack],
  );
  const [session, setSession] = useState<Session>(() => initial(defaultFilters));
  const ref = useRef(session);
  ref.current = session;
  const run = useRef(0);
  const ctrl = useRef<AbortController | null>(null);
  const filterTimer = useRef<number | undefined>(undefined);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const patch = useCallback((p: Partial<Session> | ((s: Session) => Partial<Session>)) => {
    setSession((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) }));
  }, []);

  const loadInsights = useCallback(async (studies: Study[], runId: number, signal: AbortSignal) => {
    const s0 = ref.current;
    if (!s0.useAI || s0.analysis?.ai.status !== 'ok') return;
    const todo = studies.filter((st) => !ref.current.insights[st.id]);
    if (!todo.length) return;
    patch((s) => ({ insights: { ...s.insights, ...Object.fromEntries(todo.map((t) => [t.id, 'loading' as const])) } }));
    const topic = topicTextFor(s0);
    const chunks: Study[][] = [];
    for (let i = 0; i < todo.length; i += INSIGHT_CHUNK) chunks.push(todo.slice(i, i + INSIGHT_CHUNK));
    const worker = async () => {
      while (chunks.length) {
        const chunk = chunks.shift()!;
        try {
          const out = await api.summarize({ ids: chunk.map((c) => c.id), topic, provider: settingsRef.current.aiProvider }, signal);
          if (run.current !== runId) return;
          patch((s) => ({
            insights: { ...s.insights, ...Object.fromEntries(chunk.map((c) => [c.id, out.insights[c.id] ?? ('unavailable' as const)])) },
            insightsNote: out.ai.status === 'ok' ? s.insightsNote : out.ai,
          }));
        } catch (e) {
          if (isAbort(e) || run.current !== runId) return;
          patch((s) => ({
            insights: { ...s.insights, ...Object.fromEntries(chunk.map((c) => [c.id, 'unavailable' as const])) },
            insightsNote: { status: 'unavailable', message: 'AI analysis is temporarily unavailable. Verified research results are still available.' },
          }));
        }
      }
    };
    await Promise.all([worker(), worker()]);
  }, [patch]);

  const loadTopicCounts = useCallback(async (analysis: AnalyzeResponse, yearsBack: number, runId: number, signal: AbortSignal) => {
    const names = analysis.analysis?.relatedTopics.map((t) => t.name).slice(0, 8) ?? [];
    if (!names.length) return;
    patch({ topicCountsState: 'loading' });
    try {
      const out = await api.topicCounts({ names, yearsBack }, signal);
      if (run.current !== runId) return;
      patch({
        topicCounts: Object.fromEntries(out.counts.map((c) => [c.name.toLowerCase(), c.works])),
        topicCountsState: out.available ? 'done' : 'unavailable',
      });
    } catch (e) {
      if (!isAbort(e) && run.current === runId) patch({ topicCountsState: 'unavailable' });
    }
  }, [patch]);

  const doSearch = useCallback(async (analysis: AnalyzeResponse, filters: SearchFilters, page: number, runId: number, signal: AbortSignal) => {
    const res = await api.search(
      { query: analysis.plan.primaryQuery, expandedQueries: analysis.plan.expandedQueries, concepts: searchConcepts(analysis), filters, page, perPage: settingsRef.current.perPage },
      signal,
    );
    if (run.current !== runId) return null;
    patch((s) => {
      const merged = page === 1 ? res.studies : [...s.studies, ...res.studies.filter((n) => !s.studies.some((o) => o.id === n.id))];
      return { phase: 'done', results: res, studies: merged, refreshing: false, loadingMore: false, loadMoreError: null, error: null };
    });
    void loadInsights(res.studies, runId, signal);
    return res;
  }, [patch, loadInsights]);

  const start = useCallback<Value['start']>((text, opts) => {
    const input = text.trim();
    if (!input) return;
    window.clearTimeout(filterTimer.current);
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    const runId = ++run.current;
    const useAI = opts?.useAI ?? true;
    const filters = reconcileFilters({ ...ref.current.filters, yearsBack: settingsRef.current.yearsBack });
    const next = { ...initial(filters), phase: 'analyzing' as Phase, input, origin: opts?.origin ?? 'text', docName: opts?.docName ?? null, useAI };
    ref.current = next;
    setSession(next);
    (async () => {
      try {
        const analysis = await api.analyze(
          { text: input.slice(0, 12000), origin: next.origin, useAI, provider: settingsRef.current.aiProvider },
          c.signal,
        );
        if (run.current !== runId) return;
        patch({ analysis, phase: 'searching' });
        ref.current = { ...ref.current, analysis };
        // Filters may have been changed while the topic was being analysed; search with the current ones.
        const latest = ref.current.filters;
        void loadTopicCounts(analysis, latest.yearsBack, runId, c.signal);
        await doSearch(analysis, latest, 1, runId, c.signal);
      } catch (e) {
        if (isAbort(e) || run.current !== runId) return;
        patch({ phase: 'error', error: errMessage(e), refreshing: false });
      }
    })();
  }, [patch, doSearch, loadTopicCounts]);

  const refresh = useCallback((filters: SearchFilters, yearsChanged: boolean) => {
    const a = ref.current.analysis;
    if (!a) return;
    window.clearTimeout(filterTimer.current);
    filterTimer.current = window.setTimeout(() => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      const runId = ++run.current;
      patch((s) => ({ refreshing: true, loadMoreError: null, error: null, loadingMore: false, insights: withoutLoading(s.insights) }));
      if (yearsChanged) void loadTopicCounts(a, filters.yearsBack, runId, c.signal);
      doSearch(a, filters, 1, runId, c.signal).catch((e) => {
        if (isAbort(e) || run.current !== runId) return;
        patch({ phase: 'error', error: errMessage(e), refreshing: false });
      });
    }, 250);
  }, [patch, doSearch, loadTopicCounts]);

  const setFilters = useCallback<Value['setFilters']>((p) => {
    const prev = ref.current.filters;
    const filters = reconcileFilters({ ...prev, ...p });
    ref.current = { ...ref.current, filters };
    patch({ filters });
    if (ref.current.analysis) refresh(filters, filters.yearsBack !== prev.yearsBack);
  }, [patch, refresh]);

  const loadMore = useCallback(() => {
    const s = ref.current;
    if (!s.analysis || !s.results || s.loadingMore) return;
    const runId = run.current;
    const c = ctrl.current ?? new AbortController();
    ctrl.current = c;
    patch({ loadingMore: true, loadMoreError: null });
    doSearch(s.analysis, s.filters, s.results.page + 1, runId, c.signal)
      .then((res) => {
        // The run was replaced (filters changed): the newer run owns the loading flags now.
        if (res === null && run.current === runId) patch({ loadingMore: false });
      })
      .catch((e) => {
        if (isAbort(e) || run.current !== runId) return;
        patch({ loadingMore: false, loadMoreError: errMessage(e).message });
      });
  }, [patch, doSearch]);

  const retry = useCallback(() => {
    const s = ref.current;
    if (s.analysis) {
      window.clearTimeout(filterTimer.current);
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      const runId = ++run.current;
      patch((s) => ({ phase: 'searching', error: null, refreshing: false, loadingMore: false, insights: withoutLoading(s.insights) }));
      doSearch(s.analysis, s.filters, 1, runId, c.signal).catch((e) => {
        if (isAbort(e) || run.current !== runId) return;
        patch({ phase: 'error', error: errMessage(e) });
      });
    } else if (s.input) start(s.input, { origin: s.origin, docName: s.docName, useAI: s.useAI });
  }, [patch, doSearch, start]);

  const reset = useCallback(() => {
    run.current++;
    ctrl.current?.abort();
    window.clearTimeout(filterTimer.current);
    setSession(initial(reconcileFilters({ ...defaultFilters })));
  }, [defaultFilters]);

  useEffect(() => () => ctrl.current?.abort(), []);

  const insightsExpected = session.useAI && session.analysis?.ai.status === 'ok';
  const value = useMemo(() => ({ session, start, setFilters, loadMore, retry, reset, insightsExpected: !!insightsExpected }), [session, start, setFilters, loadMore, retry, reset, insightsExpected]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useResearch(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error('ResearchProvider missing');
  return v;
}
