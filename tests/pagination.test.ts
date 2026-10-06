import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import type { SearchParams } from '../server/research/pipeline.js';
import type { Study } from '../shared/types.js';

// This file exercises real pool caching; other pipeline tests disable caches independently.
process.env.SEARCH_CACHE_SECONDS = '900';
process.env.OPENALEX_API_KEY = 'test-key-not-real';
const { runSearch } = await import('../server/research/pipeline.js');
const { studyStore } = await import('../server/research/store.js');
const realFetch = globalThis.fetch;
let calls: URL[] = [];
let respond: (url: URL) => Response;
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const year = new Date().getUTCFullYear();
const work = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: `https://openalex.org/W${7000000000 + n}`, title: `Learning technology study ${n}`,
  publication_year: year - n % 5, publication_date: `${year - n % 5}-01-01`,
  type: 'article', cited_by_count: n * 3, authorships: [], topics: [], ...overrides,
});
const params = (query: string, overrides: Partial<SearchParams> = {}): SearchParams => ({
  query, expandedQueries: [], concepts: [], page: 1, perPage: 10,
  filters: { yearsBack: 10, sources: ['openalex'], openAccessOnly: false, type: 'any', sort: 'relevance' },
  ...overrides,
});

before(() => {
  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    return respond(url);
  }) as typeof fetch;
});
after(() => { globalThis.fetch = realFetch; });

test('filtered, duplicate-heavy multi-query results are complete and stable for every sort and page size', async () => {
  calls = [];
  respond = (url) => {
    assert.equal(url.hostname, 'api.openalex.org');
    assert.equal(url.searchParams.get('per_page'), '100');
    const results = Array.from({ length: 80 }, (_, i) => work(i + 1, i < 13 ? { publication_date: 'bad date' } : {}));
    if (url.searchParams.get('search')?.endsWith('expanded')) results.reverse();
    return json({ meta: { count: 80 }, results });
  };
  for (const sort of ['relevance', 'newest', 'oldest', 'cited'] as const) {
    const input = params(`learning ${sort}`, { expandedQueries: [`learning ${sort} expanded`] });
    input.filters.sort = sort;
    let expected: string[] | undefined;
    const beforeCalls = calls.length;
    let poolId: string | undefined;
    for (const perPage of [10, 20, 50]) {
      const all: Study[] = [];
      for (let page = 1; ; page++) {
        const response = await runSearch({ ...input, page, perPage });
        poolId ??= response.searchId;
        assert.equal(response.searchId, poolId);
        assert.equal(response.counts.eligible, 67);
        assert.equal(response.counts.duplicatesRemoved, 80);
        assert.equal(response.counts.retrieved, 160);
        assert.equal(response.counts.displayed, response.studies.length);
        assert.ok(response.studies.length > 0);
        assert.equal(response.notices.some((n) => n.code === 'DEPTH_LIMIT'), false);
        all.push(...response.studies);
        assert.equal(response.hasMore, all.length < 67);
        if (!response.hasMore) break;
        assert.ok(page < 10, 'pagination must terminate');
      }
      const ids = all.map((s) => s.id);
      assert.equal(all.length, 67);
      assert.equal(new Set(ids).size, 67);
      assert.ok(Array.from({ length: 67 }, (_, i) => `W${7000000014 + i}`).every((id) => ids.includes(id)));
      expected ??= ids;
      assert.deepEqual(ids, expected, 'changing page size must not change ranking or skip records');
      if (sort === 'relevance' || sort === 'cited') assert.equal(ids[0], 'W7000000080');
      for (let i = 1; i < all.length; i++) {
        if (sort === 'newest') assert.ok(all[i - 1].publicationYear >= all[i].publicationYear);
        if (sort === 'oldest') assert.ok(all[i - 1].publicationYear <= all[i].publicationYear);
        if (sort === 'cited') assert.ok(all[i - 1].citationCount! >= all[i].citationCount!);
      }
    }
    assert.equal(calls.length - beforeCalls, 2, 'cached pages and page sizes must share discovery');
    studyStore.clear();
    const cached = await runSearch({ ...input, page: 2 });
    assert.equal(cached.cache.metadata, 'cached');
    assert.ok(cached.studies.every((s) => studyStore.get(s.id)));
    assert.equal(calls.length - beforeCalls, 2);
  }
});

