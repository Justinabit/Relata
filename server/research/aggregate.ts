import type { Aggregates, GapAnalysis, GapSignal, Study, StudyType } from '../../shared/types.js';
import { lastName, normalizeTitle, stem } from '../lib/text.js';

export function aggregate(pool: Study[]): Aggregates {
  const themes = new Map<string, number>();
  const authors = new Map<string, { name: string; count: number; orcid?: string }[]>();
  const types = new Map<StudyType, number>();
  let openAccessCount = 0;
  let withAbstractCount = 0;
  for (const s of pool) {
    for (const t of new Set(s.topics.map((x) => x.name))) themes.set(t, (themes.get(t) ?? 0) + 1);
    for (const a of s.authors.slice(0, 12)) {
      const first = normalizeTitle(a.name).split(' ')[0]?.[0] ?? '';
      // Group by surname + first initial; two distinct ORCIDs under one key are kept apart.
      const key = `${lastName(a.name)}|${first}`;
      const group = authors.get(key) ?? [];
      const cur = group.find((g) => !g.orcid || !a.orcid || g.orcid === a.orcid);
      if (cur) {
        cur.count++;
        cur.orcid ??= a.orcid;
      } else group.push({ name: a.name, count: 1, orcid: a.orcid });
      authors.set(key, group);
    }
    types.set(s.type, (types.get(s.type) ?? 0) + 1);
    if (s.openAccess.isOa) openAccessCount++;
    if (s.abstract) withAbstractCount++;
  }
  return {
    themes: [...themes.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 10),
    // Authors who appear only once in the retrieved set say nothing about relatedness.
    authors: [...authors.values()].flat().filter((a) => a.count >= 2).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 8),
    types: [...types.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    openAccessCount,
    withAbstractCount,
  };
}

const GAP_DISCLAIMER = 'This is a preliminary literature-discovery signal, not a systematic literature review.';

function conceptMatcher(concept: string): (text: string) => boolean {
  const tokens = normalizeTitle(concept).split(' ').filter((t) => t.length > 2).map(stem);
  if (!tokens.length) return () => false;
  return (text: string) => {
    const words = new Set(text.split(' ').map(stem));
    return tokens.every((t) => words.has(t));
  };
}

/**
 * Gap signals are computed from the retrieved dataset only: for each concept the AI/keyword step
 * proposed, we count how many retrieved records mention it in title, abstract, topics or keywords.
 * Concepts that few retrieved records mention are reported as "relatively fewer", never as "no research".
 */
export function analyzeGaps(pool: Study[], concepts: string[]): GapAnalysis {
  const withAbstract = pool.filter((s) => s.abstract).length;
  const base = { poolSize: pool.length, withAbstract, disclaimer: GAP_DISCLAIMER };
  const MIN_POOL = 12;
  if (pool.length < MIN_POOL) {
    return { ...base, available: false, signals: [], reason: `Only ${pool.length} records were retrieved, which is too few to say anything about relative coverage.` };
  }
  const uniqueConcepts = [...new Map(concepts.map((c) => [normalizeTitle(c), c.trim()] as const)).values()].filter(Boolean).slice(0, 12);
  if (!uniqueConcepts.length) {
    return { ...base, available: false, signals: [], reason: 'No related concepts were available for this search, so no coverage comparison could be made.' };
  }
  const texts = pool.map((s) => normalizeTitle([s.title, s.abstract ?? '', s.topics.map((t) => t.name).join(' '), s.keywords.join(' ')].join(' ')));
  const rows = uniqueConcepts.map((concept) => {
    const match = conceptMatcher(concept);
    return { concept, matches: texts.filter((t) => match(t)).length };
  });
  const signals: GapSignal[] = rows
    .filter((r) => r.matches / pool.length <= 0.25)
    .sort((a, b) => a.matches - b.matches)
    .slice(0, 4)
    .map((r) => ({
      concept: r.concept,
      matches: r.matches,
      poolSize: pool.length,
      statement:
        r.matches === 0
          ? `Within the sources retrieved by this search, none of the ${pool.length} records mention “${r.concept}” in their title, abstract or topics.`
          : `Within the sources retrieved by this search, relatively fewer studies (${r.matches} of ${pool.length}) mention “${r.concept}” in their title, abstract or topics.`,
    }));
  return signals.length
    ? { ...base, available: true, signals }
    : { ...base, available: true, signals: [], reason: 'Every related concept appears in a substantial share of the retrieved records, so no coverage imbalance stands out in this set.' };
}
