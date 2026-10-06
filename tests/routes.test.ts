import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAppPath, legacyTarget, LEGACY_REDIRECTS, ROUTES } from '../src/lib/routes.js';

test('only /app and its children use the research-tool layout', () => {
  assert.equal(isAppPath('/app'), true);
  assert.equal(isAppPath('/app/research'), true);
  assert.equal(isAppPath('/app/saved'), true);
  assert.equal(isAppPath('/'), false);
  assert.equal(isAppPath('/privacy'), false);
  // A page that merely starts with the letters "app" is not part of the tool.
  assert.equal(isAppPath('/apple'), false);
  assert.equal(isAppPath('/application'), false);
});

test('old addresses redirect into /app and keep the query string', () => {
  assert.equal(legacyTarget('/research', '?q=climate%20change'), '/app/research?q=climate%20change');
  assert.equal(legacyTarget('/saved', ''), '/app/saved');
  assert.equal(legacyTarget('/settings', ''), '/app/settings');
  assert.equal(legacyTarget('/app/research', '?q=x'), null);
  assert.equal(legacyTarget('/', ''), null);
  assert.equal(legacyTarget('/privacy', ''), null);
});

test('every legacy redirect lands on a real route, and no route is its own legacy address', () => {
  const real = new Set<string>(Object.values(ROUTES));
  for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
    assert.ok(real.has(to), `${from} redirects to unknown route ${to}`);
    assert.ok(!real.has(from), `${from} is both a route and a legacy address (redirect loop risk)`);
  }
});

test('route addresses are unique', () => {
  const values = Object.values(ROUTES);
  assert.equal(new Set(values).size, values.length);
});
