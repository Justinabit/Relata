import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../server/app.js';
import { HEAD_MARKER, parsePublicUrl, robotsTxt, sitemapXml } from '../server/spa.js';
import { resolvePath, SITEMAP_PATHS } from '../shared/routes.js';

test('PUBLIC_URL keeps only a valid http(s) origin', () => {
  assert.equal(parsePublicUrl('https://relata.example/'), 'https://relata.example');
  assert.equal(parsePublicUrl(' https://relata.example/some/path?x=1 '), 'https://relata.example');
  assert.equal(parsePublicUrl('http://localhost:8787'), 'http://localhost:8787');
  assert.equal(parsePublicUrl('relata.example'), null);
  assert.equal(parsePublicUrl('javascript:alert(1)'), null);
  assert.equal(parsePublicUrl(''), null);
  assert.equal(parsePublicUrl(undefined), null);
});

test('resolvePath: pages, redirects and unknown addresses', () => {
  assert.deepEqual(resolvePath('/'), { kind: 'page' });
  assert.deepEqual(resolvePath('/app/research'), { kind: 'page' });
  assert.deepEqual(resolvePath('/privacy/'), { kind: 'redirect', to: '/privacy' });
  assert.deepEqual(resolvePath('/research'), { kind: 'redirect', to: '/app/research' });
  assert.deepEqual(resolvePath('/nope'), { kind: 'not-found' });
  assert.deepEqual(resolvePath('/app/nope'), { kind: 'not-found' });
  assert.deepEqual(resolvePath('/Privacy'), { kind: 'not-found' });
  for (const p of SITEMAP_PATHS) assert.deepEqual(resolvePath(p), { kind: 'page' }, p);
});

test('robots.txt hides the tool and the API, and names the sitemap only when the address is known', () => {
  const without = robotsTxt(null);
  assert.match(without, /Disallow: \/app\n/);
  assert.match(without, /Disallow: \/api\//);
  assert.doesNotMatch(without, /Sitemap:/);
  assert.match(robotsTxt('https://relata.example'), /Sitemap: https:\/\/relata\.example\/sitemap\.xml/);
});

test('sitemap lists the public pages with absolute addresses and no tool pages', () => {
  const xml = sitemapXml('https://relata.example');
  assert.match(xml, /<loc>https:\/\/relata\.example\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/relata\.example\/terms<\/loc>/);
  assert.doesNotMatch(xml, /\/app/);
  assert.equal((xml.match(/<url>/g) ?? []).length, SITEMAP_PATHS.length);
});

describe('page requests over HTTP', () => {
  let dir = '';
  const servers: { close: () => void }[] = [];

  const start = async (publicUrl: string | null) => {
    const server = createApp({ distDir: dir, publicUrl }).listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    servers.push(server);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return (p: string, init?: RequestInit) => fetch(base + p, { redirect: 'manual', ...init });
  };

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relata-spa-'));
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head>${HEAD_MARKER}</head><body><div id="root"></div></body></html>`);
  });
  after(() => {
    servers.forEach((s) => s.close());
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('real pages answer 200 and get a canonical link and absolute share image when PUBLIC_URL is set', async () => {
    const get = await start('https://relata.example');
    for (const p of ['/', '/privacy', '/app', '/app/research?q=x']) {
      const res = await get(p);
      assert.equal(res.status, 200, p);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    }
    const html = await (await get('/terms')).text();
    assert.match(html, /<link rel="canonical" href="https:\/\/relata\.example\/terms" \/>/);
    assert.match(html, /og:image" content="https:\/\/relata\.example\/og-image\.png"/);
    assert.doesNotMatch(html, new RegExp(HEAD_MARKER));
  });

  test('without PUBLIC_URL the page still works and no half-working tags are added', async () => {
    const get = await start(null);
    const html = await (await get('/')).text();
    assert.doesNotMatch(html, /canonical|og:url|og:image"/);
    assert.doesNotMatch(html, new RegExp(HEAD_MARKER));
    assert.equal((await get('/sitemap.xml')).status, 404);
    assert.match(await (await get('/robots.txt')).text(), /Disallow: \/app/);
  });

  test('unknown addresses answer a real 404 that search engines skip, and still return the app', async () => {
    const get = await start('https://relata.example');
    for (const p of ['/nope', '/app/nope', '/privacy/extra']) {
      const res = await get(p);
      assert.equal(res.status, 404, p);
      assert.equal(res.headers.get('x-robots-tag'), 'noindex', p);
      const html = await res.text();
      assert.match(html, /id="root"/, p);
      assert.doesNotMatch(html, /canonical/, p);
    }
  });

  test('old and trailing-slash addresses redirect permanently and keep the query string', async () => {
    const get = await start(null);
    const a = await get('/privacy/');
    assert.equal(a.status, 301);
    assert.equal(a.headers.get('location'), '/privacy');
    const b = await get('/research?q=climate%20change');
    assert.equal(b.status, 301);
    assert.equal(b.headers.get('location'), '/app/research?q=climate%20change');
    assert.equal((await get('/saved')).headers.get('location'), '/app/saved');
  });

  test('sitemap and robots.txt use the public address; the API and other methods are untouched', async () => {
    const get = await start('https://relata.example');
    const xml = await (await get('/sitemap.xml')).text();
    assert.match(xml, /https:\/\/relata\.example\/about/);
    assert.match(await (await get('/robots.txt')).text(), /Sitemap: https:\/\/relata\.example\/sitemap\.xml/);
    const api = await get('/api/nope');
    assert.equal(api.status, 404);
    assert.equal((await get('/api')).status, 404);
    assert.match(api.headers.get('content-type') ?? '', /json/);
    assert.notEqual((await get('/nope', { method: 'POST' })).status, 200);
  });
});
