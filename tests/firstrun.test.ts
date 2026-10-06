import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeStep, showCookieNotice, type FirstRunState } from '../src/lib/firstrun.js';

const fresh: FirstRunState = { termsAccepted: false, termsDeferred: false, onboarded: false, cookies: null };

test('a new visitor on the landing page sees the terms first, then onboarding', () => {
  assert.equal(activeStep(fresh, '/'), 'terms');
  assert.equal(activeStep({ ...fresh, termsAccepted: true }, '/'), 'onboarding');
  assert.equal(activeStep({ ...fresh, termsAccepted: true, onboarded: true }, '/'), null);
});

test('closing the terms popup for now moves on to onboarding without recording acceptance', () => {
  assert.equal(activeStep({ ...fresh, termsDeferred: true }, '/'), 'onboarding');
});

test('opening the Search page directly gives onboarding but not the terms popup', () => {
  assert.equal(activeStep(fresh, '/app'), 'onboarding');
  assert.equal(activeStep({ ...fresh, onboarded: true }, '/app'), null);
});

test('policy pages, results, saved and settings never show a popup', () => {
  for (const p of ['/terms', '/privacy', '/cookies', '/app/research', '/app/saved', '/app/settings', '/nope']) {
    assert.equal(activeStep(fresh, p), null, p);
  }
});

test('the cookie notice shows until a choice is made', () => {
  assert.equal(showCookieNotice(fresh), true);
  assert.equal(showCookieNotice({ ...fresh, cookies: 'accepted' }), false);
  assert.equal(showCookieNotice({ ...fresh, cookies: 'closed' }), false);
});
