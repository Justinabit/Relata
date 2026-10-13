# Relata

**Find recent, verifiable studies on your topic.**

Relata is a research discovery tool for students and researchers. Paste a topic, a question or an abstract, or upload a PDF, DOCX, TXT or Markdown file. Relata searches OpenAlex and Crossref and lists studies with their authors, year, journal and a DOI link, plus related concepts and the search steps behind them.

![The Relata landing page, with a search box and a short explanation of how a search works](docs/screenshots/landing.png)

## Status

Relata has been tested with stubbed and fixture data, not against live OpenAlex, Crossref or AI services. Before relying on the results, run it with real keys and check a few topics you know well. The Privacy, Terms and Cookie pages are draft text and need a legal review before a public launch. See [Deploying](#deploying).

## What it does

- Searches OpenAlex (the main source) and Crossref, merges duplicates and lists each study with a link to its source record.
- Checks DOIs against Crossref and marks each one "Verified DOI", "DOI not found in Crossref" or "DOI unchecked". When the two sources disagree, it says so and shows both values.
- Filters by publication window (1, 3, 5 or 10 years by default, older ranges clearly labelled), study type, open access and source.
- Saves studies, topics and searches in the browser, with collections. No account is needed.
- Copies citations in APA 7, MLA 9 or Chicago (author-date), and exports results as .txt, .csv or .json.
- Reads uploaded documents in server memory and discards them. Nothing is written to disk.
- Works without AI. If no AI key is set, or the AI service fails, search, verification, filters, saving and citations all still work.
- Light and dark themes, keyboard navigation, and a layout that works on phones.

## How results are kept honest

- Every study comes from an OpenAlex or Crossref record. AI never supplies studies and never changes authors, dates, DOIs or links.
- A study with no valid publication date is excluded. A study with no DOI or landing page shows "Source link unavailable" instead of a guessed link.
- Relata does not score studies for quality, and it does not call work peer-reviewed, because the source data does not say so reliably.
- If the scholarly sources cannot be reached, Relata says so and shows no results.
- Results are relevant studies found through the available sources, not a complete list of everything written on a topic.

### Where AI is used

AI (Google Gemini or OpenAI, your choice) is optional and labelled wherever it appears. It finds the main topic, expands keywords, writes short definitions, suggests related topics, and writes short relevance notes on studies that were already retrieved. Any statement containing a link, DOI or number that is not in the source record is discarded. Only the opening part of your text is sent, and only when AI is switched on for that search.

## Screenshots

| Search page | Dark theme |
|---|---|
| ![The search page with the sidebar, text box, upload button and example topics](docs/screenshots/search.png) | ![The landing page in the dark theme](docs/screenshots/landing-dark.png) |

## Quick start

You need Node.js 20 or newer.

```bash
npm install
cp .env.example .env     # optional: add API keys (they stay on the server)
npm run dev              # API on :8787 and the Vite dev server on :5173
```

Open http://localhost:5173. For a production build:

```bash
npm run build
npm start                # serves the API and the built app on :8787
```

Without any keys, Relata still runs. Adding a free OpenAlex key is strongly recommended, because the shared keyless budget is small.

## Configuration

Everything is set through environment variables, read on the server only. Keys are never sent to the browser or stored in local storage. See `.env.example` for the full list.

| Variable | Purpose | Default |
|---|---|---|
| `OPENALEX_API_KEY` | Larger OpenAlex budget (free key) | none |
| `GEMINI_API_KEY`, `OPENAI_API_KEY` | Turn on AI features. Either one, or both | none |
| `PRIMARY_AI_PROVIDER` | Which provider to try first: `gemini` or `openai` | `gemini` |
| `CONTACT_EMAIL` | Shown on the Contact page and policies, sent to Crossref | none |
| `PUBLIC_URL` | Public address, for the sitemap, canonical links and share image | none |
| `PORT` | Server port | `8787` |
| `TRUST_PROXY` | Set to `true` behind a reverse proxy, so rate limits see real visitor IPs | `false` |
| `MAX_UPLOAD_MB` | Largest upload | `8` |
| `MAX_INPUT_CHARS` | Longest pasted text | `20000` |
| `AI_MAX_INPUT_CHARS` | Most text ever sent to an AI provider | `6000` |
| `RATE_LIMIT_SEARCH`, `RATE_LIMIT_AI`, `RATE_LIMIT_UPLOAD`, `RATE_LIMIT_GENERAL` | Requests per minute per IP | `40`, `20`, `8`, `240` |

## Deploying

Relata is one Node process: it serves the API and the built front end. Any host that runs `npm run build` and `npm start` on Node 20 or newer will do. Before deploying changes:

1. **Set `CONTACT_EMAIL`** to an address you monitor. Without it the Contact page says none is set.
2. **Set `PUBLIC_URL`** to your final address, for example `https://relata.example`. Without it there is no sitemap, canonical link or share image.
3. **Turn on HTTPS first.** The server sends a Strict-Transport-Security header that includes subdomains, which browsers remember for a year. Make sure every subdomain of your domain supports HTTPS before you deploy.
4. **Set `TRUST_PROXY=true`** if your host puts a proxy in front of Relata. Otherwise all visitors share one IP address and one rate limit.
5. **Set a spending limit or alert** on any AI account whose key you use.
6. **Have the policy pages reviewed**, then remove the "draft" banner (the `draft` flag on each page in `src/pages/InfoPages.tsx`).
7. **Run it with real keys** and check several real topics and a real upload before you announce it.

The site also serves `/robots.txt`, which hides the tool and the API from search engines, and a real HTTP 404 for unknown addresses.

### Vercel

Deploy the repository root. `vercel.json` builds the frontend and packages the existing Express app as one Node function through `api/handler.ts`. API requests and page navigation go to Express, preserving redirects, metadata and real 404s; built assets are served directly by Vercel. The standalone `npm start` command is for other Node hosts.

In the Vercel project's environment settings, set `PUBLIC_URL` to your production address, `CONTACT_EMAIL`, and your provider keys as needed. Set `MAX_UPLOAD_MB=4`: Vercel's function request limit is 4.5 MB, including multipart overhead. Enable Fluid compute so the configured 120-second function duration is supported. Visitor IPs are trusted through Vercel's gateway by the function entry point.

Deploy a new build containing this configuration. Redeploying an older commit will keep the old routing. After deployment, `/api/health` must return JSON with `"status":"ok"`; then try a search, a small document upload and a direct visit to `/app/research`.

Caches, rate limits and the verified-study store are held in each function instance's memory. They reset on cold starts and are not shared across instances; summary requests rebuild verified records by id when the instance has no cached study. For shared limits and state across instances, use a shared store before scaling up.

## Tests

```bash
npm test                 # unit and pipeline tests, stubbed upstreams, no network needed
npm run typecheck
```

Browser tests drive a real browser against a fixture server and are described in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). The fixture server is a local QA tool only. It serves clearly labelled "[Fixture]" studies and is never started by `npm start`.

