import type { Study } from '../../shared/types.js';
import { lastName, normalizeTitle } from '../lib/text.js';
import { reconcile } from './reconcile.js';

export function dedupeKeys(s: Study): string[] {
  const keys: string[] = [];
  if (s.doi) keys.push(`doi:${s.doi}`);
  if (s.openalexId) keys.push(`oa:${s.openalexId}`);
  if (s.pmid) keys.push(`pmid:${s.pmid}`);
  const t = normalizeTitle(s.title);
  const a = s.authors[0] ? lastName(s.authors[0].name) : '';
  // The title key needs an author and a year; otherwise two unrelated records with a short
  // generic title could be merged by accident.
  if (t.length >= 12 && a && Number.isInteger(s.publicationYear)) keys.push(`tay:${t}|${a}|${s.publicationYear}`);
  return keys;
}

export interface Ranked {
  study: Study;
  /** Reciprocal-rank-fusion score across all result lists — internal "search relevance". */
  score: number;
}

/**
 * Removes duplicates using, in order: DOI, OpenAlex id, PMID, normalised title+author+year.
 * Duplicate records are merged (never silently dropped): sources are unioned and, when an
 * OpenAlex and a Crossref record meet, they are reconciled under the source-priority rule.
 */
export function dedupe(items: Ranked[]): { unique: Ranked[]; removed: number } {
  const unique: Ranked[] = [];
  const index = new Map<string, number>();
  let removed = 0;
  for (const item of items) {
    const keys = dedupeKeys(item.study);
    const hit = keys.map((k) => index.get(k)).find((i) => i !== undefined);
    if (hit === undefined) {
      const i = unique.push({ ...item }) - 1;
      keys.forEach((k) => index.set(k, i));
      continue;
    }
    removed++;
    const cur = unique[hit];
    const a = cur.study;
    const b = item.study;
    let merged: Study;
    const aHasOa = a.sources.includes('openalex');
    const bHasOa = b.sources.includes('openalex');
    const aHasCr = a.sources.includes('crossref');
    const bHasCr = b.sources.includes('crossref');
    if (aHasOa && !aHasCr && bHasCr && !bHasOa) merged = reconcile(a, b);
    else if (bHasOa && !bHasCr && aHasCr && !aHasOa) merged = reconcile(b, a);
    else merged = { ...a, sources: [...new Set([...a.sources, ...b.sources])] as Study['sources'] };
    merged = { ...merged, matchedQueries: a.matchedQueries + b.matchedQueries };
    cur.study = merged;
    cur.score += item.score;
    dedupeKeys(merged).forEach((k) => index.set(k, hit));
  }
  return { unique, removed };
}
