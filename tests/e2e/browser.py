import json, time
from playwright.sync_api import sync_playwright
from seen import SEEN

BASE='http://localhost:8790'
results=[]
def check(name, ok, detail=''):
    results.append((name, ok)); print(('PASS' if ok else 'FAIL'), name, detail)

with sync_playwright() as p:
    b=p.chromium.launch()

    # ---- 1. happy path + stuck-loading regression -------------------------------------------
    ctx=b.new_context(accept_downloads=True, bypass_csp=True); ctx.add_init_script(SEEN); page=ctx.new_page()
    errors=[]; page.on('pageerror', lambda e: errors.append(str(e)))
    delayed={'n':0}
    def slow_summarize(route):
        delayed['n']+=1
        if delayed['n']==1: time.sleep(2.5)   # first request is slow, will be aborted by the filter change
        route.continue_()
    page.route('**/api/ai/summarize', slow_summarize)
    page.goto(BASE+'/app')
    page.fill('textarea', 'Social media and academic performance')
    page.click('button:has-text("Analyze Topic")')
    page.wait_for_selector('article.study', timeout=15000)
    check('search renders study cards', page.locator('article.study').count()>0, f"{page.locator('article.study').count()} cards")
    # change a filter while the first summarize request is still pending
    page.select_option('.filterbar select >> nth=1', 'newest')
    page.wait_for_function("document.querySelectorAll('.skels').length===0", timeout=20000)
    check('AI summaries are not stuck on loading after a filter change', page.locator('.skels').count()==0)
    check('summaries actually rendered', page.locator('.study__ai p', has_text='Reports a survey').count()>0)

    # ---- 2. CSV export has a UTF-8 BOM ------------------------------------------------------
    page.click('button:has-text("Export")')
    with page.expect_download() as d:
        page.click('button:has-text("Results .csv")')
    raw=open(d.value.path(),'rb').read()
    check('CSV starts with UTF-8 BOM', raw[:3]==b'\xef\xbb\xbf')
    check('no uncaught page errors (flow 1)', not errors, str(errors))
    ctx.close()

    # ---- 3. corrupted localStorage must not crash or break search ---------------------------
    ctx=b.new_context(bypass_csp=True); ctx.add_init_script(SEEN); page=ctx.new_page(); errors=[]; page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script("""
      localStorage.setItem('relata:library:v1', JSON.stringify({studies:[{studyId:'x'},{studyId:'y',metadata:'oops'},null,5], topics:'nope', queries:[{text:'ok query'}], collections:[{id:1}]}));
      localStorage.setItem('relata:settings:v1', JSON.stringify({yearsBack:7, perPage:999, theme:'neon', aiProvider:'bing'}));
    """)
    page.goto(BASE+'/app/saved'); page.wait_for_selector('h1')
    check('Saved page survives corrupted library', page.locator('h1:has-text("Saved research")').count()==1 and page.locator('text=Something went wrong').count()==0)
    page.goto(BASE+'/app'); page.fill('textarea','Machine learning in healthcare'); page.click('button:has-text("Analyze Topic")')
    try:
        page.wait_for_selector('article.study', timeout=15000); ok=True
    except Exception: ok=False
    check('search works even with invalid stored settings (yearsBack 7)', ok)
    check('no uncaught page errors (flow 3)', not errors, str(errors))
    ctx.close()

    # ---- 4. blocked storage (Safari private mode style) must not crash the cite dialog ------
    ctx=b.new_context(bypass_csp=True); page=ctx.new_page(); errors=[]; page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script("Storage.prototype.getItem=function(){throw new DOMException('blocked','SecurityError')};Storage.prototype.setItem=function(){throw new DOMException('blocked','SecurityError')};")
    page.goto(BASE+'/app'); page.click('.fr-card >> text=Skip'); page.click('.fr-banner >> text=Close'); page.fill('textarea','Social media and mental health'); page.click('button:has-text("Analyze Topic")')
    page.wait_for_selector('article.study', timeout=15000)
    page.locator('article.study').first.locator('button:has-text("Cite")').click()
    page.wait_for_selector('dialog[open] textarea')
    check('Cite dialog opens when storage is blocked', page.locator('dialog[open] textarea').count()==1)
    check('no uncaught page errors (flow 4)', not errors, str(errors))
    ctx.close()

    # ---- 5. keyboard navigation of Saved tabs moves focus -----------------------------------
    ctx=b.new_context(bypass_csp=True); ctx.add_init_script(SEEN); page=ctx.new_page()
    page.goto(BASE+'/app'); page.fill('textarea','Social media and academic performance'); page.click('button:has-text("Analyze Topic")')
    page.wait_for_selector('article.study', timeout=15000)
    page.locator('article.study').first.locator('button:has-text("Save")').click()
    page.goto(BASE+'/app/saved'); page.wait_for_selector('[role=tab]')
    page.focus('#tab-studies'); page.keyboard.press('ArrowRight')
    check('ArrowRight moves focus to the next tab', page.evaluate('document.activeElement && document.activeElement.id')=='tab-topics')
    page.keyboard.press('End')
    check('End jumps to the last tab', page.evaluate('document.activeElement && document.activeElement.id')=='tab-searches')
    ctx.close()
    b.close()

bad=[n for n,ok in results if not ok]
print(f"\n{len(results)-len(bad)}/{len(results)} passed"); raise SystemExit(1 if bad else 0)
