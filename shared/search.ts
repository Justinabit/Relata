import { z } from 'zod';
import { reconcileFilters } from './capabilities.js';
import type { SearchFilters } from './types.js';
import type { AnalyzeResponse } from './types.js';

export const MAX_SEARCH_CONCEPTS = 16;

/** Keep the analysis intact; only bound the concepts submitted to scholarly search. */
export function searchConcepts(analysis: AnalyzeResponse): string[] {
  const candidates = analysis.analysis
    ? [...analysis.analysis.keywords, ...analysis.analysis.concepts.map((c) => c.term), ...analysis.analysis.relatedTopics.map((t) => t.name)]
    : analysis.plan.extractedKeywords;
  const seen = new Set<string>();
  return candidates.map((s) => s.trim()).filter((s) => {
    const key = s.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_SEARCH_CONCEPTS);
}

export const searchQuerySchema = z.string().trim().min(1).max(300);
export const searchFiltersSchema = z.object({
  yearsBack: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(10), z.literal(15), z.literal(25)]).default(10),
  sources: z.array(z.enum(['openalex', 'crossref'])).min(1).max(2).default(['openalex']),
  openAccessOnly: z.boolean().default(false),
  hideRetracted: z.boolean().default(false),
  type: z.enum(['any', 'article', 'review', 'conference-paper', 'preprint', 'dataset', 'other']).default('any'),
  sort: z.enum(['relevance', 'newest', 'oldest', 'cited']).default('relevance'),
});

/** Validate parameters independently: one bad value must not discard other valid filters. */
export function parseSearchParams(params: URLSearchParams): { query: string | null; filters: SearchFilters } {
  const one = (key: string) => params.getAll(key).length === 1 ? params.get(key)! : undefined;
  const q = searchQuerySchema.safeParse(one('q'));
  const filters = searchFiltersSchema.parse({});
  const raw: Record<string, unknown> = {
    yearsBack: one('yearsBack') === undefined ? undefined : Number(one('yearsBack')),
    sources: one('sources')?.split(','), type: one('type'), sort: one('sort'),
    hideRetracted: one('hideRetracted') === 'true' ? true : one('hideRetracted') === 'false' ? false : undefined,
    openAccessOnly: one('openAccessOnly') === 'true' ? true : one('openAccessOnly') === 'false' ? false : undefined,
  };
  for (const key of Object.keys(searchFiltersSchema.shape) as (keyof typeof filters)[]) {
    const parsed = searchFiltersSchema.shape[key].safeParse(raw[key]);
    if (parsed.success) Object.assign(filters, { [key]: parsed.data });
  }
  filters.sources = [...new Set(filters.sources)].sort();
  return { query: q.success ? q.data : null, filters: reconcileFilters(filters) };
}

export function searchLink(query: string, filters: SearchFilters): string {
  const q = searchQuerySchema.safeParse(query);
  if (!q.success) return '/app/search';
  const f = reconcileFilters(searchFiltersSchema.parse(filters));
  return '/app/search?' + new URLSearchParams({ q: q.data, yearsBack: String(f.yearsBack), sources: [...new Set(f.sources)].sort().join(','), openAccessOnly: String(f.openAccessOnly), type: f.type, sort: f.sort, hideRetracted: String(f.hideRetracted ?? false) });
}
