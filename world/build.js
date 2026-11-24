import { buildIsland } from '@engine/world/terrain.js';
import { buildForest } from '@engine/world/landscape.js';
import { ISLAND, TREES } from './layout.js';
import { createMultiplayer } from '../multiplayer/client/index.js';

export function build({ grid, layer }) {
  buildIsland(grid, ISLAND, { surfaceAt: () => 'grass', corner: 10, wobble: 0 });
  return { forest: buildForest(grid, layer, TREES) };
}

// Other people on the island, when multiplayer is configured in
// home.config.js (see multiplayer/README.md). Nothing here may throw: a
// setup() that does would take the whole page down with it, and the site
// must run without the module.
export function setup(app) {
  try {
    const mp = createMultiplayer(app);
    if (!mp) return {};
    let warned = false;
    const safe = fn => (...args) => {
      try { fn(...args); } catch (e) { if (!warned) { warned = true; console.warn('multiplayer:', e); } }
    };
    return { update: safe(mp.update), warmup: safe(mp.warmup) };
  } catch (e) { console.warn('multiplayer init failed:', e); return {}; }
}
