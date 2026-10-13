# Development notes

Detailed notes for people working on the code. For an overview of the project, see the [README](../README.md).

Academic research discovery: paste a topic, question or document and get recent, verifiable scholarly studies, related concepts and a transparent search trail.

- **Studies come only from scholarly APIs** (OpenAlex primary, Crossref for DOI/metadata verification and optional discovery). AI never supplies studies and can never overwrite metadata.
- **Works without AI.** If no Gemini/OpenAI key is configured (or AI fails), search, verification, filters, saving and citations all still work.
- Dynamic research window: `currentYear − 10 … currentYear`, computed at request time (filters: 1/3/5/10 years; older ranges are explicitly labelled).

## Run

```bash
npm install
cp .env.example .env     # optional: add keys (server-side only)
npm run dev              # API :8787 + Vite :5173
# production
npm run build && npm start   # serves API + built app on :8787
npm test                     # unit + pipeline tests (stubbed upstreams, no network needed)
```

Environment (see `.env.example`): `OPENALEX_API_KEY` (free, strongly recommended: the keyless budget is shared and small), `GEMINI_API_KEY`, `OPENAI_API_KEY`, `PRIMARY_AI_PROVIDER` (`gemini`|`openai`), `CONTACT_EMAIL`, `CROSSREF_MAILTO`, `FRAME_ANCESTORS`, `RATE_LIMIT_*`, cache and upload limits. Keys are never sent to the browser or stored in localStorage.

### Browser tests (optional)

`tests/e2e/*.py` drive a real browser against the fixture harness (Python + Playwright):

```bash
npm run build
PORT=8790 npx tsx tests/harness/mock-upstreams.ts &   # serves the built app with labelled [Fixture] data
python3 tests/e2e/browser.py                          # storage corruption, blocked storage, CSV, keyboard tabs
python3 tests/e2e/stuck-insights.py                   # AI summaries recover after a filter change
python3 tests/e2e/editorial.py                        # responsive layout and text contrast checks (BROWSER_CDP_URL attaches to an existing browser)
python3 tests/e2e/layout.py                           # no dropdown option is clipped at 15 screen widths (run on its own: it uses one search)
python3 tests/e2e/firstrun.py                         # terms popup, introduction, cookie notice (new visitor paths, keyboard, mobile)
python3 tests/e2e/site.py                             # landing page, routing, 5px radius, no dashes, mobile (SHOTS=dir saves screenshots)
```

## Layout

- `shared/` domain types, dynamic window, per-source filter capabilities, citation formatting
- `server/` Express API: `research/` (OpenAlex, Crossref, dedupe, reconcile, pipeline), `ai/` (provider abstraction, schemas, guards, prompts), `documents/` (PDF/DOCX/TXT/MD extraction), `middleware/`, `auth/context.ts` (seam for future auth; no fake login)
- `src/` React + TypeScript app (state in `src/state`, `LibraryStore` interface in `state/library.tsx` is the seam for cloud-synced libraries later)
- `tests/` unit/pipeline tests; `tests/harness/mock-upstreams.ts` is a **local QA harness only** that serves labelled `[Fixture]` data in place of OpenAlex/Gemini. It is never started by `npm start`.

## Site structure

| Address | Page | Layout |
|---|---|---|
| `/` | Landing page with a working search box | public |
| `/privacy` `/terms` `/cookies` `/disclaimer` `/ai-use` `/about` `/contact` | Policy and info pages | public |
| `/app` | Search (paste text or upload a file) | tool |
| `/app/search` `/app/library` `/app/settings` | Results, saved library, settings | tool |

Old addresses (`/research`, `/saved`, `/settings`) and trailing-slash addresses redirect permanently (301) and keep the query string. Any other unknown address gets a real HTTP 404 with `X-Robots-Tag: noindex`, and the app still shows its "Page not found" screen. All addresses live in `shared/routes.ts`, which both the browser and the server read, so a new page needs one entry there plus one in the route table in `App.tsx`.

## Going live: public address, sitemap and share previews

Set `PUBLIC_URL` (for example `https://relata.example`) in the environment. With it, the server adds a canonical link and absolute share-image tags to every page and serves `/sitemap.xml`; `/robots.txt` then names the sitemap. Without it the site still works, but there is no sitemap and no canonical or share-image tags, because those need an absolute address. `robots.txt` always hides `/app` and `/api/`. The share image is `public/og-image.png` (1200 x 630); replace it if the headline or logo changes. Each public page has a server-rendered title and description from server/spa.ts.

Design rules: every button-style control uses `--r-btn` (5px) from `src/styles/tokens.css`. Change that one value to restyle all buttons. No gradients, pill shapes, emoji icons, em or en dashes in visible text, or animations tied to scrolling or the cursor.

## First visit

