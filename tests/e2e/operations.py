"""Server HTML metadata and footer draft after client-side navigation."""
import os
from playwright.sync_api import sync_playwright, expect
from seen import SEEN
BASE = os.environ.get('BASE_URL', 'http://localhost:8790')
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(os.environ['BROWSER_CDP_URL']) if os.environ.get('BROWSER_CDP_URL') else p.chromium.launch()
    ctx=b.new_context(); ctx.add_init_script(SEEN); page=ctx.new_page()
    titles=set()
    for path in ['/', '/about', '/privacy', '/cookies', '/terms', '/disclaimer', '/ai-use', '/contact']:
        html=ctx.request.get(BASE+path).text()
        import re
        titles.add(re.search(r'<title>(.*?)</title>', html).group(1))
        assert 'name="twitter:description"' in html
    assert len(titles)==8
    page.goto(BASE + '/privacy')
    report=page.get_by_role('link', name='Report a problem', exact=True)
    expect(report).to_have_attribute('href', re.compile(r'^mailto:hello%40example.invalid\?'))
    assert '%2Fprivacy' in report.get_attribute('href')
    page.locator('footer').get_by_role('link', name='Contact', exact=True).click()
    expect(report).to_have_attribute('href', re.compile('%2Fcontact'))
    ctx.close(); print('PASS distinct server previews and report email draft address')
