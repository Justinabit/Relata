import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanText, extractKeywords, joinUniqueWords, normalizeTitle, stripTags, truncate } from '../server/lib/text.js';
import { formatCitation } from '../shared/citations.js';
import { TtlCache } from '../server/lib/cache.js';
import { fetchJson } from '../server/lib/http.js';
import { UpstreamError } from '../server/lib/errors.js';
import { deterministicPlan } from '../server/ai/analyze.js';
import { sanitizeFileName } from '../server/documents/extract.js';

/* ---- text handling ---------------------------------------------------------------------- */

test('stripTags removes markup but keeps comparison operators in scientific text', () => {
  assert.equal(stripTags('Effect size p < 0.05 and n > 10 in trials'), 'Effect size p < 0.05 and n > 10 in trials');
  assert.equal(stripTags('<p>Hello <b>world</b></p>'), 'Hello world');
});

test('stripTags keeps inline sub/superscripts attached ("H2O", not "H 2 O")', () => {
  assert.equal(stripTags('H<sub>2</sub>O splitting'), 'H2O splitting');
  assert.equal(stripTags('<jats:p>CO<jats:sub>2</jats:sub> capture</jats:p>'), 'CO2 capture');
});

test('cleanText normalises Windows line endings', () => {
  assert.equal(cleanText('a\r\n\r\n\r\n\r\nb'), 'a\n\nb');
});

test('truncate cuts on word boundaries and only drops a word when the cut lands inside it', () => {
  assert.equal(truncate('hello world foo', 11), 'hello world…');
  assert.equal(truncate('hello world foo', 13), 'hello world…');
  assert.equal(truncate('short', 50), 'short');
  assert.equal(truncate('Supercalifragilistic', 8), 'Supercal…');
});

test('normalizeTitle and keyword extraction work for non-Latin scripts', () => {
  assert.equal(normalizeTitle('Café Résumé — Naïve'), 'cafe resume naive');
  assert.notEqual(normalizeTitle('Машинное обучение в медицине'), '');
  assert.ok(extractKeywords('Машинное обучение в медицине и диагностике заболеваний').length > 0);
});

test('keyword extraction never produces overlapping phrases or repeated words in the search query', () => {
  const text = 'Neural networks in medicine. Neural networks help diagnosis; medicine adopts deep learning. Deep learning models improve radiology. Radiology image analysis uses deep learning and neural networks.';
  const kws = extractKeywords(text, 8);
  const words = kws.join(' ').split(' ');
  assert.equal(new Set(words).size, words.length, `repeated words in ${JSON.stringify(kws)}`);
  const plan = deterministicPlan(text, 'passage');
  const q = plan.primaryQuery.split(' ');
  assert.equal(new Set(q).size, q.length, plan.primaryQuery);
  assert.equal(joinUniqueWords(['a b', 'b c', 'C d'], 10), 'a b c d');
});

/* ---- citations -------------------------------------------------------------------------- */

const cite = (over: object) => ({
  title: 'T', authors: [{ name: 'Ann Lee' }, { name: 'Bo Chan' }], authorCount: 2, publicationYear: 2024, publicationDate: '2024',
  journal: 'J', publisher: null, doi: null, url: null, type: 'article', ...over,
}) as Parameters<typeof formatCitation>[0];

test('APA never repeats or invents the last author when the stored author list is truncated', () => {
  const out = formatCitation(cite({ authorCount: 40 }), 'apa');
  assert.equal((out.match(/Chan/g) ?? []).length, 1, out);
  assert.match(out, /et al\./);
  assert.match(formatCitation(cite({}), 'apa'), /Lee, A\., & Chan, B\./);
});

test('APA initials keep hyphenated given names together', () => {
  assert.match(formatCitation(cite({ authors: [{ name: 'Jean-Pierre Martin' }], authorCount: 1 }), 'apa'), /Martin, J\.-P\./);
});

/* ---- cache ------------------------------------------------------------------------------ */

