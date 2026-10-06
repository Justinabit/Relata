import type { Study } from './types.js';

/**
 * Citation formatting built strictly from verified metadata. Missing fields are
 * shown with explicit placeholders — nothing is guessed or filled in.
 */
export type CitationStyle = 'apa' | 'mla' | 'chicago';
export const CITATION_STYLES: { id: CitationStyle; label: string }[] = [
  { id: 'apa', label: 'APA 7' },
  { id: 'mla', label: 'MLA 9' },
  { id: 'chicago', label: 'Chicago 17' },
];

export const PLACEHOLDER_AUTHOR = '[Author unavailable]';
export const PLACEHOLDER_JOURNAL = '[Source unavailable]';

type CiteInput = Pick<
  Study,
  'title' | 'authors' | 'authorCount' | 'publicationYear' | 'publicationDate' | 'journal' | 'publisher' | 'doi' | 'url' | 'type'
>;

interface Name {
  family: string;
  given: string;
}

function splitName(full: string): Name {
  const clean = full.replace(/\s+/g, ' ').trim();
  if (clean.includes(',')) {
    const [family, ...rest] = clean.split(',');
    return { family: family.trim(), given: rest.join(',').trim() };
  }
  const parts = clean.split(' ');
  if (parts.length === 1) return { family: parts[0], given: '' };
  return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') };
}

function initials(given: string): string {
  // "Jean-Pierre Marie" -> "J.-P. M."
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.split('-').filter(Boolean).map((x) => Array.from(x)[0].toUpperCase() + '.').join('-'))
    .join(' ');
}

function sentenceCase(title: string): string {
  return title.trim().replace(/[.\s]+$/, '');
}

function endWithPeriod(s: string): string {
  return /[.?!]$/.test(s) ? s : s + '.';
}

function doiUrl(s: CiteInput): string | null {
  if (s.doi) return `https://doi.org/${s.doi}`;
  return s.url;
}

function apaAuthors(s: CiteInput): string {
  const names = s.authors.map((a) => splitName(a.name));
  if (!names.length) return PLACEHOLDER_AUTHOR;
  const fmt = (n: Name) => (n.given ? `${n.family}, ${initials(n.given)}` : n.family);
  const truncated = s.authorCount > s.authors.length;
  if (names.length === 1 && !truncated) return fmt(names[0]);
  if (names.length <= 20 && !truncated) {
    const head = names.slice(0, -1).map(fmt).join(', ');
    return `${head}, & ${fmt(names[names.length - 1])}`;
  }
  const head = names.slice(0, 19).map(fmt).join(', ');
  // Complete list of 21+ authors: APA's "first 19 … last author" form.
  if (!truncated) return `${head}, . . . ${fmt(names[names.length - 1])}`;
  // Truncated list: the real last author is unknown, so never repeat or invent one.
  return `${head}, et al.`;
}

function mlaAuthors(s: CiteInput): string {
  const names = s.authors.map((a) => splitName(a.name));
  if (!names.length) return PLACEHOLDER_AUTHOR;
  const first = names[0].given ? `${names[0].family}, ${names[0].given}` : names[0].family;
  if (names.length === 1 && s.authorCount <= 1) return first;
  if (names.length === 2 && s.authorCount === 2) {
    const second = names[1].given ? `${names[1].given} ${names[1].family}` : names[1].family;
    return `${first}, and ${second}`;
  }
  return `${first}, et al`;
}

function chicagoAuthors(s: CiteInput): string {
  const names = s.authors.map((a) => splitName(a.name));
  if (!names.length) return PLACEHOLDER_AUTHOR;
  const first = names[0].given ? `${names[0].family}, ${names[0].given}` : names[0].family;
  const rest = names.slice(1, 10).map((n) => (n.given ? `${n.given} ${n.family}` : n.family));
  const all = [first, ...rest];
  if (s.authorCount > 10) return `${all.slice(0, 7).join(', ')}, et al`;
  if (all.length === 1) return all[0];
  return `${all.slice(0, -1).join(', ')}, and ${all[all.length - 1]}`;
}

export function formatCitation(s: CiteInput, style: CitationStyle): string {
  const link = doiUrl(s);
  const journal = s.journal ?? null;
  const title = sentenceCase(s.title);
  const year = String(s.publicationYear);

  if (style === 'apa') {
    const a = apaAuthors(s);
    const authorPart = endWithPeriod(a);
    const src = journal ? `${journal}.` : s.publisher ? `${s.publisher}.` : `${PLACEHOLDER_JOURNAL}.`;
    return [`${authorPart} (${year}).`, `${endWithPeriod(title)}`, src, link ?? ''].filter(Boolean).join(' ');
  }
  if (style === 'mla') {
    const a = mlaAuthors(s);
    const parts = [endWithPeriod(a), `"${endWithPeriod(title)}"`];
    const container = journal ?? s.publisher ?? PLACEHOLDER_JOURNAL;
    parts.push(`${container},`, `${year},`);
    const tail = link ? `${link.replace(/^https?:\/\//, '')}.` : '';
    return (parts.join(' ') + ' ' + tail).trim().replace(/,$/, '.');
  }
  const a = chicagoAuthors(s);
  const container = journal ?? s.publisher ?? PLACEHOLDER_JOURNAL;
  return `${endWithPeriod(a)} "${endWithPeriod(title)}" ${container} (${year}).${link ? ' ' + link + '.' : ''}`;
}

export function formatBibliography(studies: CiteInput[], style: CitationStyle): string {
  const lines = studies.map((s) => ({ s, text: formatCitation(s, style) }));
  lines.sort((x, y) => {
    const ax = x.s.authors[0]?.name ? splitName(x.s.authors[0].name).family : x.s.title;
    const ay = y.s.authors[0]?.name ? splitName(y.s.authors[0].name).family : y.s.title;
    return ax.localeCompare(ay);
  });
  return lines.map((l) => l.text).join('\n\n');
}

export function studyInfoText(s: Study & { url: string | null }): string {
  const lines = [
    s.title,
    s.authors.length ? s.authors.map((a) => a.name).join(', ') + (s.authorCount > s.authors.length ? ', et al.' : '') : PLACEHOLDER_AUTHOR,
    `${s.publicationYear}${s.journal ? ' · ' + s.journal : ''}`,
    s.doi ? `DOI: ${s.doi}` : 'DOI: not available from source',
    s.url ? `Link: ${s.url}` : 'Source link unavailable',
    `Indexed by: ${s.sources.map((x) => (x === 'openalex' ? 'OpenAlex' : 'Crossref')).join(' + ')}`,
  ];
  return lines.join('\n');
}
