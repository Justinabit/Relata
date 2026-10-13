import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rememberSearch, loadRecentSearches, saveRecentSearches } from '../src/lib/recent-searches.js';
import { searchFiltersSchema } from '../shared/search.js';
const filters = searchFiltersSchema.parse({});
test('recent history keeps 8 distinct query/filter pairs in most recent order', () => {
  let recent: ReturnType<typeof rememberSearch> = [];
  for (let i = 0; i < 10; i++) recent = rememberSearch(recent, `query ${i}`, filters, 'text');
  assert.equal(recent.length, 8); assert.equal(recent[0].query, 'query 9'); assert.equal(recent[7].query, 'query 2');
  recent = rememberSearch(recent, 'query 3', filters, 'text');
  assert.equal(recent.length, 8); assert.equal(recent[0].query, 'query 3');
  recent = rememberSearch(recent, 'query 3', { ...filters, sort: 'cited' }, 'text');
  assert.equal(recent[0].filters.sort, 'cited'); assert.equal(recent[1].filters.sort, 'relevance');
});
test('document text and long passages are never retained, even if they are short enough to be a query', () => {
  assert.deepEqual(rememberSearch([], 'secret uploaded text', filters, 'document'), []);
  assert.deepEqual(rememberSearch([], 'x'.repeat(301), filters, 'text'), []);
});
test('storage unavailability is reported without throwing', () => {
  assert.deepEqual(loadRecentSearches(), { searches: [], failed: true });
  assert.equal(saveRecentSearches([]), false);
});