test('discovery and visible pools are bounded at 100, with a limit notice and a real last page', async () => {
  calls = [];
  respond = (url) => {
    assert.equal(url.searchParams.get('per_page'), '100');
    const offset = url.searchParams.get('search')?.endsWith('expanded') ? 100 : 0;
    return json({ meta: { count: 1000 }, results: Array.from({ length: 100 }, (_, i) => work(offset + i + 1)) });
  };
  const input = params('bounded learning', { expandedQueries: ['bounded learning expanded'], perPage: 50 });
  const first = await runSearch(input);
  const second = await runSearch({ ...input, page: 2 });
  const beyond = await runSearch({ ...input, page: 3 });
  assert.equal(first.counts.eligible, 100);
  assert.equal(first.studies.length, 50);
  assert.equal(first.hasMore, true);
  assert.equal(second.studies.length, 50);
  assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.studies, ...second.studies].map((s) => s.id)).size, 100);
  assert.deepEqual(beyond.studies, []);
  assert.equal(beyond.hasMore, false);
  assert.ok(first.notices.some((n) => n.code === 'DEPTH_LIMIT' && n.level === 'info'));
  assert.equal(calls.length, 2);
});

test('an exhausted pool with no eligible records returns no more pages', async () => {
  respond = () => json({ meta: { count: 20 }, results: Array.from({ length: 20 }, (_, i) => work(i, { type: 'dataset' })) });
  const result = await runSearch(params('empty eligible pool'));
  assert.deepEqual(result.studies, []);
  assert.equal(result.hasMore, false);
  assert.equal(result.counts.eligible, 0);
});

test('degraded discovery is not cached and a retry can recover missing studies', async () => {
  calls = [];
  let failed = true;
  respond = (url) => {
    const expanded = url.searchParams.get('search') === 'retry learning expanded';
    if (expanded && failed) return new Response('{}', { status: 400 });
    return json({ meta: { count: 1 }, results: [work(expanded ? 2 : 1)] });
  };
  const input = params('retry learning', { expandedQueries: ['retry learning expanded'] });
  const degraded = await runSearch(input);
  assert.equal(degraded.studies.length, 1);
  assert.ok(degraded.notices.some((n) => n.code === 'PARTIAL_OPENALEX'));
  failed = false;
  const beforeRetry = calls.length;
  const recovered = await runSearch(input);
  assert.ok(calls.length > beforeRetry);
  assert.equal(recovered.cache.metadata, 'live');
  assert.equal(recovered.studies.length, 2);
  assert.equal(recovered.notices.some((n) => n.level === 'warning'), false);
  const beforeCached = calls.length;
  assert.equal((await runSearch(input)).cache.metadata, 'cached');
  assert.equal(calls.length, beforeCached);
});

test('Crossref-only discovery also retrieves the bounded pool before local sorting', async () => {
  calls = [];
  respond = (url) => {
    if (url.hostname === 'api.openalex.org') return json({ results: [] });
    assert.equal(url.hostname, 'api.crossref.org');
    assert.equal(url.searchParams.get('rows'), '100');
    return json({ message: { 'total-results': 30, items: Array.from({ length: 30 }, (_, i) => ({
      DOI: `10.5555/pagination.${i}`, title: [`Crossref learning technology ${i}`],
      issued: { 'date-parts': [[year - 2, 1, i % 28 + 1]] }, type: 'journal-article', author: [],
    })) } });
  };
  const input = params('crossref learning technology');
  input.filters = { ...input.filters, sources: ['crossref'], sort: 'newest' };
  const first = await runSearch(input);
  const second = await runSearch({ ...input, page: 2 });
  const last = await runSearch({ ...input, page: 3 });
  assert.equal(first.counts.eligible, 30);
  assert.equal(first.hasMore, true);
  assert.equal(last.hasMore, false);
  const all = [...first.studies, ...second.studies, ...last.studies];
  assert.equal(new Set(all.map((s) => s.id)).size, 30);
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].publicationDate! >= all[i].publicationDate!);
  assert.equal(calls.filter((url) => url.hostname === 'api.crossref.org').length, 1);
});

test('cached pools expire and the computed year window participates in pool identity', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-12-31T23:59:59.000Z') });
  calls = [];
  respond = () => json({ meta: { count: 1 }, results: [work(1, { publication_year: 2026, publication_date: '2026-01-01' })] });
  const input = params('year boundary learning');
  const before = await runSearch(input);
  t.mock.timers.tick(2000);
  const after = await runSearch(input);
  assert.equal(after.window.toYear, 2027);
  assert.equal(after.window.fromYear, before.window.fromYear + 1);
  assert.equal(after.cache.metadata, 'live');
  assert.equal(calls.length, 2);
  t.mock.timers.tick(900001);
  assert.equal((await runSearch(input)).cache.metadata, 'live');
  assert.equal(calls.length, 3);
});
