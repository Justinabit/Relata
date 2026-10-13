"""Source notices on cards/details and explicit hiding, with no retracted ids sent for AI."""
import os
from playwright.sync_api import sync_playwright, expect
from seen import SEEN
BASE = os.environ.get('BASE_URL', 'http://localhost:8790')
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(os.environ['BROWSER_CDP_URL']) if os.environ.get('BROWSER_CDP_URL') else p.chromium.launch()
    ctx = b.new_context(); ctx.add_init_script(SEEN); page = ctx.new_page(); ids=[]
    page.on('request', lambda r: ids.extend(r.post_data_json['ids']) if r.url.endswith('/api/ai/summarize') else None)
    page.goto(BASE + '/app/search?q=social%20media')
    expect(page.locator('article.study').first).to_be_visible()
    retracted = page.locator('article.study').filter(has=page.locator('h3', has_text='record 1').filter(has_text='record 1')).first
    # Exact source notices are available without inferring from titles.
    expect(page.get_by_text('This paper has been retracted', exact=True).first).to_be_visible()
    expect(page.get_by_text('This paper has a correction', exact=True).first).to_be_visible()
    card = page.locator('article.study').filter(has_text='AI summary skipped').first
    expect(card).to_contain_text('Source: OpenAlex')
    card.get_by_role('button', name='More details').click()
    expect(card.locator('.study__details')).to_contain_text('This paper has been retracted')
    assert 'W3000000001' not in ids
    page.get_by_label('Hide retracted studies').check()
    expect(page.get_by_text('This paper has been retracted', exact=True)).to_have_count(0)
    expect(page.get_by_text('This paper has a correction', exact=True).first).to_be_visible()
    assert 'hideRetracted=true' in page.url
    ctx.close(); print('PASS source notices, details, AI exclusion and hide filter')
