/** Compose a draft only; the user's mail client decides whether to send it. */
export function problemReportLink(email: string | null, pageAddress: string): string | null {
  if (!email || !/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email)) return null;
  const params = new URLSearchParams({ subject: 'Relata problem report', body: `Page: ${pageAddress}\n\nWhat happened?\n` });
  return `mailto:${encodeURIComponent(email)}?${params.toString().replace(/\+/g, '%20')}`;
}
