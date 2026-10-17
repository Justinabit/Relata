import type { AnalyzeResponse } from './types.js';

export const MAX_SEARCH_CONCEPTS = 16;
/** Longest strings /api/search accepts. The server's search plan and the client both stay within them. */
export const MAX_QUERY_CHARS = 300;
export const MAX_EXPANDED_CHARS = 200;
export const MAX_CONCEPT_CHARS = 100;

/** Keep the analysis intact; only bound the concepts submitted to scholarly search. */
export function searchConcepts(analysis: AnalyzeResponse): string[] {
  const candidates = analysis.analysis
    ? [...analysis.analysis.keywords, ...analysis.analysis.concepts.map((c) => c.term), ...analysis.analysis.relatedTopics.map((t) => t.name)]
    : analysis.plan.extractedKeywords;
  const seen = new Set<string>();
  return candidates.map((s) => s.trim()).filter((s) => {
    const key = s.toLowerCase();
    if (!key || s.length > MAX_CONCEPT_CHARS || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_SEARCH_CONCEPTS);
}
