import { isIP } from 'node:net';

const DOI_RE = /^10\.\d{4,9}\/\S+$/i;

/** Normalises a DOI (strips resolver prefixes, lower-cases). Returns null if it is not a well-formed DOI. */
export function normalizeDoi(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const d = raw
    .trim()
    .replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .toLowerCase();
  return DOI_RE.test(d) && d.length <= 200 ? d : null;
}

/** Builds the resolver URL from a DOI that a scholarly source returned. */
export function doiToUrl(doi: string): string {
  return 'https://doi.org/' + encodeURI(doi).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

/**
 * Accepts only absolute http(s) URLs on public hostnames. Used to vet landing-page URLs that
 * come back from scholarly APIs before they are shown as links. Never used to fetch anything.
 */
export function safeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2000) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return null;
  if (isIP(host.replace(/^\[|\]$/g, ''))) return null;
  return u.toString();
}

export function openalexShortId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/(?:openalex\.org\/)?([WwTtAa]\d{4,12})$/);
  return m ? m[1].toUpperCase() : null;
}

export function crossrefStudyId(doi: string): string {
  return 'cr-' + Buffer.from(doi, 'utf8').toString('base64url');
}

export function doiFromCrossrefStudyId(id: string): string | null {
  if (!id.startsWith('cr-')) return null;
  try {
    return normalizeDoi(Buffer.from(id.slice(3), 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function pmidFromUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/);
  return m ? m[1] : null;
}
