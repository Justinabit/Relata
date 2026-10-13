import type { Study } from './types.js';

/**
 * Citation formatting built strictly from verified metadata. Missing fields are omitted; nothing is guessed or filled in.
 */
export type CitationStyle = 'apa' | 'mla' | 'chicago';
export const CITATION_STYLES: { id: CitationStyle; label: string }[] = [
  { id: 'apa', label: 'APA 7' },
  { id: 'mla', label: 'MLA 9' },
  { id: 'chicago', label: 'Chicago (author-date)' },
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
  if (s.doi) return `https://doi.org/${s.doi.split('/').map(encodeURIComponent).join('/')}`;
  return s.url;
}

function apaAuthors(s: CiteInput): string {
  const names = s.authors.map((a) => splitName(a.name));
  if (!names.length) return '';
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
  if (!names.length) return '';
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
  if (!names.length) return '';
  const first = names[0].given ? `${names[0].family}, ${names[0].given}` : names[0].family;
  const rest = names.slice(1, 10).map((n) => (n.given ? `${n.given} ${n.family}` : n.family));
  const all = [first, ...rest];
  if (s.authorCount > 10 || s.authorCount > names.length) return `${all.slice(0, 7).join(', ')}, et al`;
  if (all.length === 1) return all[0];
  return `${all.slice(0, -1).join(', ')}, and ${all[all.length - 1]}`;
}

export function formatCitation(s: CiteInput, style: CitationStyle): string {
  const link = doiUrl(s);
  const journal = s.journal ?? null;
  const title = sentenceCase(s.title);
  const year = String(s.publicationYear);

  if (style === 'apa') {
    const authors = apaAuthors(s);
    const heading = authors ? `${endWithPeriod(authors)} (${year}). ${endWithPeriod(title)}` : `${endWithPeriod(title)} (${year}).`;
    return [heading, journal ? endWithPeriod(journal) : '', link ?? ''].filter(Boolean).join(' ');
  }
  if (style === 'mla') {
    const authors = mlaAuthors(s);
    const container = [journal, year, link?.replace(/^https?:\/\//, '')].filter(Boolean).join(', ');
    return [authors ? endWithPeriod(authors) : '', `"${endWithPeriod(title)}"`, endWithPeriod(container)].filter(Boolean).join(' ');
  }
  const authors = chicagoAuthors(s);
  return [authors ? `${endWithPeriod(authors)} ${year}.` : '', `"${endWithPeriod(title)}"`, !authors ? `${year}.` : '', journal ? endWithPeriod(journal) : '', link ? endWithPeriod(link) : ''].filter(Boolean).join(' ');
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

/** Escape each original character once so generated TeX commands are not escaped again. */
export function escapeBibtex(value: string): string {
  const special: Record<string, string> = {
    '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '&': '\\&', '%': '\\%',
    '$': '\\$', '#': '\\#', '_': '\\_', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
  };
  return value.replace(/[\\{}&%$#_~^]/g, (c) => special[c]).replace(/[\r\n]+/g, ' ');
}

/** Collision suffixes are assigned by record id, independent of library sort order. */
export function citeKeys(studies: Study[]): string[] {
  const word = (s: string) => (s.normalize('NFKD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) ?? []).join('');
  const base = (s: Study) => `${word(s.authors[0] ? splitName(s.authors[0].name).family : '')}${s.publicationYear}${word(s.title.match(/[\p{L}\p{N}]+/u)?.[0] ?? '')}`;
  const used = new Set<string>();
  const result: string[] = [];
  studies.map((s, i) => ({ s, i })).sort((a, b) => a.s.id.localeCompare(b.s.id)).forEach(({ s, i }) => {
    const key = base(s); let unique = key; let n = 0;
    while (used.has(unique)) { n++; unique = key + suffix(n); }
    used.add(unique); result[i] = unique;
  });
  return result;
}
function suffix(n: number): string {
  let out = '';
  while (n > 0) { n--; out = String.fromCharCode(97 + n % 26) + out; n = Math.floor(n / 26); }
  return out;
}

export function studiesToBibtex(studies: Study[]): string {
  const keys = citeKeys(studies);
  return studies.map((s, i) => {
    const fields: [string, string | null][] = [
      ['title', s.title], ['author', s.authors.length ? s.authors.map((a) => { const n = splitName(a.name); return n.given ? `${n.family}, ${n.given}` : n.family; }).join(' and ') : null],
      ['year', String(s.publicationYear)], ['journal', s.journal], ['publisher', s.publisher], ['doi', s.doi], ['url', s.url],
    ];
    const kind = s.type === 'article' || s.type === 'review' ? 'article' : s.type === 'conference-paper' ? 'inproceedings' : 'misc';
    return `@${kind}{${keys[i]},\n${fields.filter(([, v]) => v).map(([k, v]) => `  ${k} = {${escapeBibtex(v!)}},`).join('\n')}\n}`;
  }).join('\n\n') + (studies.length ? '\n' : '');
}

export function studiesToRis(studies: Study[]): string {
  const line = (tag: string, value: string | null) => value ? `${tag}  - ${value.replace(/[\r\n]+/g, ' ')}\r\n` : '';
  return studies.map((s) => line('TY', s.type === 'article' || s.type === 'review' ? 'JOUR' : s.type === 'conference-paper' ? 'CPAPER' : 'GEN') +
    line('TI', s.title) + s.authors.map((a) => line('AU', a.name)).join('') + line('PY', String(s.publicationYear)) +
    line('JO', s.journal) + line('PB', s.publisher) + line('DO', s.doi) + line('UR', s.url) + 'ER  - \r\n').join('\r\n');
}

const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formula injection in exported metadata.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};

export function studiesToCsv(studies: Study[]): string {
  const head = ['title', 'authors', 'year', 'publication_date', 'journal', 'publisher', 'doi', 'url', 'open_access', 'citation_count', 'citation_source', 'type', 'indexed_by', 'doi_status'];
  const rows = studies.map((s) =>
    [
      s.title, s.authors.map((a) => a.name).join('; '), s.publicationYear, s.publicationDate, s.journal, s.publisher, s.doi, s.url,
      s.openAccess.isOa === null ? '' : s.openAccess.isOa, s.citationCount, s.citationSource, s.type, s.sources.join('+'), s.verification.doi,
    ].map(csvCell).join(','),
  );
  // The BOM makes Excel read the file as UTF-8, so accents and non-Latin titles are not garbled.
  return '\uFEFF' + [head.join(','), ...rows].join('\r\n');
}
