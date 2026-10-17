# Changelog

## Bug fixes, AI model update and design refresh

How each item was verified:
- **Reproduced, then fixed** (a script or browser run showed the bug before and not after, plus a new test in
  `tests/fixes.test.ts`): empty and oversized search plans, re-verify identity, stale research window, older Safari,
  unconfigured AI provider.
- **Checked against current vendor documentation, fixed defensively** (needs a live key to confirm): Gemini model
  default and Gemini 3 settings, model-not-found messages.
- **Found by code review, verified after the fix**: Windows `npm start`, `/index.html`, citation file names,
  example focus, error-state header, privacy page character limit.

### Bugs fixed
- **Some texts could not be searched at all.** With AI off or unavailable, a passage with no usable keywords (for
  example only numbers) sent an empty query, and text without spaces (Chinese, Japanese, Thai) built keyword phrases
  over the 100 and 300 character limits. Both failed with a cryptic "Invalid request" error. The keyword plan now always
  fits the limits and falls back to the text's opening words; input with nothing to search (such as "?!") gets a clear
  message.
- **Re-verifying a saved study broke it.** A study first found through Crossref came back from the re-check under its
  OpenAlex id, so its card showed "Save" instead of "Saved" and pressing it saved a second copy. Saved studies now keep
  the id they were saved under.
- **The sidebar showed the old research window** after the default was changed in Settings, until a new search ran.
- **Searching failed in Safari before 17.4** (iOS 16 and early iOS 17): `AbortSignal.any` does not exist there, so every
  request failed with "Could not reach the Relata server". A fallback is used when it is missing, and timeouts are told
  apart from cancellations by the signals rather than by error names, which differ between browsers.
- **The Search page could state something untrue.** With a provider chosen in Settings that the server has not set up,
  it said "your text is sent to OpenAI" although nothing was sent, and the results then said AI was "not set up on this
  server" while the other provider was. Unconfigured providers can no longer be chosen in Settings, the Search and
  landing pages run without AI in that case and say why, and the server names the missing provider.
- **`npm start` failed on Windows.** `NODE_ENV=production tsx ...` is Unix shell syntax. Production mode is now set in
  `server/start.ts`.
- `/index.html` served the raw build template (with its placeholder comment) as a "Page not found" screen. It now
  redirects to `/`.
- Exported file names could start with a dash or come out as `-` for non-Latin searches ("--bibliography-apa.txt").
- Clicking an example while a document was loaded did not focus the text box.
- After a failed search the Studies header still said "Searching verified scholarly sources…".
- The Privacy Policy always said 6,000 characters are sent to AI, even when `AI_MAX_INPUT_CHARS` was changed.

### AI providers
- **Default Gemini model is now `gemini-3.8-flash`.** Google's Gemini API release notes (18 September 2026) limit the 2.5
  models to projects that already used them, so a new key could not use the old default `gemini-2.5-flash`. Gemini 3
  models get `thinkingLevel: "low"` and the default temperature, as Google's Gemini 3 guide describes; 2.5 Flash keeps
  its thinking budget of 0. If a model rejects the thinking setting, the request is retried once without it.
- A retired or mistyped `GEMINI_MODEL` or `OPENAI_MODEL` is now logged as "model is not available to this API key"
  with the setting to change, instead of a bare "HTTP 404".
- `.env.example` notes that OpenAI lists `gpt-4.1-mini` for removal from the API on 14 January 2027. It is still the
  default because it still works; choose its replacement before that date.

### Design
- New visual system: warm paper background with white working surfaces, hairline borders and one soft shadow, in place
  of the paired "soft UI" shadows that made every surface the same grey. One ink-blue accent, also used by the favicon
  and browser theme colour.
- Study cards are separate cards with a clearer order: title, authors, year, venue and citation count, source badges,
  then the AI notes in a labelled panel, then actions. The landing page's example result now uses the same card styles,
  so it shows the real layout (including the "Cited by" count it already promised).
- Routine information (such as the "up to 100 records" note shown on most searches) is a quiet line under the Studies
  header; warnings keep their highlighted box.
- Landing page: facts row in the hero, card layouts for the steps, checks and AI sections, icons from the existing
  icon set, sticky header on larger screens, single-row navigation on phones.
