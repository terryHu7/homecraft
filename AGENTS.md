# Homecraft Development Conventions

## Purpose

Homecraft is a Minecraft-style 3D personal website template. The project uses Three.js and native ES modules, and runs without a build step.

## Development Principles

1. **Ensure mobile experience.** Follow the performance budget. After any functional or visual change, check the `?debug` overlay or run `npm run check`.
2. **Reference the showcase home for dimensions and materials.** Refer to similar items in `examples/terry-home` for style; see "Visual Design" for details.

## Directory Structure

```
index.html        Content: each <article class="page" data-station="id"> is a card
homecraft.json    Public site metadata: unified site name, URL, logo, tagline, and language
home.config.js    Settings: name, skin, language, weather city, Dock, guestbook
world/            The user's world
  layout.js       Data: island bounds, spawn point, stations, prefab positions
  build.js        Building: build(ctx) creates blocks and furniture; setup(app) defines dynamic behavior (optional)
assets/           Images (project screenshots, skins, icons)
engine/           Engine (keep when customizing the site; replace entirely when upgrading)
examples/terry-home/   Showcase home: reference implementation for buildings, furniture, landscaping, and pets
backend/mailbox/  Optional: Cloudflare Worker that forwards guestbook messages to email
tools/            serve.py (local preview), check.mjs (self-check), build.sh (build & deploy)
plugin/           Portal plugin for regular websites and blogs (homecraft-door.js)
directory/        Public directory data
```

Site customization primarily involves modifying `world/`, `index.html`, `home.config.js`, `homecraft.json`, and `assets/`. Only modify `engine/` when fixing engine bugs or when the user explicitly requests it; if a requirement can only be fulfilled by changing the engine, inform the user first. See "Running and Self-Check" for how to check engine diffs.

The import map in `index.html` defines module paths: `@world/` maps to `world/`, `@config` maps to `home.config.js`, and `@engine/` maps to `engine/`.

## Running and Self-Check

```sh
python3 tools/serve.py          # Start local preview; use python on Windows
npm run check:site              # Check site metadata, skin, and engine diffs — no dependencies or running server needed
npm install && npm run check    # Install dependencies and run site + browser checks
```

- The preview server automatically picks a free port, opens the browser, and prints the address in the terminal. Responses have caching disabled — just refresh after changes. `npm run check` connects to this address.
- `npm run check` first runs `check:site`, then uses a headless browser to verify startup and page opening at desktop and mobile sizes, reports errors, and outputs draw stats. Screenshots are saved in `tools/.check/`; check at least one screenshot after visual changes.
- Appending `?debug` to the URL displays draw calls, triangle count, and frame time at the top of the page; values exceeding the budget are highlighted in red.
- When `check:site` reports a missing tagline or logo, ask the user to provide them. For engine diffs in the check report, only revert engine changes unrelated to the current task and keep changes the user already had. `engine/manifest.json` is only updated by maintainers at release time.
- Local frame time only reflects the current machine's performance. Before publishing, ask the user to check the actual experience on their phone. See [docs/deploy.md](docs/deploy.md) for deployment steps.

The browser console provides the following debug APIs:

| Call | Purpose |
|---|---|
| `__home.stats()` | View draw stats |
| `__home.go('about')` | Navigate to a station |
| `__home.player.teleport(x, z)` | Move to specific coordinates |
| `__home.setTimeMode('night')` | Switch time of day |
| `__home.setWeatherMode('rain')` | Switch weather |
| `__home.rig.showcase([camX,Y,Z], [lookX,Y,Z])` | Lock camera position for screenshots |

## Coordinates

One block = 1 meter. x points east, z points south, y points up; the opening shot is from the south, and ground level is y = 0. `grid.fill` uses half-open intervals, e.g. x0 ≤ x < x1. The character is 1.8 m tall and can step up ledges about 0.6 m high; greater height differences require stairs or flying.

## World API

### `world/layout.js`