## Project structure

```text
shared/    types, research window, filter capabilities, citation formatting, routes
server/    Express API: research/ (OpenAlex, Crossref, dedupe, reconcile),
           ai/ (providers, schemas, guards), documents/ (file extraction), middleware/
src/       React 19 and TypeScript app: pages/, components/, state/, styles/
public/    favicon and share image
tests/     unit and pipeline tests, plus e2e/ (Playwright, Python) and harness/
docs/      development notes and README screenshots
```

Built with Express 5, React 19, Vite and TypeScript. There is no database. Searches are cached in memory only, so restarting the server clears the caches and nothing else.

## Pages

| Address | Page |
|---|---|
| `/` | Landing page with a working search box |
| `/app` | Search: paste text or upload a file |
| `/app/search`, `/app/library`, `/app/settings` | Results, saved library, settings |
| `/about`, `/contact`, `/privacy`, `/terms`, `/cookies`, `/disclaimer`, `/ai-use` | Information and policy pages |

## Design rules

Relata is meant to look like a finished product, not a template. These rules apply to everything added to the site:

- Every button-style control uses one corner radius, `--r-btn` (5px) in `src/styles/tokens.css`.
- No gradients, pill-shaped buttons, emoji icons, fake reviews, fake metrics or customer counters.
- No em or en dashes in visible text.
- No scroll-triggered or cursor-following animation.
- No generated photos. Use real screenshots.
- Copy says what the product does, and nothing it does not do.

## Privacy in short

No accounts, analytics, advertising trackers or cookies. Settings, saved studies and searches stay in your own browser and can be cleared from Settings. Uploaded documents are read in server memory and discarded. The full text is on the Privacy page in the app.

