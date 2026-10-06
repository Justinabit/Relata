import type { Study } from '../../shared/types';

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

export function studiesToJson(studies: Study[], query?: string): string {
  const meta = studies.map(({ abstract: _a, ...rest }) => rest);
  return JSON.stringify({ exportedAt: new Date().toISOString(), note: 'Bibliographic metadata as returned by OpenAlex and/or Crossref. No AI-generated text is included.', query: query ?? null, studies: meta }, null, 2);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
