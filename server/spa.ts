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

export function renderIndex(html: string, publicUrl: string | null, path: string): string {
  return html.replace(HEAD_MARKER, seoHead(publicUrl, path));
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
