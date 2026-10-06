"""End to end checks for the landing page, the research tool and the routing between them.

Run against the fixture harness (see README): PORT=8790 npx tsx tests/harness/mock-upstreams.ts
Optional: SHOTS=/some/dir saves screenshots.
"""
import os, re
from playwright.sync_api import sync_playwright
from seen import SEEN

BASE = os.environ.get('BASE', 'http://localhost:8790')
SHOTS = os.environ.get('SHOTS')
results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('PASS' if ok else 'FAIL'), name, detail)


def radius(page, selector, nth=0):
    return page.evaluate(
        "([s, n]) => getComputedStyle(document.querySelectorAll(s)[n]).borderTopLeftRadius", [selector, nth])


def in_view(page, selector):
    return page.evaluate(
        "(s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.top >= -2 && r.top < 260; }", selector)


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(bypass_csp=True, viewport={'width': 1360, 'height': 900})
    ctx.add_init_script(SEEN)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    # Chrome logs the deliberate 404 page loads below as console errors; those two addresses are expected.
    expected_404 = (BASE + '/nope', BASE + '/app/nope')
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and m.location.get('url') not in expected_404 else None)

    # ---- landing page --------------------------------------------------------------------
    page.goto(BASE + '/')
    page.wait_for_selector('h1')
    check('landing: headline is the concrete one', page.inner_text('h1') == 'Find recent, verifiable studies on your topic.')
    check('landing: public layout, no app sidebar', page.locator('.sidebar').count() == 0 and page.locator('.pubhead').count() == 1)
    check('landing: no sign-in UI while accounts are disabled', page.locator('.account').count() == 0)
    check('landing: hero buttons use the 5px radius',
          radius(page, '.lp-composer .btn', 0) == '5px' and radius(page, '.lp-composer .btn', 1) == '5px',
          radius(page, '.lp-composer .btn', 0))
    check('landing: closing call-to-action uses the 5px radius', radius(page, '.lp-cta__btn') == '5px')
    check('landing: header button uses the 5px radius', radius(page, '.pubhead .btn') == '5px')
    check('landing: Analyze Topic disabled until text is entered', page.locator('.lp-composer button[type=submit]').is_disabled())
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=f'{SHOTS}/landing-light.png', full_page=True)

    # composer starts a real search
    page.fill('.lp-composer textarea', 'Social media and academic performance')
    page.click('.lp-composer button[type=submit]')
    page.wait_for_selector('article.study', timeout=15000)
    check('landing composer opens the research page with results',
          page.url.endswith('/app/research?q=Social%20media%20and%20academic%20performance') and page.locator('article.study').count() > 0, page.url)
    check('research page uses the sidebar layout', page.locator('.sidebar').count() == 1)
    check('app: buttons use the 5px radius', radius(page, 'main .btn') == '5px', radius(page, 'main .btn'))
    check('app: sidebar nav links use the 5px radius', radius(page, '.nav__link') == '5px')
    nav_labels = page.locator('.sidebar .nav__link').all_inner_texts()
    check('app navigation is Search, Research, Saved, Settings (no About)', [t.split('\n')[0].strip() for t in nav_labels] == ['Search', 'Research', 'Saved', 'Settings'], str(nav_labels))
    check('Research is the only active item on /app/research',
          page.locator('.sidebar .nav__link[aria-current=page]').count() == 1 and 'Research' in page.locator('.sidebar .nav__link[aria-current=page]').inner_text())

    # brand link goes home
    page.click('.sidebar__brand')
    page.wait_for_selector('.lp')
    check('brand link returns to the landing page', page.url.rstrip('/') == BASE)

    # ---- old addresses redirect ----------------------------------------------------------
    page.goto(BASE + '/research?q=Social%20media%20and%20mental%20health')
    page.wait_for_selector('article.study', timeout=15000)
    check('old /research?q= link redirects and still searches', '/app/research?q=Social%20media%20and%20mental%20health' in page.url, page.url)
    for old, new in [('/saved', '/app/saved'), ('/settings', '/app/settings')]:
        page.goto(BASE + old)
        page.wait_for_selector('h1')
        check(f'old {old} redirects to {new}', page.url.endswith(new), page.url)

    # ---- anchors and public pages --------------------------------------------------------
    page.goto(BASE + '/privacy')
    page.wait_for_selector('h1')
    check('privacy page uses the public layout', page.locator('.pubhead').count() == 1 and page.locator('.sidebar').count() == 0)
    page.click('.pubhead__nav >> text=How it works')
    page.wait_for_selector('#how-it-works')
    page.wait_for_timeout(300)
    check('"How it works" from another page lands on the section', page.url.endswith('/#how-it-works') and in_view(page, '#how-it-works'), page.url)
    page.click('.pubhead__nav >> text=What we check')
    page.wait_for_timeout(300)
    check('same-page anchor scrolls to its section', page.url.endswith('/#checks') and in_view(page, '#checks'))
    page.goto(BASE + '/#ai')
    page.wait_for_selector('#ai')
    page.wait_for_timeout(300)
    check('fresh load with a hash scrolls to it', in_view(page, '#ai'))

    page.click('.footer >> text=Terms and Conditions')
    page.wait_for_selector('h1')
    check('footer opens Terms and Conditions page', page.url.endswith('/terms') and page.inner_text('h1') == 'Terms and Conditions')
    page.click('.pubhead >> text=Open Relata')
    page.wait_for_selector('.sidebar')
    check('"Open Relata" opens the tool', page.url.rstrip('/').endswith('/app'))
    page.goto(BASE + '/')
    page.click('.lp-composer >> text=Upload Document')
    page.wait_for_selector('.composer')
    check('"Upload Document" opens the tool where uploads happen', page.url.rstrip('/').endswith('/app'))

    # ---- not found -----------------------------------------------------------------------
    resp = page.goto(BASE + '/nope')
    page.wait_for_selector('h1')
    check('unknown public path answers HTTP 404', resp.status == 404, str(resp.status))
    check('unknown public path: not found inside the public layout', page.inner_text('h1') == 'Page not found' and page.locator('.pubhead').count() == 1)
    resp = page.goto(BASE + '/app/nope')
    page.wait_for_selector('h1')
    check('unknown /app path answers HTTP 404', resp.status == 404, str(resp.status))
    check('unknown /app path: not found inside the tool layout', page.inner_text('h1') == 'Page not found' and page.locator('.sidebar').count() == 1)

    # ---- banned characters in visible text ----------------------------------------------
    bad = []
    for path in ['/', '/app', '/about', '/privacy', '/terms', '/cookies', '/disclaimer', '/ai-use', '/contact', '/app/settings', '/app/saved']:
        page.goto(BASE + path)
        page.wait_for_selector('h1')
        text = page.evaluate('document.body.innerText')
        if re.search('[—–]', text):
            bad.append(path)
    check('no em or en dashes in visible text on any page', not bad, str(bad))

    # ---- pill shapes ---------------------------------------------------------------------
    page.goto(BASE + '/')
    max_btn = page.evaluate("""() => Math.max(...[...document.querySelectorAll('.btn')].map(e => parseFloat(getComputedStyle(e).borderTopLeftRadius)))""")
    check('no pill-shaped buttons on the landing page', max_btn <= 5, str(max_btn))

    # ---- dark mode -----------------------------------------------------------------------
    page.goto(BASE + '/app')
    page.click('.sidebar >> text=Dark mode')
    page.goto(BASE + '/')
    page.wait_for_selector('.lp')
    check('theme choice carries to the landing page', page.evaluate("document.documentElement.getAttribute('data-theme')") == 'dark')
    if SHOTS:
        page.screenshot(path=f'{SHOTS}/landing-dark.png', full_page=True)
    page.goto(BASE + '/app')
    page.click('.sidebar >> text=Light mode')
    ctx.close()

    # ---- mobile --------------------------------------------------------------------------
    m = b.new_context(bypass_csp=True, viewport={'width': 390, 'height': 844}, is_mobile=True)
    m.add_init_script(SEEN)
    mp = m.new_page()
    mp.goto(BASE + '/')
    mp.wait_for_selector('.lp')
    over = mp.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    check('mobile: landing has no horizontal scroll', over <= 0, f'overflow {over}px')
    if SHOTS:
        mp.screenshot(path=f'{SHOTS}/landing-mobile.png', full_page=True)
    mp.goto(BASE + '/privacy')
    mp.wait_for_selector('h1')
    check('mobile: policy page has no horizontal scroll', mp.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth') <= 0)
    mp.goto(BASE + '/app')
    mp.wait_for_selector('.bottomnav')
    check('mobile: app bottom navigation shows 4 items', mp.locator('.bottomnav li').count() == 4)
    m.close()

    check('no uncaught page or console errors', not errors, str(errors[:3]))
    b.close()

bad = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(bad)}/{len(results)} passed")
raise SystemExit(1 if bad else 0)
