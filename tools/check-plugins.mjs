// Browser integration check for the plugin host:
// 1. Upgrades a real historical v0.1.0 fork using tools/update-engine.mjs (without
//    touching its v0.1.0 index.html or tools/build.sh).
// 2. Installs a fixture plugin exercising build(), setup(), corner/dock buttons,
//    overlay (pause + Esc), shortcut key, minimap static/dynamic layers, 3D picker,
//    events, and a faulty sibling plugin to confirm isolation.
// 3. Builds with the fork's unmodified tools/build.sh and verifies desktop + mobile
//    rendering, interaction, draw budget, and zero page errors in Playwright.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { applyUpdate } from './update-engine.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const work = mkdtempSync(join(tmpdir(), 'homecraft-plugin-host-check-'));
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 20 * 1024 * 1024 });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function serveDir(dir) {
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    let file = resolve(dir, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(resolve(dir) + sep) && file !== resolve(dir)) { res.writeHead(403); res.end(); return; }
    if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(done => { server.closeAllConnections(); server.close(done); }),
  })));
}

function checkoutOldFork(dest, ref) {
  const files = git('ls-tree', '-r', '--name-only', ref).toString().trim().split('\n').filter(Boolean);
  for (const file of files) {
    if (!/^(index\.html|_headers|home\.config\.js|homecraft\.json|package\.json|AGENTS\.md|world\/|assets\/|engine\/|vendor\/|tools\/build\.sh)/.test(file)) continue;
    const out = join(dest, file);
    mkdirSync(join(out, '..'), { recursive: true });
    writeFileSync(out, git('show', `${ref}:${file}`));
  }
}

const FIXTURE_PLUGIN = `import * as THREE from 'three';
import { BoxBatch } from '@engine/world/blocks.js';

export default {
  build({ grid, layer }) {
    const batch = new BoxBatch(layer);
    batch.box(12, 0, 22, 1.2, 2.2, 1.2, { tex: 'paint', tint: 0x3fa9cf });
    return {
      batches: { static: batch },
      obstacles: [{ x0: 11.3, x1: 12.7, z0: 21.3, z1: 22.7, level: 0 }],
    };
  },
  setup(host, options) {
    const state = { ticks: 0, warmups: 0, clicks: 0, langs: [], moods: [], staticDraws: 0, dynamicDraws: 0, picked: 0 };
    host.ui.addStyle('.test-plugin-modal{position:fixed;inset:20% 25%;z-index:40;background:var(--gui);padding:16px;}');
    const modal = document.createElement('div');
    modal.className = 'test-plugin-modal';
    modal.hidden = true;
    modal.textContent = options.greeting || 'Plugin Overlay';
    const overlay = host.ui.addOverlay(modal);

    const corner = host.ui.addCornerButton({
      id: 'toggle',
      icon: 'gear',
      label: { zh: '插件面板', en: 'Plugin panel' },
      onClick() {
        state.clicks++;
        if (overlay.isOpen()) overlay.close(); else overlay.open();
        corner.setPressed(overlay.isOpen());
      },
    });
    const dock = host.ui.addDockButton({
      id: 'dock-btn',
      icon: 'gear',
      label: { zh: '插件', en: 'Plugin' },
      onClick() { overlay.open(); },
    });
    host.input.onKey('g', () => {
      if (overlay.isOpen()) overlay.close(); else overlay.open();
    }, { allowWhenBlocked: true });

    host.ui.addMapLayer((ctx, X, Z) => {
      state.staticDraws++;
      ctx.fillStyle = '#3fa9cf';
      ctx.fillRect(X(12) - 3, Z(22) - 3, 6, 6);
    }, { static: true });
    host.ui.addMapLayer((ctx, { toScreen }) => {
      state.dynamicDraws++;
      const [sx, sy] = toScreen(12, 22);
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill();
    });

    const box = new THREE.Box3(new THREE.Vector3(11.4, 0, 21.4), new THREE.Vector3(12.6, 2.2, 22.6));
    const hit = new THREE.Vector3();
    host.addPicker(ray => ray.intersectBox(box, hit) ? {
      t: hit.distanceTo(ray.origin),
      cursor: 'pointer',
      onTap() { state.picked++; },
    } : null);

    host.events.on('lang', l => state.langs.push(l));
    host.events.on('mood', m => state.moods.push(m));
    host.expose({ state, overlay, corner, dock });
    return {
      warmup() { state.warmups++; },
      update() { state.ticks++; },
    };
  },
};
`;

const BROKEN_PLUGIN = `export default {
  setup(host) {
    const marker = document.createElement('div');
    marker.id = 'broken-plugin-leak';
    host.ui.mount(marker);
    throw Error('Intentional plugin failure');
  },
};
`;

