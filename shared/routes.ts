/**
 * Every address in the site lives here, so links, redirects and the layout choice agree.
 *
 *   /            landing page (public)
 *   /app/...     the research tool (sidebar layout)
 *   /about ...   information and policy pages (public layout)
 *
 * This file is shared: the browser uses it to pick a page and a layout, and the server uses it to answer
 * unknown addresses with a real 404, redirect old addresses, and build the sitemap.
 *
 * FUTURE(auth): add `login: '/login'` and `account: '/app/account'` here, register them in the
 * route table in App.tsx, and set `requiresAuth: true` on the routes that need an account.
 */
export const ROUTES = {
  home: '/',
  app: '/app',
  research: '/app/research',
  saved: '/app/saved',
  settings: '/app/settings',
  about: '/about',
  privacy: '/privacy',
  cookies: '/cookies',
  terms: '/terms',
  disclaimer: '/disclaimer',
  aiUse: '/ai-use',
  contact: '/contact',
} as const;

/** Addresses used before the landing page existed. Bookmarks and shared links keep working. */
export const LEGACY_REDIRECTS: Readonly<Record<string, string>> = {
  '/research': ROUTES.research,
  '/saved': ROUTES.saved,
  '/settings': ROUTES.settings,
};

/** True for the research tool, which uses the sidebar layout. Everything else is the public site. */
export function isAppPath(path: string): boolean {
  return path === ROUTES.app || path.startsWith(ROUTES.app + '/');
}

/** Where an old address should go (query string kept), or null when the path is not a legacy one. */
export function legacyTarget(path: string, search: string): string | null {
  const to = LEGACY_REDIRECTS[path];
  return to ? to + search : null;
}

/** Pages that belong in the sitemap: the public site. The tool (`/app/...`) is not indexed. */
export const SITEMAP_PATHS: readonly string[] = [
  ROUTES.home,
  ROUTES.about,
  ROUTES.privacy,
  ROUTES.terms,
  ROUTES.cookies,
  ROUTES.disclaimer,
  ROUTES.aiUse,
  ROUTES.contact,
];

const KNOWN_PATHS: ReadonlySet<string> = new Set(Object.values(ROUTES));

export type PathResolution =
  | { kind: 'page' }
  | { kind: 'redirect'; to: string }
  | { kind: 'not-found' };

/**
 * What the server should do for a page address (query string handled by the caller):
 * serve the app, redirect permanently, or answer 404 (the app still renders its not-found page).
 */
export function resolvePath(path: string): PathResolution {
  if (path.length > 1 && path.endsWith('/')) return { kind: 'redirect', to: path.replace(/\/+$/, '') || '/' };
  const legacy = LEGACY_REDIRECTS[path];
  if (legacy) return { kind: 'redirect', to: legacy };
  return KNOWN_PATHS.has(path) ? { kind: 'page' } : { kind: 'not-found' };
}