test('a cancelled first caller does not fail others sharing the same in-flight load', async () => {
  const cache = new TtlCache<string>(10, 1000);
  const ctrl = new AbortController();
  const loader = (sig?: AbortSignal) => () =>
    new Promise<string>((res, rej) => {
      const t = setTimeout(() => res('ok'), 40);
      sig?.addEventListener('abort', () => { clearTimeout(t); rej(new UpstreamError('x', 'cancelled', 'Request cancelled.')); });
    });
  const a = cache.getOrLoad('k', loader(ctrl.signal));
  const b = cache.getOrLoad('k', loader());
  setTimeout(() => ctrl.abort(), 5);
  await assert.rejects(a);
  assert.equal((await b).value, 'ok');
});

test('genuine upstream failures are still shared, not retried per waiter', async () => {
  const cache = new TtlCache<string>(10, 1000);
  let calls = 0;
  const failing = () => new Promise<string>((_, rej) => { calls++; setTimeout(() => rej(new UpstreamError('x', 'rate_limited', 'limited', 429)), 10); });
  const results = await Promise.allSettled([cache.getOrLoad('k', failing), cache.getOrLoad('k', failing), cache.getOrLoad('k', failing)]);
  assert.equal(calls, 1);
  assert.ok(results.every((r) => r.status === 'rejected'));
});

/* ---- outbound HTTP ---------------------------------------------------------------------- */

async function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = real; }
}
const opts = { service: 'OpenAlex', timeoutMs: 2000, retries: 0 };

test('fetchJson follows redirects only to allow-listed hosts', async () => {
  const seen: string[] = [];
  const impl = (async (u: string) => {
    seen.push(String(u));
    return String(u).includes('/old')
      ? new Response(null, { status: 301, headers: { location: 'https://api.openalex.org/works/new' } })
      : new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;
  assert.deepEqual(await withFetch(impl, () => fetchJson('https://api.openalex.org/works/old', opts)), { ok: true });
  assert.equal(seen.length, 2);

  const evil = (async () => new Response(null, { status: 302, headers: { location: 'https://evil.example.com/steal' } })) as unknown as typeof fetch;
  await assert.rejects(withFetch(evil, () => fetchJson('https://api.openalex.org/works/old', opts)), (e: UpstreamError) => e.kind === 'blocked');
});

test('fetchJson refuses non-allow-listed hosts and non-https, and does not even start when already cancelled', async () => {
  await assert.rejects(fetchJson('https://example.com/x', opts), (e: UpstreamError) => e.kind === 'blocked');
  await assert.rejects(fetchJson('http://api.openalex.org/works', opts), (e: UpstreamError) => e.kind === 'blocked');
  const ctrl = new AbortController();
  ctrl.abort();
  let called = false;
  const impl = (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch;
  await assert.rejects(withFetch(impl, () => fetchJson('https://api.openalex.org/works', { ...opts, signal: ctrl.signal })), (e: UpstreamError) => e.kind === 'cancelled');
  assert.equal(called, false);
});

test('fetchJson does not retry blocked or 4xx errors but retries 5xx once', async () => {
  let n = 0;
  const flaky = (async () => (++n === 1 ? new Response('', { status: 503 }) : new Response('{"a":1}'))) as unknown as typeof fetch;
  assert.deepEqual(await withFetch(flaky, () => fetchJson('https://api.openalex.org/works', { ...opts, retries: 1 })), { a: 1 });
  assert.equal(n, 2);
  let m = 0;
  const bad = (async () => { m++; return new Response('', { status: 400 }); }) as unknown as typeof fetch;
  await assert.rejects(withFetch(bad, () => fetchJson('https://api.openalex.org/works', { ...opts, retries: 2 })));
  assert.equal(m, 1);
});

/* ---- uploads ---------------------------------------------------------------------------- */

test('file names survive multipart latin1 mis-decoding and are sanitised', () => {
  const latin1 = Buffer.from('résumé 研究.txt', 'utf8').toString('latin1');
  assert.equal(sanitizeFileName(latin1), 'résumé 研究.txt');
  assert.equal(sanitizeFileName('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFileName('plain.pdf'), 'plain.pdf');
});
