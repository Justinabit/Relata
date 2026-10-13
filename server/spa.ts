import { SITEMAP_PATHS } from '../shared/routes.js';

/** Where the server puts the canonical link and absolute share-image URLs. See `renderIndex`. */
export const HEAD_MARKER = '<!--relata:head-->';

/** `PUBLIC_URL` must be an http(s) address. Only its origin is kept, with no trailing slash. */
export function parsePublicUrl(value: string | undefined): string | null {
  if (!value || !value.trim()) return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Tags that need the site's real address. Empty until `PUBLIC_URL` is set, because relative values do not work for them. */
export function seoHead(publicUrl: string | null, path: string): string {
  if (!publicUrl) return '';
  const url = publicUrl + path;
  const image = `${publicUrl}/og-image.png`;
  return [
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ].join('\n    ');
}

export const PUBLIC_PAGE_META: Readonly<Record<string, { title: string; description: string }>> = {
  '/': { title: 'Relata: Find recent, verifiable studies on your topic', description: 'Search OpenAlex and Crossref for scholarly studies with authors, dates and source links.' },
  '/about': { title: 'About Relata', description: 'How Relata finds scholarly research, verifies source metadata and uses optional AI.' },
  '/privacy': { title: 'Privacy Policy | Relata', description: 'What Relata processes, what stays in your browser and how to clear your research data.' },
  '/cookies': { title: 'Cookie Policy | Relata', description: 'Relata uses no cookies. Learn about browser storage for preferences, saved studies and recent searches.' },
  '/terms': { title: 'Terms and Conditions | Relata', description: 'Terms for using Relata and its scholarly search and optional AI features.' },
  '/disclaimer': { title: 'Academic Disclaimer | Relata', description: 'Understand the limits of scholarly metadata, search coverage and generated research notes.' },
  '/ai-use': { title: 'AI Disclosure | Relata', description: 'Where optional AI is used in Relata, what it can read and why source records remain authoritative.' },
  '/contact': { title: 'Contact | Relata', description: 'Contact the Relata operator with questions or a problem report.' },
};

export function renderIndex(html: string, publicUrl: string | null, path: string): string {
  const meta = PUBLIC_PAGE_META[path] ?? { title: 'Research | Relata', description: 'Search scholarly sources and manage research saved in your browser.' };
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    seoHead(publicUrl, path),
  ].join('\n    ');
  return html.replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\s+(?:name|property)="(?:description|og:title|og:description|twitter:title|twitter:description)"[^>]*>/gi, '')
    .replace(HEAD_MARKER, tags);
}

export function robotsTxt(publicUrl: string | null): string {
  const lines = ['User-agent: *', 'Allow: /', 'Disallow: /app', 'Disallow: /api/'];
  if (publicUrl) lines.push('', `Sitemap: ${publicUrl}/sitemap.xml`);
  return lines.join('\n') + '\n';
}

export function sitemapXml(publicUrl: string): string {
  const urls = SITEMAP_PATHS.map((p) => `  <url><loc>${esc(publicUrl + p)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
