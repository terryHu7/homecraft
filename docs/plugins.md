# Homecraft Plugins

Homecraft includes a lightweight plugin host in `engine/plugins.js` (`PLUGIN_API = 1`). A new site starts with `plugins: []` in `home.config.js` and loads no plugins by default.

Community and optional plugins live in a separate repository: [terryHu7/homecraft-plugins](https://github.com/terryHu7/homecraft-plugins).

> Note: `plugin/` (singular) is the standalone Portal Plugin (`plugin/homecraft-door.js`) embedded on external websites. Site plugins installed inside a Homecraft world live under `world/plugins/<id>/`, with optional backend services under `backend/<id>/`.

## Directory Layout and Compatibility

- `world/plugins/<id>/`: Frontend plugin files (`index.js`, `plugin.json`, local assets). Included automatically by `tools/build.sh` (including on existing forks from `v0.1.0` onward) and preserved by `npm run update`.
- `backend/<id>/`: Optional server or Worker code (e.g. a WebSocket room server). Excluded from `dist/` by `tools/build.sh` and deployed separately.
- `home.config.js`: Declares enabled plugins and per-plugin options.

Existing forks only need to update `engine/` via [engine/UPDATING.md](../engine/UPDATING.md) (`npm run update`) to gain plugin host support. No edits to `index.html`, `tools/build.sh`, or `world/build.js` are required.

## Enabling Plugins in `home.config.js`

```js
export default {
  // ...existing site settings...
  plugins: [
    // Enable with default options
    'welcome',
    // Enable with options (or set enabled: false to disable without deleting files)
    { id: 'multiplayer', enabled: true, endpoint: 'wss://mp.example.com', maxRemote: 16 },
  ],
};
```

Each entry is either a plugin ID string (`'my-plugin'`) or an object with `id`, optional `enabled` (default `true`), and options passed to the plugin. Disabled plugins are never imported by the browser.

## Plugin Module Contract (`world/plugins/<id>/index.js`)

A plugin exports a default object (or named exports) with optional `build` and `setup` hooks:

```js
export default {
  // Optional: runs during createWorld() right after world/build.js.
  // May mutate `grid` or return partial world additions to merge.
  build(ctx, options) {
    // ctx: { grid, layer, materials, stage, quality, scene, built, id, asset }
    return { batches, planes, obstacles, lights, bakes, hotspots, sites, sitesAfter, animated, surfaces, named };
  },

  // Optional: runs after world, HUD, minimap, phone, and photo studio initialize,
  // and before shader warmup and the main loop start.
  setup(host, options) {
    // Return optional lifecycle hooks (or a single cleanup function).
    return {
      update(dt, elapsed, now) {},
      warmup(on) {},
      dispose() {},
    };
  },
};
```

`setup` may be synchronous or return a Promise. Errors thrown in loading, `build`, `setup`, `update`, `warmup`, or host callbacks stop only that plugin and run its cleanup handlers without breaking the rest of the site.

## Host API (`setup(host, options)`)

### Core Handles and Actions

| Property / Method | Description |
|---|---|
| `version`, `id`, `signal`, `asset(path)` | API version (`1`), plugin ID, `AbortSignal` aborted on stop/dispose, plugin-local URL resolver |
| `onDispose(fn)`, `expose(value)` | Register cleanup callback; attach a debug handle readable at `__home.plugins.get(id)` |
| `stage`, `world`, `nav`, `player`, `avatar`, `rig`, `sound`, `portal`, `weather`, `quality`, `config` | Live engine subsystem handles |
| `go(id)`, `navigate(x, z, y)`, `openPage(id)`, `closePage()`, `openPortal()`, `visitWorld(w)`, `depart(w)` | World navigation and portal actions |
| `setWeatherMode(m)`, `getWeatherMode()`, `setTimeMode(m)`, `getTimeMode()` | Weather and time-of-day controls |
| `lang`, `t(zh, en)` | Current language (`'zh'` or `'en'`) and bilingual helper |

### Composable Extension Slots

All resources registered through these slots are removed automatically when the plugin stops or disposes.

| Method | Description |
|---|---|
| `host.ui.addCornerButton({ id, icon, label, title, onClick })` | Insert a button into `#corner`. `icon` accepts a built-in icon name, URL/data URI, or `<svg>` string. `label` accepts a string or `{ zh, en }`. Returns `{ el, setPressed, setLabel, setIcon, remove }`. |
| `host.ui.addDockButton({ id, icon, label, onClick })` | Append a slot to `#hotbar` with native tooltip and language sync. Returns `{ el, setActive, setLabel, remove }`. |
| `host.ui.addOverlay(el, { isOpen, close, pauseWorld, blockShortcuts })` | Register a modal/fullscreen element. While open, world movement pauses, shortcuts block, and `Escape` closes the topmost overlay automatically. |
| `host.ui.mount(el, { parent })` | Append a custom DOM element into `#hud` (or `parent`) tagged with `data-plugin="<id>"`. |
| `host.ui.addStyle(css)` | Inject a `<style>` element scoped for automatic cleanup. |
| `host.ui.addMapLayer(drawFn, { static })` | Paint on the minimap and big map. With `{ static: true }`, draws onto the cached map image (`(ctx, X, Z, PPM) => void`). By default (`static: false`), runs each redraw (`(ctx, { mode, scale, dpr, width, height, toScreen }) => void`). |
| `host.input.onKey(key, handler, { allowWhenBlocked })` | Register a non-movement keyboard shortcut (automatically ignores text inputs and system modifiers). Return `false` to fall through to lower handlers. |
| `host.addPicker(ray => hit)` | Participate in 3D pointer raycasting. Return `{ t, cursor, onTap }` (or `null`) to support hover cursors and click interactions depth-tested against world geometry. |
| `host.events.on(event, fn)` | Subscribe to `'lang'`, `'mood'`, `'weather'`, `'pageOpen'`, or `'pageClose'`. |

## Performance and Trust Model

- Plugins execute as standard site-local ES modules in the same origin as the website. The host isolates exceptions and cleans up registered resources; it is **not** a security sandbox. Only install plugins whose source you have reviewed.
- Plugin rendering counts toward the complete site's performance budget in [AGENTS.md](../AGENTS.md) (`<= 60` draw calls, `<= 200,000` triangles, `<= 2` real-time lights, no per-frame allocations). Always check desktop and mobile after installing a plugin.
