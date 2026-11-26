// Lightweight plugin host for site-local plugins under world/plugins/<id>/.
// Loads enabled modules from config.plugins, runs optional build() and setup()
// hooks, composes UI/input/map/picking slots, and isolates per-plugin failures.

export const PLUGIN_API = 1;

const RESERVED_KEYS = new Set(['id', 'enabled']);
const PLAIN_OBJECT = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export const validPluginId = id =>
  typeof id === 'string' && id.length <= 60 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id);

export function normalizePlugins(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const entries = [];
  for (const item of raw) {
    let id, enabled = true, options = {};
    if (typeof item === 'string') {
      id = item;
    } else if (PLAIN_OBJECT(item)) {
      id = item.id;
      enabled = item.enabled !== false;
      const rest = Object.fromEntries(Object.entries(item).filter(([k]) => !RESERVED_KEYS.has(k)));
      const keys = Object.keys(rest);
      options = keys.length === 1 && keys[0] === 'options' && PLAIN_OBJECT(rest.options) ? { ...rest.options } : rest;
    } else {
      console.warn('Homecraft plugins: ignored invalid plugin entry', item);
      continue;
    }
    if (!validPluginId(id)) {
      console.warn(`Homecraft plugins: invalid plugin id "${String(id)}"`);
      continue;
    }
    if (seen.has(id)) {
      console.warn(`Homecraft plugins: duplicate plugin id "${id}"`);
      continue;
    }
    seen.add(id);
    entries.push({ id, enabled, options });
  }
  return entries;
}

function resolveAsset(baseUrl, path) {
  if (typeof path !== 'string' || !path) throw Error('Asset path must be a non-empty string');
  const url = new URL(path, baseUrl);
  if (!url.href.startsWith(baseUrl.href)) throw Error(`Asset path leaves plugin directory: ${path}`);
  return url.href;
}

function mergeBuildPatch(built, patch) {
  if (!PLAIN_OBJECT(patch)) return;
  for (const key of ['planes', 'obstacles', 'lights', 'bakes', 'hotspots', 'sites', 'sitesAfter']) {
    if (Array.isArray(patch[key]) && patch[key].length) {
      built[key] ||= [];
      built[key].push(...patch[key]);
    }
  }
  if (PLAIN_OBJECT(patch.batches)) {
    built.batches ||= {};
    for (const [name, batch] of Object.entries(patch.batches)) {
      if (!batch) continue;
      if (!built.batches[name]) built.batches[name] = batch;
      else if (Array.isArray(built.batches[name])) built.batches[name].push(batch);
      else built.batches[name] = [built.batches[name], batch];
    }
  }
  for (const key of ['animated', 'surfaces', 'named']) {
    if (PLAIN_OBJECT(patch[key])) {
      built[key] ||= {};
      Object.assign(built[key], patch[key]);
    }
  }
}

