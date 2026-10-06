import { createHash } from 'node:crypto';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const STOPWORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your
  study studies research paper article using use used based effect effects impact impacts role analysis approach investigate investigates examine examines examined present presents show shows results result method methods however therefore thus among within novel new via per et al between towards toward`
    .split(/\s+/)
    .filter(Boolean),
);

/** Removes control characters and normalises whitespace. Does not alter wording. */
export function cleanText(input: string): string {
  return input
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Inline formatting tags are removed without a space so "H<sub>2</sub>O" stays "H2O". */
const INLINE_TAG = /<\/?(?:sub|sup|i|b|u|em|strong|small|span|mml:[a-z]+|jats:(?:sub|sup|italic|bold|underline|sc))(?:\s[^<>]*)?>/gi;
/** Only real tags (a letter right after "<") are removed, so "p < 0.05 and n > 10" survives. */
const ANY_TAG = /<\/?[a-z][^<>]*>/gi;

export function stripTags(html: string): string {
  return decodeEntities(html.replace(INLINE_TAG, '').replace(ANY_TAG, ' ')).replace(/\s+/g, ' ').trim();
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(ANY_TAG, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function tokenSet(t: string): Set<string> {
  return new Set(normalizeTitle(t).split(' ').filter((w) => w.length > 2 && !STOPWORDS.has(w)));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function lastName(full: string): string {
  const base = full.includes(',') ? full.split(',')[0] : full.trim().split(/\s+/).pop() ?? '';
  return normalizeTitle(base).replace(/\s+/g, '');
}

/** Light stemmer used only for internal term matching (gap analysis, keyword extraction). */
export function stem(w: string): string {
  return w.replace(/(ing|ed|es|s)$/i, (m, _s, off: number) => (off >= 4 ? '' : m));
}

export function extractKeywords(text: string, max = 8): string[] {
  const words = normalizeTitle(text).split(' ').filter((w) => w.length > 2 && !/^\d+$/.test(w));
  const freq = new Map<string, number>();
  const bigrams = new Map<string, number>();
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (STOPWORDS.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
    const n = words[i + 1];
    if (n && !STOPWORDS.has(n)) bigrams.set(`${w} ${n}`, (bigrams.get(`${w} ${n}`) ?? 0) + 1);
  }
  const out: string[] = [];
  const used = new Set<string>();
  const topBi = [...bigrams.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]);
  for (const [b] of topBi) {
    if (out.length >= Math.ceil(max / 2)) break;
    const parts = b.split(' ');
    // Overlapping bigrams ("neural networks" + "networks medicine") would repeat words in the query.
    if (parts.some((p) => used.has(p))) continue;
    out.push(b);
    parts.forEach((p) => used.add(p));
  }
  const firstSeen = new Map<string, number>();
  words.forEach((w, i) => !firstSeen.has(w) && firstSeen.set(w, i));
  const uni = [...freq.entries()]
    .filter(([w]) => !used.has(w))
    .sort((a, b) => b[1] - a[1] || (firstSeen.get(a[0]) ?? 0) - (firstSeen.get(b[0]) ?? 0));
  for (const [w] of uni) {
    if (out.length >= max) break;
    out.push(w);
  }
  return out.slice(0, max);
}

/** Breaks any delimiter-like sequences in untrusted text so it can't close a prompt section. */
export function neutralizeDelimiters(s: string): string {
  return s.replace(/<<<|>>>/g, ' ').replace(/<\/?(system|assistant|user|document|request|source)[^>]*>/gi, ' ');
}

/** Shortens at a word boundary. A word is only dropped when the cut would land inside it. */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  if (/\s/.test(s[max])) return cut.trimEnd() + '…';
  const back = cut.replace(/\s+\S*$/, '');
  return (back || cut) + '…';
}

/** Joins keyword phrases into one search string without repeating a word. */
export function joinUniqueWords(phrases: string[], maxWords: number): string {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const w of phrases.join(' ').split(/\s+/).filter(Boolean)) {
    const k = w.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    words.push(w);
    if (words.length >= maxWords) break;
  }
  return words.join(' ');
}
