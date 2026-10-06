import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';

// Isolated config for this test file: no keys, no caching surprises.
process.env.SEARCH_CACHE_SECONDS = '0';
process.env.OPENALEX_API_KEY = 'test-key-not-real';
process.env.GEMINI_API_KEY = 'test-gemini';
process.env.OPENAI_API_KEY = 'test-openai';

const realFetch = globalThis.fetch;
let aiCalls: string[] = [];
let aiBehaviour: (provider: string, body: any) => { ok: boolean; json?: unknown } = () => ({ ok: false });

const oa = (n: number, over: Record<string, unknown> = {}) => ({
  id: `https://openalex.org/W${2000000000 + n}`,
  doi: `https://doi.org/10.5555/test.${n}`,
  title: `Social media and student performance study ${n}`,
  publication_year: 2022,
  publication_date: '2022-03-01',
  type: 'article',
  cited_by_count: n,
  open_access: { is_oa: n % 2 === 0, oa_status: 'green', oa_url: null },
  primary_location: { source: { display_name: 'Journal of Tests' } },
  authorships: [{ author: { display_name: 'Ana Reyes' } }],
  topics: [{ id: 'https://openalex.org/T10', display_name: 'Social Media' }],
  abstract_inverted_index: Object.fromEntries('Students who spent more time on social media reported 12 hours of weekly use in this survey of undergraduates at one university, and the authors discuss how those habits relate to study time, attention and self-reported coursework outcomes.'.split(' ').map((w, i) => [w, [i]])),
  ...over,
});

before(() => {
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (url.startsWith('https://api.openalex.org/works')) {
      const results = [oa(1), oa(2), oa(3, { publication_year: 2014, publication_date: '2014-01-01' }), oa(4, { doi: null, abstract_inverted_index: null })];
      return json({ meta: { count: 4 }, results });
    }
    if (url.startsWith('https://api.crossref.org/works')) {
      const u = new URL(url);
      const filter = u.searchParams.get('filter') ?? '';
      const dois = [...filter.matchAll(/doi:([^,]+)/g)].map((m) => m[1]);
      // Crossref knows test 1 only; tests 2 and 3 are unknown to it.
      const items = dois.filter((d) => d.endsWith('.1')).map((d) => ({
        DOI: d, title: ['Social media and student performance study 1'],
        author: [{ given: 'Ana', family: 'Reyes' }], issued: { 'date-parts': [[2022, 3, 1]] }, 'container-title': ['Journal of Tests'], publisher: 'Test Publisher', type: 'journal-article', 'is-referenced-by-count': 5,
      }));
      return json({ message: { items, 'total-results': items.length } });
    }
    if (url.includes('generativelanguage.googleapis.com') || url.includes('api.openai.com')) {
      const provider = url.includes('googleapis') ? 'gemini' : 'openai';
      aiCalls.push(provider);
      const r = aiBehaviour(provider, JSON.parse(init.body));
      if (!r.ok) return new Response('{}', { status: 500 });
      const text = JSON.stringify(r.json);
      return json(provider === 'gemini' ? { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] } : { choices: [{ message: { content: text }, finish_reason: 'stop' }] });
    }
    throw new Error('unexpected fetch ' + url);
  }) as typeof fetch;
});
after(() => { globalThis.fetch = realFetch; });

test('search pipeline: window filter, Crossref verification, conflicts, dedupe', async () => {
  const { runSearch } = await import('../server/research/pipeline.js');
  const res = await runSearch({
    query: 'social media student performance', expandedQueries: ['social media grades'], concepts: [],
    filters: { yearsBack: 10, sources: ['openalex'], openAccessOnly: false, type: 'any', sort: 'relevance' }, page: 1, perPage: 10,
  });
  assert.equal(res.window.label.endsWith(String(new Date().getUTCFullYear())), true);
  // 4 raw records x 2 queries = 8; duplicates merged; 2014 record rejected by the date window.
  assert.equal(res.counts.retrieved, 8);
  assert.equal(res.counts.duplicatesRemoved, 4);
  assert.equal(res.counts.rejected['Outside the selected research window'], 1);
  assert.equal(res.studies.length, 3);
  assert.ok(res.studies.every((s) => s.publicationYear >= res.window.fromYear));
  const byId = Object.fromEntries(res.studies.map((s) => [s.doi ?? 'none', s]));
  assert.equal(byId['10.5555/test.1'].verification.doi, 'verified');
  assert.deepEqual(byId['10.5555/test.1'].verification.verifiedBy, ['openalex', 'crossref']);
  assert.equal(byId['10.5555/test.2'].verification.doi, 'not-in-crossref');
  assert.equal(byId['none'].verification.doi, 'no-doi');
  assert.equal(byId['none'].url, null); // no DOI + no landing page => "Source link unavailable", never a guess
  assert.equal(res.crossrefVerification.verified, 1);
  assert.equal(res.crossrefVerification.notFound, 1); // test.2; test.3 never reached verification (outside window)
});

test('open-access filter is enforced locally as well as in the query', async () => {
  const { runSearch } = await import('../server/research/pipeline.js');
  const res = await runSearch({
    query: 'social media', expandedQueries: [], concepts: [],
    filters: { yearsBack: 10, sources: ['openalex'], openAccessOnly: true, type: 'any', sort: 'cited' }, page: 1, perPage: 10,
  });
  assert.ok(res.studies.length > 0 && res.studies.every((s) => s.openAccess.isOa === true));
});

