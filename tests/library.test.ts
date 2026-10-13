import assert from 'node:assert/strict';
import { test } from 'node:test';
import { libraryImportSchema, mergeLibrary, refreshSavedStudy, sanitizeLibrary } from '../src/lib/library.js';
import { normalizeOpenAlexWork } from '../server/research/openalex.js';
import { resolvePath, SITEMAP_PATHS } from '../shared/routes.js';
import { robotsTxt } from '../server/spa.js';
const empty = () => sanitizeLibrary({});
const entry = (id: number) => {
  const study = normalizeOpenAlexWork({ id: `https://openalex.org/W${3000000000 + id}`, title: 'Saved research', publication_year: 2024, publication_date: '2024-01-01', authorships: [] })!;
  return { studyId: study.id, savedAt: new Date().toISOString(), metadata: { ...study, abstract: null }, collectionIds: [] };
};
test('library import roundtrips and merges ids without replacing saved records', () => {
  const data = { ...empty(), studies: [entry(123)] };
  assert.deepEqual(mergeLibrary(data, JSON.parse(JSON.stringify(data))), data);
  assert.equal(mergeLibrary(data, { ...empty(), studies: [entry(124)] }).studies.length, 2);
});
test('invalid versions, incomplete records, mismatched ids and unsafe URLs are rejected', () => {
  for (const raw of [{ version: 2 }, { ...empty(), studies: [{}] }, { ...empty(), studies: [{ ...entry(123), studyId: 'wrong' }] }, { ...empty(), studies: [{ ...entry(123), metadata: { ...entry(123).metadata, url: 'javascript:alert(1)' } }] }]) assert.equal(libraryImportSchema.safeParse(raw).success, false);
});
test('library merge rejects overflow atomically and permits duplicates at capacity', () => {
  const data = { ...empty(), studies: Array.from({ length: 500 }, (_, i) => entry(1000 + i)) };
  assert.equal(mergeLibrary(data, data).studies.length, 500);
  assert.throws(() => mergeLibrary(data, { ...empty(), studies: [entry(9000)] }), /500 studies/);
  assert.equal(data.studies.length, 500);
});
test('library route is served, old address redirects and robots excludes app pages', () => {
  assert.deepEqual(resolvePath('/app/library'), { kind: 'page' });
  assert.deepEqual(resolvePath('/app/saved'), { kind: 'redirect', to: '/app/library' });
  assert.ok(!SITEMAP_PATHS.includes('/app/library'));
  assert.match(robotsTxt(null), /Disallow: \/app/);
});

test('reverification preserves saved ids, timestamps and collections after enrichment changes canonical id', () => {
  const saved = entry(123);
  const fresh = entry(124).metadata;
  const refreshed = refreshSavedStudy(saved, fresh);
  assert.equal(refreshed.metadata.id, saved.studyId);
  assert.equal(refreshed.savedAt, saved.savedAt);
  assert.ok(libraryImportSchema.safeParse({ ...empty(), studies: [refreshed] }).success);
});
