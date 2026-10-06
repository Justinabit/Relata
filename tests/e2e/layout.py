"""Layout checks that need a real browser: no dropdown option may be clipped at any common width.

Run against the fixture harness (see README).
"""
import os
from playwright.sync_api import sync_playwright
from seen import SEEN

BASE = os.environ.get('BASE', 'http://localhost:8790')
WIDTHS = [360, 390, 600, 768, 899, 900, 1000, 1099, 1100, 1200, 1279, 1280, 1360, 1600, 1920]
results = []

MEASURE = """() => {
  const cv = document.createElement('canvas').getContext('2d');
  const out = [];
  for (const sel of document.querySelectorAll('.filterbar__panel select, main select')) {
    if (sel.offsetParent === null) continue;
    const cs = getComputedStyle(sel);
    cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const room = sel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    for (const o of sel.options) {
      const w = cv.measureText(o.text).width;
      if (w > room - 1) out.push({ select: sel.id || sel.name || 'select', option: o.text, need: Math.round(w), have: Math.round(room) });
    }
  }
  return out;
}"""

with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(os.environ['BROWSER_CDP_URL']) if os.environ.get('BROWSER_CDP_URL') else p.chromium.launch()
    ctx = b.new_context(bypass_csp=True)
    ctx.add_init_script(SEEN)
    page = ctx.new_page()
    # One search, then resize: reloading at every width would run into the search rate limit.
    page.goto(BASE + '/app/research?q=Social%20media%20and%20academic%20performance')
    page.wait_for_selector('article.study', timeout=15000)
    for w in WIDTHS:
        page.set_viewport_size({'width': w, 'height': 900})
        page.wait_for_timeout(120)
        toggle = page.locator('.filterbar__toggle')
        if toggle.is_visible() and page.locator('.filterbar__panel').is_hidden():
            toggle.click()
        clipped = page.evaluate(MEASURE)
        ok = not clipped
        results.append(ok)
        print('PASS' if ok else 'FAIL', f'{w}px: every dropdown option fits', clipped[:2] if clipped else '')
    ctx.close()
    if not os.environ.get('BROWSER_CDP_URL'): b.close()

bad = results.count(False)
print(f"\n{len(results) - bad}/{len(results)} passed")
raise SystemExit(1 if bad else 0)
