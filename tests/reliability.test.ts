import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TopicAnalysisSchema } from '../server/ai/schemas.js';
import { searchBody } from '../server/routes/schemas.js';
import { normalizeOpenAlexWork } from '../server/research/openalex.js';
import { MAX_SEARCH_CONCEPTS, searchConcepts } from '../shared/search.js';
import type { AnalyzeResponse } from '../shared/types.js';
import { formatBibliography, studyInfoText } from '../shared/citations.js';
import { sanitizeLibrary, type LibraryData } from '../src/lib/library.js';
import { authorsLine, formatDate } from '../src/lib/format.js';

function analysisResponse(): AnalyzeResponse {
  return {
    inputKind: 'question',
    plan: { primaryQuery: 'learning technology', expandedQueries: [], extractedKeywords: ['learning'] },
    ai: { status: 'ok' }, cache: { hit: false },
    analysis: TopicAnalysisSchema.parse({
      mainTopic: 'Learning technology',
      definition: 'A description of how technology supports learning.',
      simpleExplanation: 'Technology can help students learn in different ways.',
      keywords: Array.from({ length: 12 }, (_, i) => `keyword ${i}`),
      concepts: Array.from({ length: 8 }, (_, i) => ({ term: `concept ${i}`, explanation: 'An explanation of this concept.' })),
      relatedTopics: Array.from({ length: 8 }, (_, i) => ({ name: `topic ${i}`, definition: 'A definition.', relevance: 'Relevant to learning.' })),
      searchQueries: ['learning technology'],
    }),
  };
}

test('maximum valid AI analysis produces a valid search request without changing the analysis', () => {
  const response = analysisResponse();
  const before = structuredClone(response);
  const concepts = searchConcepts(response);
  assert.equal(concepts.length, MAX_SEARCH_CONCEPTS);
  assert.deepEqual(concepts, [...response.analysis!.keywords, ...response.analysis!.concepts.slice(0, 4).map((c) => c.term)]);
  assert.ok(searchBody.safeParse({ query: response.plan.primaryQuery, concepts }).success);
  assert.deepEqual(response, before);
  assert.equal(searchBody.safeParse({ query: 'learning', concepts: [...concepts, 'overflow'] }).success, false);
});

test('search concepts preserve priority while trimming and deduplicating before the limit', () => {
  const response = analysisResponse();
  response.analysis!.keywords = [' learning ', 'LEARNING', ' ', 'attention'];
  response.analysis!.concepts = [{ term: 'Attention', explanation: 'x' }, { term: ' technology ', explanation: 'x' }];
  response.analysis!.relatedTopics = [{ name: ' TECHNOLOGY ', definition: 'x', relevance: 'x' }, { name: 'students', definition: 'x', relevance: 'x' }];
  assert.deepEqual(searchConcepts(response), ['learning', 'attention', 'technology', 'students']);
  response.analysis = null;
  response.plan.extractedKeywords = [' learning ', '', 'Learning', 'attention'];
  assert.deepEqual(searchConcepts(response), ['learning', 'attention']);
  assert.ok(searchBody.safeParse({ query: 'learning', concepts: searchConcepts(response) }).success);
});

function library(): LibraryData {
  const study = normalizeOpenAlexWork({
    id: 'https://openalex.org/W1234567890', title: 'Learning technology',
    publication_year: 2024, publication_date: '2024-03-01', type: 'article',
    authorships: [{ author: { display_name: 'Ann Lee', id: 'https://openalex.org/A123' } }],
    topics: [{ id: 'https://openalex.org/T123', display_name: 'Learning' }],
  }, new Date('2026-01-01T00:00:00.000Z'))!;
  const stamp = '2026-01-02T00:00:00.000Z';
  return {
    version: 1,
    studies: [{ studyId: study.id, savedAt: stamp, metadata: { ...study, abstract: null }, collectionIds: ['c_one'] }],
    topics: [{ name: 'Learning', savedAt: stamp }],
    queries: [{ text: 'Learning technology', savedAt: stamp }],
    collections: [{ id: 'c_one', name: 'Education', createdAt: stamp }],
  };
}

test('valid libraries survive unchanged and retained studies support formatting and export', () => {
  const original = library();
  const before = JSON.stringify(original);
  const out = sanitizeLibrary(original);
  assert.deepEqual(out, original);
  assert.equal(JSON.stringify(original), before);
  const study = out.studies[0].metadata;
  assert.equal(authorsLine(study), 'Ann Lee');
  assert.match(formatDate(study), /2024/);
  assert.match(studyInfoText(study), /Learning technology/);
  for (const style of ['apa', 'mla', 'chicago'] as const) assert.match(formatBibliography([study], style), /Learning technology/);
});

test('malformed nested metadata is rejected individually, even ahead of a valid duplicate', () => {
  const good = library();
  const invalid: Record<string, unknown>[] = [
    { authors: [null] }, { authors: [{ name: 42 }] }, { authors: [{ name: '  ' }] },
    { topics: undefined }, { topics: [{ name: {} }] }, { verification: {} },
    { verification: { ...good.studies[0].metadata.verification, conflicts: [{ field: 'made up' }] } },
    { verification: { ...good.studies[0].metadata.verification, verifiedBy: ['invented'] } },
    { openAccess: {} }, { openAccess: { isOa: 'yes', status: null, url: null } },
    { url: 'javascript:alert(1)' }, { url: 123 }, { doi: {} }, { keywords: [null] },
    { publicationYear: NaN }, { publicationDate: '2024-02-31' }, { publicationDate: '2024-13' },
    { sourceId: null }, { source: 'invented' }, { sources: [] }, { type: 'invented' },
    { citationCount: -1 }, { authorCount: 'one' }, { abstract: 'should not be saved' },
    { retrievedAt: 'yesterday' },
  ];
  for (const patch of invalid) {
    const bad = { ...good.studies[0], metadata: { ...good.studies[0].metadata, ...patch } };
    const out = sanitizeLibrary({ ...good, studies: [bad, ...good.studies] });
    assert.deepEqual(out.studies, good.studies, `accepted malformed metadata: ${JSON.stringify(patch)}`);
  }
});

test('library recovery validates auxiliary entries, timestamps, and collection references without mutation', () => {
  const good = library();
  const raw = {
    ...good,
    studies: [null, { ...good.studies[0], savedAt: '2026-02-31T00:00:00Z' }, { ...good.studies[0], collectionIds: ['c_one', 'missing', 'c_one'] }],
    topics: [null, { name: 'broken' }, { name: {}, savedAt: good.topics[0].savedAt }, ...good.topics],
    queries: [{ text: 'broken', savedAt: 4 }, ...good.queries],
    collections: [{ id: 'missing', name: 'Broken', createdAt: 'nope' }, ...good.collections],
  };
  const before = structuredClone(raw);
  assert.deepEqual(sanitizeLibrary(raw), good);
  assert.deepEqual(raw, before);
  for (const input of [null, [], 123, 'bad', { studies: 'bad' }]) {
    assert.deepEqual(sanitizeLibrary(input), { version: 1, studies: [], topics: [], queries: [], collections: [] });
  }
});