| Export | Required | Description |
|---|---|---|
| `ISLAND` | ✓ | `{ x0, x1, z0, z1 }`: world bounds in blocks, default 74×57. The pathfinding grid, map, and block grid all cover this range. If pool depth exceeds 3 m, increase the `depth` parameter in `buildIsland` |
| `SPAWN` | ✓ | `{ x, z, heading }`: spawn point. heading 0 faces south, π faces north |
| `STATIONS` | ✓ | Array of stations, see below |
| `MAILBOX` | | `{ x, z, yaw }`: position and facing of the mailbox prefab |
| `PORTAL` | | `{ x, z, yaw }`: position and facing of the portal. Appears as a frameless blue vortex, ~1.7 m wide and ~2.6 m tall. yaw is one of 0, π/2, π, −π/2, where 0 faces south. Place on land with 3 m of clear space in front for arriving visitors |
| `PETS` | | `{ cat: {…}, dog: {…} }`: `anchors: [[x,z],…]` are roaming positions; `within(x,z)` can restrict roaming area; `home: [x,z]` is the initial resting position |
| `HOUSE` | | `{ x0, x1, z0, z1, height }`: enterable house. When the character enters, walls blocking the camera (`wallN/S/E/W` groups) and the roof (`roof` group) auto-hide. The roof is walkable; doorways need 2 blocks wide and 3 blocks tall; when taking off indoors, the character exits via the `EXIT` / `DOORWAY` defined exits |
| `POOL` | | `{ x0, x1, z0, z1, water, bed }`: swimmable pool (loads pool.js). See also `POOL_LADDER`, `POOL_LAMPS` |
| `floorAt(x, z)` | | Returns the floor height at the given position, used for stairs and upper floors. Defaults to 0 if undefined |
| `INTRO` | | `{ pos, portrait, look }`: opening camera shot, defaults to starting from above the island at an angle |
| `LIGHT_VOLUME`, `SHELTER` | | Bounds for baked lighting and rain/snow occlusion maps, calculated from `ISLAND` by default |

Station example:

```js
{ id: 'works', name: '作品', en: 'Works', at: [4.5, 2.7], look: [4.5, 1], icon: 'works' }
```

- `id` is used in `index.html`'s `<article data-station>`, `STATIONS`, and `hotspots`. Press F nearby to open the card.
- `at` is about 1.5 m in front of the object, `look` points toward the object.
- `icon` is a pixel icon name from `ART` in `engine/ui/icons.js`, defaults to the same as `id`.
- `floor` is the floor height of the station's level; must be set for stations on the second floor. `page: false` means there is no corresponding card.
- `id: 'portal'` is the station in front of the portal; `at` is about 2.4 m in front of it; pressing F opens the world list.

### `world/build.js`

```js
export function build({ grid, layer, materials, stage, quality, scene }) {
  // Create blocks and furniture
  return { batches: { static: B }, planes, obstacles, hotspots, bakes, surfaces, forest };
}
export function setup({ stage, world, nav, player, avatar, sound, rig, quality, config }) {
  return { update(dt) { /* per frame */ }, warmup(on) {} };   // optional
}
```

All fields in the return value are optional:

| Field | Description |
|---|---|
| `batches` | `{ groupName: BoxBatch }`. Groups prefixed with `wall` keep glass visible when walls are hidden; the `roof` group hides when the character enters the house |
| `planes` | Additional `THREE.Mesh` objects for patterned panels, signs, etc. Each Mesh adds draw overhead |
| `obstacles` | `{ x0, x1, z0, z1, level }`: collision bounds for furniture, extended ~5 cm beyond the actual object. level 0 is ground floor, 1 is the floor at `LOFT.y` |
| `hotspots` | `{ id, box: THREE.Box3 }`: click and proximity detection bounds for stations |
| `bakes` | Lights written into the light volume: `{ id, position: [x,y,z], power, radius, direction: [x,y,z] or null }`. Nighttime lighting uses pre-baked results; standard light fixtures should all be written to this field |
| `lights` | Real-time point lights, maximum 2. Use `bakes` for standard lighting |
| `surfaces` | Dynamic surfaces supported by the engine: `fireplace` (one or more flame faces `{ position, rotation, width, height }`), `scoreboard` (wall-mounted calendar clock), `tvScreen` (a Mesh playing city night footage) |
| `forest` | Return value of `buildForest(grid, layer, spots)`. Tree canopies are merged into a single draw call |
| `sites` / `named` | Walkable surfaces outside the block grid, such as hills, docks, and rooftop stairs; see examples for usage |