test('summaries: only verified server-side studies, ungrounded content dropped, provider fallback works', async () => {
  const { runSearch } = await import('../server/research/pipeline.js');
  const { summarizeStudies } = await import('../server/ai/summarize.js');
  const res = await runSearch({
    query: 'social media', expandedQueries: [], concepts: [],
    filters: { yearsBack: 10, sources: ['openalex'], openAccessOnly: false, type: 'any', sort: 'relevance' }, page: 1, perPage: 10,
  });
  const withAbstract = res.studies.find((s) => s.abstract)!;
  const noAbstract = res.studies.find((s) => !s.abstract)!;
  assert.ok(withAbstract && noAbstract);

  aiCalls = [];
  // Gemini fails -> OpenAI answers. The "model" tries to smuggle in a statistic, a citation and a summary for a study with no abstract.
  aiBehaviour = (provider, body) => {
    if (provider === 'gemini') return { ok: false };
    const prompt: string = body.messages[1].content;
    const refs = [...prompt.matchAll(/"ref":"(s\d+)"/g)].map((m) => m[1]);
    return {
      ok: true,
      json: {
        items: [
          ...refs.map((ref, i) => ({
            ref,
            relevance: 'This record appears relevant because it examines social media and students.',
            summary: i === 0 ? 'Students reported 12 hours of weekly use. Grades dropped by 17% according to Smith et al. (2024).' : 'A summary that should be discarded when no abstract exists.',
            keyFindings: ['Students reported 12 hours of weekly use.', 'Grades dropped by 17%.'],
          })),
          { ref: 's99', relevance: 'invented', summary: 'invented', keyFindings: [] },
        ],
      },
    };
  };
  const out = await summarizeStudies({ ids: [withAbstract.id, noAbstract.id, 'W0000000000'], topic: 'social media', preference: 'auto' });
  assert.deepEqual(aiCalls.slice(0, 2), ['gemini', 'openai']);
  assert.equal(out.ai.provider, 'openai');
  assert.equal(out.ai.fallbackUsed, true);
  assert.deepEqual(out.missing, ['W0000000000']);
  const a = out.insights[withAbstract.id];
  assert.equal(a.summary, null); // contained an ungrounded "17%" and a citation-like string -> rejected
  assert.deepEqual(a.keyFindings, ['Students reported 12 hours of weekly use.']);
  assert.equal(a.basis, 'abstract');
  const b = out.insights[noAbstract.id];
  assert.equal(b.summary, null);
  assert.deepEqual(b.keyFindings, []);
  assert.equal(b.basis, 'title-and-topics');
  assert.equal(Object.keys(out.insights).length, 2); // the invented ref s99 was ignored
});

test('explicit provider choice never falls back to the other provider; total failure is graceful', async () => {
  const { analyzeInput } = await import('../server/ai/analyze.js');
  aiCalls = [];
  aiBehaviour = () => ({ ok: false });
  const r = await analyzeInput({ text: 'machine learning in healthcare', origin: 'text', useAI: true, preference: 'openai' });
  assert.deepEqual(aiCalls, ['openai']);
  assert.equal(r.analysis, null);
  assert.equal(r.ai.status, 'unavailable');
  assert.match(r.ai.message!, /temporarily unavailable/);
  assert.ok(r.plan.primaryQuery.length > 0); // search plan still works without AI

  aiCalls = [];
  const auto = await analyzeInput({ text: 'machine learning in healthcare', origin: 'text', useAI: true, preference: 'auto' });
  assert.deepEqual(aiCalls, ['gemini', 'openai']);
  assert.equal(auto.ai.status, 'unavailable');
});

test('analysis: invalid AI output is rejected like a failure', async () => {
  const { analyzeInput } = await import('../server/ai/analyze.js');
  aiBehaviour = () => ({ ok: true, json: { mainTopic: 'x', definition: 'See https://fake.example/paper for the definition of this topic.' } });
  const r = await analyzeInput({ text: 'climate change and agricultural productivity', origin: 'text', useAI: true, preference: 'gemini' });
  assert.equal(r.analysis, null);
});

test('search pipeline: a failed expanded query is reported instead of silently thinning the results', async () => {
  const { runSearch } = await import('../server/research/pipeline.js');
  const inner = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    if (url.startsWith('https://api.openalex.org/works') && new URL(url).searchParams.get('search') === 'social media grades') {
      return new Response('{}', { status: 400 }); // 4xx: never retried
    }
    return inner(input, init);
  }) as typeof fetch;
  try {
    const res = await runSearch({
      query: 'social media student performance', expandedQueries: ['social media grades'], concepts: [],
      filters: { yearsBack: 10, sources: ['openalex'], openAccessOnly: false, type: 'any', sort: 'relevance' }, page: 1, perPage: 10,
    });
    assert.ok(res.studies.length > 0, 'the query that worked still returns results');
    const n = res.notices.find((x) => x.code === 'PARTIAL_OPENALEX');
    assert.ok(n && n.level === 'warning', 'partial failure must be surfaced as a warning');
    assert.match(n.message, /1 of 2 OpenAlex searches failed/);
  } finally {
    globalThis.fetch = inner;
  }
});
