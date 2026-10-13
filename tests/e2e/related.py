"""Live id-based relations through the harness, with empty and failed upstream states."""
import os, re
from playwright.sync_api import sync_playwright, expect
from seen import SEEN
BASE = os.environ.get('BASE_URL', 'http://localhost:8790')
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(os.environ['BROWSER_CDP_URL']) if os.environ.get('BROWSER_CDP_URL') else p.chromium.launch()
    ctx = b.new_context(viewport={'width':360,'height':800}); ctx.add_init_script(SEEN)
    page = ctx.new_page(); page.goto(BASE + '/app/search?q=social%20media')
    expect(page.locator('article.study').first).to_be_visible()
    def card(n): return page.locator('article.study').filter(has=page.locator('h3', has_text=re.compile('record '+str(n)+r'\b'))).first
    card(1).get_by_role('button', name='Related studies', exact=True).click()
    dialog = page.get_by_role('dialog')
    expect(dialog.locator('article.study')).to_have_count(10)
    assert dialog.evaluate('(el) => el.scrollWidth <= el.clientWidth')
    assert 'record 1' not in dialog.locator('h3').all_text_contents()
    page.keyboard.press('Escape')
    card(2).get_by_role('button', name='Related studies', exact=True).click()
    expect(dialog.get_by_text('No related studies found.', exact=True)).to_be_visible()
    page.keyboard.press('Escape')
    card(3).get_by_role('button', name='Related studies', exact=True).click()
    expect(dialog.get_by_text('Related studies unavailable', exact=True)).to_be_visible(timeout=20000)
    ctx.close(); print('PASS related studies, limit, mobile, empty and upstream failure')
