"""Share links run once, filters update URLs and history restores both query and filters."""
import os
from playwright.sync_api import sync_playwright, expect
from seen import SEEN
BASE = os.environ.get('BASE_URL', 'http://localhost:8790')
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(os.environ['BROWSER_CDP_URL']) if os.environ.get('BROWSER_CDP_URL') else p.chromium.launch()
    ctx = b.new_context(); ctx.add_init_script(SEEN)
    page = ctx.new_page(); calls=[]
    page.on('request', lambda r: calls.append(r.post_data_json) if r.url.endswith('/api/search') else None)
    page.goto(BASE + '/app/search?q=learning&yearsBack=5&sort=newest&sources=openalex')
    expect(page.locator('article.study').first).to_be_visible()
    expect(page.get_by_label('Publication date', exact=True)).to_have_value('5')
    expect(page.get_by_label('Sort by', exact=True)).to_have_value('newest')
    assert len(calls) == 1, calls
    page.get_by_label('Sort by', exact=True).select_option('cited')
    with page.expect_response(lambda r: r.url.endswith('/api/search')): pass
    assert 'sort=cited' in page.url
    page.go_back()
    expect(page.get_by_label('Sort by', exact=True)).to_have_value('newest')
    with page.expect_response(lambda r: r.url.endswith('/api/search')): pass
    page.go_forward()
    expect(page.get_by_label('Sort by', exact=True)).to_have_value('cited')
    with page.expect_response(lambda r: r.url.endswith('/api/search')): pass
    assert len(calls) == 4, calls
    page.get_by_role('button', name='Copy link to this search').click()
    expect(page.get_by_text('Search link copied', exact=True)).to_be_visible()
    # A new tab represents a recipient. No reload loop is used.
    recipient = ctx.new_page(); recipient.goto(page.url)
    expect(recipient.locator('article.study').first).to_be_visible()
    expect(recipient.get_by_label('Sort by', exact=True)).to_have_value('cited')
    short = ctx.new_page(); short.goto(BASE + '/app/search?q=a')
    expect(short.locator('article.study').first).to_be_visible()
    ctx.close(); print('PASS shared link, single search, filter URL, history and clipboard')
