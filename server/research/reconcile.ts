import type { Author, MetadataConflict, Study } from '../../shared/types.js';
import { jaccard, lastName, normalizeTitle, tokenSet } from '../lib/text.js';

/**
 * Deterministic source-priority rule for conflicting metadata:
 *   original source > DOI metadata > Crossref > OpenAlex > other indexes.
 * Relata only has Crossref (which holds the publisher-deposited DOI metadata) and OpenAlex,
 * so Crossref wins for bibliographic fields. Differences are never hidden: every disagreement
 * is recorded in `verification.conflicts` and shown to the user.
 */
export function detectConflicts(oa: Study, cr: Study): MetadataConflict[] {
  const out: MetadataConflict[] = [];
  const a = tokenSet(oa.title);
  const b = tokenSet(cr.title);
  const sameNorm = normalizeTitle(oa.title) === normalizeTitle(cr.title);
  if (!sameNorm && (Math.min(a.size, b.size) < 3 ? true : jaccard(a, b) < 0.75)) {
    out.push({ field: 'title', openalex: oa.title, crossref: cr.title, displayed: 'crossref' });
  }
  if (Number.isInteger(oa.publicationYear) && Number.isInteger(cr.publicationYear) && oa.publicationYear !== cr.publicationYear) {
    out.push({ field: 'publication year', openalex: String(oa.publicationYear), crossref: String(cr.publicationYear), displayed: 'crossref' });
  }
  if (oa.authors.length && cr.authors.length) {
    const first = lastName(oa.authors[0].name);
    const crLasts = new Set(cr.authors.map((x) => lastName(x.name)));
    if (first && !crLasts.has(first)) {
      out.push({ field: 'first author', openalex: oa.authors[0].name, crossref: cr.authors[0].name, displayed: 'crossref' });
    }
  }
  return out;
}

function mergeAuthors(oa: Author[], cr: Author[]): Author[] {
  if (!cr.length) return oa;
  const byLast = new Map<string, Author[]>();
  for (const a of oa) {
    const k = lastName(a.name);
    byLast.set(k, [...(byLast.get(k) ?? []), a]);
  }
  return cr.map((c) => {
    const candidates = byLast.get(lastName(c.name)) ?? [];
    // Only borrow identifiers when the match is unambiguous.
    const m = candidates.length === 1 ? candidates[0] : undefined;
    return { name: c.name, orcid: c.orcid ?? m?.orcid, id: m?.id };
  });
}

/** Combines an OpenAlex record and a Crossref record describing the same DOI. */
export function reconcile(oa: Study, cr: Study): Study {
  const conflicts = detectConflicts(oa, cr);
  const crAbstract = cr.abstract && cr.abstract.length >= 100 ? cr.abstract : null;
  const abstract = crAbstract ?? oa.abstract ?? cr.abstract;
  const abstractSource = crAbstract ? 'crossref' : oa.abstract ? 'openalex' : cr.abstract ? 'crossref' : null;
  const sources = [...new Set([...oa.sources, ...cr.sources])] as Study['sources'];
  const useOaCites = oa.citationCount !== null;
  return {
    ...oa,
    title: cr.title,
    authors: mergeAuthors(oa.authors, cr.authors),
    authorCount: cr.authorCount || oa.authorCount,
    publicationDate: cr.publicationDate ?? oa.publicationDate,
    publicationYear: Number.isInteger(cr.publicationYear) ? cr.publicationYear : oa.publicationYear,
    journal: cr.journal ?? oa.journal,
    publisher: cr.publisher ?? oa.publisher,
    doi: cr.doi ?? oa.doi,
    abstract,
    abstractSource,
    url: cr.url ?? oa.url,
    urlKind: cr.url ? 'doi' : oa.urlKind,
    citationCount: useOaCites ? oa.citationCount : cr.citationCount,
    citationSource: useOaCites ? oa.citationSource : cr.citationSource,
    sources,
    source: oa.source,
    isRetracted: oa.isRetracted || cr.isRetracted,
    matchedQueries: Math.max(oa.matchedQueries, cr.matchedQueries),
    verification: { doi: 'verified', verifiedBy: ['openalex', 'crossref'], conflicts },
  };
}