## Known limits

- Scanned PDFs are not supported, because there is no OCR.
- A search checks up to 100 records per source and query and shows up to 100 eligible studies. The results page says so when that limit applies. Refine your keywords to go further.
- Caches are in memory, so each server instance has its own.
- Public pages have individual share titles and descriptions; search queries are not included in server preview tags.
- Browser tests run in Chromium only.

## Planned

Sign-in is planned but not built. The code has places ready for it (`src/state/auth.tsx`, `src/components/AccountSlot.tsx`, `server/auth/context.ts`), and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) lists the steps. The Privacy and Terms pages say there are no accounts and must be updated when sign-in is added.

## Data sources

Bibliographic metadata comes from [OpenAlex](https://openalex.org) (CC0) and [Crossref](https://www.crossref.org). Relata is not affiliated with or endorsed by either, or by any AI provider it can use.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

No license file is included yet. Add one (for example MIT or Apache-2.0) before you accept contributions or let others reuse the code.

### Saved library

Use `/app/library` to filter, sort, remove, export or import saved research. JSON imports merge by study id and reject invalid files or a merged library over 500 studies. Saved in this browser only. Export to keep a copy. Storage can be unavailable or cleared by the browser; backups are your responsibility.

### Citation export

Each study and the whole library support APA 7, MLA 9 and Chicago author-date copying, and BibTeX, RIS and UTF-8 CSV downloads. Missing fields are omitted. Known limits: source author lists can be truncated; name order and capitalization should be checked against the original paper and your style guide. Exports use only available metadata, with no invented volume, issue or page numbers.

### Shareable searches

Copy a search link from `/app/search` to share a typed query and its filters. Back and forward restore them. Known limits: uploaded documents and passages longer than 300 characters are not placed in links. Search results can change when the scholarly indexes change; links describe queries, not frozen result sets.

### Source notices

OpenAlex retractions and Crossref retraction/correction notices appear on cards and details. Retracted studies stay in normal search order unless you enable Hide retracted studies. AI summaries are skipped for them. Known limits: notices depend on what the sources report and their cache freshness; an absent notice is not a guarantee that a paper is current. Saved copies retain their last metadata until re-checked.

### Related studies

Use Related studies on a card to retrieve up to 10 OpenAlex related works and references. Records are fetched by id and verified, including after an instance restart. Known limits: Crossref-only records without an OpenAlex match may have no relations. References can be older than your search window, and upstream failures may leave a partial list with a notice.

### Recent searches

The Search page keeps the last 8 typed queries and filters in this browser. Select one to run it again or use Clear recent searches. Known limits: uploaded document text and typed passages over 300 characters are excluded; browser storage may be cleared or unavailable.

### Report a problem and share previews

The footer opens a draft email to `CONTACT_EMAIL` with the current page address. If contact email is unset, it links to the Contact page. Each public page receives its own title and description from `server/spa.ts`, including Open Graph and Twitter tags before JavaScript runs. Known limits: email requires a configured mail client; external preview services may cache old tags.

### Adding shared rate limiting later

Current limiters in `server/middleware/security.ts` use `express-rate-limit` memory stores. On Vercel, requests to different instances do not share a budget. No paid service is configured by this patch.

When you choose to add Upstash Redis or a Vercel Marketplace KV/Redis store:

1. Obtain approval for the provider and its costs, then provision a database near the function region. Keep its endpoint and credentials in server environment variables only.
2. Add an `express-rate-limit` compatible store adapter using atomic increment and expiration operations. Supply a separate store/prefix for each general, search, AI and upload limiter; preserve the current window, limits and 429 JSON/Retry-After behavior.
3. Keep client IP handling restricted to the trusted Vercel gateway. Use the library's IPv6-safe key generator. Do not key by query text or upload contents, and do not store them in Redis.
4. Decide explicitly how store failures behave. For paid AI/upload work, return a temporary unavailable response when the shared budget cannot be checked; expose outages in server monitoring. Avoid silently falling back to independent memory budgets.
5. Test simultaneous requests through two app instances, window expiry, IPv4 and IPv6 clients, proxy spoofing, provider timeouts and 429 responses. Set storage retention to the limit window and monitor request cost and latency before rollout.

Shared rate limiting does not automatically share metadata caches or the study store. Id-based lookup recovery must continue to work without them.
