import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import app from '../api/handler.js';

const realFetch = globalThis.fetch;
let base: string;
let server: ReturnType<typeof app.listen>;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.startsWith(base + '/')) return realFetch(input, init);
    if (url.startsWith('https://api.openalex.org/works')) {
      return Response.json({ meta: { count: 1 }, results: [{
        id: 'https://openalex.org/W1234567890',
        title: '[Fixture] Climate adaptation study',
        publication_year: new Date().getUTCFullYear(),
        publication_date: `${new Date().getUTCFullYear()}-01-01`,
        type: 'article', doi: null, cited_by_count: 0,
        authorships: [], topics: [],
        open_access: { is_oa: false },
        primary_location: { landing_page_url: 'https://example.org/study', source: null },
      }] });
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  }) as typeof fetch;
});

after(async () => {
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

test('Vercel entry point serves the original health URL as JSON', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /application\/json/);
  assert.equal((await res.json()).status, 'ok');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('Vercel entry point accepts POST bodies through analysis and scholarly search', async () => {
  const post = (path: string, body: unknown) => fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const analysis = await post('/api/analyze', { text: 'climate adaptation', useAI: false });
  assert.equal(analysis.status, 200);
  const { plan } = await analysis.json();
  const search = await post('/api/search', { query: plan.primaryQuery });
  assert.equal(search.status, 200);
  const result = await search.json();
  assert.equal(result.studies.length, 1);
  assert.equal(result.studies[0].title, '[Fixture] Climate adaptation study');
});

test('Vercel entry point preserves structured validation errors', async () => {
  const res = await fetch(`${base}/api/search`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'INVALID_REQUEST');
});

test('Vercel entry point still accepts multipart document uploads', async () => {
  const form = new FormData();
  form.append('file', new Blob(['Climate adaptation research on resilient cities and communities.'], { type: 'text/plain' }), 'topic.txt');
  const res = await fetch(`${base}/api/upload`, { method: 'POST', body: form });
  assert.equal(res.status, 200);
  assert.match((await res.json()).text, /Climate adaptation/);
});
