"""Responsive editorial layout checks against the labelled fixture harness.

BROWSER_CDP_URL attaches to an existing browser; SHOTS optionally saves viewport screenshots.
"""
import os
from playwright.sync_api import sync_playwright
from seen import SEEN

BASE = os.environ.get('BASE_URL', 'http://localhost:8790')
CDP = os.environ.get('BROWSER_CDP_URL')
SHOTS = os.environ.get('SHOTS')
results = []


def check(name, ok, detail=''):
    results.append(bool(ok))
    print('PASS' if ok else 'FAIL', name, detail, flush=True)


# Check visible text against its composited background, including translucent status labels.
CONTRAST = """() => {
  const rgba = s => { const v = s.match(/[\\d.]+/g).map(Number); return [...v.slice(0, 3), v[3] ?? 1]; };
  const blend = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
  const bg = e => !e ? [255,255,255] : blend(rgba(getComputedStyle(e).backgroundColor), bg(e.parentElement));
  const luminance = rgb => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((v, n, i) => v + n * [.2126,.7152,.0722][i], 0);
  const bad = [];
  for (const e of document.querySelectorAll('h1,h2,h3,h4,p,label,a,button,.badge,.tag,.label,.field__hint')) {
    if (!e.checkVisibility({checkOpacity: true, checkVisibilityCSS: true}) || !e.textContent.trim() || e.closest(':disabled,.btn--disabled,[inert]')) continue;
    // Containers with only child elements have their text checked at those children.
    if (![...e.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim())) continue;
    const s = getComputedStyle(e), back = bg(e), foreground = blend(rgba(s.color), back);
    const x = luminance(foreground), y = luminance(back);
    const ratio = (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
    const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && parseFloat(s.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) bad.push({text:e.textContent.trim().slice(0,55), ratio:Math.round(ratio*100)/100});
  }
  return bad;
}"""


def inspect(page, label):
    page.evaluate('document.fonts.ready')
    page.evaluate("async () => { await Promise.all(document.getAnimations().filter(a => a.effect.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); }")
    check(label+' fits horizontally', page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'))
    bad = page.evaluate(CONTRAST)
    check(label+' text contrast', not bad, str(bad[:3]) if bad else '')
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=f'{SHOTS}/{label}.png')


def stress_records(route):
    response = route.fetch()
    data = response.json()
    if data.get('studies'):
        study = data['studies'][0]
        study['title'] = '[Fixture] A longitudinal investigation of digital learning environments and student attention across institutions: '+('InterdisciplinaryResearch' * 4)
        study['isRetracted'] = True
        study['verification']['conflicts'] = [{'field':'publication year', 'openalex':'2024', 'crossref':'2025', 'displayed':'crossref'}]
    route.fulfill(response=response, json=data)


with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(CDP) if CDP else p.chromium.launch()
    for theme in ['light', 'dark']:
        for width in [390, 768, 1440]:
            prefix = f'{theme}-{width}'
            ctx = browser.new_context(viewport={'width':width, 'height':960}, color_scheme=theme)
            ctx.add_init_script(SEEN)
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(BASE+'/')
            page.wait_for_selector('.lp-hero h1')
            inspect(page, prefix+'-landing')
            page.goto(BASE+'/app')
            page.wait_for_selector('.composer')
            page.focus('textarea'); page.keyboard.press('Tab')
            check(prefix+' keyboard focus is visible', page.evaluate("getComputedStyle(document.activeElement).outlineStyle !== 'none'"))
            inspect(page, prefix+'-search')
            page.route('**/api/search', stress_records)
            page.fill('textarea', 'Social media and academic performance')
            page.get_by_role('button', name='Analyze Topic', exact=True).click()
            page.wait_for_selector('article.study')
            page.wait_for_function('document.querySelectorAll(".skels").length === 0')
            check(prefix+' results precede supporting content in the DOM', page.evaluate("!!(document.querySelector('.studies').compareDocumentPosition(document.querySelector('.dash__rail')) & Node.DOCUMENT_POSITION_FOLLOWING)"))
            check(prefix+' topic overview starts collapsed', not page.locator('.topic-overview').evaluate('(e) => e.open'))
            check(prefix+' retraction and conflict stay visible', page.locator('article.study').first.get_by_text('Retracted', exact=True).is_visible() and page.locator('article.study').first.get_by_text('Metadata conflict detected', exact=True).is_visible())
            check(prefix+' missing abstracts have a clear fallback', page.get_by_text('A reliable summary could not be generated from the available source information.', exact=True).count()>0)
            inspect(page, prefix+'-results')
            page.locator('.topic-overview > summary').click()
            check(prefix+' full topic explanation is accessible', page.locator('.overview__topic').is_visible())
            page.locator('.topic-overview > summary').click()
            first = page.locator('article.study').first
            first.get_by_role('button', name='Save', exact=True).click()
            first.get_by_role('button', name='Cite', exact=True).click()
            page.wait_for_selector('dialog[open]')
            page.keyboard.press('Tab')
            check(prefix+' citation dialog retains keyboard focus', page.evaluate("document.querySelector('dialog[open]').contains(document.activeElement)"))
            inspect(page, prefix+'-citation')
            page.keyboard.press('Escape')
            page.goto(BASE+'/app/saved'); page.wait_for_selector('article.study')
            inspect(page, prefix+'-saved')
            page.goto(BASE+'/app/settings'); page.wait_for_selector('.setting')
            inspect(page, prefix+'-settings')
            page.get_by_role('button', name='Clear local research data').click()
            page.wait_for_selector('dialog[open]')
            inspect(page, prefix+'-confirmation')
            page.keyboard.press('Escape')
            page.goto(BASE+'/privacy'); page.wait_for_selector('.prose')
            inspect(page, prefix+'-policy')

            page.evaluate("localStorage.removeItem('relata:library:v1')")
            page.goto(BASE+'/app/saved'); page.wait_for_selector('.empty')
            inspect(page, prefix+'-empty-library')
            page.unroute('**/api/search')
            page.route('**/api/search', lambda route: route.fulfill(status=503, json={'error': {'code':'RESEARCH_UNAVAILABLE', 'message':'Fixture source outage'}}))
            page.goto(BASE+'/app/research?q=Fixture%20source%20outage')
            page.wait_for_selector('.callout--danger')
            inspect(page, prefix+'-error')
            page.unroute('**/api/search')
            held = []
            page.route('**/api/search', lambda route: held.append(route))
            page.goto(BASE+'/app/research?q=Fixture%20loading%20state')
            page.wait_for_selector('.study--skel')
            inspect(page, prefix+'-loading')
            for route in held:
                route.abort()
            check(prefix+' no page errors', not errors, str(errors[:2]))
            ctx.close()

            # First-visit overlays share the palette but have their own scrolling constraints.
            fresh = browser.new_context(viewport={'width':width, 'height':960}, color_scheme=theme)
            visit = fresh.new_page()
            visit.goto(BASE+'/'); visit.wait_for_selector('.fr-card')
            inspect(visit, prefix+'-terms')
            visit.get_by_role('button', name='Close for now', exact=True).click()
            visit.get_by_role('heading', name='Welcome to Relata').wait_for()
            inspect(visit, prefix+'-onboarding')
            fresh.close()
    if not CDP: browser.close()

print(f'\n{sum(results)}/{len(results)} passed')
raise SystemExit(0 if all(results) else 1)
