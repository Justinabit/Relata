import { config } from '../config.js';
import { fetchJson } from '../lib/http.js';
import { TtlCache } from '../lib/cache.js';
import { stripTags, truncate } from '../lib/text.js';
import { UpstreamError } from '../lib/errors.js';
import type { Author, Study, StudyType, TypeFilter } from '../../shared/types.js';
import { crossrefStudyId, doiToUrl, normalizeDoi } from './ids.js';

const SELECT = 'DOI,title,author,issued,container-title,publisher,type,abstract,is-referenced-by-count,URL,updated-by';
const MAX_AUTHORS = 25;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

// `null` is a valid cached value: "Crossref has no record for this DOI".
const doiCache = new TtlCache<Study | null>(2000, config.retention.crossrefCacheSeconds * 1000);
const searchCache = new TtlCache<unknown>(200, config.retention.searchCacheSeconds * 1000);

function headers(): Record<string, string> {
  const mailto = config.crossref.mailto;
  return { 'user-agent': `Relata/${config.version}${mailto ? ` (mailto:${mailto})` : ''}` };
}

function dateParts(issued: unknown): { date: string | null; year: number } {
  const parts: unknown = (issued as Raw)?.['date-parts']?.[0];
  if (!Array.isArray(parts) || !Number.isInteger(parts[0])) return { date: null, year: Number.NaN };
  const [y, m, d] = parts as number[];
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = Number.isInteger(m) ? (Number.isInteger(d) ? `${y}-${pad(m)}-${pad(d)}` : `${y}-${pad(m)}`) : String(y);
  return { date, year: y };
}

function cleanAbstract(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const noTitle = raw.replace(/<jats:title>[\s\S]*?<\/jats:title>/gi, ' ');
  const text = stripTags(noTitle).replace(/^abstract[:.\s]+/i, '');
  return text.length >= 40 ? truncate(text, 6000) : null;
}

function mapType(raw: string | null): StudyType {
  switch (raw) {
    case 'journal-article': return 'article';
    case 'proceedings-article': return 'conference-paper';
    case 'posted-content': return 'preprint';
    case 'dataset': return 'dataset';
    default: return 'other';
  }
}

export function normalizeCrossrefWork(w: Raw, now = new Date()): Study | null {
  const doi = normalizeDoi(w.DOI);
  const title = stripTags(String(Array.isArray(w.title) ? w.title[0] ?? '' : w.title ?? '')).slice(0, 600);
  if (!doi || !title) return null;
  const rawAuthors: Raw[] = Array.isArray(w.author) ? w.author : [];
  const authors: Author[] = rawAuthors
    .slice(0, MAX_AUTHORS)
    .map((a) => {
      const name = a.family ? `${a.given ? a.given + ' ' : ''}${a.family}` : String(a.name ?? '');
      return {
        name: stripTags(name),
        orcid: typeof a.ORCID === 'string' && /^https?:\/\/orcid\.org\//.test(a.ORCID) ? a.ORCID : undefined,
      };
    })
    .filter((a) => a.name);
  const { date, year } = dateParts(w.issued);
  const container = Array.isArray(w['container-title']) ? w['container-title'][0] : null;
  const abstract = cleanAbstract(w.abstract);
  const rawType = typeof w.type === 'string' ? w.type : null;
  const updatedBy: Raw[] = Array.isArray(w['updated-by']) ? w['updated-by'] : [];
  const cites = Number.isInteger(w['is-referenced-by-count']) ? (w['is-referenced-by-count'] as number) : null;
  return {
    id: crossrefStudyId(doi),
    title,
    authors,
    authorCount: rawAuthors.length,
    publicationDate: date,
    publicationYear: year,
    journal: container ? stripTags(String(container)).slice(0, 300) : null,
    publisher: w.publisher ? stripTags(String(w.publisher)).slice(0, 200) : null,
    doi,
    abstract,
    abstractSource: abstract ? 'crossref' : null,
    url: doiToUrl(doi),
    urlKind: 'doi',
    openAccess: { isOa: null, status: null, url: null },
    citationCount: cites,
    citationSource: cites === null ? null : 'crossref',
    source: 'crossref',
    sources: ['crossref'],
    sourceId: doi,
    openalexId: null,
    pmid: null,
    topics: [],
    keywords: [],
    type: mapType(rawType),
    rawType,
    isRetracted: updatedBy.some((u) => ['retraction', 'withdrawal'].includes(String(u?.type ?? '').toLowerCase())),
    // A record that comes from Crossref carries a DOI that Crossref itself registered.
    verification: { doi: 'verified', verifiedBy: ['crossref'], conflicts: [] },
    matchedQueries: 1,
    retrievedAt: now.toISOString(),
  };
}