`src/components/FirstRun.tsx` renders three things once, outside the page layouts. Which one shows is decided by `activeStep` in `src/lib/firstrun.ts`; choices are saved by `src/state/firstrun.ts`.
- **Terms popup:** landing page only, until accepted. The X or Escape closes it for this visit without recording acceptance. The Terms and Privacy pages never show a popup, so they can always be read.
- **Introduction:** three steps, on the landing page or `/app`, once. Skip or finish both remember it.
- **Cookie notice:** every page, until answered ("Accept cookies" or "Close"). The Cookie Policy page has a "Your cookie setting" section to change the choice. Relata sets no cookies today, so the notice says so and only records the answer; if cookies are added later (for login), gate the optional ones on `cookies === 'accepted'` and update the notice and Cookie Policy text first.
- The older e2e scripts pre-set these keys with `tests/e2e/seen.py` so they test what they are about.

## Adding login later

Nothing about login is visible today. The seams are in place:
1. `src/state/auth.tsx`: replace the always-anonymous `AuthProvider` with a real session (`enabled: true`).
2. `src/components/AccountSlot.tsx`: renders a sign-in button or account menu in the header and sidebar once `enabled` is true.
3. `src/App.tsx`: set `requiresAuth: true` on a route to gate it; `SignInRequired` is shown to anonymous visitors.
4. `server/auth/context.ts`: resolve the user per request; `LibraryStore` in `src/state/library.tsx` can then sync to the server.
5. Update the Privacy and Terms pages, which currently say there are no accounts.

## Behaviour worth knowing

- Uploaded files are validated (extension, MIME, magic bytes, size), read in memory and discarded. Nothing is written to disk. No OCR for scanned PDFs.
- Server caches (memory only): search results 15 min, AI analysis of short typed queries 1 h, Crossref DOI lookups 24 h.
- No accounts, analytics or cookies. localStorage keys: `relata:settings:v1`, `relata:library:v1`, `relata:citestyle`, `relata:terms:v1`, `relata:onboarded:v1`, `relata:cookies:v1`.
- Policy pages are draft text for a personal-use deployment and need review before public launch.

### Saved library

`src/lib/library.ts` validates all imported entries before merging. The versioned `relata:library:v1` key holds at most 500 studies. `/app/saved` redirects to `/app/library`; the existing `/app` robots exclusion covers it, and it is excluded from the public sitemap. `npm run build:vercel` runs the repository's Vercel build (`npm run build`); both hosts currently consume the same dist output.

### Citation export

Pure formatting and export functions live in `shared/citations.ts`. BibTeX collision suffixes are assigned by record id, so changing library sort order keeps keys stable for the same set. CSV neutralizes formula prefixes; RIS strips line breaks from metadata. Run `tests/e2e/citations.py` against the built fixture harness for individual and library exports.

### Search URLs

`shared/search.ts` owns the query and filter Zod schemas used by the API and URL parser. Each parameter is validated independently; duplicate parameters are ignored. `ResearchProvider.start` owns navigation for new searches; history restoration passes `fromUrl` to avoid a new history entry. `tests/e2e/search-links.py` counts search requests without repeated reloads.

### Source notices and lookup recovery

`Study.sourceNotices` retains source attribution. Only Crossref `updated-by` marks this record as affected; `update-to` describes another record and must not flag the notice itself as retracted. Summary requests accept ids only, rebuilding cache misses through `server/research/lookup.ts`. Source flags are excluded from AI prompts and checked before cached summaries. `tests/e2e/source-flags.py` exercises the retracted and corrected fixtures.

### Related studies

`GET /api/studies/:id/related` uses the search rate limiter. The server resolves the parent by id, reads OpenAlex relationships and verifies up to 10 unique candidates with three concurrent lookups. Browser metadata never supplies relationship ids. `tests/e2e/related.py` covers success, empty records and upstream failure in the harness.

### Recent searches

`src/lib/recent-searches.ts` validates the versioned `relata:recent-searches:v1` key and refuses document-origin input before persisting anything. The provider records typed queries and filters only, at most 8, and syncs storage changes between tabs. Settings also clears recent history. `tests/e2e/recent-searches.py` verifies upload exclusion.


### Operational updates

- Footer report drafts use `shared/contact.ts` and the health endpoint's configured contact email. The current address is prefilled, including its query string; nothing is sent automatically.
- `server/spa.ts` replaces default metadata and supplies unique public-page titles, descriptions, Open Graph and Twitter tags. Unknown/app paths use a generic description without user text. PUBLIC_URL still controls canonical and image URLs.
- See README's shared rate limiting section before introducing Upstash or Vercel KV. A shared store must preserve atomic budgets, trusted IP handling and explicit outage behavior; provider cost approval is required first.
- Browser smoke check: `tests/e2e/operations.py`. New feature checks: `library.py`, `citations.py`, `search-links.py`, `source-flags.py`, `related.py`, `recent-searches.py`. They use the fixture harness and accept BROWSER_CDP_URL. Pace suites so search requests remain below 40 per minute; avoid repeated reload loops.
