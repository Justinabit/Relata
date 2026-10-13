import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeOpenAlexWork } from '../server/research/openalex.js';
import { normalizeCrossrefWork } from '../server/research/crossref.js';
import { reconcile } from '../server/research/reconcile.js';
import { summarizeStudies } from '../server/ai/summarize.js';
import { runSearch } from '../server/research/pipeline.js';
const oa = (retracted: unknown = false) => ({ id: 'https://openalex.org/W8765432100', title: 'Learning technology', publication_year: 2024, publication_date: '2024-01-01', is_retracted: retracted, type: 'article' });
const cr = (updates: unknown = []) => ({ DOI: '10.1234/flags', title: ['Learning technology'], issued: { 'date-parts': [[2024]] }, 'updated-by': updates });
test('OpenAlex requires a true boolean and records the source', () => {
  assert.equal(normalizeOpenAlexWork(oa('true'))!.isRetracted, false);
  assert.deepEqual(normalizeOpenAlexWork(oa(true))!.sourceNotices, [{ kind: 'retraction', source: 'openalex', doi: null }]);
});
test('Crossref corrections and retractions stay distinct; update-to is not a retraction of the notice', () => {
  const correction = normalizeCrossrefWork(cr([{ type: 'correction', DOI: '10.1234/notice' }]))!;
  assert.equal(correction.isRetracted, false); assert.equal(correction.sourceNotices![0].kind, 'correction');
  assert.equal(normalizeCrossrefWork(cr([{ type: 'retraction' }]))!.isRetracted, true);
  assert.equal(normalizeCrossrefWork({ ...cr(), 'update-to': [{ type: 'retraction' }] })!.isRetracted, false);
  assert.deepEqual(normalizeCrossrefWork(cr([{ type: 'unknown' }]))!.sourceNotices, []);
});
test('reconciliation preserves every source notice', () => {
  const merged = reconcile(normalizeOpenAlexWork(oa(true))!, normalizeCrossrefWork(cr([{ type: 'correction' }]))!);
  assert.equal(merged.isRetracted, true); assert.equal(merged.sourceNotices!.length, 2);
});
test('cold summary request rebuilds by id and skips a retracted study without calling AI', async () => {
  const real = globalThis.fetch; const urls: string[] = [];
  globalThis.fetch = (async (url) => { urls.push(String(url)); assert.ok(String(url).startsWith('https://api.openalex.org/works/W')); return Response.json(oa(true)); }) as typeof fetch;
  try {
    const result = await summarizeStudies({ ids: ['W8765432100'], topic: 'learning', preference: 'auto' });
    assert.deepEqual(result.skipped, ['W8765432100']); assert.deepEqual(result.insights, {});
    assert.equal(urls.length, 1);
  } finally { globalThis.fetch = real; }
});
test('retracted studies remain ranked normally unless the explicit filter is on', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ results: [oa(true), { ...oa(), id: 'https://openalex.org/W8765432101' }], meta: { count: 2 } })) as typeof fetch;
  try {
    const filters = { yearsBack: 10 as const, sources: ['openalex' as const], openAccessOnly: false, type: 'any' as const, sort: 'relevance' as const };
    const request = { query: 'learning flags', expandedQueries: [], concepts: [], filters, page: 1, perPage: 10 };
    assert.equal((await runSearch(request)).studies.length, 2);
    const hidden = await runSearch({ ...request, filters: { ...filters, hideRetracted: true } });
    assert.equal(hidden.studies.length, 1); assert.equal(hidden.studies[0].isRetracted, false);
  } finally { globalThis.fetch = real; }
});
