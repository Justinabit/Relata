import type { SourceId, Study } from '../../shared/types';
import { TYPE_LABELS } from '../../shared/capabilities';

export const sourceLabel = (s: SourceId) => (s === 'openalex' ? 'OpenAlex' : 'Crossref');

export function authorsLine(s: Pick<Study, 'authors' | 'authorCount'>, max = 4): string {
  if (!s.authors.length) return '[Author unavailable]';
  const shown = s.authors.slice(0, max).map((a) => a.name);
  const more = Math.max(s.authorCount, s.authors.length) - shown.length;
  return shown.join(', ') + (more > 0 ? `, +${more} more` : '');
}

export function typeLabel(t: Study['type']): string {
  return t === 'other' ? 'Other' : TYPE_LABELS[t];
}

export function formatDate(s: Pick<Study, 'publicationDate' | 'publicationYear'>): string {
  const d = s.publicationDate;
  if (!d) return String(s.publicationYear);
  const parts = d.split('-').map(Number);
  if (parts.length === 3) return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  if (parts.length === 2) return new Date(Date.UTC(parts[0], parts[1] - 1, 1)).toLocaleDateString(undefined, { year: 'numeric', month: 'long', timeZone: 'UTC' });
  return String(parts[0]);
}

export const nf = new Intl.NumberFormat();

export function plural(n: number, one: string, many = one + 's'): string {
  return `${nf.format(n)} ${n === 1 ? one : many}`;
}

export function excerpt(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  if (/\s/.test(t[max])) return cut.trimEnd() + '…';
  return (cut.replace(/\s+\S*$/, '') || cut) + '…';
}

export function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString();
}