- Search page: keyboard shortcut hint; filters on phones open as one card instead of a box inside a box; Settings
  sections are cards; dialogs have a header bar; onboarding shows its progress.
- All existing rules still hold: 5px corner radius on every button-style control, no gradients, pill buttons or emoji,
  no em or en dashes in visible text, no scroll or cursor animation. Every text colour passes WCAG AA in both themes
  (checked by `tests/e2e/editorial.py`, 204 checks).

### Tests
- `tests/fixes.test.ts` (11 tests) covers the fixes above; `tests/spa.test.ts` checks the `/index.html` redirect.
  77 unit and pipeline tests in total.
- The fixture harness raises its own rate limits, so the browser suites can run back to back (the editorial suite used
  to stop partway with "Too many AI analysis requests").
- README screenshots retaken.

## Repository housekeeping
- New `README.md` for the repository, with screenshots in `docs/screenshots/`. The detailed developer notes that used to be the README are now in `docs/DEVELOPMENT.md`.
- Stopped tracking the compiled Python file `tests/e2e/__pycache__/seen.cpython-313.pyc` and ignored `__pycache__/` and `*.pyc`.

## Filters, real 404s and launch basics
- Filter dropdowns no longer clip: "(your default)" is now "(default)", the type "Other (books, chapters, reports, theses)" is now "Other (books, reports)", the filter panel is one column on phones, two on tablets and three on desktop. A new browser test measures every option at 15 screen widths.
- Unknown addresses now return HTTP 404 (with `noindex`) instead of 200; old and trailing-slash addresses redirect with 301 and keep the query string. Routes moved to `shared/routes.ts` so the server and browser agree.
- Added `/robots.txt`, `/sitemap.xml`, Open Graph and Twitter card tags, a canonical link and a share image. The sitemap, canonical link and absolute image address need the new `PUBLIC_URL` setting.
- New tests: `tests/spa.test.ts` (9 tests, including real HTTP requests) and `tests/e2e/layout.py` (15 checks).

## First-visit flow
- Terms and Conditions popup on the landing page (summary of the main points, accept, or read the full terms), with a cookie notice below it ("Accept cookies" or "Close", plus a link to cookie settings).
- Three-step introduction for new visitors, shown once on the landing page or the Search page. Back, Next and Skip; Escape skips.
- Popups trap keyboard focus, make the page behind them inert, restore focus on close and work with storage blocked.
- Popups and the cookie notice have no glow: flat card with a border, and the page behind the popup is blurred instead.
- Cookie Policy page gained a "Your cookie setting" section and lists the three new storage keys.
- New: `tests/firstrun.test.ts` (5 tests) and `tests/e2e/firstrun.py` (42 checks). Older e2e scripts pre-set the first-visit keys.

## Landing page and site structure
- New landing page at `/` (concrete headline, working search box, how it works, what is checked, where AI is used, data handling). The research tool moved to `/app/...`; old addresses redirect.
- Button corner radius is 5px everywhere through the `--r-btn` token (buttons, segmented controls, nav links, example chips, skip link).
- Public header and footer with links to the Privacy Policy and Terms and Conditions pages; layout-aware 404 page.
- Anchor links (`/#how-it-works`) work from any page and on first load.
- Login seam added with no visible UI (see README, "Adding login later").
- Research window label now reads "2016 to 2026" instead of using an en dash. Remaining em and en dashes removed from visible text.
- New tests: `tests/routes.test.ts` and `tests/e2e/site.py` (33 checks). Older e2e scripts updated for `/app` paths.

## Earlier: bug-fix and hardening pass

How each item was verified:
- **Reproduced, then fixed** (failing test or browser run before, passing after): tag stripping, APA authors, non-Latin
  normalisation, keyword queries, truncation, CRLF, cancelled shared loads, stuck AI summaries.
- **Found by code review, verified after the fix** (tests or browser run): storage/crash hardening, settings/library
  validation, CSV BOM, tab focus, redirect/abort handling in `fetchJson`, partial-failure notice.
- **Found by code review, fixed defensively, not reproduced** (depend on live services or deployment config): Gemini
  thinking budget, `FRAME_ANCESTORS` quoting, multipart file-name decoding, withdrawal notices, JSON body limit.