## World Building

**Blocks**: placed on a 1 m grid; surfaces of adjacent identical blocks are merged into a single draw call.

```js
grid.set(x, y, z, 'stone');                       // single block
grid.fill(x0, y0, z0, x1, y1, z1, 'planks');      // region (half-open interval)
grid.set(x, y, z, null);                          // remove
grid.define('marble', { tex: { all: 'prada_marble' }, merge: true, map: '#3b5a4a' });  // custom block type; map is its minimap color
```

Built-in block types: `grass sand dirt stone deepslate gravel concrete planks deck pavers travertine log leaves hedge glass`.

**Furniture**: built uniformly with `BoxBatch`, allowing custom sizes and positions while reducing draw calls through batched rendering.

```js
import { BoxBatch } from '@engine/world/blocks.js';
const B = new BoxBatch(layer);
B.box(cx, y, cz, w, h, d, { tex: 'oak' });                         // y is the bottom face
B.box(cx, y, cz, w, h, d, { tex: 'wood_panel', top: 'oak' });      // different textures for top and sides
B.box(cx, y, cz, w, h, d, { tex: 'paint', tint: 0x2a2d31 });       // solid color
B.box(cx, y, cz, w, h, d, { tex: 'paint', tint: 0x9fd3ff, emissive: 1 });   // self-illuminated (screens, lampshades)
B.box(cx, y, cz, w, h, d, { tex: 'glass', glass: true });          // glass
B.box(cx, y, cz, w, h, d, look, { ry: Math.PI / 4 });              // rotation (rx, ry, rz)
B.at(x, 0, z, ry, () => { /* coordinates here are relative to (x, z) and rotated by ry */ });
```

Built-in textures are all procedurally generated 16×16 pixel images: `grass_top grass_side dirt stone deepslate concrete oak wood_floor wood_panel stainless sand prada_marble chair_mesh parquet walnut maple deck black_metal white_brick prada plaster glass roof bookshelf leaves leaves_olive leaves_osmanthus solar hedge log log_top palm pool_tile pool_deep travertine pavers steel white velvet linen leather terracotta rubber paint chrome glow screen water cloud gravel flower_red flower_white flower_violet tall_grass greige_floor foliage`.

**Other:**

- Terrain: `buildIsland(grid, ISLAND, { surfaceAt: (x, z, edge) => 'grass' })`, where edge is the approximate distance from the coast.
- Trees: `buildForest` for groves of trees, `buildTrees` for block-leaf tree shapes.
- Grass and flowers: `buildTufts(layer, materials, [{ x, z, tile: 'flower_red' }, …])`. tile can be `tall_grass flower_red flower_white flower_violet`; optional parameter `s` sets size, `tint` sets color. Return value goes into `planes`; tufts in the same batch are merged into a single draw call.
- Signs and paintings: use `canvasTexture(w, h, (ctx, w, h) => …)` and `pixelText(ctx, 'HELLO', x, y, scale, color)` to generate textures, then apply them to panels in `planes`.

Implementation examples: `world/build.js` (empty island with trees), `examples/terry-home/world/furnish.js` (indoor furniture).

## Content (index.html)

