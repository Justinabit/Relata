/**
 * Output guards. AI text is never trusted: anything that looks like an invented citation,
 * link, DOI or statistic is dropped before it reaches the client.
 */
const URL_RE = /(https?:\/\/|www\.)\S+/i;
const DOI_RE = /\b10\.\d{4,9}\/\S+/i;
// "Johnson et al. (2024)", "Smith and Lee, 2023", "(Garcia, 2021)"
const CITATION_RE = /\b[A-Z][a-zA-Z'’-]+\s+(?:et al\.?|and\s+[A-Z][a-zA-Z'’-]+|&\s+[A-Z][a-zA-Z'’-]+)[,\s]*\(?(?:19|20)\d{2}\)?|\([A-Z][a-zA-Z'’-]+,\s*(?:19|20)\d{2}\)/;

export function hasForbiddenReference(s: string): boolean {
  return URL_RE.test(s) || DOI_RE.test(s) || CITATION_RE.test(s);
}

const NUM_RE = /\d+(?:[.,]\d+)*/g;

export function numbersIn(s: string): Set<string> {
  return new Set((s.match(NUM_RE) ?? []).map((n) => n.replace(/,/g, '')));
}

/** Every number in `generated` must literally appear in `source`. */
export function numbersGrounded(generated: string, source: string): boolean {
  const allowed = numbersIn(source);
  for (const n of numbersIn(generated)) if (!allowed.has(n)) return false;
  return true;
}

export function cleanAIString(s: string, max: number): string {
  return s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/<\/?[a-z][^<>]*>/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