async function main() {
  const releaseOut = join(work, 'release');
  const backups = join(work, 'backups');
  const site = join(work, 'old-fork');
  execFileSync(process.execPath, ['tools/prepare-release.mjs', '--allow-dirty', '--out', releaseOut], { cwd: root, stdio: 'pipe' });
  const bundle = JSON.parse(readFileSync(join(releaseOut, 'homecraft-engine.json'), 'utf8'));

  // Start from the real v0.1.0 fork and upgrade engine/ via the official updater.
  checkoutOldFork(site, '8a8e101');
  const beforeBuildSh = readFileSync(join(site, 'tools/build.sh'), 'utf8');
  const beforeIndex = readFileSync(join(site, 'index.html'), 'utf8');
  const updated = applyUpdate({ root: site, bundle, storage: backups });
  assert.equal(updated.status, 'updated');
  assert.equal(readFileSync(join(site, 'tools/build.sh'), 'utf8'), beforeBuildSh);
  assert.equal(readFileSync(join(site, 'index.html'), 'utf8'), beforeIndex);

  // Install two plugins into world/plugins/<id>/ and a backend folder under backend/.
  mkdirSync(join(site, 'world/plugins/smoke'), { recursive: true });
  writeFileSync(join(site, 'world/plugins/smoke/index.js'), FIXTURE_PLUGIN);
  mkdirSync(join(site, 'world/plugins/broken'), { recursive: true });
  writeFileSync(join(site, 'world/plugins/broken/index.js'), BROKEN_PLUGIN);
  mkdirSync(join(site, 'backend/smoke'), { recursive: true });
  writeFileSync(join(site, 'backend/smoke/server.mjs'), 'console.log("server only");\n');

  const cfg = readFileSync(join(site, 'home.config.js'), 'utf8').replace(
    /badge:\s*true,/,
    "plugins: [{ id: 'smoke', greeting: 'Hello Plugin Host' }, 'broken', { id: 'disabled-one', enabled: false }],\n  badge: true,",
  );
  writeFileSync(join(site, 'home.config.js'), cfg);

  // Build with the UNMODIFIED v0.1.0 tools/build.sh offline (omit npx from PATH so tests never flake on registry.npmjs.org).
  execFileSync('bash', ['tools/build.sh'], { cwd: site, stdio: 'pipe', env: { ...process.env, PATH: '/usr/bin:/bin' } });
  const dist = join(site, 'dist');
  assert(existsSync(join(dist, 'world/plugins/smoke/index.js')), 'v0.1.0 build.sh must ship world/plugins/');
  assert(!existsSync(join(dist, 'backend/smoke/server.mjs')), 'v0.1.0 build.sh must exclude backend/');

  const server = await serveDir(dist);
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  try {
    const errors = [];
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(server.url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(`${server.url}/?lang=en`);
    await page.waitForFunction(() => window.__home && !window.__home.rig.introActive, null, { timeout: 60000 });

    const status = await page.evaluate(() => __home.plugins.status());
    assert.deepEqual(
      status.map(({ id, state }) => ({ id, state })),
      [
        { id: 'smoke', state: 'active' },
        { id: 'broken', state: 'failed' },
        { id: 'disabled-one', state: 'disabled' },
      ],
    );
    assert.equal(await page.locator('#broken-plugin-leak').count(), 0, 'broken plugin cleaned up DOM');

    // Corner button & Dock button present
    const cornerBtn = page.locator('#corner button[data-plugin="smoke"]');
    const dockBtn = page.locator('#hotbar button[data-plugin="smoke"]');
    assert.equal(await cornerBtn.count(), 1);
    assert.equal(await dockBtn.count(), 1);
    assert.equal(await cornerBtn.getAttribute('aria-label'), 'Plugin panel');

    // Shortcut opens overlay, pauses movement, Escape closes it
    await page.keyboard.press('g');
    await page.locator('.test-plugin-modal').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => __home.plugins.hasBlockingOverlay()), true);
    await page.keyboard.press('Escape');
    await page.locator('.test-plugin-modal').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => __home.plugins.hasBlockingOverlay()), false);

    // Events (mood) + warmup + update + minimap layers
    await page.evaluate(() => __home.setTimeMode('night'));
    await page.waitForTimeout(250);
    const snap = await page.evaluate(() => {
      const s = __home.plugins.get('smoke').state;
      return { ...s, stats: __home.stats() };
    });
    assert(snap.ticks > 0, 'update() ran');
    assert(snap.warmups >= 2, 'warmup(true/false) ran');
    assert(snap.staticDraws >= 1, 'static map layer drew');
    assert(snap.dynamicDraws >= 1, 'dynamic map layer drew');
    assert(snap.moods.includes('night'), 'mood event received');
    assert(snap.stats.calls <= 60 && snap.stats.triangles <= 200000, `within budget: ${JSON.stringify(snap.stats)}`);

    // Mobile check
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await mobileContext.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(server.url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      return route.abort();
    });
    const mobile = await mobileContext.newPage();
    mobile.on('pageerror', err => errors.push(err.message));
    await mobile.goto(`${server.url}/?lang=zh`);
    await mobile.waitForFunction(() => window.__home && !window.__home.rig.introActive, null, { timeout: 60000 });
    assert.equal(await mobile.locator('#corner button[data-plugin="smoke"]').getAttribute('aria-label'), '插件面板');
    const [cornerBox, portalBox] = await Promise.all([
      mobile.locator('#corner').boundingBox(),
      mobile.locator('#portalButton').boundingBox(),
    ]);
    if (cornerBox && portalBox) {
      assert(cornerBox.x >= portalBox.x + portalBox.width - 1, `mobile #corner overlaps portal button: ${JSON.stringify({ cornerBox, portalBox })}`);
    }
    const mobileStats = await mobile.evaluate(() => __home.stats());
    assert(mobileStats.calls <= 60 && mobileStats.triangles <= 200000);
    await mobileContext.close();

    assert.deepEqual(errors, []);
    console.log(`PASS plugin host (v0.1.0 upgraded fork + build.sh): desktop=${snap.stats.calls} calls/${snap.stats.triangles} tris, mobile=${mobileStats.calls} calls/${mobileStats.triangles} tris`);
  } finally {
    await browser.close();
    await server.close();
    rmSync(work, { recursive: true, force: true });
  }
}

await main();
