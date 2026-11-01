// Inspect the deployed UI, not its homecraft:true declaration. Only this
// isolated browser sees the probe directory; the applicant's site is unchanged.
import { readFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

export const PUBLIC_DIRECTORY = ['https://homecraft.terryhu.cn/worlds.json', 'https://terryhu7.github.io/homecraft/worlds.json'];
const key = value => { const u = new URL(value); return u.origin + u.pathname.replace(/\/index\.html$/, '').replace(/\/$/, ''); };
const publicSource = value => { try { return PUBLIC_DIRECTORY.includes(new URL(value).origin + new URL(value).pathname); } catch { return false; } };
const protocol = readFileSync(new URL('../engine/door-protocol.js', import.meta.url), 'utf8');
const VIEWS = [
  { name: 'desktop-zh', locale: 'zh-CN', viewport: { width: 1280, height: 800 } },
  { name: 'desktop-en', locale: 'en-US', viewport: { width: 1280, height: 800 } },
  { name: 'mobile-zh', locale: 'zh-CN', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: 'mobile-en', locale: 'en-US', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

export async function launchBrowser() {
  const { chromium } = await import('playwright');
  const args = process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  return chromium.launch({ ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}), args });
}

async function firstVisible(locator) {
  for (const item of await locator.all()) if (await item.isVisible()) return item;
  return null;
}

async function openPortal(page, timeout) {
  // Use the visitor's controls, including a site's optional entrance screen.
  // Do not invoke __home.openPortal(): a hidden/broken entry must not pass.
  const canonical = page.locator('#portalButton, .hc-control.open');
  const open = canonical.or(page.getByRole('button', { name: /传送门|\bportal\b/i }));
  const start = page.locator('#enter-world').or(page.getByRole('button', { name: /^(走进|进入|开始探索|enter|explore|start)/i }));
  await open.or(start).filter({ visible: true }).first().waitFor({ timeout });
  const entrance = await firstVisible(start);
  if (entrance && !(await firstVisible(open))) await entrance.click();
  await open.filter({ visible: true }).first().waitFor({ timeout });
  const button = await firstVisible(canonical) || await firstVisible(open);
  await button.click({ timeout });
}

const returnControl = page => page.locator('#portalReturn, .hc-control.back').or(page.getByRole('button', { name: /^(返回 |Back to )/i }));

async function inspectView(browser, address, view, { timeout, out }) {
  const { name, ...options } = view;
  const context = await browser.newContext({ ...options, reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: false });
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);
  const target = `https://portal-check.homecraft.invalid/${randomUUID()}/`;
  const probeOrigin = new URL(target).origin;
  let requests = 0, stage = 'page', actualConfig = null;
  const result = { view: name, status: 'review', code: 'unverified' };
  const response = { version: 1, updated: new Date().toISOString(), blocked: [], worlds: [
    { name: 'Homecraft check', url: target, owner: 'Homecraft', intro: 'Portal compatibility check', lang: ['zh', 'en'], homecraft: true },
  ] };
  await context.route(url => publicSource(url.href), route => {
    requests++;
    return route.fulfill({ json: response, headers: { 'access-control-allow-origin': '*' } });
  });
  await context.route(`${probeOrigin}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/door-protocol.js') return route.fulfill({ contentType: 'text/javascript', body: protocol });
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>Homecraft check</title><button id="back">Back</button><script type="module">
      import { createTravelSession, navigateDoor } from '/door-protocol.js';
      const travel = createTravelSession(), arrival = travel.arrive(), skin = await travel.wornSkin();
      document.body.dataset.from = arrival.from || '';
      document.body.dataset.arrived = String(arrival.door);
      document.body.dataset.skin = skin.value;
      // A fresh valid skin makes a receiver that resets every visitor to its
      // own/default character observable, even on uncustomized websites.
      const canvas = Object.assign(document.createElement('canvas'), {width:64,height:64});
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#${randomUUID().slice(0, 6)}'; ctx.fillRect(0,0,64,64);
      const witness = canvas.toDataURL('image/png').split(',')[1].replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
      document.body.dataset.witness = witness;
      document.querySelector('#back').onclick = async () => {
        const url = new URL(await travel.link({url: arrival.from, homecraft: true}));
        const hash = new URLSearchParams(url.hash.slice(1)); hash.set('skin', witness); url.hash = hash.toString();
        navigateDoor(url.href);
      };
      document.body.dataset.ready = 'true';
    </script>` });
  });
  try {
    const loaded = await page.goto(address, { waitUntil: 'domcontentloaded', timeout });
    if (!loaded?.ok()) throw Error('page unavailable');
    const source = page.url();
    stage = 'open';
    await openPortal(page, timeout);
    actualConfig = await page.evaluate(() => window.__home?.config?.portal?.directory ?? null);
    stage = 'directory';
    // Locators pierce open shadow roots, so the ordinary-site plugin is covered.
    const destination = page.locator(`[data-world="${target}"], a[href^="${target}"]`);
    await destination.filter({ visible: true }).first().waitFor({ timeout });
    if (!requests) throw Error('no public directory request');
    if (out) { mkdirSync(out, { recursive: true }); await page.screenshot({ path: join(out, `${name}-portal.png`) }); }
    stage = 'departure';
    await destination.first().click();
    await page.waitForURL(url => key(url.href) === key(target), { timeout });
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout });
    const arrival = await page.locator('body').evaluate(el => ({ ...el.dataset }));
    if (arrival.arrived !== 'true' || key(arrival.from) !== key(source)) throw Error('invalid portal arrival');
    stage = 'return';
    await page.locator('#back').click();
    await page.waitForURL(url => key(url.href) === key(source), { timeout });
    await returnControl(page).filter({ visible: true }).first().waitFor({ timeout });
    stage = 'carry';
    // Return to the probe using the site's actual return control. This proves
    // the receiving site kept the visitor's character instead of replacing it.
    await returnControl(page).filter({ visible: true }).first().click();
    await page.waitForURL(url => key(url.href) === key(target), { timeout });
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout });
    const returned = await page.locator('body').evaluate(el => ({ ...el.dataset }));
    if (returned.arrived !== 'true' || returned.skin !== arrival.witness) throw Error('visitor character changed');
    Object.assign(result, { status: 'pass', code: 'connected' });
  } catch {
    // Unsupported custom controls and network failures need review, not a
    // claim that the author configured something incorrectly.
    const localOnly = Array.isArray(actualConfig) && !actualConfig.some(publicSource);
    const definitive = (stage === 'directory' && localOnly) || ['departure', 'carry'].includes(stage);
    Object.assign(result, { status: definitive ? 'fail' : 'review', code: stage === 'directory' && localOnly ? 'private_directory' : stage });
    if (out) {
      mkdirSync(out, { recursive: true });
      await page.screenshot({ path: join(out, `${name}-review.png`) }).catch(() => {});
    }
  } finally { result.publicRequests = requests; await context.close(); }
  return result;
}

export async function inspectPortal(address, { browser, timeout = 30000, out, views = VIEWS } = {}) {
  const ownBrowser = !browser;
  browser ??= await launchBrowser();
  const results = [];
  try {
    for (const view of views) {
      let result = await inspectView(browser, address, view, { timeout, out });
      // A clean second attempt avoids turning a one-off network failure into
      // work for the applicant. Confirmed configuration failures don't retry.
      if (result.status === 'review') result = await inspectView(browser, address, view, { timeout, out });
      results.push(result);
    }
  } finally { if (ownBrowser) await browser.close(); }
  const status = results.some(r => r.status === 'fail') ? 'fail' : results.every(r => r.status === 'pass') ? 'pass' : 'review';
  return { status, views: results };
}
