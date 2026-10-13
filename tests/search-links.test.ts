import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSearchParams, searchLink } from '../shared/search.js';
import { searchBody } from '../server/routes/schemas.js';
test('search URL roundtrips all filters through API rules', () => {
  const state = parseSearchParams(new URLSearchParams('q=caf%C3%A9&yearsBack=5&sources=openalex&openAccessOnly=true&type=review&sort=cited'));
  const link = searchLink(state.query!, state.filters);
  assert.deepEqual(parseSearchParams(new URL(link, 'https://example.org').searchParams), state);
  assert.ok(searchBody.safeParse({ query: state.query, filters: state.filters }).success);
});
test('bad parameters fall back independently and unknown parameters are ignored', () => {
  const state = parseSearchParams(new URLSearchParams('q=learning&yearsBack=999&sources=evil&type=script&sort=newest&openAccessOnly=yes&provider=evil'));
  assert.equal(state.filters.yearsBack, 10); assert.equal(state.filters.sort, 'newest');
  assert.deepEqual(state.filters.sources, ['openalex']); assert.equal(state.filters.openAccessOnly, false);
});
test('duplicate and oversized queries never start a search', () => {
  assert.equal(parseSearchParams(new URLSearchParams('q=a&q=b')).query, null);
  assert.equal(parseSearchParams(new URLSearchParams({ q: 'x'.repeat(301) })).query, null);
  assert.equal(parseSearchParams(new URLSearchParams('q=%20%20')).query, null);
});
test('unsupported source filters reconcile exactly as normal API requests', () => {
  const state = parseSearchParams(new URLSearchParams('q=learning&sources=crossref&openAccessOnly=true&type=review'));
  assert.equal(state.filters.openAccessOnly, false); assert.equal(state.filters.type, 'any');
});
