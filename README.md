# Relata

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
python3 tests/e2e/layout.py                           # no dropdown option is clipped at 15 screen widths (run on its own: it uses one search)
python3 tests/e2e/firstrun.py                         # terms popup, introduction, cookie notice (new visitor paths, keyboard, mobile)
python3 tests/e2e/site.py                             # landing page, routing, 5px radius, no dashes, mobile (SHOTS=dir saves screenshots)
```

`browser.py` also covers maximum-sized AI analysis, complete pagination, and malformed entries mixed with valid saved research. Set `BROWSER_CDP_URL` to attach it to an existing Chromium session; `BASE_URL` overrides its fixture address.

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
| `/app/research` `/app/saved` `/app/settings` | Results, saved library, settings | tool |

Old addresses (`/research`, `/saved`, `/settings`) and trailing-slash addresses redirect permanently (301) and keep the query string. Any other unknown address gets a real HTTP 404 with `X-Robots-Tag: noindex`, and the app still shows its "Page not found" screen. All addresses live in `shared/routes.ts`, which both the browser and the server read, so a new page needs one entry there plus one in the route table in `App.tsx`.

## Going live: public address, sitemap and share previews

Set `PUBLIC_URL` (for example `https://relata.example`) in the environment. With it, the server adds a canonical link and absolute share-image tags to every page and serves `/sitemap.xml`; `/robots.txt` then names the sitemap. Without it the site still works, but there is no sitemap and no canonical or share-image tags, because those need an absolute address. `robots.txt` always hides `/app` and `/api/`. The share image is `public/og-image.png` (1200 x 630); replace it if the headline or logo changes. Share previews show the same title and description on every page.

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
- Search checks up to 100 candidates per source and query, verifies and ranks them, and exposes at most 100 eligible studies. Pages share the same cached pool regardless of page size, so the initial search may take longer. A notice explains when more candidates may exist. Expired caches and retries after partial provider failures can produce a fresh pool.
- Saved-library entries are validated before display. Malformed entries are skipped individually, and missing collection references are removed from the loaded view; loading does not overwrite local storage.
- No accounts, analytics or cookies. localStorage keys: `relata:settings:v1`, `relata:library:v1`, `relata:citestyle`, `relata:terms:v1`, `relata:onboarded:v1`, `relata:cookies:v1`.
- Policy pages are draft text for a personal-use deployment and need review before public launch.
