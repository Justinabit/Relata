import type { SourceId, SearchFilters, StudyType, TypeFilter } from './types.js';

/**
 * What each scholarly source can actually filter on. The UI only offers options the
 * selected sources can honour, and the server enforces the same rules.
 */
export const SOURCE_CAPABILITIES: Record<SourceId, { label: string; openAccessFilter: boolean; types: StudyType[] }> = {
  openalex: {
    label: 'OpenAlex',
    openAccessFilter: true,
    types: ['article', 'review', 'conference-paper', 'preprint', 'dataset', 'other'],
  },
  crossref: {
    label: 'Crossref',
    openAccessFilter: false,
    types: ['article', 'conference-paper', 'preprint', 'dataset', 'other'],
  },
};

export const TYPE_LABELS: Record<StudyType, string> = {
  article: 'Article',
  review: 'Review',
  'conference-paper': 'Conference paper',
  preprint: 'Preprint',
  dataset: 'Dataset',
  other: 'Other (books, reports)',
};

export interface EffectiveCapabilities {
  openAccessFilter: boolean;
  types: StudyType[];
}

/** A filter is only available when *every* selected source supports it. */
export function capabilitiesFor(sources: SourceId[]): EffectiveCapabilities {
  const list = sources.length ? sources : (['openalex'] as SourceId[]);
  return {
    openAccessFilter: list.every((s) => SOURCE_CAPABILITIES[s].openAccessFilter),
    types: SOURCE_CAPABILITIES[list[0]].types.filter((t) => list.every((s) => SOURCE_CAPABILITIES[s].types.includes(t))),
  };
}

/** Drops filter values that the selected sources cannot support. */
export function reconcileFilters(f: SearchFilters): SearchFilters {
  const caps = capabilitiesFor(f.sources);
  const type: TypeFilter = f.type === 'any' || caps.types.includes(f.type) ? f.type : 'any';
  return { ...f, type, openAccessOnly: caps.openAccessFilter ? f.openAccessOnly : false };
}
