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

export { studiesToCsv } from '../../shared/citations';

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