const TYPE_FILTERS: Record<TypeFilter, string[]> = {
  any: ['journal-article', 'proceedings-article', 'posted-content', 'book-chapter', 'book', 'report', 'dissertation', 'monograph'],
  article: ['journal-article'],
  review: [],
  'conference-paper': ['proceedings-article'],
  preprint: ['posted-content'],
  dataset: ['dataset'],
  other: ['book-chapter', 'book', 'report', 'dissertation', 'monograph'],
};

export interface CrossrefSearchParams {
  query: string;
  fromYear: number;
  toYear: number;
  type: TypeFilter;
  limit: number;
  signal?: AbortSignal;
}

/** Crossref is always queried by relevance; any other sort is applied locally to that relevance-ranked pool. */
export async function searchCrossref(p: CrossrefSearchParams): Promise<{ studies: Study[]; total: number }> {
  const query = p.query.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!query) return { studies: [], total: 0 };
  const filter = [`from-pub-date:${p.fromYear}-01-01`, `until-pub-date:${p.toYear}-12-31`, ...TYPE_FILTERS[p.type].map((t) => `type:${t}`)].join(',');
  const url = new URL('/works', config.crossref.baseUrl);
  url.searchParams.set('query', query);
  url.searchParams.set('filter', filter);
  url.searchParams.set('rows', String(Math.min(100, p.limit)));
  url.searchParams.set('select', SELECT);
  const key = url.toString();
  const { value } = await searchCache.getOrLoad(key, () =>
    fetchJson<unknown>(key, { service: 'Crossref', timeoutMs: config.crossref.timeoutMs, headers: headers(), signal: p.signal }),
  );
  const msg = (value as Raw)?.message ?? {};
  const studies = (Array.isArray(msg.items) ? msg.items : []).map((w: Raw) => normalizeCrossrefWork(w)).filter((s: Study | null): s is Study => s !== null);
  return { studies, total: Number.isInteger(msg['total-results']) ? msg['total-results'] : studies.length };
}

export interface CrossrefLookup {
  records: Map<string, Study | null>;
  failed: Set<string>;
}

/** DOI verification. A DOI that Crossref does not know maps to `null` (never an invented record). */
export async function lookupCrossrefByDois(dois: string[], signal?: AbortSignal): Promise<CrossrefLookup> {
  const records = new Map<string, Study | null>();
  const failed = new Set<string>();
  const need: string[] = [];
  for (const doi of new Set(dois)) {
    const hit = doiCache.get(doi);
    if (hit) records.set(doi, hit.value);
    else need.push(doi);
  }
  const batchable = need.filter((d) => !/[,|]/.test(d));
  const singles = need.filter((d) => /[,|]/.test(d));
  const chunks: string[][] = [];
  for (let i = 0; i < batchable.length; i += 25) chunks.push(batchable.slice(i, i + 25));

  const runChunk = async (chunk: string[]) => {
    try {
      const url = new URL('/works', config.crossref.baseUrl);
      url.searchParams.set('filter', chunk.map((d) => `doi:${d}`).join(','));
      url.searchParams.set('rows', String(chunk.length));
      url.searchParams.set('select', SELECT);
      const data = await fetchJson<Raw>(url.toString(), { service: 'Crossref', timeoutMs: config.crossref.timeoutMs, headers: headers(), signal });
      const found = new Map<string, Study>();
      for (const w of data?.message?.items ?? []) {
        const s = normalizeCrossrefWork(w);
        if (s?.doi) found.set(s.doi, s);
      }
      for (const d of chunk) {
        const s = found.get(d) ?? null;
        records.set(d, s);
        doiCache.set(d, s);
      }
    } catch {
      chunk.forEach((d) => failed.add(d));
    }
  };
  const runSingle = async (doi: string) => {
    try {
      const data = await fetchJson<Raw>(`${config.crossref.baseUrl}/works/${encodeURIComponent(doi)}`, {
        service: 'Crossref', timeoutMs: config.crossref.timeoutMs, headers: headers(), signal,
      });
      const s = normalizeCrossrefWork(data?.message ?? {});
      records.set(doi, s);
      doiCache.set(doi, s);
    } catch (err) {
      if (err instanceof UpstreamError && err.status === 404) {
        records.set(doi, null);
        doiCache.set(doi, null);
      } else failed.add(doi);
    }
  };

  const queue: (() => Promise<void>)[] = [...chunks.map((c) => () => runChunk(c)), ...singles.map((d) => () => runSingle(d))];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) await queue.shift()!();
  });
  await Promise.all(workers);
  return { records, failed };
}

export async function getCrossrefWork(doi: string, signal?: AbortSignal): Promise<Study | null> {
  const { records, failed } = await lookupCrossrefByDois([doi], signal);
  if (failed.has(doi)) throw new UpstreamError('Crossref', 'network', 'Crossref could not be reached.');
  return records.get(doi) ?? null;
}

