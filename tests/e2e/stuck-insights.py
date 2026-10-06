from playwright.sync_api import sync_playwright, expect
from seen import SEEN
BASE='http://localhost:8790'
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(bypass_csp=True); ctx.add_init_script(SEEN); page=ctx.new_page()
    held=[]
    def hold_first(route):
        if not held: held.append(route)          # park the very first summarize request (do not answer it)
        else: route.continue_()
    page.route('**/api/ai/summarize', hold_first)
    page.goto(BASE+'/app'); page.fill('textarea','Social media and academic performance'); page.click('button:has-text("Analyze Topic")')
    page.wait_for_selector('article.study', timeout=15000)
    page.wait_for_timeout(500)
    assert held, 'first summarize request was not parked'
    n_loading_before = page.locator('.skels').count()
    page.select_option('.filterbar select >> nth=1', 'newest')   # aborts the parked request, re-runs the search
    page.wait_for_selector('article.study'); page.wait_for_timeout(3000)
    try: held[0].abort()
    except Exception: pass
    page.wait_for_timeout(1500)
    stuck = page.locator('.skels').count()
    print(f'skeletons while request parked: {n_loading_before}; skeletons 4.5s after filter change: {stuck}')
    print('RESULT:', 'STUCK (bug present)' if stuck else 'OK (summaries loaded)')
    b.close()