export async function loadPlugins(raw, { resolveUrl, importModule } = {}) {
  const entries = normalizePlugins(raw);
  const records = entries.map(entry => ({
    id: entry.id,
    enabled: entry.enabled,
    options: entry.options,
    state: entry.enabled ? 'loading' : 'disabled',
    error: null,
    module: null,
    baseUrl: resolveUrl ? resolveUrl(entry.id) : new URL(`../world/plugins/${entry.id}/`, import.meta.url),
    stopped: false,
    cleanup: new Set(),
    controller: new AbortController(),
    frame: null,
    warmup: null,
    exposed: undefined,
  }));

  const load = importModule || (href => import(href));
  await Promise.all(records.map(async record => {
    if (!record.enabled) return;
    try {
      const entryUrl = new URL('index.js', record.baseUrl).href;
      const ns = await load(entryUrl);
      const def = ns?.default;
      const mod = typeof def === 'function' ? { setup: def } : PLAIN_OBJECT(def) ? def : ns;
      if (!mod || (typeof mod.build !== 'function' && typeof mod.setup !== 'function')) {
        throw Error('Plugin entry must export build() or setup()');
      }
      record.module = mod;
      record.state = 'loaded';
    } catch (error) {
      record.state = 'failed';
      record.error = error?.message || String(error);
      console.warn(`Plugin "${record.id}" failed to load:`, error);
    }
  }));

  function runBuild(ctx) {
    for (const record of records) {
      if (record.state !== 'loaded' || typeof record.module.build !== 'function') continue;
      try {
        const patch = record.module.build(
          { ...ctx, id: record.id, asset: path => resolveAsset(record.baseUrl, path) },
          record.options,
        );
        mergeBuildPatch(ctx.built, patch);
      } catch (error) {
        record.state = 'failed';
        record.error = error?.message || String(error);
        console.warn(`Plugin "${record.id}" failed during build:`, error);
      }
    }
  }

  function createHost(env) {
    const active = [];
    const overlays = [];
    const keyBindings = [];
    const pickers = [];
    const eventListeners = new Map();
    const staticMapLayers = [];
    const dynamicMapLayers = [];
    let disposed = false;
    let started = false;

    const { stage, world, nav, player, avatar, rig, sound, portal, weather, quality, config, actions, ui } = env;

    const localize = value => {
      if (typeof value === 'string') return value;
      if (PLAIN_OBJECT(value)) return ui.t(value.zh ?? value.en ?? '', value.en ?? value.zh ?? '');
      return '';
    };

    const resolveIconUrl = spec => {
      if (!spec) return ui.icon('gear').url;
      if (typeof spec === 'string') {
        const trimmed = spec.trim();
        if (trimmed.startsWith('<svg')) return `data:image/svg+xml;utf8,${encodeURIComponent(trimmed)}`;
        if (/^(?:data:|blob:|https?:\/\/|\/|\.\.?\/)/.test(trimmed)) return trimmed;
        return ui.icon(trimmed).url;
      }
      return ui.icon('gear').url;
    };

    function stop(record, error = null) {
      if (record.stopped) return;
      record.stopped = true;
      record.frame = null;
      record.warmup = null;
      record.exposed = undefined;
      record.controller.abort();
      for (const cleanup of [...record.cleanup].reverse()) {
        try { cleanup(); } catch (e) { console.warn(`Plugin "${record.id}" cleanup error:`, e); }
      }
      record.cleanup.clear();
      const idx = active.indexOf(record);
      if (idx >= 0) active.splice(idx, 1);
      record.state = error ? 'failed' : 'stopped';
      if (error) {
        record.error = error?.message || String(error);
        console.warn(`Plugin "${record.id}" stopped after error:`, error);
      }
    }

    function createHostFor(record) {
      const own = cleanup => {
        if (typeof cleanup !== 'function') throw Error('Cleanup handler must be a function');
        let done = false;
        const release = () => {
          if (done) return;
          done = true;
          record.cleanup.delete(release);
          cleanup();
        };
        if (record.stopped) release();
        else record.cleanup.add(release);
        return release;
      };

      const guard = fn => (...args) => {
        if (record.stopped) return;
        try {
          const out = fn(...args);
          if (out?.then) out.catch(err => stop(record, err));
          return out;
        } catch (err) {
          stop(record, err);
        }
      };

      const hostUi = {
        addCornerButton({ id, icon: iconSpec, label, title, onClick } = {}) {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.plugin = record.id;
          if (id) button.dataset.pluginControl = id;
          button.setAttribute('aria-pressed', 'false');
          const glyph = document.createElement('span');
          glyph.style.backgroundImage = `url("${resolveIconUrl(iconSpec)}")`;
          button.append(glyph);
          let currentLabel = label ?? record.id;
          let currentTitle = title ?? currentLabel;
          const syncText = () => {
            const text = localize(currentLabel);
            button.setAttribute('aria-label', text);
            button.title = localize(currentTitle);
          };
          syncText();
          const offLang = ui.onLang(syncText);
          if (typeof onClick === 'function') {
            button.addEventListener('click', guard(onClick), { signal: record.controller.signal });
          }
          ui.corner.prepend(button);
          const remove = own(() => { offLang(); button.remove(); });
          return {
            el: button,
            setPressed(on) { button.setAttribute('aria-pressed', String(Boolean(on))); },
            setLabel(next) { currentLabel = next; currentTitle = next; syncText(); },
            setIcon(next) { glyph.style.backgroundImage = `url("${resolveIconUrl(next)}")`; },
            remove,
          };
        },

        addDockButton({ id, icon: iconSpec, label, onClick } = {}) {
          let currentLabel = label ?? record.id;
          const handle = ui.addDockButton({
            name: () => localize(currentLabel),
            iconUrl: resolveIconUrl(iconSpec),
            onClick: typeof onClick === 'function' ? guard(onClick) : () => {},
            pluginId: record.id,
            controlId: id,
          });
          const remove = own(() => handle.remove());
          return {
            el: handle.el,
            setActive(on) { handle.el.classList.toggle('on', Boolean(on)); },
            setLabel(next) { currentLabel = next; handle.el.setAttribute('aria-label', localize(currentLabel)); },
            remove,
          };
        },

        addOverlay(el, { isOpen, close, pauseWorld = true, blockShortcuts = true } = {}) {
          let mountedByHost = false;
          if (el && !el.isConnected) {
            el.dataset.plugin = record.id;
            ui.hud.append(el);
            mountedByHost = true;
          }
          const checkOpen = typeof isOpen === 'function' ? isOpen : () => Boolean(el?.isConnected && !el.hidden);
          const closeOverlay = typeof close === 'function' ? close : () => { if (el) el.hidden = true; };
          const entry = { record, isOpen: checkOpen, close: guard(closeOverlay), pauseWorld, blockShortcuts };
          overlays.push(entry);
          const remove = own(() => {
            const i = overlays.indexOf(entry);
            if (i >= 0) overlays.splice(i, 1);
            if (mountedByHost) el?.remove();
          });
          return {
            el,
            open() { if (el) el.hidden = false; },
            close() { entry.close(); },
            isOpen: checkOpen,
            remove,
          };
        },

        mount(el, { parent } = {}) {
          el.dataset.plugin = record.id;
          (parent || ui.hud).append(el);
          return own(() => el.remove());
        },

        addStyle(css) {
          const style = document.createElement('style');
          style.dataset.plugin = record.id;
          style.textContent = String(css);
          document.head.append(style);
          return own(() => style.remove());
        },

        addMapLayer(drawFn, { static: isStatic = false } = {}) {
          if (typeof drawFn !== 'function') throw Error('Map layer must be a function');
          const entry = { record, fn: drawFn };
          if (isStatic) {
            staticMapLayers.push(entry);
            ui.minimap.redrawImage();
            return own(() => {
              const i = staticMapLayers.indexOf(entry);
              if (i >= 0) staticMapLayers.splice(i, 1);
              ui.minimap.redrawImage();
            });
          }
          dynamicMapLayers.push(entry);
          return own(() => {
            const i = dynamicMapLayers.indexOf(entry);
            if (i >= 0) dynamicMapLayers.splice(i, 1);
          });
        },
      };

      const hostInput = {
        onKey(key, handler, { allowWhenBlocked = false } = {}) {
          if (typeof key !== 'string' || !key || typeof handler !== 'function') throw Error('onKey requires a key and handler');
          const binding = { record, key: key.toLowerCase(), handler, allowWhenBlocked };
          keyBindings.push(binding);
          return own(() => {
            const i = keyBindings.indexOf(binding);
            if (i >= 0) keyBindings.splice(i, 1);
          });
        },
      };

      const hostEvents = {
        on(event, fn) {
          if (typeof fn !== 'function') throw Error('Event listener must be a function');
          if (event === 'lang') {
            const off = ui.onLang(guard(fn));
            return own(off);
          }
          let set = eventListeners.get(event);
          if (!set) { set = new Set(); eventListeners.set(event, set); }
          const entry = { record, fn };
          set.add(entry);
          return own(() => set.delete(entry));
        },
      };

      return {
        version: PLUGIN_API,
        id: record.id,
        signal: record.controller.signal,
        asset: path => resolveAsset(record.baseUrl, path),
        onDispose: own,
        expose(value) { record.exposed = value; },
        addPicker(fn) {
          if (typeof fn !== 'function') throw Error('Picker must be a function');
          const entry = { record, fn };
          pickers.push(entry);
          return own(() => {
            const i = pickers.indexOf(entry);
            if (i >= 0) pickers.splice(i, 1);
          });
        },
        // Core engine handles
        stage, world, nav, player, avatar, rig, sound, portal, weather, quality, config,
        // Actions
        ...actions,
        // Localization
        get lang() { return ui.getLang(); },
        t: ui.t,
        // Composable extension slots
        ui: hostUi,
        input: hostInput,
        events: hostEvents,
      };
    }

    function bindHooks(record, hooks) {
      if (record.stopped) return;
      if (typeof hooks === 'function') {
        record.cleanup.add(hooks);
      } else if (PLAIN_OBJECT(hooks)) {
        if (typeof hooks.update === 'function') record.frame = hooks.update;
        if (typeof hooks.warmup === 'function') record.warmup = hooks.warmup;
        if (typeof hooks.dispose === 'function') record.cleanup.add(hooks.dispose);
      }
      record.state = 'active';
      if (!active.includes(record)) active.push(record);
    }

    function start() {
      if (started || disposed) return;
      started = true;
      for (const record of records) {
        if (record.state !== 'loaded') continue;
        if (typeof record.module.setup !== 'function') {
          record.state = 'active';
          continue;
        }
        try {
          const host = createHostFor(record);
          const result = record.module.setup(host, record.options);
          if (result?.then) {
            record.state = 'starting';
            result.then(hooks => {
              if (!disposed) bindHooks(record, hooks);
            }, err => stop(record, err));
          } else {
            bindHooks(record, result);
          }
        } catch (error) {
          stop(record, error);
        }
      }
    }

    return {
      version: PLUGIN_API,
      start,
      update(dt, elapsed, now) {
        for (const record of [...active]) {
          if (record.stopped || !record.frame) continue;
          try { record.frame(dt, elapsed, now); }
          catch (err) { stop(record, err); }
        }
      },
      warmup(on) {
        for (const record of [...active]) {
          if (record.stopped || !record.warmup) continue;
          try { record.warmup(on); }
          catch (err) { stop(record, err); }
        }
      },
      hasBlockingOverlay() {
        for (const o of overlays) {
          if (o.record.stopped || !o.pauseWorld) continue;
          try { if (o.isOpen()) return true; } catch (err) { stop(o.record, err); }
        }
        return false;
      },
      hasShortcutBlockingOverlay() {
        for (const o of overlays) {
          if (o.record.stopped || !o.blockShortcuts) continue;
          try { if (o.isOpen()) return true; } catch (err) { stop(o.record, err); }
        }
        return false;
      },
      closeTopOverlay() {
        for (let i = overlays.length - 1; i >= 0; i--) {
          const o = overlays[i];
          if (o.record.stopped) continue;
          try {
            if (o.isOpen()) { o.close(); return true; }
          } catch (err) { stop(o.record, err); }
        }
        return false;
      },
      handleKey(k, event, { blocked = false, shortcutsBlocked = false } = {}) {
        for (let i = keyBindings.length - 1; i >= 0; i--) {
          const b = keyBindings[i];
          if (b.record.stopped || b.key !== k) continue;
          if (!b.allowWhenBlocked && (blocked || shortcutsBlocked)) continue;
          try {
            const handled = b.handler(event);
            if (handled !== false) return true;
          } catch (err) {
            stop(b.record, err);
          }
        }
        return false;
      },
      pick(ray, maxT = Infinity) {
        let best = null;
        for (const p of [...pickers]) {
          if (p.record.stopped) continue;
          try {
            const hit = p.fn(ray);
            if (!hit || !Number.isFinite(hit.t) || hit.t <= 0 || hit.t >= maxT) continue;
            if (!best || hit.t < best.t) best = { ...hit, record: p.record };
          } catch (err) {
            stop(p.record, err);
          }
        }
        return best;
      },
      emit(event, payload) {
        const set = eventListeners.get(event);
        if (!set) return;
        for (const entry of [...set]) {
          if (entry.record.stopped) continue;
          try { entry.fn(payload); } catch (err) { stop(entry.record, err); }
        }
      },
      drawStaticMap(ctx, X, Z, PPM) {
        for (const layer of [...staticMapLayers]) {
          if (layer.record.stopped) continue;
          try { ctx.save(); layer.fn(ctx, X, Z, PPM); ctx.restore(); }
          catch (err) { ctx.restore(); stop(layer.record, err); }
        }
      },
      drawMapLayers(ctx, info) {
        for (const layer of [...dynamicMapLayers]) {
          if (layer.record.stopped) continue;
          try { ctx.save(); layer.fn(ctx, info); ctx.restore(); }
          catch (err) { ctx.restore(); stop(layer.record, err); }
        }
      },
      status() {
        return records.map(({ id, state, error }) => ({ id, state, ...(error ? { error } : {}) }));
      },
      get(id) {
        return records.find(r => r.id === id && !r.stopped)?.exposed;
      },
      stop(id) {
        const record = records.find(r => r.id === id);
        if (record) stop(record);
      },
      dispose() {
        disposed = true;
        for (const record of [...records]) stop(record);
      },
    };
  }

  return { records, runBuild, createHost };
}
