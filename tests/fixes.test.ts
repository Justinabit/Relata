import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';

// Only Gemini is configured in this file. An empty value also stops a developer's .env from filling it in.
process.env.GEMINI_API_KEY = 'test-gemini';
process.env.OPENAI_API_KEY = '';
process.env.GEMINI_MODEL = 'gemini-3.8-flash';
process.env.ANALYSIS_CACHE_SECONDS = '0';

const realFetch = globalThis.fetch;
let geminiBodies: any[] = [];
let geminiReply: (body: any, call: number) => Response = () => new Response('{}', { status: 500 });

const analysis = {
  mainTopic: 'Social media and academic performance',
  definition: 'Social media use refers to time spent on online platforms for communication and sharing content.',
  simpleExplanation: 'This topic asks whether how students use social networks is linked to how they do in school.',
  academicField: 'Educational Psychology', relatedFields: [], keywords: ['social media', 'academic performance'], synonyms: [],
  concepts: [], relatedTopics: [], researchDirections: [], searchQueries: ['social media academic performance'],
};
const geminiOk = (data: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] }, finishReason: 'STOP' }] }), { status: 200, headers: { 'content-type': 'application/json' } });

before(() => {
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    if (url.includes('generativelanguage.googleapis.com')) {
      const body = JSON.parse(init.body);
      geminiBodies.push(body);
      return geminiReply(body, geminiBodies.length);
    }
    throw new Error('unexpected fetch ' + url);
  }) as typeof fetch;
});
after(() => { globalThis.fetch = realFetch; });

/* ---- search plan: always searchable ------------------------------------------------------ */

test('a passage with no usable keywords still produces a searchable plan (was a cryptic 400)', async () => {
  const { deterministicPlan } = await import('../server/ai/analyze.js');
  const { searchBody } = await import('../server/routes/schemas.js');
  const plan = deterministicPlan(Array.from({ length: 80 }, (_, i) => String(i)).join(' '), 'passage');
  assert.ok(plan.primaryQuery.length > 0);
  assert.ok(searchBody.safeParse({ query: plan.primaryQuery, expandedQueries: plan.expandedQueries, concepts: plan.extractedKeywords }).success);
});

test('text without spaces (Chinese) produces queries and concepts within the search limits (was a 400)', async () => {
  const { deterministicPlan } = await import('../server/ai/analyze.js');
  const { searchBody } = await import('../server/routes/schemas.js');
  const sentences = [
    '社交媒体使用与大学生学业成绩之间的关系研究表明过度使用可能降低注意力和学习效率并且影响睡眠质量与心理健康状况以及同伴关系',
    '在线学习平台对中学生自主学习能力培养的影响机制及其教育政策含义分析以及教师角色转变与家庭支持的作用',
  ];
  const text = Array.from({ length: 6 }, () => sentences.join('。 ')).join('。 ');
  const plan = deterministicPlan(text, 'document');
  const parsed = searchBody.safeParse({ query: plan.primaryQuery, expandedQueries: plan.expandedQueries, concepts: plan.extractedKeywords });
  assert.ok(parsed.success, parsed.success ? '' : parsed.error.issues[0]?.message);
});

test('input with nothing to search for gets a clear message instead of a failed search', async () => {
  const { analyzeInput } = await import('../server/ai/analyze.js');
  await assert.rejects(analyzeInput({ text: '?!', origin: 'text', useAI: false, preference: 'auto' }), (e: any) => e.code === 'EMPTY_INPUT');
});

test('search concepts longer than the server accepts are left out', async () => {
  const { searchConcepts, MAX_CONCEPT_CHARS } = await import('../shared/search.js');
  const concepts = searchConcepts({
    inputKind: 'document', analysis: null, ai: { status: 'disabled' }, cache: { hit: false },
    plan: { primaryQuery: 'q', expandedQueries: [], extractedKeywords: ['ok', 'x'.repeat(MAX_CONCEPT_CHARS + 1)] },
  });
  assert.deepEqual(concepts, ['ok']);
});

/* ---- Gemini ----------------------------------------------------------------------------- */

