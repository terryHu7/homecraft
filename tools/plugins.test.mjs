import test from 'node:test';
import assert from 'node:assert/strict';
import { PLUGIN_API, validPluginId, normalizePlugins, loadPlugins } from '../engine/plugins.js';

function fakeDom() {
  const makeEl = tag => {
    const el = {
      tagName: tag.toUpperCase(),
      dataset: {},
      style: {},
      hidden: false,
      isConnected: true,
      children: [],
      attributes: {},
      classes: new Set(),
      listeners: new Map(),
      classList: {
        toggle(name, on) { if (on === undefined ? !el.classes.has(name) : on) el.classes.add(name); else el.classes.delete(name); },
      },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k]; },
      append(...nodes) { this.children.push(...nodes); for (const n of nodes) n.parent = this; },
      prepend(...nodes) { this.children.unshift(...nodes); for (const n of nodes) n.parent = this; },
      remove() {
        this.isConnected = false;
        if (this.parent) {
          const i = this.parent.children.indexOf(this);
          if (i >= 0) this.parent.children.splice(i, 1);
        }
      },
      addEventListener(type, fn, opts) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(fn);
        opts?.signal?.addEventListener('abort', () => this.listeners.get(type)?.delete(fn));
      },
      dispatch(type, event = {}) { for (const fn of [...(this.listeners.get(type) || [])]) fn(event); },
    };
    return el;
  };
  const head = makeEl('head');
  const prevDoc = globalThis.document;
  globalThis.document = { createElement: makeEl, head };
  return {
    makeEl,
    head,
    restore() { globalThis.document = prevDoc; },
  };
}

function fakeEnv(dom) {
  let lang = 'en';
  const langListeners = new Set();
  const minimap = { redraws: 0, redrawImage() { this.redraws++; } };
  const corner = dom.makeEl('div');
  const hotbar = dom.makeEl('nav');
  const hud = dom.makeEl('div');
  const dockHandles = [];
  return {
    setLang(next) { lang = next; for (const fn of [...langListeners]) fn(lang); },
    minimap, corner, hotbar, hud, dockHandles,
    env: {
      stage: {}, world: {}, nav: {}, player: {}, avatar: {}, rig: {}, sound: {}, portal: {}, weather: {}, quality: {}, config: {},
      actions: {
        go() {}, navigate() {}, openPage() {}, closePage() {}, openPortal() {},
        visitWorld() {}, depart() {}, setWeatherMode() {}, setTimeMode() {},
        getWeatherMode: () => 'clear', getTimeMode: () => 'day',
      },
      ui: {
        corner, hotbar, hud, minimap,
        icon: name => ({ url: `icon:${name}` }),
        getLang: () => lang,
        t: (zh, en) => (lang === 'en' ? en : zh),
        onLang: fn => { langListeners.add(fn); return () => langListeners.delete(fn); },
        addDockButton({ name, iconUrl, onClick, pluginId }) {
          const el = dom.makeEl('button');
          el.dataset.plugin = pluginId;
          el.iconUrl = iconUrl;
          el.setAttribute('aria-label', name());
          el.addEventListener('click', onClick);
          hotbar.append(el);
          const handle = { el, remove() { el.remove(); } };
          dockHandles.push(handle);
          return handle;
        },
      },
    },
  };
}

test('validPluginId and normalizePlugins validate, unwrap options, and deduplicate', () => {
  assert.equal(PLUGIN_API, 1);
  assert.equal(validPluginId('multiplayer'), true);
  assert.equal(validPluginId('door-rings-2'), true);
  assert.equal(validPluginId('../escape'), false);
  assert.equal(validPluginId('BadCaps'), false);
  assert.equal(validPluginId(''), false);

  const normalized = normalizePlugins([
    'welcome',
    { id: 'multiplayer', endpoint: 'wss://mp.example.com', maxRemote: 12 },
    { id: 'nested', options: { color: 'blue' } },
    { id: 'off-plugin', enabled: false, x: 1 },
    'welcome', // duplicate
    '../bad',  // invalid
    123,       // invalid
  ]);
  assert.deepEqual(normalized, [
    { id: 'welcome', enabled: true, options: {} },
    { id: 'multiplayer', enabled: true, options: { endpoint: 'wss://mp.example.com', maxRemote: 12 } },
    { id: 'nested', enabled: true, options: { color: 'blue' } },
    { id: 'off-plugin', enabled: false, options: { x: 1 } },
  ]);
});

