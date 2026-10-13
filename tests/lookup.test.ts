import assert from 'node:assert/strict';
import { test } from 'node:test';
process.env.GEMINI_API_KEY = 'fixture-key';
process.env.OPENALEX_API_KEY = 'fixture-key';
const { summarizeStudies } = await import('../server/ai/summarize.js');
const { crossrefStudyId } = await import('../server/research/ids.js');

test('cold Crossref id summaries return under the requested id after OpenAlex enrichment', async () => {
  const original = globalThis.fetch;
  const doi = '10.1234/cold-summary'; const id = crossrefStudyId(doi);
  const cr = { DOI: doi, title: ['Learning methods'], issued: { 'date-parts': [[2024]] }, type: 'journal-article' };
  let aiCalls = 0;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.startsWith('https://api.crossref.org/works')) return Response.json({ message: { items: [cr] } });
    if (url.startsWith('https://api.openalex.org/works')) return Response.json({ results: [{ id: 'https://openalex.org/W9000000001', title: 'Learning methods', doi, publication_year: 2024, publication_date: '2024' }] });
    assert.ok(url.includes('generativelanguage.googleapis.com')); aiCalls++;
    assert.ok(String(init?.body).includes('Learning methods'));
    assert.ok(!String(init?.body).includes('isRetracted'));
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [{ ref: 's1', relevance: 'Describes learning methods and their use in education.', summary: null, keyFindings: [] }] }) }] }, finishReason: 'STOP' }] });
  }) as typeof fetch;
  try {
    const first = await summarizeStudies({ ids: [id], topic: 'learning', preference: 'gemini' });
    assert.deepEqual(first.missing, []); assert.ok(first.insights[id]);
    assert.equal(first.insights[id].fromCache, false);
    const second = await summarizeStudies({ ids: [id], topic: 'learning', preference: 'gemini' });
    assert.equal(second.insights[id].fromCache, true); assert.equal(aiCalls, 1);
  } finally { globalThis.fetch = original; }
});
