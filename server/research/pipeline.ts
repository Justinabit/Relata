import { createHash, randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { TtlCache } from '../lib/cache.js';
import { AppError, UpstreamError } from '../lib/errors.js';
import { normalizeTitle, stem } from '../lib/text.js';
import { computeWindow } from '../../shared/window.js';
import { reconcileFilters } from '../../shared/capabilities.js';
import type { Notice, SearchFilters, SearchResponse, SourceId, SourceReport, Study } from '../../shared/types.js';
import { lookupOpenAlexByDois, searchOpenAlex } from './openalex.js';
import { lookupCrossrefByDois, searchCrossref } from './crossref.js';
import { dedupe, type Ranked } from './dedupe.js';
import { reconcile } from './reconcile.js';
import { REJECTION, sortableDate, validateStudy } from './validate.js';
import { aggregate, analyzeGaps } from './aggregate.js';
import { rememberStudies } from './store.js';

export interface SearchParams {
  query: string;
  expandedQueries: string[];
  concepts: string[];
  filters: SearchFilters;
  page: number;
  perPage: number;
}

const resultCache = new TtlCache<SearchResponse>(150, config.retention.searchCacheSeconds * 1000);
const RRF_K = 20;

function describe(err: unknown, service: string): string {
  if (err instanceof UpstreamError) {
    if (err.kind === 'rate_limited') {
      const hint = service === 'OpenAlex' && !config.openalex.apiKey ? ' No OpenAlex API key is configured on this server, so the shared keyless budget applies.' : '';
      return `${service} request budget or rate limit reached.${hint}`;
    }
    if (err.kind === 'timeout') return `${service} did not respond in time.`;
    return `${service} is unavailable (${err.status ? 'HTTP ' + err.status : err.kind}).`;
  }
  return `${service} is unavailable.`;
}

function queryCoverage(study: Study, queries: string[]): number {
  const hay = new Set(normalizeTitle([study.title, study.abstract ?? '', study.journal ?? ''].join(' ')).split(' ').map(stem));
  let best = 0;
  for (const q of queries) {
    const terms = [...new Set(normalizeTitle(q).split(' ').filter((t) => t.length > 2).map(stem))];
    if (!terms.length) continue;
    best = Math.max(best, terms.filter((t) => hay.has(t)).length / terms.length);
  }
  return best;
}

type ListResult = { source: SourceId; studies: Study[]; total: number } | { source: SourceId; error: unknown };

export async function runSearch(params: SearchParams, signal?: AbortSignal): Promise<SearchResponse> {
  const filters = reconcileFilters(params.filters);
  const window = computeWindow(filters.yearsBack);
  const seen = new Set<string>();
  const queries = [params.query, ...params.expandedQueries]
    .map((q) => q.replace(/\s+/g, ' ').trim())
    .filter((q) => {
      const k = normalizeTitle(q);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 3);
  if (!queries.length) throw new AppError(400, 'EMPTY_QUERY', 'Enter a topic or question to search.');

  const cacheKey = createHash('sha256').update(JSON.stringify({ queries, filters, page: params.page, perPage: params.perPage, c: params.concepts })).digest('hex');
  const hit = resultCache.get(cacheKey);
  if (hit) {
    // Keep the verified-study store alive for as long as the cached page can be shown, so the AI
    // summary endpoint can still find these records by id.
    rememberStudies(hit.value.studies);
    return { ...hit.value, cache: { metadata: 'cached', cachedAt: new Date(hit.storedAt).toISOString() } };
  }

  const depth = params.page * params.perPage;
  const notices: Notice[] = [];
  const reports: SourceReport[] = [];
  const rejected: Record<string, number> = {};
  const reject = (reason: string) => (rejected[reason] = (rejected[reason] ?? 0) + 1);
  if (window.outsideDefault) {
    notices.push({ level: 'info', code: 'OUTSIDE_WINDOW', message: 'Outside the default 10-year research window. Older studies are included because you widened the window.' });
  }
  if (depth - params.perPage >= config.limits.maxDepthPerQuery) {
    return emptyResponse(params, queries, filters, window, [{ level: 'info', code: 'DEPTH_LIMIT', message: 'No further results are loaded for this search. Refine your keywords instead.' }]);
  }
  const limit = Math.min(depth, config.limits.maxDepthPerQuery);

  // ---------- 1. discovery ----------
  const wantOA = filters.sources.includes('openalex');
  const wantCR = filters.sources.includes('crossref');
  const runDiscovery = (source: SourceId): Promise<ListResult>[] =>
    queries.map(async (q): Promise<ListResult> => {
      try {
        if (source === 'openalex') {
          const r = await searchOpenAlex({ query: q, fromYear: window.fromYear, toYear: window.toYear, openAccessOnly: filters.openAccessOnly, type: filters.type, sort: filters.sort, limit, signal });
          return { source, ...r };
        }
        const r = await searchCrossref({ query: q, fromYear: window.fromYear, toYear: window.toYear, type: filters.type, limit, signal });
        return { source, ...r };
      } catch (error) {
        return { source, error };
      }
    });

  const lists: ListResult[] = [];
  if (wantOA) lists.push(...(await Promise.all(runDiscovery('openalex'))));
  if (wantCR) lists.push(...(await Promise.all(runDiscovery('crossref'))));
  if (signal?.aborted) throw new AppError(499, 'CANCELLED', 'Request cancelled.');

  const okLists = (s: SourceId) => lists.filter((l): l is Extract<ListResult, { studies: Study[] }> => l.source === s && 'studies' in l);
  const firstError = (s: SourceId) => lists.find((l): l is Extract<ListResult, { error: unknown }> => l.source === s && 'error' in l)?.error;

  let openalexFailed = false;
  for (const s of ['openalex', 'crossref'] as SourceId[]) {
    if (!(s === 'openalex' ? wantOA : wantCR)) continue;
    const ok = okLists(s);
    const name = s === 'openalex' ? 'OpenAlex' : 'Crossref';
    if (ok.length) {
      reports.push({ id: s, role: 'discovery', status: 'ok', resultCount: ok.reduce((n, l) => n + l.studies.length, 0), totalMatches: Math.max(...ok.map((l) => l.total)) });
      const failedQueries = lists.filter((l) => l.source === s && 'error' in l).length;
      if (failedQueries > 0) {
        // Some of the expanded searches failed: say so instead of presenting a thinner result as complete.
        notices.push({
          level: 'warning',
          code: `PARTIAL_${s.toUpperCase()}`,
          message: `${failedQueries} of ${failedQueries + ok.length} ${name} searches failed, so these results may be less complete than usual. Try again in a moment.`,
        });
      }
    } else {
      if (s === 'openalex') openalexFailed = true;
      reports.push({ id: s, role: 'discovery', status: 'error', message: describe(firstError(s), name) });
    }
  }

  // Automatic fallback to another *real* scholarly index — never to invented data.
  if (openalexFailed && !wantCR) {
    const crossrefCanHelp = !filters.openAccessOnly && filters.type !== 'review';
    if (crossrefCanHelp) {
      const fb = await Promise.all(runDiscovery('crossref'));
      lists.push(...fb);
      const ok = okLists('crossref');
      if (ok.length) {
        reports.push({ id: 'crossref', role: 'discovery', status: 'ok', resultCount: ok.reduce((n, l) => n + l.studies.length, 0), totalMatches: Math.max(...ok.map((l) => l.total)) });
        notices.push({
          level: 'warning',
          code: 'OPENALEX_FALLBACK',
          message: 'OpenAlex was unavailable, so these results come from Crossref only. Crossref matches mainly on titles and bibliographic fields, so coverage and topic data are narrower.',
        });
      } else {
        reports.push({ id: 'crossref', role: 'discovery', status: 'error', message: describe(firstError('crossref'), 'Crossref') });
      }
    }
  }

  const anyOk = lists.some((l) => 'studies' in l);
  if (!anyOk) {
    throw new AppError(503, 'RESEARCH_UNAVAILABLE', 'Research services are temporarily unavailable. Please try again later.');
  }

  // ---------- 2. rank-fuse + term-overlap check for Crossref ----------
  const ranked: Ranked[] = [];
  let retrieved = 0;
  for (const l of lists) {
    if (!('studies' in l)) continue;
    retrieved += l.studies.length;
    l.studies.forEach((study, i) => {
      if (l.source === 'crossref' && queryCoverage(study, queries) < 0.5) {
        reject(REJECTION.overlap);
        return;
      }
      ranked.push({ study: { ...study }, score: 1 / (RRF_K + i) });
    });
  }

  // ---------- 3. de-duplicate ----------
  const dedupeResult = dedupe(ranked);
  const removed = dedupeResult.removed;
  // Records that can already be seen to be invalid (no title, impossible/malformed/out-of-window date)
  // are dropped before spending any verification requests on them.
  const unique = dedupeResult.unique.filter((r) => {
    const reason = validateStudy(r.study, window);
    if (reason) reject(reason);
    return !reason;
  });

  // ---------- 4. verify / enrich ----------
  const verification = { checked: 0, verified: 0, notFound: 0, failed: 0 };
  const toVerify = unique.filter((r) => r.study.doi && r.study.sources.includes('openalex') && !r.study.sources.includes('crossref'));
  if (toVerify.length) {
    const { records, failed } = await lookupCrossrefByDois(toVerify.map((r) => r.study.doi!), signal);
    for (const r of toVerify) {
      const doi = r.study.doi!;
      verification.checked++;
      if (failed.has(doi)) {
        verification.failed++;
        r.study = { ...r.study, verification: { ...r.study.verification, doi: 'unchecked' } };
        continue;
      }
      const cr = records.get(doi);
      if (cr) {
        verification.verified++;
        r.study = reconcile(r.study, cr);
      } else {
        verification.notFound++;
        r.study = { ...r.study, verification: { ...r.study.verification, doi: 'not-in-crossref' } };
      }
    }
    reports.push({
      id: 'crossref',
      role: 'verification',
      status: verification.failed === verification.checked ? 'error' : 'ok',
      message: verification.failed ? `${verification.failed} DOI(s) could not be checked.` : undefined,
      resultCount: verification.verified,
    });
    if (verification.failed) notices.push({ level: 'warning', code: 'CROSSREF_PARTIAL', message: 'Crossref could not verify some DOIs. Those records are marked as unchecked.' });
  }

  const toEnrich = unique.filter((r) => r.study.doi && r.study.sources.includes('crossref') && !r.study.sources.includes('openalex'));
  if (toEnrich.length && !openalexFailed) {
    try {
      const found = await lookupOpenAlexByDois(toEnrich.map((r) => r.study.doi!), signal);
      let n = 0;
      for (const r of toEnrich) {
        const oa = found.get(r.study.doi!);
        if (!oa) continue;
        n++;
        const discoveredBy = r.study.source;
        r.study = { ...reconcile({ ...oa, matchedQueries: r.study.matchedQueries }, r.study), source: discoveredBy };
      }
      reports.push({ id: 'openalex', role: 'enrichment', status: 'ok', resultCount: n });
    } catch (err) {
      reports.push({ id: 'openalex', role: 'enrichment', status: 'error', message: describe(err, 'OpenAlex') });
    }
  } else if (toEnrich.length) {
    reports.push({ id: 'openalex', role: 'enrichment', status: 'skipped', message: 'OpenAlex was unavailable, so topics, open-access status and citation counts could not be added.' });
  }

  // ---------- 5. validate (dates, type, open access) ----------
  const eligible: Ranked[] = [];
  for (const r of unique) {
    const reason = validateStudy(r.study, window);
    if (reason) {
      reject(reason);
      continue;
    }
    if (filters.type !== 'any' && r.study.type !== filters.type) {
      reject(REJECTION.type);
      continue;
    }
    if (filters.type === 'any' && r.study.type === 'dataset') {
      reject(REJECTION.type);
      continue;
    }
    if (filters.openAccessOnly && r.study.openAccess.isOa !== true) {
      reject('Not marked open access by the source');
      continue;
    }
    eligible.push(r);
  }

  // ---------- 6. sort ----------
  const cmpYear = (a: Ranked, b: Ranked) => b.study.publicationYear - a.study.publicationYear;
  eligible.sort((a, b) => {
    switch (filters.sort) {
      case 'newest': return sortableDate(b.study).localeCompare(sortableDate(a.study)) || b.score - a.score;
      case 'oldest': return sortableDate(a.study).localeCompare(sortableDate(b.study)) || b.score - a.score;
      case 'cited': return (b.study.citationCount ?? -1) - (a.study.citationCount ?? -1) || b.score - a.score;
      default: return b.score - a.score || cmpYear(a, b);
    }
  });

  const pool = eligible.map((r) => r.study);
  const start = (params.page - 1) * params.perPage;
  const pageStudies = pool.slice(start, start + params.perPage);
  rememberStudies(pool);

  const maxTotal = Math.max(0, ...reports.filter((r) => r.role === 'discovery' && r.status === 'ok').map((r) => r.totalMatches ?? 0));
  const hasMore = pool.length > start + params.perPage || (limit < config.limits.maxDepthPerQuery && maxTotal > limit && pageStudies.length > 0);

  const response: SearchResponse = {
    searchId: randomUUID(),
    query: queries[0],
    expandedQueries: queries.slice(1),
    filters,
    window,
    studies: pageStudies,
    page: params.page,
    perPage: params.perPage,
    hasMore,
    counts: {
      retrieved,
      duplicatesRemoved: removed,
      rejected,
      eligible: pool.length,
      displayed: pageStudies.length,
    },
    sources: reports,
    crossrefVerification: verification,
    aggregates: aggregate(pool),
    gaps: analyzeGaps(pool, params.concepts),
    notices,
    cache: { metadata: 'live', cachedAt: null },
    generatedAt: new Date().toISOString(),
  };

  // Never cache a degraded result: a retry should be allowed to reach the source again.
  const degraded = reports.some((r) => r.status === 'error') || notices.some((n) => n.level === 'warning');
  if (!degraded) resultCache.set(cacheKey, response);
  return response;
}

function emptyResponse(params: SearchParams, queries: string[], filters: SearchFilters, window: ReturnType<typeof computeWindow>, notices: Notice[]): SearchResponse {
  return {
    searchId: randomUUID(),
    query: queries[0],
    expandedQueries: queries.slice(1),
    filters,
    window,
    studies: [],
    page: params.page,
    perPage: params.perPage,
    hasMore: false,
    counts: { retrieved: 0, duplicatesRemoved: 0, rejected: {}, eligible: 0, displayed: 0 },
    sources: [],
    crossrefVerification: { checked: 0, verified: 0, notFound: 0, failed: 0 },
    aggregates: { themes: [], authors: [], types: [], openAccessCount: 0, withAbstractCount: 0 },
    gaps: { available: false, poolSize: 0, withAbstract: 0, signals: [], disclaimer: '' },
    notices,
    cache: { metadata: 'live', cachedAt: null },
    generatedAt: new Date().toISOString(),
  };
}
