// Puts a world together. The world's own build (`@world/build.js`) sets its
// blocks and furniture; this file meshes them, bakes the lamps into one light
// volume, adds the sea and gathers everything that can be stood on. The
// collision grid stays independent of the merged surfaces, so wide windows
// and floors stay cheap to render.
import * as THREE from 'three';
import * as L from '@world/layout.js';
import { build as buildWorld } from '@world/build.js';
import { createTileArray, createMarbleTexture } from './textures.js';
import { createBlockMaterials } from './blocks.js';
import { VoxelGrid } from './voxels.js';
import { defineBaseBlocks } from './terrain.js';
import { createSea } from './landscape.js';
import { createGround } from './ground.js';
import { createContactShadows } from './fx.js';
import { createInteriorLighting } from './lighting.js';
import { MOODS, LAYER_SHADOW_ONLY } from './stage.js';

export const floorAt = L.floorAt || (() => 0);

export function createWorld(stage, quality) {
  const { scene } = stage;
  const tiles = createTileArray(), materials = createBlockMaterials(tiles.texture, createMarbleTexture(), tiles.layer.prada_marble);
  // Boxes marked { metal: true } use this; a world may swap in a real metal (see examples/terry-home's stainless.js).
  materials.boxMetal = materials.box;
  const B = L.ISLAND;
  const grid = new VoxelGrid({ min: [B.x0, -20, B.z0], size: [B.x1 - B.x0, 34, B.z1 - B.z0] });
  defineBaseBlocks(grid);
  const built = buildWorld({ grid, layer: tiles.layer, materials, stage, quality, scene }) || {};
  const {
    batches = {}, planes = [], obstacles = [], lights: allLights = [], bakes = [], hotspots = [], animated = {}, surfaces = {},
    forest = null, sites = [], sitesAfter = [], seaHole = L.POOL || null, named = {},
  } = built;

  const groups = {};
  const group = name => (groups[name] ||= Object.assign(new THREE.Group(), { name }));
  for (const [name, meshes] of Object.entries(grid.build(materials, tiles.layer))) for (const m of meshes) {
    // Invisible bounds (tree crowns) only keep the camera and the rain out.
    if (name === 'forestCollision') { m.geometry.dispose(); continue; }
    group(name).add(m);
  }
  if (forest) for (const m of forest.batch.build(materials)) group('forest').add(m);
  const lighting = createInteriorLighting(grid, bakes, L.LIGHT_VOLUME);
  for (const [name, batch] of Object.entries(batches)) for (const m of batch.build(materials)) {
    m.userData.keepVisible = name.startsWith('wall'); group(name).add(m);
  }
  for (const p of planes) group(p.userData.group || 'static').add(p);
  for (const g of Object.values(groups)) scene.add(g);
  const coast = createSea(scene, seaHole);

  // Up high, the player can land on and walk across a house's roof (and its
  // parapet) and the tops of tree crowns.
  const H = L.HOUSE;
  const roofPlane = H && new THREE.Plane(new THREE.Vector3(0, 1, 0), -H.height - 1), roofHit = new THREE.Vector3();
  const heights = {
    levels(x, z, out) {
      if (H && x >= H.x0 - 1 && x < H.x1 + 1 && z >= H.z0 - 1 && z < H.z1 + 1) {
        const bx = Math.floor(x), bz = Math.floor(z);
        for (let y = H.height; y <= H.height + 2; y++) if (grid.type(bx, y, bz) && !grid.type(bx, y + 1, bz) && !grid.type(bx, y + 2, bz)) out.push({ y: y + 1, site: 'roof' });
      }
      if (forest) for (const c of forest.tops) if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) out.push(c);
    },
    obstructed(x, z, feet) {
      for (const h of [.15, .95, 1.7]) if (grid.type(Math.floor(x), Math.floor(feet + h), Math.floor(z))) return true;
      return false;
    },
    pick(ray) {
      if (!H || named.modelRoofPicking || hidden.has('roof') || ray.direction.y >= 0 || !ray.intersectPlane(roofPlane, roofHit)) return null;
      if (roofHit.x <= H.x0 || roofHit.x >= H.x1 || roofHit.z <= H.z0 || roofHit.z >= H.z1) return null;
      return { t: roofHit.distanceTo(ray.origin), point: roofHit.clone(), site: 'roof' };
    },
  };
  // Everything outside the base grid the player can stand on, in one place.
  const sources = [...sites, heights, ...sitesAfter];
  const ground = createGround(sources);
  const lights = allLights.slice(0, quality.maxLights);
  for (const l of lights) scene.add(l);

  scene.add(createContactShadows(obstacles, floorAt, L.LOFT?.y ?? 4));
  const hidden = new Set();
  function setHidden(name, hide) {
    if (!groups[name] || hidden.has(name) === hide) return;
    hide ? hidden.add(name) : hidden.delete(name);
    groups[name].traverse(o => {
      if (!o.isMesh) return;
      const glazing = name.startsWith('wall') && (o.userData.keepVisible || o.material === materials.voxelGlass || o.material === materials.boxGlass);
      o.layers.set(hide && !glazing ? LAYER_SHADOW_ONLY : 0);
    });
  }
  let night = false;
  function setMood(name) {
    const mood = MOODS[name]; night = mood.night >= .5;
    stage.setMood(name, lights); materials.uniforms.uEmissiveBoost.value = mood.lamps;
    lighting.uniforms.uInteriorBoost.value = mood.interior;
    coast.setMood(name);
  }
  // The camera stops at slopes that are not blocks (a mountain's ground).
  const viewBlock = (from, dir, far) => sources.reduce((t, s) => Math.min(t, s.viewBlock?.(from, dir, far) ?? Infinity), Infinity);
  return {
    ...named, grid, groups, setHidden, hidden, setMood, lighting, forest, coast, ground, viewBlock,
    obstacles, hotspots, animated, surfaces, lights, materials, tiles, isNight: () => night,
  };
}