test('loadPlugins skips disabled entries, merges build patches, and runs all setup slots with clean disposal', async () => {
  const dom = fakeDom();
  try {
    const calls = [];
    const modules = new Map([
      ['alpha', {
        default: {
          build(ctx, options) {
            calls.push(['build', ctx.id, options.tag, ctx.asset('a.png')]);
            return {
              planes: ['plane-alpha'],
              obstacles: [{ x0: 0, x1: 1, z0: 0, z1: 1, level: 0 }],
              batches: { static: 'batch-alpha' },
              named: { alphaFlag: true },
            };
          },
          setup(host, options) {
            const btn = host.ui.addCornerButton({ icon: 'map', label: { zh: '地图', en: 'Map' }, onClick: () => calls.push('corner-click') });
            const dock = host.ui.addDockButton({ icon: '<svg></svg>', label: { zh: '扩展', en: 'Ext' }, onClick: () => calls.push('dock-click') });
            const modal = dom.makeEl('div');
            modal.hidden = true;
            const overlay = host.ui.addOverlay(modal);
            host.ui.addStyle('.x { color: red; }');
            host.ui.addMapLayer(() => calls.push('static-map'), { static: true });
            host.ui.addMapLayer(() => calls.push('dynamic-map'));
            host.input.onKey('m', () => { overlay.open(); });
            host.addPicker(() => ({ t: 5, cursor: 'pointer', onTap: () => calls.push('picked') }));
            host.events.on('mood', mood => calls.push(['mood', mood]));
            host.events.on('lang', l => calls.push(['lang', l]));
            host.expose({ overlay, btn, dock, options });
            return {
              update(dt) { calls.push(['update', dt]); },
              warmup(on) { calls.push(['warmup', on]); },
              dispose() { calls.push('dispose-alpha'); },
            };
          },
        },
      }],
    ]);

    const loader = await loadPlugins(
      [{ id: 'alpha', tag: 'ok' }, { id: 'disabled-one', enabled: false }],
      {
        resolveUrl: id => new URL(`https://example.test/world/plugins/${id}/`),
        importModule: async href => {
          const id = href.match(/world\/plugins\/([^/]+)\/index\.js$/)?.[1];
          if (!modules.has(id)) throw Error('404');
          return modules.get(id);
        },
      },
    );

    const built = { batches: { static: 'batch-world' }, planes: ['plane-world'] };
    loader.runBuild({ built });
    assert.deepEqual(built.planes, ['plane-world', 'plane-alpha']);
    assert.deepEqual(built.batches.static, ['batch-world', 'batch-alpha']);
    assert.equal(built.named.alphaFlag, true);

    const fx = fakeEnv(dom);
    const host = loader.createHost(fx.env);
    host.start();
    assert.deepEqual(host.status(), [
      { id: 'alpha', state: 'active' },
      { id: 'disabled-one', state: 'disabled' },
    ]);
    assert.equal(fx.corner.children.length, 1);
    assert.equal(fx.hotbar.children.length, 1);
    assert.equal(dom.head.children.length, 1);
    assert.equal(fx.minimap.redraws, 1);

    // Language sync
    assert.equal(fx.corner.children[0].getAttribute('aria-label'), 'Map');
    fx.setLang('zh');
    assert.equal(fx.corner.children[0].getAttribute('aria-label'), '地图');

    // Keyboard shortcut opens overlay -> pauses world & closes on Esc
    assert.equal(host.hasBlockingOverlay(), false);
    assert.equal(host.handleKey('m', {}, { blocked: false, shortcutsBlocked: false }), true);
    assert.equal(host.hasBlockingOverlay(), true);
    assert.equal(host.hasShortcutBlockingOverlay(), true);
    assert.equal(host.closeTopOverlay(), true);
    assert.equal(host.hasBlockingOverlay(), false);

    // Picking, events, map layers, warmup, update
    const hit = host.pick({}, 10);
    assert.equal(hit.t, 5);
    assert.equal(hit.cursor, 'pointer');
    hit.onTap();
    host.emit('mood', 'night');
    host.warmup(true);
    host.update(0.016, 0.016, 100);
    host.drawStaticMap({ save() {}, restore() {} }, v => v, v => v, 8);
    host.drawMapLayers({ save() {}, restore() {} }, {});

    assert(calls.includes('picked'));
    assert(calls.includes('static-map'));
    assert(calls.includes('dynamic-map'));
    assert(calls.some(c => Array.isArray(c) && c[0] === 'mood' && c[1] === 'night'));
    assert(calls.some(c => Array.isArray(c) && c[0] === 'lang' && c[1] === 'zh'));
    assert(calls.some(c => Array.isArray(c) && c[0] === 'warmup' && c[1] === true));
    assert(calls.some(c => Array.isArray(c) && c[0] === 'update'));

    // Dispose removes everything cleanly
    host.dispose();
    assert.equal(fx.corner.children.length, 0);
    assert.equal(fx.hotbar.children.length, 0);
    assert.equal(dom.head.children.length, 0);
    assert.equal(fx.minimap.redraws, 2);
    assert(calls.includes('dispose-alpha'));
  } finally {
    dom.restore();
  }
});

