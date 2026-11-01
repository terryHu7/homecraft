// Keyboard regressions use browser KeyboardEvents; they do not emulate an OS IME.
// Run with a local site URL. PLAYWRIGHT_ENGINE=webkit also checks WebKit.
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:4192';
const engine = process.env.PLAYWRIGHT_ENGINE || 'chromium';

(async () => {
  const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' }));
  try {
    const isolated = await browser.newPage();
    await isolated.goto(`${base}/?plain`);
    const results = await isolated.evaluate(async () => {
      const { createInput } = await import('/engine/input.js');
      let blocked = false, interactions = 0, jumps = 0, flights = 0;
      const input = createInput(document.createElement('canvas'), {
        blocked: () => blocked, interact: () => interactions++, jump: () => jumps++, toggleFly: () => flights++,
      });
      const rows = [];
      const fire = (type, options, target = window) => {
        const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...options });
        target.dispatchEvent(event);
        return { ...input.read(), prevented: event.defaultPrevented };
      };
      const check = (name, actual, expected) => rows.push({ name, actual, expected });
      for (const key of ['d', 'D', 'Process', 'в']) {
        input.clear();
        const state = fire('keydown', { key, code: 'KeyD', isComposing: key === 'Process' });
        check(`physical D with key=${key}`, [state.x, state.prevented], [1, true]);
        check(`release D with changed key=${key}`, fire('keyup', { key: 'Unidentified', code: 'KeyD' }).x, 0);
      }
      input.clear();
      fire('keydown', { key: 'a', code: 'KeyA' });
      fire('keyup', { key: 'Process', code: 'KeyA', isComposing: true });
      check('released A does not cancel D', fire('keydown', { key: 'd', code: 'KeyD' }).x, 1);
      input.clear();
      check('a different physical key producing d does not steer', fire('keydown', { key: 'd', code: 'KeyH' }).x, 0);
      for (const code of ['', 'Unidentified']) {
        input.clear();
        check(`fallback without usable code: ${code}`, fire('keydown', { key: 'D', code }).x, 1);
        check(`fallback release: ${code}`, fire('keyup', { key: 'd', code }).x, 0);
      }
      input.clear();
      fire('keydown', { key: 'Control', code: 'ControlLeft', ctrlKey: true });
      const ctrlD = fire('keydown', { key: 'd', code: 'KeyD', ctrlKey: true });
      check('Ctrl+D moves, descends and cancels the page default', [ctrlD.x, ctrlD.down, ctrlD.prevented], [1, true, true]);
      input.clear();
      fire('keydown', { key: 'd', code: 'KeyD' });
      fire('keydown', { key: 'ArrowRight', code: 'ArrowRight' });
      check('releasing D preserves a held right arrow', fire('keyup', { key: 'd', code: 'KeyD' }).x, 1);
      window.dispatchEvent(new Event('blur'));
      check('window blur releases movement', input.read().x, 0);
      input.clear();
      fire('keydown', { key: 'Shift', code: 'ShiftLeft' });
      fire('keydown', { key: 'Shift', code: 'ShiftRight' });
      check('releasing one Shift preserves the other', fire('keyup', { key: 'Shift', code: 'ShiftLeft' }).run, true);
      input.clear();
      check('Space climbs and jumps once', [fire('keydown', { key: ' ', code: 'Space' }).up, jumps], [true, 1]);
      fire('keydown', { key: ' ', code: 'Space', repeat: true });
      check('holding Space does not toggle flight', [jumps, flights], [1, 0]);
      check('Space release stops climbing', fire('keyup', { key: ' ', code: 'Space' }).up, false);
      fire('keydown', { key: ' ', code: 'Space' });
      check('a second Space press toggles flight', flights, 1);
      input.clear(); blocked = true;
      const paused = fire('keydown', { key: 'd', code: 'KeyD' });
      check('panels retain their keys', [paused.x, paused.prevented], [0, false]);
      blocked = false;
      for (const modifiers of [{ metaKey: true }, { altKey: true }]) {
        input.clear();
        const state = fire('keydown', { key: 'd', code: 'KeyD', ...modifiers });
        check(`system modifier ${Object.keys(modifiers)[0]}`, [state.x, state.prevented], [0, false]);
      }
      for (const tag of ['input', 'textarea', 'select', 'div']) {
        input.clear();
        const target = document.body.appendChild(document.createElement(tag));
        if (tag === 'div') target.contentEditable = 'true';
        const state = fire('keydown', { key: 'd', code: 'KeyD' }, target);
        check(`typing in ${tag} does not move or cancel text input`, [state.x, state.prevented], [0, false]);
        target.remove();
      }
      input.clear();
      fire('keydown', { key: 'e', code: 'KeyW' });
      check('physical movement does not also trigger a localized shortcut', [input.read().z, interactions], [-1, 0]);
      input.clear();
      fire('keydown', { key: 'f', code: 'KeyF' });
      check('interaction shortcut still works', interactions, 1);
      return rows;
    });
    for (const { name, actual, expected } of results) assert.deepEqual(actual, expected, name);
    console.log(`PASS ${engine}: ${results.length} keyboard event cases`);
    await isolated.close();

    for (const lang of ['zh', 'en']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/?lang=${lang}`);
      await page.waitForFunction(() => window.__home && !window.__home.rig.introActive, null, { timeout: 60000 });
      for (const keys of [['w'], ['a'], ['s'], ['d'], ['ArrowRight'], ['Shift', 'd'], ['w', 'd']]) {
        const start = await page.evaluate(async () => {
          window.dispatchEvent(new Event('blur'));
          const { SPAWN } = await import('@world/layout.js'), h = window.__home;
          h.teleport(SPAWN.x, SPAWN.z);
          return { x: h.player.pos.x, z: h.player.pos.z, yaw: h.rig.yaw };
        });
        for (const key of keys) await page.keyboard.down(key);
        try {
          await page.waitForFunction(start => Math.hypot(__home.player.pos.x - start.x, __home.player.pos.z - start.z) > .3, start, { timeout: 5000 });
        } finally {
          for (const key of [...keys].reverse()) await page.keyboard.up(key);
        }
        const end = await page.evaluate(() => ({ x: __home.player.pos.x, z: __home.player.pos.z }));
        const right = (end.x - start.x) * Math.cos(start.yaw) - (end.z - start.z) * Math.sin(start.yaw);
        if (keys.includes('d') || keys.includes('ArrowRight')) assert(right > .15, `${lang}: ${keys.join('+')} did not move right`);
        const stopped = await page.evaluate(() => ({ x: __home.player.pos.x, z: __home.player.pos.z }));
        await page.waitForTimeout(120);
        const drift = await page.evaluate(p => Math.hypot(__home.player.pos.x - p.x, __home.player.pos.z - p.z), stopped);
        assert(drift < .01, `${lang}: ${keys.join('+')} stayed pressed after release`);
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${engine} ${lang}: WASD, right arrow, Shift+D, W+D and release in the 3D scene`);
      await page.close();

      // CDP produces a sustained, real touch pointer, including pointer capture.
      // WebKit's desktop keyboard coverage above is separate from this mobile check.
      if (engine !== 'chromium') continue;
      const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      const touchErrors = []; mobile.on('pageerror', error => touchErrors.push(error.message));
      await mobile.goto(`${base}/?lang=${lang}`);
      await mobile.waitForFunction(() => window.__home && !window.__home.rig.introActive, null, { timeout: 60000 });
      await mobile.locator('#flyButton').tap();
      const right = mobile.locator('#flightPad [data-dir="right"]');
      await right.waitFor({ state: 'visible' });
      assert.equal(await right.getAttribute('aria-label'), lang === 'zh' ? '向右' : 'Right');
      const box = await right.boundingBox();
      const start = await mobile.evaluate(() => ({ x: __home.player.pos.x, z: __home.player.pos.z, yaw: __home.rig.yaw }));
      const cdp = await mobile.context().newCDPSession(mobile);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
      try {
        await mobile.waitForFunction(p => Math.hypot(__home.player.pos.x - p.x, __home.player.pos.z - p.z) > .3, start, { timeout: 5000 });
      } finally { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
      const end = await mobile.evaluate(() => ({ x: __home.player.pos.x, z: __home.player.pos.z }));
      assert((end.x - start.x) * Math.cos(start.yaw) - (end.z - start.z) * Math.sin(start.yaw) > .15, `${lang}: touch pad did not move right`);
      assert(!await right.evaluate(el => el.classList.contains('on')), 'Touch release left the direction held');
      assert.deepEqual(touchErrors, []);
      console.log(`PASS chromium ${lang}: touch flight pad moves right and releases`);
      await mobile.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
