// Exercise web landings with the real showcase collision geometry and player.
// Usage: node tools/check-player.mjs http://127.0.0.1:<port>/examples/terry-home/
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const url = process.argv[2];
if (!url) throw Error('Pass the URL of the showcase home.');
const output = new URL('./.check/player/', import.meta.url);
mkdirSync(output, { recursive: true });
const args = process.platform === 'darwin'
  ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}), args });
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage(mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: { current: {
      time: Math.floor(Date.now() / 1000), temperature_2m: 24, weather_code: 0, rain: 0, showers: 0, cloud_cover: 0,
    } } }));
    await page.goto(url);
    await page.waitForFunction(() => window.__home, null, { timeout: 60000 });
    const results = await page.evaluate(async () => {
      const { world, nav } = __home, ground = world.ground;
      const THREE = await import('three'), { createPlayer } = await import('@engine/world/player.js');
      const make = () => createPlayer({ nav, grid: world.grid, ground, avatar: {
        root: new THREE.Object3D(), hand: new THREE.Object3D(), blob: new THREE.Object3D(), update() {},
      } });
      const empty = { x: 0, z: 0, run: false };
      const targets = [
        { x: 32, y: 8, z: -16, island: 'tree' },
        { x: 33.5, y: 9, z: 14, island: 'tree' },
        { x: 24.5, y: 12, z: 8, island: 'roof', anchor: { x: 25, y: 9, z: 8 }, normal: [1, 0, 0] },
        { x: 20, y: 11, z: 8, island: 'roof' },
      ];
      const results = [];
      for (const t of targets) {
        const stand = ground.canStand(t.x, t.z, t.y);
        if (!stand || stand.site !== t.island || Math.abs(stand.y - t.y) > .01) throw Error(`Invalid landing fixture: ${JSON.stringify(t)}`);
      }
      for (const fps of [30, 60, 144]) for (const from of targets) for (const to of targets) {
        if (from === to) continue;
        for (const action of ['walk', 'jump', 'jump-walk', 'blocked-jump']) {
          const p = make(), dt = 1 / fps;
          const zip = target => {
            if (!p.zipTo({ ...target, anchor: target.anchor || target })) throw Error('Web launch rejected.');
            for (let i = 0; i < fps * 4 && p.zipping; i++) p.update(dt, empty, 0);
            if (p.zipping || p.y !== target.y || p.island !== target.island) throw Error('Web landing did not finish.');
          };
          zip(from);
          // Moving on the first surface records the support that must not survive the next zip.
          p.update(dt, { ...empty, x: .1 }, 0);
          zip(to);
          if (action.includes('jump')) p.jump();
          const input = action === 'jump' ? empty : { ...empty, x: action === 'blocked-jump' ? 1 : -1 };
          for (let i = 0; i < fps / 2; i++) p.update(dt, input, 0);
          for (let i = 0; i < fps * 2; i++) p.update(dt, empty, 0);
          const stand = ground.canStand(p.pos.x, p.pos.z, p.y);
          const supported = stand && Math.abs(stand.y - p.y) < .01 && stand.site === p.island;
          const moved = action !== 'walk' && action !== 'jump-walk' || Math.hypot(p.pos.x - to.x, p.pos.z - to.z) > .1;
          results.push({ fps, from: [from.x, from.y, from.z], to: [to.x, to.y, to.z], action,
            ok: !!supported && moved && p.mode === 'ground', actual: [p.pos.x, p.y, p.pos.z], site: p.island });
        }
      }
      // A normal ground jump keeps its height, and flight can still launch and land.
      const p = make(), start = p.y;
      p.jump(); let peak = start;
      for (let i = 0; i < 120; i++) { p.update(1 / 60, empty, 0); peak = Math.max(peak, p.y); }
      results.push({ action: 'ground-jump', ok: peak > start + 1 && p.y === start && p.mode === 'ground' });
      p.startFlying();
      for (let i = 0; i < 60; i++) p.update(1 / 60, { ...empty, up: true }, 0);
      const rose = p.y > start + 1;
      p.stopFlying();
      for (let i = 0; i < 180; i++) p.update(1 / 60, empty, 0);
      results.push({ action: 'flight-landing', ok: rose && p.mode === 'ground' && p.y === start });
      return results;
    });
    const device = mobile ? 'phone' : 'computer';
    writeFileSync(new URL(`${device}.json`, output), JSON.stringify(results, null, 2));
    const failures = results.filter(result => !result.ok);
    console.log(`${device}: ${results.length - failures.length}/${results.length} player movement checks passed`);
    assert.deepEqual(errors, [], 'Browser errors');
    assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 5), null, 2));
    await page.close();
  }
} finally { await browser.close(); }