test('faulty plugins are isolated in load, build, setup, and update without affecting healthy plugins', async () => {
  const dom = fakeDom();
  try {
    let healthyTicks = 0;
    let cleaned = false;
    const modules = new Map([
      ['bad-build', { default: { build() { throw Error('boom build'); }, setup() { throw Error('should not run'); } } }],
      ['bad-setup', { default: { setup(host) { host.ui.mount(dom.makeEl('div')); throw Error('boom setup'); } } }],
      ['bad-frame', {
        default: {
          setup(host) {
            host.onDispose(() => { cleaned = true; });
            let n = 0;
            return { update() { if (++n === 2) throw Error('boom frame'); } };
          },
        },
      }],
      ['healthy', { default: { setup() { return { update() { healthyTicks++; } }; } } }],
    ]);

    const loader = await loadPlugins(
      ['missing', 'bad-build', 'bad-setup', 'bad-frame', 'healthy'],
      {
        resolveUrl: id => new URL(`https://example.test/world/plugins/${id}/`),
        importModule: async href => {
          const id = href.match(/world\/plugins\/([^/]+)\/index\.js$/)?.[1];
          if (!modules.has(id)) throw Error('Module not found');
          return modules.get(id);
        },
      },
    );

    loader.runBuild({ built: {} });
    const fx = fakeEnv(dom);
    const host = loader.createHost(fx.env);
    host.start();
    assert.equal(fx.hud.children.length, 0, 'bad-setup element was cleaned up');

    host.update(0.016, 0.016, 1);
    host.update(0.016, 0.016, 2);
    host.update(0.016, 0.016, 3);
    assert.equal(healthyTicks, 3);
    assert.equal(cleaned, true);

    const byId = Object.fromEntries(host.status().map(s => [s.id, s.state]));
    assert.deepEqual(byId, {
      missing: 'failed',
      'bad-build': 'failed',
      'bad-setup': 'failed',
      'bad-frame': 'failed',
      healthy: 'active',
    });
    host.dispose();
  } finally {
    dom.restore();
  }
});
