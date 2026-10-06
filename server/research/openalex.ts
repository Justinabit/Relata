import { config } from '../config.js';
import { fetchJson } from '../lib/http.js';
import { TtlCache } from '../lib/cache.js';
import { stripTags, truncate } from '../lib/text.js';
import { UpstreamError } from '../lib/errors.js';
import type { Author, SortKey, Study, StudyType, TypeFilter } from '../../shared/types.js';
import { doiToUrl, normalizeDoi, openalexShortId, pmidFromUrl, safeExternalUrl } from './ids.js';

const SELECT = [
  'id', 'doi', 'title', 'display_name', 'publication_year', 'publication_date', 'type', 'type_crossref',
  'cited_by_count', 'is_retracted', 'open_access', 'primary_location', 'best_oa_location', 'authorships',
  'topics', 'keywords', 'abstract_inverted_index', 'ids',
].join(',');

const MAX_AUTHORS = 25;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

const responseCache = new TtlCache<unknown>(400, config.retention.searchCacheSeconds * 1000);

async function oaGet<T>(path: string, params: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<T> {
  const url = new URL(path, config.openalex.baseUrl);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  const key = url.toString(); // the API key travels in a header, so it never appears in cache keys or URLs
  const { value } = await responseCache.getOrLoad(key, () =>
    fetchJson<unknown>(key, {
      service: 'OpenAlex',
      timeoutMs: config.openalex.timeoutMs,
      signal,
      headers: config.openalex.apiKey ? { authorization: `Bearer ${config.openalex.apiKey}` } : undefined,
    }),
  );
  return value as T;
}

function reconstructAbstract(inv: unknown): string | null {
  if (!inv || typeof inv !== 'object') return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(inv as Record<string, unknown>)) {
    if (!Array.isArray(positions)) continue;
    for (const p of positions) if (typeof p === 'number' && p >= 0 && p < 20000) words[p] = word;
  }
  const text = words.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return text ? truncate(stripTags(text), 6000) : null;
}

function mapType(w: Raw): { type: StudyType; raw: string | null } {
  const raw = typeof w.type === 'string' ? w.type : null;
  if (w.type_crossref === 'proceedings-article') return { type: 'conference-paper', raw };
  switch (raw) {
    case 'article': return { type: 'article', raw };
    case 'review': return { type: 'review', raw };
    case 'preprint': return { type: 'preprint', raw };
    case 'dataset': return { type: 'dataset', raw };
    default: return { type: 'other', raw };
  }
}

export function normalizeOpenAlexWork(w: Raw, now = new Date()): Study | null {
  const openalexId = openalexShortId(w.id);
  const title = stripTags(String(w.title ?? w.display_name ?? '')).slice(0, 600);
  if (!openalexId || !title) return null;

  const doi = normalizeDoi(w.doi ?? w.ids?.doi);
  const authorships: Raw[] = Array.isArray(w.authorships) ? w.authorships : [];
  const authors: Author[] = authorships
    .slice(0, MAX_AUTHORS)
    .map((a) => ({
      name: stripTags(String(a?.author?.display_name ?? a?.raw_author_name ?? '')),
      id: typeof a?.author?.id === 'string' && a.author.id.startsWith('https://openalex.org/') ? a.author.id : undefined,
      orcid: typeof a?.author?.orcid === 'string' && a.author.orcid.startsWith('https://orcid.org/') ? a.author.orcid : undefined,
    }))
    .filter((a) => a.name);

  const primary: Raw = w.primary_location ?? {};
  const best: Raw = w.best_oa_location ?? {};
  const landing = safeExternalUrl(primary.landing_page_url) ?? safeExternalUrl(best.landing_page_url);
  const url = doi ? doiToUrl(doi) : landing;
  const oa: Raw = w.open_access ?? {};
  const oaUrl = safeExternalUrl(oa.oa_url) ?? safeExternalUrl(best.pdf_url) ?? safeExternalUrl(best.landing_page_url);
  const { type, raw } = mapType(w);
  const abstract = reconstructAbstract(w.abstract_inverted_index);
  const topics = (Array.isArray(w.topics) ? w.topics : [])
    .slice(0, 6)
    .map((t: Raw) => ({ id: openalexShortId(t?.id) ?? undefined, name: stripTags(String(t?.display_name ?? '')) }))
    .filter((t: { name: string }) => t.name);
  const keywords = (Array.isArray(w.keywords) ? w.keywords : [])
    .slice(0, 8)
    .map((k: Raw) => stripTags(String(k?.display_name ?? '')))
    .filter(Boolean);
  const venue = primary.source?.display_name ? stripTags(String(primary.source.display_name)).slice(0, 300) : null;
  const publisher = primary.source?.host_organization_name ? stripTags(String(primary.source.host_organization_name)).slice(0, 200) : null;
  const pubDate = typeof w.publication_date === 'string' ? w.publication_date : null;

  return {
    id: openalexId,
    title,
    authors,
    authorCount: authorships.length,
    publicationDate: pubDate,
    publicationYear: Number.isInteger(w.publication_year) ? w.publication_year : Number.NaN,
    journal: venue,
    publisher,
    doi,
    abstract,
    abstractSource: abstract ? 'openalex' : null,
    url,
    urlKind: doi ? 'doi' : landing ? 'source' : null,
    openAccess: {
      isOa: typeof oa.is_oa === 'boolean' ? oa.is_oa : null,
      status: typeof oa.oa_status === 'string' ? oa.oa_status : null,
      url: oaUrl,
    },
    citationCount: Number.isInteger(w.cited_by_count) ? w.cited_by_count : null,
    citationSource: Number.isInteger(w.cited_by_count) ? 'openalex' : null,
    source: 'openalex',
    sources: ['openalex'],
    sourceId: openalexId,
    openalexId,
    pmid: pmidFromUrl(w.ids?.pmid),
    topics,
    keywords,
    type,
    rawType: raw,
    isRetracted: w.is_retracted === true,
    verification: { doi: doi ? 'unchecked' : 'no-doi', verifiedBy: ['openalex'], conflicts: [] },
    matchedQueries: 1,
    retrievedAt: now.toISOString(),
  };
}

