// One quick look at the site in a headless browser, at computer and phone size:
// it starts, nothing throws, every page in the Dock opens, and what a first
// visit downloads and what a frame draws, against the budget in AGENTS.md.
// Screenshots go to tools/.check/. `npm run check` first runs
// tools/check-site.mjs (homecraft.json, the skin, engine/).
//
//   npm install            (once: installs Playwright)
//   npm run serve          (in another terminal; it prints the address and opens the browser)
//   npm run check [-- http://127.0.0.1:<port>/examples/terry-home/]
//
// Frame times here come from this computer's GPU, not a phone's: they show
// regressions, not real-phone smoothness. Try a real phone before you ship.
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { chromium } = await import('playwright').catch(() => {
  console.log('The browser check needs Playwright: run npm install once, then try again. (npm run check:site needs nothing installed.)');
  process.exit(1);
});
const remembered = () => { try { return readFileSync(new URL('./.serve-url', import.meta.url), 'utf8').trim(); } catch { return ''; } };
const url = process.argv[2] || remembered();
if (!url) { console.log('Nothing is being served. Run python3 tools/serve.py first, or pass the address.'); process.exit(1); }
if (!(await fetch(url).catch(() => null))) { console.log(`Nothing answers at ${url}: start the site first (python3 tools/serve.py).`); process.exit(1); }
const out = fileURLToPath(new URL('./.check/', import.meta.url));
mkdirSync(out, { recursive: true });
const gpu = process.platform === 'darwin'
  ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const VIEWS = [
  { name: 'computer', viewport: { width: 1280, height: 800 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
];

let browser;
try { browser = await chromium.launch({ channel: 'chrome', args: gpu }); }
catch { browser = await chromium.launch({ args: gpu }); }

let failed = false;
for (const view of VIEWS) {
  const context = await browser.newContext(view);
  const page = await context.newPage();
  // Door signs and map lists may pull remote logos; answer cross-origin image
  // requests with a local stand-in so the check stays hermetic and quiet (a
  // missing CORS header on a real logo would otherwise fail the run).
  const origin = new URL(url).origin;
  const standIn = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#7aa653"/><rect x="10" y="10" width="44" height="44" fill="#4a3d2e"/></svg>');
  await context.route('**/*', route => {
    const request = route.request();
    if (request.resourceType() !== 'image') return route.fallback();
    if (new URL(request.url()).origin === origin) return route.fallback();
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: standIn });
  });
  const errors = [];
  let bytes = 0;
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', async r => { try { bytes += (await r.body()).length; } catch {} });
  const start = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__home?.player || window.__homeStartupError, null, { timeout: 60000 });
  const bootMs = Date.now() - start;
  const startup = await page.evaluate(() => window.__homeStartupError || null);
  if (startup) { console.log(`${view.name}: 3D did not start (${startup.phase}: ${startup.message})`); failed = true; await context.close(); continue; }
  // Let the opening shot finish, then measure a few seconds of frames.
  await page.waitForTimeout(5000);
  const stats = await page.evaluate(() => __home.stats());
  await page.screenshot({ path: `${out}${view.name}.png` });
  // Every page in the Dock opens.
  const pages = await page.evaluate(() => [...document.querySelectorAll('#hotbar [data-station]')].map(b => b.dataset.station));
  for (const id of pages) {
    // As the Dock does: go to the page's place in the world (if it has one) and open it.
    await page.evaluate(id => __home.go(id), id);
    await page.waitForTimeout(400);
    const open = await page.evaluate(() => document.querySelector('#panel')?.open);
    if (!open) errors.push(`page "${id}" did not open`);
    await page.screenshot({ path: `${out}${view.name}-${id}.png` });
    await page.evaluate(() => document.querySelector('#panel .close')?.click());
  }
  // The showcase house must finish a roof-ladder round trip without flying.
  // Keep this here so a vertical waypoint cannot be silently skipped again.
  const traversal = await page.evaluate(async () => {
    const h = __home, access = h.world.roofAccess;
    if (!access) return null;
    const home = { x: .5, z: 5.8 }, empty = { x: 0, z: 0, run: false };
    const finish = target => {
      let flew = false;
      for (let i = 0; i < 6000 && h.player.travelling; i++) {
        h.player.update(1 / 60, empty, 0);
        flew ||= ['air', 'fly', 'zip'].includes(h.player.mode);
      }
      return !h.player.travelling && !flew && Math.hypot(h.player.pos.x - target.x, h.player.pos.z - target.z) < .2;
    };
    h.player.teleport(home.x, home.z);
    h.player.follow(access.route(home.x, 0, home.z, access.exit.x, access.exit.y, access.exit.z), access.foot);
    const up = finish(access.exit) && Math.abs(h.player.y - access.exit.y) < .05;
    h.player.follow(access.route(h.player.pos.x, h.player.y, h.player.pos.z, home.x, 0, home.z), null, () => h.player.goTo(home.x, home.z));
    const down = finish(home) && Math.abs(h.player.y) < .05;
    const layout = await import('@world/layout.js');
    const dog = h.dog && h.pets[layout.PETS?.cat ? 1 : 0];
    const dogIndoors = !dog || dog.routes.some(route => layout.inHouse(route.at(-1).x, route.at(-1).z));
    return { up, down, dogIndoors };
  });
  if (traversal) {
    console.log(`${view.name}: roof round trip and indoor dog route: ${JSON.stringify(traversal)}`);
    if (!traversal.up || !traversal.down || !traversal.dogIndoors) errors.push('showcase traversal regression');
  }
  const over = [stats.calls > stats.budget.calls && 'draw calls', stats.triangles > stats.budget.triangles && 'triangles'].filter(Boolean);
  // Bytes as served; a server that compresses (tools/build.sh, deploy.md) sends far fewer.
  console.log(`${view.name}: started in ${(bootMs / 1000).toFixed(1)} s, loaded ${Math.round(bytes / 1024)} KB uncompressed, `
    + `${stats.calls} draw calls, ${Math.round(stats.triangles / 1000)}k triangles, ${stats.frameMs} ms a frame, ${stats.programs} shader programs`
    + (over.length ? `  ← over budget: ${over.join(', ')}` : ''));
  for (const e of errors) console.log(`  error: ${e}`);
  if (errors.length) failed = true;
  await context.close();
}
await browser.close();
console.log(`screenshots: ${out}`);
process.exit(failed ? 1 : 0);
