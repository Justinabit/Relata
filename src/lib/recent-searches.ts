import { z } from 'zod';
import type { SearchFilters } from '../../shared/types';
import { searchFiltersSchema, searchLink, searchQuerySchema } from '../../shared/search';

export const RECENT_KEY = 'relata:recent-searches:v1';
export const recentSearchSchema = z.object({ query: searchQuerySchema, filters: searchFiltersSchema });
export type RecentSearch = z.infer<typeof recentSearchSchema>;
const schema = z.object({ version: z.literal(1), searches: z.array(recentSearchSchema).max(8) });

export function rememberSearch(previous: RecentSearch[], query: string, filters: SearchFilters, origin: 'text' | 'document'): RecentSearch[] {
  if (origin !== 'text') return previous;
  const parsed = recentSearchSchema.safeParse({ query, filters });
  if (!parsed.success) return previous;
  const key = searchLink(parsed.data.query, parsed.data.filters);
  return [parsed.data, ...previous.filter((s) => searchLink(s.query, s.filters) !== key)].slice(0, 8);
}

export function loadRecentSearches(): { searches: RecentSearch[]; failed: boolean } {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return { searches: [], failed: false };
    return { searches: schema.parse(JSON.parse(raw)).searches, failed: false };
  } catch { return { searches: [], failed: true }; }
}
export function saveRecentSearches(searches: RecentSearch[]): boolean {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify({ version: 1, searches })); return true; }
  catch { return false; }
}
