import assert from 'node:assert/strict';
import { test } from 'node:test';
import { problemReportLink } from '../shared/contact.js';
import { HEAD_MARKER, PUBLIC_PAGE_META, renderIndex } from '../server/spa.js';
import { SITEMAP_PATHS } from '../shared/routes.js';
test('report drafts preserve the full address and encode mail header separators', () => {
  const address = 'https://example.org/app/search?q=café&sort=cited#part';
  const link = problemReportLink('test+relata@example.org', address)!;
  assert.ok(link.startsWith('mailto:test%2Brelata%40example.org?'));
  assert.match(new URLSearchParams(link.split('?')[1]).get('body')!, /q=café&sort=cited#part/);
  assert.equal(problemReportLink(null, address), null);
  assert.equal(problemReportLink('bad@example.org?bcc=other@example.org', address), null);
});
test('all public routes have distinct metadata served before scripts with no duplicate defaults', () => {
  assert.deepEqual(Object.keys(PUBLIC_PAGE_META).sort(), [...SITEMAP_PATHS].sort());
  const template = `<head><title>Old</title><meta name="description" content="Old" /><meta property="og:title" content="Old" />${HEAD_MARKER}</head>`;
  const titles = new Set<string>();
  for (const path of SITEMAP_PATHS) {
    const html = renderIndex(template, null, path); titles.add(PUBLIC_PAGE_META[path].title);
    assert.equal((html.match(/<title>/g) ?? []).length, 1);
    assert.equal((html.match(/name="description"/g) ?? []).length, 1);
    assert.ok(html.includes('name="twitter:description"')); assert.ok(!html.includes('Old'));
  }
  assert.equal(titles.size, SITEMAP_PATHS.length);
});