## Bugs fixed

### Data correctness
- **Scientific text was silently corrupted.** `stripTags` removed everything between any `<` and the next `>`,
  so an abstract containing `p < 0.05 and n > 10` became `p 10`. It now removes only real tags. The same
  flaw existed in the AI-output cleaner and the Markdown reader. Inline tags no longer insert spaces
  (`H<sub>2</sub>O` stays `H2O`, not `H 2 O`).
- **APA citations repeated the last author** when only part of a long author list was stored
  (`…, Chan, B., . . . Chan, B.`). They now end in "et al." instead of repeating or inventing an author.
  Hyphenated given names now give `J.-P.` instead of `J. P.`.
- **Non-Latin titles were erased** by title normalisation (`[^a-z0-9]`), which broke de-duplication and keyword
  extraction for Cyrillic, Greek, CJK and similar text. Matching is now Unicode-aware.
- **Keyword-only searches (no AI) built poor queries** such as `neural networks networks medicine medicine neural`
  from overlapping bigrams. Phrases no longer overlap and queries never repeat a word.
- **Retraction flags missed Crossref "withdrawal" notices.**
- `truncate` / `excerpt` dropped the last whole word when the cut landed exactly on a word boundary.
- Windows (CRLF) text uploads kept stray `\r` characters.

### Reliability
- **A cancelled request could fail other users' identical in-flight request** (shared cache load inherited the
  first caller's abort). Followers now retry their own load; genuine upstream errors are still shared.
- **AI summaries could stay on "loading" forever.** Changing a filter or retrying during summarisation aborted the
  request but left the studies marked as loading, so they were never summarised again.
- Searching used stale filters if they were changed while the topic was still being analysed.
- "Load more" could be left stuck in its loading state after a competing search replaced it.
- Partial search failures (one of several queries failing) were hidden; a warning is now shown and the result is
  not cached.
- A cached results page could outlive the verified-study store, making summaries fail with "missing".
- Failed "insufficient" AI notes were cached for 6 hours; only successful notes are cached now.
- Gemini 2.5 Flash could truncate its JSON because hidden "thinking" tokens count against the output budget.
- `fetchJson`: aborted-before-start requests, redirects (now followed by hand and only to allow-listed hosts),
  `blocked` errors being retried, and a dead ternary.
- Server now exits with a clear message on `EADDRINUSE` and shuts down gracefully on SIGINT/SIGTERM.
- JSON body limit was fixed at 300 kB and could reject valid input when `MAX_INPUT_CHARS` was raised; it is now derived
  from config.

### Crashes and robustness
- **Blocked or disabled browser storage crashed the Cite dialog** (unguarded `localStorage` call during render).
- **Corrupted saved data could white-screen the app.** Library and settings are now validated on load, and an
  error boundary prevents any single render error from blanking the page.
- Invalid stored settings (e.g. `yearsBack: 7`) made every search fail with HTTP 400; they are now sanitised.
- Settings were persisted from inside a React state updater (impure under StrictMode); moved to an effect.
- Client requests had no timeout; a hung connection meant an endless spinner (now 90 s, with a clear message).

### UX and accessibility
- Saved tabs: arrow keys changed the selection but not focus, stranding keyboard users; Home/End added.
- Saved page showed a broken empty view if the selected collection was deleted elsewhere.
- CSV export lacked a UTF-8 BOM, so Excel garbled accents and non-Latin text.
- "Remove filters" and the active-filter count ignored the user's own default research window.
- Drag-and-drop highlight flickered when the pointer crossed child elements.
- 404 page used a full-page reload link instead of client-side navigation.
- `FRAME_ANCESTORS=self` (unquoted, as `.env` files usually are) produced an invalid CSP.
- Multipart file names are decoded as UTF-8 (defensive; multer decodes them as latin1 in some configurations).

## Structure
- `ErrorBoundary` component; safe `readString`/`writeString` storage helpers; `sanitizeSettings` / `sanitizeLibrary`.
- Replaced the type-unsafe lazy-loading cast in `App.tsx` with a typed helper.
- Tests: 18 → 33 (regression tests for each text, citation, cache and HTTP fix, plus a pipeline partial-failure test).
  Browser tests added under `tests/e2e/`.