const TYPE_FILTERS: Record<TypeFilter, string | null> = {
  // "any" deliberately leaves out datasets, errata, editorials, peer-review records and supplementary files.
  any: 'type:article|review|preprint|book|book-chapter|dissertation|report',
  article: 'type:article',
  review: 'type:review',
  'conference-paper': 'type_crossref:proceedings-article',
  preprint: 'type:preprint',
  dataset: 'type:dataset',
  other: 'type:book|book-chapter|dissertation|report',
};

const SORTS: Record<SortKey, string> = {
  relevance: 'relevance_score:desc',
  newest: 'publication_date:desc',
  oldest: 'publication_date:asc',
  cited: 'cited_by_count:desc',
};

export interface OpenAlexSearchParams {
  query: string;
  fromYear: number;
  toYear: number;
  openAccessOnly: boolean;
  type: TypeFilter;
  sort: SortKey;
  limit: number;
  signal?: AbortSignal;
}

/** OpenAlex requires quotes/operators to be balanced; user text is sent as plain words only. */
function toSearchString(q: string): string {
  return q.replace(/["()~*?:\\]|\b(AND|OR|NOT)\b/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

export async function searchOpenAlex(p: OpenAlexSearchParams): Promise<{ studies: Study[]; total: number }> {
  const filters = [`from_publication_date:${p.fromYear}-01-01`, `to_publication_date:${p.toYear}-12-31`];
  if (p.openAccessOnly) filters.push('is_oa:true');
  const tf = TYPE_FILTERS[p.type];
  if (tf) filters.push(tf);
  const search = toSearchString(p.query);
  if (!search) return { studies: [], total: 0 };
  const params = { search, filter: filters.join(','), sort: SORTS[p.sort], per_page: Math.min(100, p.limit), select: SELECT };
  let data: { results?: Raw[]; meta?: { count?: number } };
  try {
    data = await oaGet('/works', params, p.signal);
  } catch (err) {
    // A rejected `select` (400) should not take search down: retry once with the full record.
    if (err instanceof UpstreamError && err.status === 400) data = await oaGet('/works', { ...params, select: undefined }, p.signal);
    else throw err;
  }
  const studies = (data.results ?? []).map((w) => normalizeOpenAlexWork(w)).filter((s): s is Study => s !== null);
  return { studies, total: data.meta?.count ?? studies.length };
}

/** Batch DOI lookup used to enrich Crossref-discovered records (list+filter pricing, up to 100 DOIs). */
export async function lookupOpenAlexByDois(dois: string[], signal?: AbortSignal): Promise<Map<string, Study>> {
  const out = new Map<string, Study>();
  const unique = [...new Set(dois)].filter((d) => !/[|,]/.test(d));
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const data = await oaGet<{ results?: Raw[] }>(
      '/works',
      { filter: `doi:${chunk.map((d) => 'https://doi.org/' + d).join('|')}`, per_page: chunk.length, select: SELECT },
      signal,
    );
    for (const w of data.results ?? []) {
      const s = normalizeOpenAlexWork(w);
      if (s?.doi) out.set(s.doi, s);
    }
  }
  return out;
}

export async function getOpenAlexWork(shortId: string, signal?: AbortSignal): Promise<Study | null> {
  try {
    const w = await oaGet<Raw>(`/works/${shortId}`, { select: SELECT }, signal);
    return normalizeOpenAlexWork(w);
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 404) return null;
    throw err;
  }
}

/** Number of OpenAlex works matching a phrase inside the research window (real count, no estimate). */
export async function countWorks(phrase: string, fromYear: number, toYear: number, signal?: AbortSignal): Promise<number | null> {
  const search = toSearchString(phrase);
  if (!search) return null;
  const data = await oaGet<{ meta?: { count?: number } }>(
    '/works',
    { search: `"${search}"`, filter: `from_publication_date:${fromYear}-01-01,to_publication_date:${toYear}-12-31`, per_page: 1, select: 'id' },
    signal,
  );
  return typeof data.meta?.count === 'number' ? data.meta.count : null;
}

export interface OpenAlexTopic {
  id: string;
  name: string;
  description: string | null;
  field: string | null;
  subfield: string | null;
  domain: string | null;
  keywords: string[];
  worksCount: number | null;
}

export async function getOpenAlexTopic(shortId: string, signal?: AbortSignal): Promise<OpenAlexTopic | null> {
  try {
    const t = await oaGet<Raw>(`/topics/${shortId}`, { select: 'id,display_name,description,keywords,subfield,field,domain,works_count' }, signal);
    return {
      id: shortId,
      name: stripTags(String(t.display_name ?? '')),
      description: t.description ? stripTags(String(t.description)).slice(0, 800) : null,
      field: t.field?.display_name ?? null,
      subfield: t.subfield?.display_name ?? null,
      domain: t.domain?.display_name ?? null,
      keywords: Array.isArray(t.keywords) ? t.keywords.slice(0, 10).map((k: unknown) => String(k)) : [],
      worksCount: Number.isInteger(t.works_count) ? t.works_count : null,
    };
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 404) return null;
    throw err;
  }
}
