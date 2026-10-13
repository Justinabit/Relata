"""Individual and whole-library citations and file exports."""
import os
from playwright.sync_api import sync_playwright, expect
from seen import SEEN
BASE = os.environ.get('BASE_URL', 'http://localhost:8790')
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(os.environ['BROWSER_CDP_URL']) if os.environ.get('BROWSER_CDP_URL') else p.chromium.launch()
    ctx = b.new_context(accept_downloads=True); ctx.add_init_script(SEEN)
    page = ctx.new_page(); page.goto(BASE + '/app')
    page.locator('textarea').fill('Learning technology'); page.get_by_role('button', name='Analyze Topic').click()
    expect(page.locator('article.study').first).to_be_visible()
    page.locator('article.study').first.get_by_role('button', name='Save', exact=True).click()
    page.locator('article.study').first.get_by_role('button', name='Cite', exact=True).click()
    for style in ['APA 7', 'MLA 9', 'Chicago (author-date)']:
        page.get_by_label(style, exact=True).check()
        assert 'Fixture' in page.get_by_label('Citation', exact=True).input_value()
    page.get_by_role('button', name='Copy citation', exact=True).click()
    expect(page.get_by_text('Citation copied', exact=True)).to_be_visible()
    for label, marker in [('Download BibTeX', b'@article'), ('Download RIS', b'TY  -'), ('Results .csv', b'\xef\xbb\xbf')]:
        with page.expect_download() as d: page.get_by_role('button', name=label, exact=True).click()
        assert marker in open(d.value.path(), 'rb').read()
    page.keyboard.press('Escape'); page.goto(BASE + '/app/library')
    page.get_by_role('button', name='Cite whole library', exact=True).click()
    expect(page.get_by_role('dialog')).to_be_visible()
    with page.expect_download() as d: page.get_by_role('button', name='Download BibTeX').click()
    assert b'@article' in open(d.value.path(), 'rb').read()
    ctx.close(); print('PASS citation styles, clipboard and individual/library exports')