- `<article class="page" data-station="id">`: a card; `<h2>` is the title.
- `data-embed="https://…"`: embeds a webpage via iframe; the ↗ in the title bar opens the original page in a new tab.
- `data-link="https://…"`: opens the specified link in a new tab.
- A card's `data-icon` determines its icon on the Dock.
- In the contact list (`data-station="contact"`), each `<li data-app="…">` corresponds to an app on the phone UI; `<p>` is the description for that account. Available `data-app` values are listed in `LOOKS` in `engine/ui/phone.js`.
- When the user has not provided a link URL, do not set `href` on the `<a>`.
- Work cards (`ul.store > li[data-work]`): `.listing` contains the icon, name, description, and button; `.shots` holds portrait screenshots — 400×869 WebP images are recommended.
- Bilingual: short labels are written in English by default; Chinese uses `data-zh`, `data-zh-label`, `data-zh-placeholder`, `data-zh-alt`, etc.; Chinese body text with `data-en` attributes is also supported. Longer text is placed in separate elements with `lang="zh-CN"` and `lang="en"`. For single-language sites, set `languages` in `home.config.js`, e.g. `['zh']` or `['en']`.
- Use the same Chinese and English names across the UI, README files, documentation, issue forms and screenshots: `传送门 / Portal`, `申请收录 / Request listing`, `查看全部 / View all`. Keep spelling and capitalization consistent; do not rename the listing request to "Add my home" or "Add my website". When changing a label, check synced copies and screenshots as well.
- Site name, logo, and one-line tagline go in `homecraft.json` ([docs/site-metadata.md](docs/site-metadata.md)). `logo` is for site branding; the avatar skin is set by `config.skin`. When changing the site name, also update `<title>` and sharing metadata.
- The Dock defaults to "Home page, About, Guestbook, Phone". Order is set by `dock` in `home.config.js`, maximum 9 items. The home page (`data-station="blog"`) embeds the user-provided website; when changing `data-embed`, also update the link in the body text.
- Avatar follows [docs/avatar.md](docs/avatar.md): only replace the 64×64 PNG skin (`config.skin`); do not change the default model.

## Guestbook

The guestbook entry defaults to opening the visitor's email app. For in-site submission, deploy the Worker per [backend/mailbox/README.md](backend/mailbox/README.md).

## Performance Budget

All changes must comply with the following budget.

| Metric | Limit | Implementation Requirement |
|---|---|---|
| Draw calls at common viewpoints | 60 | Use `grid.fill` for walls and floors, `BoxBatch` for furniture |
| Triangles | 200,000 | New models count toward the total budget |
| Real-time lights | 2 | Write lights to `bakes` |
| Shadows | Only the sun casts shadows; the shadow map is static | New lights must not cast shadows |
| Textures | Built-in 16×16 textures | Use `canvasTexture` to generate small textures for new patterns. Photos go in cards |
| Post-processing | None | Use materials and baked lighting to achieve effects |
| Initial load | Under 500 KB (compressed) | Use WebP for images, add `loading="lazy"` to card images |
| Per frame | No object allocations | Animations run in `setup().update(dt)`; do not update invisible objects |

When exceeding the budget, prioritize reducing rendering overhead; if still unable to meet the budget, explain the impact and let the user decide.

## Visual Design

The following are the default design requirements; user-specified styles take priority.

- **Reference existing items.** Look for similar buildings, furniture, plants, paintings, or light fixtures in `examples/terry-home/world/`, reuse their dimensions, materials, and implementation, then adjust per user requirements. See `examples/terry-home/README.md` for the file reference table.
- **Two to three primary materials per space.** One wood, one metal, one low-saturation accent color. Use dark tones for sofas and chairs, light tones for bedding.
- **Highlight one main piece per area**, leaving space around it.
- **Use real-world proportions.** 1 block = 1 m, character height = 1.8 m. Doors 2.2–2.8 m tall, at least 1.2 m wide; tabletops at 0.75 m; seat height 0.45 m; bed surface 0.5 m; floor-to-ceiling at least 3 m; stair risers ~0.17 m. Passages at least 1.2 m wide. Leave small gaps between furniture and walls, and between objects.
- **Put names and descriptions in cards.**
- **Write lights to `bakes`.** See "Performance Budget".
- **Use the engine's built-in UI.** Radar, Dock, card frames, buttons, and fonts are provided by the engine. The BetterMapIt icon and Homecraft branding are distributed with the engine.

## Portal

The portal connects independently deployed websites; see [docs/protocol.md](docs/protocol.md) for the protocol. When modifying the protocol, consider backward compatibility with older versions.

- Link formats follow `engine/door-protocol.js`, `engine/portal.js`, and `engine/traveller.js`. The public directory URL follows `engine/config.js`.
- `Referrer-Policy` preserves the origin. Links contain only public URLs — no account IDs, email addresses, or other identity information.
- The listing entry point is the main repository's ["Request listing"](https://github.com/terryHu7/homecraft/issues/new/choose); see [docs/worlds.md](docs/worlds.md) for the process. `directory/` is only maintained in the main repository.