test('Gemini 3 models get a thinking level and the default temperature; 2.5 Flash keeps its budget of 0', async () => {
  const { geminiGenerationSettings } = await import('../server/ai/gemini.js');
  assert.deepEqual(geminiGenerationSettings('gemini-3.8-flash'), { thinkingConfig: { thinkingLevel: 'low' } });
  assert.deepEqual(geminiGenerationSettings('gemini-2.5-flash'), { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } });
  assert.deepEqual(geminiGenerationSettings('gemini-2.5-pro'), { temperature: 0.2 });
});

test('a model that rejects the thinking settings is retried once without them', async () => {
  const { analyzeInput } = await import('../server/ai/analyze.js');
  geminiBodies = [];
  geminiReply = (body) => (body.generationConfig.thinkingConfig ? new Response('{}', { status: 400 }) : geminiOk(analysis));
  const r = await analyzeInput({ text: 'social media and academic performance', origin: 'text', useAI: true, preference: 'gemini' });
  assert.equal(geminiBodies.length, 2);
  assert.ok(geminiBodies[0].generationConfig.thinkingConfig);
  assert.equal(geminiBodies[1].generationConfig.thinkingConfig, undefined);
  assert.equal(r.ai.status, 'ok');
  assert.equal(r.analysis?.mainTopic, analysis.mainTopic);
});

test('an unavailable Gemini model is reported with the setting to change', async () => {
  const { runStructured } = await import('../server/ai/manager.js');
  const { TopicAnalysisSchema } = await import('../server/ai/schemas.js');
  geminiReply = () => new Response('{}', { status: 404 });
  await assert.rejects(
    runStructured({ system: 's', user: 'u', schema: TopicAnalysisSchema, maxOutputTokens: 10, preference: 'gemini' }),
    (e: any) => /GEMINI_MODEL/.test(e.attempts?.[0]?.error ?? ''),
  );
});

/* ---- provider choice ------------------------------------------------------------------- */

test('an explicitly chosen provider that is not configured is named, and the other is not used', async () => {
  const { analyzeInput } = await import('../server/ai/analyze.js');
  geminiBodies = [];
  const r = await analyzeInput({ text: 'machine learning in healthcare', origin: 'text', useAI: true, preference: 'openai' });
  assert.equal(geminiBodies.length, 0);
  assert.equal(r.ai.status, 'not_configured');
  assert.equal(r.ai.provider, 'openai');
  assert.match(r.ai.message ?? '', /OpenAI/);
});

test('the browser only offers AI, and only names providers, that the server has set up', async () => {
  const { aiUsable, providerNames } = await import('../src/lib/ai.js');
  const health = { ai: { gemini: true, openai: false, primary: 'gemini', anyConfigured: true } } as any;
  assert.equal(aiUsable('auto', health), true);
  assert.equal(aiUsable('gemini', health), true);
  assert.equal(aiUsable('openai', health), false);
  assert.equal(aiUsable('openai', null), true); // unknown until the server answers
  assert.equal(providerNames('auto', health), 'Google Gemini');
});

/* ---- browser helpers ------------------------------------------------------------------- */

test('re-checking a saved study keeps the id it was saved under (it used to show as unsaved and save twice)', async () => {
  const { storedMetadata } = await import('../src/lib/library.js');
  const recheck = { id: 'W123', abstract: 'text', title: 'T' } as any;
  const stored = storedMetadata(recheck, 'cr-abc');
  assert.equal(stored.id, 'cr-abc');
  assert.equal(stored.abstract, null);
  assert.equal(storedMetadata(recheck).id, 'W123');
});

test('requests still combine their signals in browsers without AbortSignal.any (Safari before 17.4)', async () => {
  const { anySignal } = await import('../src/lib/api.js');
  const original = AbortSignal.any;
  (AbortSignal as any).any = undefined;
  try {
    const a = new AbortController();
    const b = new AbortController();
    const both = anySignal([a.signal, b.signal]);
    assert.equal(both.aborted, false);
    b.abort(new Error('second'));
    assert.equal(both.aborted, true);
    assert.equal((both.reason as Error).message, 'second');
    const done = new AbortController();
    done.abort();
    assert.equal(anySignal([done.signal]).aborted, true);
  } finally {
    (AbortSignal as any).any = original;
  }
});
