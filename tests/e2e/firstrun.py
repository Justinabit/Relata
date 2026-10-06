"""First-visit flow: terms popup, introduction, cookie notice. Every context here starts as a brand-new visitor.

Run against the fixture harness (see README). Optional: SHOTS=/some/dir saves screenshots.
"""
import os, re
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:8790')
SHOTS = os.environ.get('SHOTS')
results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('PASS' if ok else 'FAIL'), name, detail)


def box(page, sel):
    return page.evaluate("(s) => { const r = document.querySelector(s).getBoundingClientRect(); return {top: r.top, bottom: r.bottom, left: r.left, right: r.right}; }", sel)


def stored(page, key):
    return page.evaluate("(k) => localStorage.getItem(k)", key)


with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(os.environ['BROWSER_CDP_URL']) if os.environ.get('BROWSER_CDP_URL') else p.chromium.launch()

    def fresh(**kw):
        ctx = b.new_context(bypass_csp=True, viewport=kw.pop('viewport', {'width': 1360, 'height': 900}), **kw)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        return ctx, page, errors

    # ---- new visitor on the landing page ---------------------------------------------------
    ctx, page, errors = fresh()
    page.goto(BASE + '/')
    page.wait_for_selector('.fr-card')
    check('terms popup is a modal dialog titled Terms and Conditions',
          page.get_attribute('.fr-card', 'role') == 'dialog' and page.get_attribute('.fr-card', 'aria-modal') == 'true'
          and page.inner_text('.fr-card__title') == 'Terms and Conditions')
    check('cookie notice shows with the popup', page.locator('.fr-banner').count() == 1)
    c, n = box(page, '.fr-card'), box(page, '.fr-banner')
    check('cookie notice sits below the terms popup', n['top'] >= c['bottom'] - 1, f"card bottom {c['bottom']:.0f}, notice top {n['top']:.0f}")
    check('page behind the popup is inert', page.evaluate("document.getElementById('root').hasAttribute('inert')"))
    check('focus starts inside the popup', page.evaluate("document.activeElement.closest('.fr-card') !== null"))
    check('popup and notice buttons use the 5px radius',
          page.evaluate("[...document.querySelectorAll('.fr-card .btn, .fr-banner .btn')].every(e => getComputedStyle(e).borderTopLeftRadius === '5px')"))
    text = page.inner_text('.fr-card') + page.inner_text('.fr-banner')
    check('no em or en dashes in popup or notice text', not re.search('[—–]', text))
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=f'{SHOTS}/firstrun-terms.png')

    # keyboard: Tab stays inside the popup and notice
    seen_outside = False
    for _ in range(14):
        page.keyboard.press('Tab')
        if not page.evaluate("document.activeElement.closest('[data-fr-scope]') !== null"):
            seen_outside = True
    check('Tab never leaves the popup and the cookie notice', not seen_outside)

    # the cookie notice works while the popup is open
    page.click('.fr-banner button:has-text("Close")')
    check('closing the cookie notice hides it and remembers the choice',
          page.locator('.fr-banner').count() == 0 and stored(page, 'relata:cookies:v1') == 'closed')
    check('terms popup stays open after the notice is closed', page.locator('.fr-card__title').inner_text() == 'Terms and Conditions')

    # Escape closes for now: nothing recorded, introduction follows
    page.keyboard.press('Escape')
    page.wait_for_selector('#fr-onboarding')
    check('Escape closes the terms for now without recording acceptance', stored(page, 'relata:terms:v1') is None)
    page.reload()
    page.wait_for_selector('.fr-card')
    check('terms popup returns on the next visit if not accepted', page.inner_text('.fr-card__title') == 'Terms and Conditions')
    check('closed cookie notice stays closed after reload', page.locator('.fr-banner').count() == 0)

    # accept terms, then the introduction
    page.click('.fr-card button:has-text("Accept and continue")')
    page.wait_for_selector('#fr-onboarding')
    check('accepting stores the date', bool(stored(page, 'relata:terms:v1')))
    check('introduction starts at step 1 of 3', 'step 1 of 3' in page.inner_text('.fr-step').lower())
    check('introduction has no Back button on step 1', page.locator('.fr-card button:has-text("Back")').count() == 0)
    page.click('.fr-card button:has-text("Next")')
    check('Next moves to step 2', 'step 2 of 3' in page.inner_text('.fr-step').lower())
    page.click('.fr-card button:has-text("Back")')
    check('Back returns to step 1', 'step 1 of 3' in page.inner_text('.fr-step').lower())
    page.click('.fr-card button:has-text("Next")'); page.click('.fr-card button:has-text("Next")')
    check('last step offers Start searching and no Skip', page.locator('.fr-card button:has-text("Start searching")').count() == 1 and page.locator('.fr-card button:has-text("Skip")').count() == 0)
    page.click('.fr-card button:has-text("Start searching")')
    page.wait_for_timeout(200)
    check('finishing closes the popup, frees the page and focuses the search box',
          page.locator('.fr-card').count() == 0 and not page.evaluate("document.getElementById('root').hasAttribute('inert')")
          and page.evaluate("document.activeElement.tagName") == 'TEXTAREA')
    page.reload()
    page.wait_for_selector('.lp')
    page.wait_for_timeout(200)
    check('nothing is shown on the next visit', page.locator('.fr-card').count() == 0 and page.locator('.fr-banner').count() == 0)
    check('no uncaught page errors (landing flow)', not errors, str(errors[:2]))
    ctx.close()

    # ---- opening the tool first: introduction only -----------------------------------------
    ctx, page, errors = fresh()
    page.goto(BASE + '/app')
    page.wait_for_selector('.fr-card')
    check('/app first visit shows the introduction, not the terms', page.inner_text('.fr-card__title') == 'Welcome to Relata')
    page.click('.fr-card button:has-text("Skip")')
    check('Skip ends the introduction and remembers it', page.locator('.fr-card').count() == 0 and stored(page, 'relata:onboarded:v1') == '1')
    check('skipping the introduction does not accept the terms', stored(page, 'relata:terms:v1') is None)
    page.reload(); page.wait_for_selector('.sidebar')
    check('introduction does not return', page.locator('.fr-card').count() == 0)
    check('notice above the bottom of the page on the tool layout', page.locator('.fr-banner').count() == 1)
    page.click('.fr-banner button:has-text("Accept cookies")')
    check('Accept cookies hides the notice and stores accepted', page.locator('.fr-banner').count() == 0 and stored(page, 'relata:cookies:v1') == 'accepted')
    ctx.close()

    # ---- policy pages are always readable --------------------------------------------------
    ctx, page, errors = fresh()
    page.goto(BASE + '/terms')
    page.wait_for_selector('h1')
    check('Terms page has no popup for a new visitor', page.locator('.fr-card').count() == 0)
    check('Terms page is not inert and can be scrolled', not page.evaluate("document.getElementById('root').hasAttribute('inert')"))
    page.click('.fr-banner >> text=Cookie settings')
    page.wait_for_selector('#your-choice')
    page.wait_for_timeout(300)
    check('Cookie settings link opens the choice section', page.url.endswith('/cookies#your-choice'), page.url)
    check('Cookie page says no answer yet', 'not answered' in page.inner_text('main'))
    page.click('.fr-banner button:has-text("Accept cookies")')
    check('Cookie page reflects an accepted choice', 'accepted cookies' in page.inner_text('main'))
    page.click('main >> text=Change my choice')
    check('Change my choice brings the notice back', page.locator('.fr-banner').count() == 1 and stored(page, 'relata:cookies:v1') is None)
    ctx.close()

    # ---- popups on the landing page in the terms link --------------------------------------
    ctx, page, errors = fresh()
    page.goto(BASE + '/')
    page.wait_for_selector('.fr-card')
    page.click('.fr-card >> text=Read the full terms')
    page.wait_for_selector('h1:has-text("Terms and Conditions")')
    check('Read the full terms opens the Terms page without a popup', page.url.endswith('/terms') and page.locator('.fr-card').count() == 0)
    ctx.close()

    # ---- blocked storage still works for the visit -----------------------------------------
    ctx, page, errors = fresh()
    page.add_init_script("Storage.prototype.getItem=function(){throw new DOMException('blocked','SecurityError')};Storage.prototype.setItem=function(){throw new DOMException('blocked','SecurityError')};")
    page.goto(BASE + '/')
    page.wait_for_selector('.fr-card')
    page.click('.fr-card button:has-text("Accept and continue")')
    page.click('.fr-card button:has-text("Skip")')
    page.click('.fr-banner button:has-text("Close")')
    page.wait_for_timeout(150)
    check('with storage blocked, choices still hold for the visit', page.locator('.fr-card').count() == 0 and page.locator('.fr-banner').count() == 0)
    check('no uncaught page errors (blocked storage)', not errors, str(errors[:2]))
    ctx.close()

    # ---- mobile ----------------------------------------------------------------------------
    ctx, page, errors = fresh(viewport={'width': 390, 'height': 844}, is_mobile=True)
    page.goto(BASE + '/')
    page.wait_for_selector('.fr-card')
    c, n = box(page, '.fr-card'), box(page, '.fr-banner')
    check('mobile: popup and notice do not overlap', c['bottom'] <= n['top'] + 1, f"card bottom {c['bottom']:.0f}, notice top {n['top']:.0f}")
    pb = page.evaluate("(() => { const r = document.querySelector('.fr-card .btn--primary').getBoundingClientRect(); const c = document.querySelector('.fr-card').getBoundingClientRect(); return r.top >= c.top && r.bottom <= c.bottom + 0.5; })()")
    check('mobile: the Accept button is fully visible inside the popup', pb)
    check('mobile: both fit the screen width', c['left'] >= 0 and c['right'] <= 390 and n['left'] >= 0 and n['right'] <= 390)
    check('mobile: page does not scroll sideways', page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth') <= 0)
    if SHOTS:
        page.screenshot(path=f'{SHOTS}/firstrun-mobile.png')
    ctx.close()
    ctx, page, errors = fresh(viewport={'width': 390, 'height': 844}, is_mobile=True)
    page.add_init_script("localStorage.setItem('relata:onboarded:v1','1')")
    page.goto(BASE + '/app')
    page.wait_for_selector('.fr-banner')
    n, nav = box(page, '.fr-banner'), box(page, '.bottomnav')
    check('mobile: notice sits above the bottom navigation', n['bottom'] <= nav['top'] + 1, f"notice bottom {n['bottom']:.0f}, nav top {nav['top']:.0f}")
    ctx.close()

    if not os.environ.get('BROWSER_CDP_URL'): b.close()

bad = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(bad)}/{len(results)} passed")
raise SystemExit(1 if bad else 0)
