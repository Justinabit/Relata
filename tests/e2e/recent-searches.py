"""Recent typed queries persist with filters, can be rerun and cleared, and exclude uploads."""
import os
from playwright.sync_api import sync_playwright, expect
from seen import SEEN
BASE = os.environ.get('BASE_URL', 'http://localhost:8790')
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(os.environ['BROWSER_CDP_URL']) if os.environ.get('BROWSER_CDP_URL') else p.chromium.launch()
    ctx=b.new_context(); ctx.add_init_script(SEEN); page=ctx.new_page()
    page.goto(BASE + '/app/search?q=typed%20learning&yearsBack=5&sort=cited')
    expect(page.locator('article.study').first).to_be_visible()
    page.goto(BASE + '/app')
    recent=page.get_by_role('region', name='Recent searches')
    recent.get_by_role('button', name='typed learning', exact=True).click()
    expect(page.get_by_label('Publication date', exact=True)).to_have_value('5')
    expect(page.get_by_label('Sort by', exact=True)).to_have_value('cited')
    page.goto(BASE + '/app')
    page.locator('input[type=file]').set_input_files({'name':'private.txt','mimeType':'text/plain','buffer':b'Private document content about learning technology that must not appear in browser history.'})
    expect(page.get_by_text('private.txt', exact=True)).to_be_visible()
    page.get_by_role('button', name='Analyze Topic').click()
    expect(page.locator('article.study').first).to_be_visible()
    stored=page.evaluate("localStorage.getItem('relata:recent-searches:v1')")
    assert 'Private document' not in stored
    page.goto(BASE + '/app')
    recent.get_by_role('button', name='Clear recent searches', exact=True).click()
    expect(recent.get_by_text('No recent searches.', exact=True)).to_be_visible()
    assert page.evaluate("JSON.parse(localStorage.getItem('relata:recent-searches:v1')).searches.length") == 0
    ctx.close(); print('PASS recent query/filter replay, persistence, clear and upload exclusion')
