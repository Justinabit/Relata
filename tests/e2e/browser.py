import copy, json, os, time
from playwright.sync_api import sync_playwright
from seen import SEEN

BASE=os.environ.get('BASE_URL', 'http://localhost:8790')
CDP=os.environ.get('BROWSER_CDP_URL')
results=[]
def check(name, ok, detail=''):
    results.append((name, ok)); print(('PASS' if ok else 'FAIL'), name, detail)

with sync_playwright() as p:
    b=p.chromium.connect_over_cdp(CDP) if CDP else p.chromium.launch()

    # ---- 1. happy path + stuck-loading regression -------------------------------------------
    ctx=b.new_context(accept_downloads=True, bypass_csp=True); ctx.add_init_script(SEEN); page=ctx.new_page()
    errors=[]; page.on('pageerror', lambda e: errors.append(str(e)))
    delayed={'n':0}
    search_requests=[]
    def maximal_analysis(route):
        response=route.fetch()
        data=response.json(); analysis=data['analysis']
        analysis['keywords'] += [f'Fixture keyword {i}' for i in range(12-len(analysis['keywords']))]
        analysis['concepts'] += [{'term':f'Fixture concept {i}', 'explanation':'A fixture concept.'} for i in range(8-len(analysis['concepts']))]
        analysis['relatedTopics'] += [{'name':f'Fixture topic {i}', 'definition':'A fixture topic.', 'relevance':'Related to the fixture.'} for i in range(8-len(analysis['relatedTopics']))]
        route.fulfill(response=response, json=data)
    page.route('**/api/analyze', maximal_analysis)
    page.on('request', lambda req: search_requests.append(req.post_data_json) if req.url.endswith('/api/search') else None)
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
    check('maximum AI analysis submits only 16 search concepts', len(search_requests[0]['concepts'])==16)
    # change a filter while the first summarize request is still pending
    with page.expect_response(lambda r: r.url.endswith('/api/search') and r.request.post_data_json['filters']['sort']=='newest') as refreshed:
        page.select_option('.filterbar select >> nth=1', 'newest')
    assert refreshed.value.ok, 'filtered search must succeed before paging'
    page.wait_for_function("document.querySelectorAll('.skels').length===0", timeout=20000)
    check('AI summaries are not stuck on loading after a filter change', page.locator('.skels').count()==0)
    check('summaries actually rendered', page.locator('.study__ai p', has_text='Reports a survey').count()>0)

    # The fixture has 50 unique eligible records. All five pages must be reachable exactly once.
    expected=page.locator('article.study').count()
    while page.get_by_role('button', name='Load more studies', exact=True).count():
        page.get_by_role('button', name='Load more studies', exact=True).click()
        expected=min(expected+10, 50)
        page.wait_for_function('(n) => document.querySelectorAll("article.study").length === n', arg=expected)
        if expected==50: break
    titles=page.locator('.study__title').all_text_contents()
    check('pagination exposes every fixture once and ends at the last page', len(titles)==50 and len(set(titles))==50 and page.get_by_role('button', name='Load more studies', exact=True).count()==0)

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

    # ---- 6. deeply malformed entries alongside valid saved research ------------------------
    original=page.evaluate("JSON.parse(localStorage.getItem('relata:library:v1'))")
    broken=copy.deepcopy(original['studies'][0])
    broken['studyId']='broken'; broken['metadata']['verification']={}
    bad_author=copy.deepcopy(original['studies'][0])
    bad_author['studyId']='bad-author'; bad_author['metadata']['authors']=[None]
    original['studies']=[broken, bad_author]+original['studies']
    original['studies'][-1]['collectionIds']=['deleted-collection']
    original['topics']=[{'name':'Bad timestamp', 'savedAt':'yesterday'}]
    stored=json.dumps(original)
    page.evaluate('(value) => localStorage.setItem("relata:library:v1", value)', stored)
    page.reload(); page.wait_for_selector('article.study')
    check('valid saved study survives malformed neighbors', page.locator('article.study').count()==1)
    page.locator('article.study').first.get_by_role('button', name='More details').click()
    check('saved study details render safely', page.locator('.study__details:visible').count()==1)
    page.locator('article.study').first.get_by_role('button', name='Cite', exact=True).click()
    page.wait_for_selector('dialog[open] textarea')
    check('retained study supports citation export', '[Fixture]' in page.locator('dialog[open] textarea').input_value())
    check('library recovery does not rewrite stored data', page.evaluate("localStorage.getItem('relata:library:v1')")==stored)
    ctx.close()
    if not CDP: b.close()

bad=[n for n,ok in results if not ok]
print(f"\n{len(results)-len(bad)}/{len(results)} passed"); raise SystemExit(1 if bad else 0)
