// The portal, between two fixture worlds on this server (/ and /visit/, the
// second wearing assets/skin-template.png). Nothing online is read or changed:
// both lists and the shared directory are served by the browser fixture.
//
//   npm run serve          (in another terminal; it prints the address)
//   npm run check:portal [-- http://127.0.0.1:<port>]
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';

const remembered = () => { try { return readFileSync(new URL('./.serve-url', import.meta.url), 'utf8').trim(); } catch { return ''; } };
const base = (process.argv[2] || remembered()).replace(/\/$/, '');
if (!base) { console.log('Nothing is being served. Run python3 tools/serve.py first, or pass the address.'); process.exit(1); }
const out = new URL('./.check/portal/', import.meta.url);
mkdirSync(out, { recursive: true });
const args = process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}), args });
const views = [
  { name: 'computer', viewport: { width: 1280, height: 800 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'reduced', viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' },
];
const DIRECTORY = ['https://homecraft.terryhu.cn/worlds.json', 'https://terryhu7.github.io/homecraft/worlds.json'];
try {
  for (const { name, ...view } of views) {
    const context = await browser.newContext({ ...view, locale: 'zh-CN' });
    const page = await context.newPage(), errors = [];
    await (await context.newCDPSession(page)).send('Network.setCacheDisabled', { cacheDisabled: true });
    page.on('pageerror', e => errors.push(e.message));
    const starter = { name: 'Starter', url: `${base}/`, homecraft: true };
    const neighbour = { name: 'Neighbour', owner: 'Alex', url: `${base}/visit/`, homecraft: true, intro: { zh: '隔壁', en: 'Next door' } };
    let directory = { version: 1, join: 'https://example.com/join', blocked: [], worlds: [starter, neighbour] };
    let directoryDown = false, holdDirectory = false, releaseDirectory = null;
    await context.route(`${base}/visit/**`, async route => {
      const url = new URL(route.request().url());
      url.pathname = url.pathname.replace(/^\/visit/, '') || '/';
      const response = await route.fetch({ url: url.href });
      if (url.pathname === '/home.config.js') return route.fulfill({ response, body: (await response.text()).replace("skin: '',", "skin: 'assets/skin-template.png',") });
      await route.fulfill({ response });
    });
    await context.route('**/homecraft.json', route => route.fulfill({ status: 404 }));
    for (const url of DIRECTORY) await context.route(url, async route => {
      if (holdDirectory) await new Promise(resolve => { releaseDirectory = resolve; });
      if (directoryDown) return route.fulfill({ status: 503, body: 'unavailable', headers: { 'cache-control': 'no-store' } });
      await route.fulfill({ json: directory, headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
    });
    // Pause just before leaving, so the departing page can be inspected.
    await context.route('**/engine/portal.js', async route => {
      const url = new URL(route.request().url()); url.pathname = url.pathname.replace(/^\/visit/, '');
      const response = await route.fetch({ url: url.href });
      const body = (await response.text()).replace('  leaveFor(href);',
        '  if (window.__holdWorldNavigation) await new Promise(resolve => { window.__releaseWorldNavigation = resolve; });\n  leaveFor(href);');
      await route.fulfill({ response, body });
    });
    const ready = async () => {
      await page.waitForFunction(() => window.__home?.player, null, { timeout: 60000 });
      await page.waitForFunction(() => !document.querySelector('#loading') && !document.querySelector('#hud').hidden && !__home.portal?.busy, null, { timeout: 15000 });
    };
    const open = async () => {
      await page.evaluate(() => __home.go('portal'));
      await page.waitForFunction(() => document.querySelector('.world-directory')?.dataset.loaded === 'true');
      await page.waitForFunction(() => document.querySelector('#panel').open && getComputedStyle(document.querySelector('#panel')).opacity === '1');
    };
    // The directory is reused for a minute. A changed fixture is a new visit.
    const fresh = async () => { await page.reload(); await ready(); await open(); };
    const close = async () => { await page.locator('#panel .close').click(); await page.waitForFunction(() => !document.querySelector('#panel').open); };

    await page.goto(`${base}/?lang=zh`); await ready();
    await page.evaluate(() => {
      const h = __home; h.setTimeMode('day'); const f = h.portal.front; h.player.teleport(f.x + Math.sin(f.heading) * 3, f.z + Math.cos(f.heading) * 3); h.rig.set(f.heading + .05, .35, 9); h.rig.recenter(h.player);
    });
    await page.screenshot({ path: new URL(`${name}-door.png`, out).pathname });
    // Click the real 3D portal, rather than calling a synthetic DOM control.
    const point = await page.evaluate(() => __home.project(__home.portal.root.position.x, 1.2, __home.portal.root.position.z + .1));
    if (view.hasTouch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => document.querySelector('#panel').open && !!document.querySelector('.world-list button'));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#panel')).opacity === '1');
    await page.waitForFunction(() => document.querySelector('.world-directory')?.dataset.loaded === 'true');
    assert.equal(new URL(page.url()).pathname, '/');
    assert.equal(await page.locator('.world-list button').count(), 2);
    assert(await page.locator('.world-list button[aria-current="page"]').isDisabled());
    assert.equal(await page.locator('.world-tags, .world-join').count(), 0);
    assert.equal(await page.locator('.world-footer a').getAttribute('href'), 'https://example.com/join');
    assert.equal(await page.locator('#loading').count(), 0, 'Opening the list started a journey');
    const before = await page.evaluate(() => __home.player.pos.toArray());
    await page.screenshot({ path: new URL(`${name}-list.png`, out).pathname });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#panel').open);
    assert.deepEqual(await page.evaluate(() => __home.player.pos.toArray()), before);

    // At the portal, picking a world and joining walks into the light (not
    // with reduced motion), then the normal startup bar shows.
    await page.evaluate(() => { const h = __home; const f = h.portal.front; h.player.teleport(f.x + Math.sin(f.heading) * .9, f.z + Math.cos(f.heading) * .9, { look: [h.portal.root.position.x, h.portal.root.position.z] }); h.rig.recenter(h.player); });
    await open(); await page.evaluate(() => { window.__holdWorldNavigation = true; });
    await page.locator(`.world-list button[data-world="${base}/visit/"]`).click();

    assert.equal(await page.locator('#panel').evaluate(el => el.open), false);
    if (name !== 'reduced') {
      assert(await page.evaluate(() => __home.portal.busy), 'Did not walk into the portal');
      await page.waitForTimeout(900);
      await page.screenshot({ path: new URL(`${name}-departure.png`, out).pathname });
    }
    await page.locator('#loading .bar[role="progressbar"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('#loading .loading-label')?.textContent.includes('Neighbour'));
    await page.screenshot({ path: new URL(`${name}-loading.png`, out).pathname });
    await page.waitForFunction(() => typeof window.__releaseWorldNavigation === 'function');
    await page.evaluate(() => window.__releaseWorldNavigation());

    // Arriving: the address bar is clean, Return is there, and the visitor
    // still wears the starter's default player rather than /visit/'s skin.
    await page.waitForURL(url => url.pathname === '/visit/');
    await page.waitForFunction(() => window.__home?.player, null, { timeout: 60000 });
    if (name !== 'reduced') {
      await page.evaluate(() => __home.setTimeMode('day'));
      await page.waitForFunction(() => !document.querySelector('#loading'));
      await page.screenshot({ path: new URL(`${name}-arrival.png`, out).pathname });
    }
    await ready();
    const arrived = new URL(page.url());
    assert.equal(arrived.searchParams.has('from'), false);
    assert.equal(arrived.hash, '');
    assert.deepEqual(await page.evaluate(() => ({ carried: __home.worn.carried, url: __home.worn.url })), { carried: true, url: '' });
    const back = page.locator('#portalReturn'); await back.waitFor({ state: 'visible' });
    const bounds = await back.boundingBox();
    assert(bounds.height >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= view.viewport.width);

    // Explicit return supports the keyboard and works in both directions.
    await back.focus(); await page.keyboard.press('Enter');
    await page.waitForURL(url => url.pathname === '/'); await ready();
    await page.locator('#portalReturn').click();
    await page.waitForURL(url => url.pathname === '/visit/'); await ready();
    assert.equal(await page.evaluate(() => __home.worn.carried), true);
    await page.goBack(); await ready(); assert.equal(new URL(page.url()).pathname, '/');
    await page.goForward(); await ready(); assert.equal(new URL(page.url()).pathname, '/visit/');
    // Routing may disable BFCache; explicitly test its event handler as well.
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await page.waitForFunction(() => !document.querySelector('#loading'));
    assert.equal(await page.evaluate(() => __home.player.pos.z), await page.evaluate(() => __home.portal.front.z));
    assert.equal(await page.evaluate(() => __home.portal.busy), false);

    // Empty and unavailable lists keep the visitor here.
    directory = { ...directory, worlds: [] }; await fresh();
    assert.equal(await page.locator('.world-row').count(), 1);
    assert((await page.locator('.world-row').textContent()).includes("Terry's Home"));
    assert.equal(await page.locator('#loading').count(), 0); await close();
    directoryDown = true; await fresh();
    assert((await page.locator('.world-row').textContent()).includes("Terry's Home"));
    assert.equal(await page.locator('.world-list-status.is-error').count(), 0); await close();
    directoryDown = false; directory = { ...directory, worlds: [starter, neighbour] };
    // The directory can hide a listed world.
    directory = { ...directory, blocked: [`${base}/`] }; await fresh();
    assert.equal(await page.locator(`.world-list button[data-world="${base}/"]`).count(), 0); await close();
    directory = { ...directory, blocked: [] };

    // A response still in flight when the list closes cannot replace the page.
    holdDirectory = true; releaseDirectory = null;
    await page.reload(); await ready();
    const held = Date.now();
    while (!releaseDirectory && Date.now() - held < 5000) await new Promise(resolve => setTimeout(resolve, 10));
    assert(releaseDirectory, 'The directory request was not held');
    await page.evaluate(() => __home.openPortal());
    await page.locator('.world-list-status').waitFor();
    await close();
    await page.evaluate(() => __home.go('about'));
    holdDirectory = false; releaseDirectory();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#panel').getAttribute('data-station'), 'about');
    assert.equal(await page.locator('.world-directory').count(), 0);

    // Long lists scroll inside the panel; untrusted labels stay plain text.
    directory = { ...directory, worlds: [neighbour, { name: '<img src=x onerror="alert(1)">', url: `${base}/safe-label/` },
      { name: 'Unsafe', url: 'javascript:alert(1)' },
      ...Array.from({ length: 20 }, (_, i) => ({ name: `World ${i + 1}`, url: `${base}/world-${i}/` }))] };
    await fresh();
    assert.equal(await page.locator('.world-list button').count(), 22);
    assert.equal(await page.locator('.world-text img').count(), 0);
    assert(await page.locator('.world-screen').evaluate(el => el.scrollHeight > el.clientHeight));
    const panel = await page.locator('#panel').boundingBox();
    assert(panel.x >= 0 && panel.x + panel.width <= view.viewport.width);
    await close();

    // A pasted link can't point Return elsewhere or dress the visitor up.
    const forged = await context.newPage();
    forged.on('pageerror', e => errors.push(e.message));
    await forged.goto(`${base}/?from=${encodeURIComponent('https://evil.example/')}#homecraft=1&skin=default`);
    await forged.waitForFunction(() => window.__home?.player, null, { timeout: 60000 });
    assert.equal(await forged.locator('#portalReturn').count(), 0);
    assert.equal(await forged.evaluate(() => __home.worn.carried), false);
    assert.equal(new URL(forged.url()).hash, '');
    // An ordinary blog with the door plugin (once): no Return on a direct
    // visit, into a world, and back out of the world's door to the blog,
    // whose Return chip carries the traveller on.
    if (name === 'computer') {
      const blog = `${base}/blog/`, page2 = await context.newPage();
      page2.on('pageerror', e => errors.push(e.message));
      directory = { ...directory, worlds: [{ ...neighbour }, { name: 'A blog', url: blog, homecraft: true }] };
      await context.route(url => url.pathname === '/blog/', route => route.fulfill({ contentType: 'text/html', body:
        '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Blog</title></head><body>' +
        '<script type="module" src="/plugin/homecraft-door.js"></script><homecraft-door></homecraft-door></body></html>' }));
      const door = page2.locator('homecraft-door');
      await page2.goto(blog);
      await page2.locator('.hc-controls button.open').click();
      await door.locator('.row').first().waitFor();
      assert.equal(await page2.locator('.hc-controls .back').count(), 0, 'Return on a direct visit');
      await door.locator('.row', { hasText: 'Neighbour' }).click();
      await page2.waitForURL(url => url.pathname === '/visit/');
      await page2.waitForFunction(() => window.__home?.player && !document.querySelector('#loading') && !__home.portal.busy, null, { timeout: 60000 });
      assert(await page2.locator('#portalReturn').isVisible(), 'The blog sends no referrer, yet its door must vouch');
      await page2.evaluate(() => __home.openPortal());
      await page2.locator(`.world-list button[data-world="${blog}"]`).click();

      await page2.waitForURL(url => url.pathname === '/blog/' && !url.search, { timeout: 20000 });
      await page2.locator('.hc-controls .back').waitFor();
      await page2.locator('.hc-controls .back').click();
      await page2.waitForURL(url => url.pathname === '/visit/');
      await page2.waitForFunction(() => window.__home?.player, null, { timeout: 60000 });
      assert.equal(await page2.evaluate(() => __home.worn.carried), true);
      await page2.close();
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${name}: portal click, one-click entry, walk-through, startup progress, carried skin, keyboard return, Back/Forward, empty/error/blocked, stale request, scrolling, forged link${name === 'computer' ? ', blog plugin' : ''}; ${JSON.stringify(await page.evaluate(() => __home.stats()))}`);
    await context.close();
  }
} finally { await browser.close(); }
