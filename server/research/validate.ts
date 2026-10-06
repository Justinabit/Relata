import type { ResearchWindow, Study } from '../../shared/types.js';

export const REJECTION = {
  title: 'Missing or unusable title',
  noDate: 'No verifiable publication date',
  impossible: 'Impossible publication date',
  malformed: 'Malformed publication date',
  outside: 'Outside the selected research window',
  type: 'Publication type did not match the filter',
  overlap: 'Low term overlap with the query (Crossref relevance check)',
} as const;

/** Returns a rejection reason, or null when the record is acceptable. Dates are never guessed. */
export function validateStudy(s: Study, window: ResearchWindow, now = new Date()): string | null {
  if (!s.title || s.title.trim().length < 3) return REJECTION.title;
  const y = s.publicationYear;
  if (!Number.isInteger(y)) return REJECTION.noDate;
  if (y < 1500 || y > now.getUTCFullYear()) return REJECTION.impossible;
  if (s.publicationDate) {
    const m = s.publicationDate.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
    if (!m) return REJECTION.malformed;
    const [, yy, mm, dd] = m;
    if (Number(yy) !== y) return REJECTION.malformed;
    if (mm && (Number(mm) < 1 || Number(mm) > 12)) return REJECTION.malformed;
    if (dd) {
      const d = new Date(Date.UTC(Number(yy), Number(mm) - 1, Number(dd)));
      if (d.getUTCMonth() !== Number(mm) - 1 || d.getUTCDate() !== Number(dd)) return REJECTION.malformed;
      if (d.getTime() > now.getTime() + 366 * 86400_000) return REJECTION.impossible;
    }
  }
  if (y < window.fromYear || y > window.toYear) return REJECTION.outside;
  return null;
}

/** "2024-05" → "2024-05-01" so partial dates sort sensibly. */
export function sortableDate(s: Study): string {
  const d = s.publicationDate ?? String(s.publicationYear);
  return d.length === 4 ? `${d}-01-01` : d.length === 7 ? `${d}-01` : d;
}
