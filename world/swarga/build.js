import * as THREE from 'three';
import { BoxBatch } from '@engine/world/blocks.js';
import { setupAiravata } from './airavata.js';
import { buildDanceHall } from './dance-hall.js';
import { setupDance } from './dance-animation.js';
import { buildNandana, buildNandanaClouds, setupNandanaClouds } from './nandana.js';
import { setupNandanaAnimals } from './nandana-animals.js';
import { CORE_ISLAND, DAIS, DAIS_STEP, DANCE_BRIDGE, HOUSE, STAIRS, STATIONS } from './layout.js';

const marble = { tex: 'plaster', tint: 0xfff1df };
const gold = { tex: 'paint', tint: 0xd4a017 };
const lapis = { tex: 'paint', tint: 0x253c78 };
const glow = { ...gold, emissive: 1 };

class SceneryBatch extends BoxBatch {
  box(x, y, z, w, h, d, look, options) {
    super.box(x, y, z, w, h, d, look, { ...options, shadow: false });
  }
}

function buildIsland(grid) {
  const cloudTint = new THREE.Color(0xfff9f3).multiplyScalar(1.85);
  grid.define('cloud', { tex: { all: 'cloud' }, tint: cloudTint, map: '#f4f1ee', merge: true });
  // The voxel mesher normally omits undersides concealed by the sea.
  grid.emptyBelow = () => false;
  const { x0, x1, z0, z1 } = CORE_ISLAND;
  // Broad shoulders, clipped corners and a narrowing underside.
  for (const [y, depth, inset, corner] of [[-2, 2, 0, 6], [-4, 2, 2, 7], [-6, 2, 5, 7],
    [-8, 2, 9, 6], [-10, 2, 14, 5], [-11, 1, 20, 3]]) {
    for (let z = z0 + inset; z < z1 - inset; z++) {
      const clip = Math.max(0, corner - Math.min(z - z0 - inset, z1 - inset - 1 - z));
      grid.fill(x0 + inset + clip, y, z, x1 - inset - clip, y + depth, z + 1, 'cloud');
      if (y === -2) {
        grid.set(x0 + clip, 0, z, 'cloud');
        if (z < DANCE_BRIDGE.z0 || z >= DANCE_BRIDGE.z1) grid.set(x1 - clip - 1, 0, z, 'cloud');
      }
    }
  }
  grid.fill(x0 + 6, 0, z0, x1 - 6, 1, z0 + 1, 'cloud');
  grid.fill(x0 + 6, 0, z1 - 1, x1 - 6, 1, z1, 'cloud');
}

function buildPlinth(grid, batch) {
  grid.define('marble', { tex: { all: 'plaster' }, tint: marble.tint, map: '#e8d8bd', merge: true });
  grid.fill(-14, 0, -23, 14, 1, STAIRS.z0, 'marble');
  batch.box(0, 0.78, STAIRS.z0 - 0.06, 28, 0.12, 0.18, gold);
  const width = STAIRS.x1 - STAIRS.x0;
  for (let i = 0; i < STAIRS.count; i++) {
    const z = STAIRS.z0 + (i + 0.5) * STAIRS.tread;
    const height = (STAIRS.count - i) / STAIRS.count;
    batch.box(0, 0, z, width, height, STAIRS.tread, marble);
    batch.box(0, height - 0.041, z + 0.233, width, 0.045, 0.04, gold);
  }
  batch.box(0, 0, 16, 5, 0.025, 8, marble);
  for (const x of [-2.5, 2.5]) batch.box(x, 0, 16, 0.08, 0.035, 8, gold);
}

function pillar(batch, obstacles, x, y, z, height, width = 0.8) {
  batch.box(x, y, z, width + 0.32, 0.19, width + 0.32, marble);
  batch.box(x, y + 0.19, z, width, height - 0.49, width, marble);
  batch.box(x, y + height - 0.3, z, width + 0.42, 0.3, width + 0.42, gold);
  const radius = width / 2 + 0.21;
  obstacles.push({ x0: x - radius, x1: x + radius, z0: z - radius, z1: z + radius, level: 0 });
}

function arch(batch, x, y, z, radius, depth, turn = 0) {
  const segments = 9;
  const length = 2 * radius * Math.tan(Math.PI / (segments * 2));
  batch.at(x, y, z, turn, () => {
    for (let i = 0; i < segments; i++) {
      const angle = (i + 0.5) * Math.PI / segments;
      batch.box(radius * Math.cos(angle), radius * Math.sin(angle) - 0.16, 0,
        length, 0.32, depth, gold, { rz: angle - Math.PI / 2 });
    }
  });
}

function buildShell(grid, batches, obstacles) {
  const { static: batch, roof } = batches;
  const gateZ = 13;
  for (const x of [-2.55, 2.55]) pillar(batch, obstacles, x, 0, gateZ, 4.7, 1.2);
  arch(batch, 0, 2.55, gateZ, 2.2, 0.55);
  batch.box(0, 4.65, gateZ, 6.7, 0.2, 1.7, gold);
  for (let i = 0; i < 5; i++) {
    const y = 4.85 + i * 0.59, width = 7.25 - i * 1.15;
    batch.box(0, y, gateZ, width - 0.22, 0.47, 1.78 - i * 0.19, marble);
    batch.box(0, y + 0.47, gateZ, width, 0.12, 1.99 - i * 0.19, gold);
    for (const x of [-1, 0, 1]) batch.box(x * width / 4, y + 0.11, gateZ + (1.78 - i * 0.19) / 2, 0.27, 0.26, 0.05, lapis);
  }
  finial(batch, 0, 7.8, gateZ);

  const { x0, x1, z0, z1, height } = HOUSE;
  grid.fill(x0, 1, z0, x1, 8, z0 + 1, 'marble');
  grid.fill(x0, 8, z0, x1, height, z0 + 1, 'marble');
  grid.fill(x0, height, z0, x1, height + 1, z1, 'marble', 'roof');
  for (const x of [-11, -7, -3, 3, 7, 11]) pillar(batch, obstacles, x, 1, z1, 6.8);
  for (const x of [-9, -5, 0, 5, 9]) arch(batch, x, 4.85, z1, x === 0 ? 2.65 : 1.68, 0.55);
  for (const x of [-11, 11]) {
    for (const z of [-19, -15, -11, -7]) pillar(batch, obstacles, x, 1, z, 6.8);
    for (const z of [-17, -13, -9, -5]) arch(batch, x, 5.25, z, 1.68, 0.55, Math.PI / 2);
    batch.box(x, 7.8, -11, 0.8, 0.58, 17, marble);
    batch.box(x, 8.38, -12, 1.1, 0.22, 18, gold);
    roof.box(x, 8.6, -12, 0.85, 2.42, 18, marble);
  }
  batch.box(0, 7.8, z1, 23.4, 0.58, 0.9, marble);
  batch.box(0, 8.38, z1, 24, 0.22, 1.15, gold);
  roof.box(0, 8.6, z1, 24, 2.42, 0.85, marble);
  roof.box(0, height + 0.84, -12, 24.5, 0.22, 18.5, gold);

  const profile = [[0, 0], [0.99, 0], [0.99, 0.25], [1, 0.38], [0.85, 0.6],
    [0.59, 0.8], [0.28, 0.95], [0, 1]].map(([r, y]) => new THREE.Vector2(r, y));
  const domes = new THREE.InstancedMesh(new THREE.LatheGeometry(profile, 12),
    new THREE.MeshStandardMaterial({ color: gold.tint, roughness: 0.55, flatShading: true }), 3);
  const transform = new THREE.Matrix4();
  [-8, 0, 8].forEach((x, index) => {
    const radius = x === 0 ? 4.8 : 2.6, rise = x === 0 ? 3.7 : 2.2;
    roof.box(x, 12, -12, radius * 1.65, 0.3, radius * 1.65, marble);
    domes.setMatrixAt(index, transform.makeScale(radius, rise, radius).setPosition(x, 12.3, -12));
    finial(roof, x, 12.3 + rise, -12);
  });
  domes.userData.group = 'roof';
  return domes;
}

function finial(batch, x, y, z) {
  batch.box(x, y, z, 0.34, 0.14, 0.34, gold);
  batch.box(x, y + 0.14, z, 0.43, 0.32, 0.43, glow, { ry: Math.PI / 4 });
  batch.box(x, y + 0.46, z, 0.15, 0.26, 0.15, gold);
}

function buildInterior(batch, obstacles) {
  for (const x of [-6.5, 6.5]) {
    for (const z of [-6, -10, -14, -18]) pillar(batch, obstacles, x, 1, z, 10, 0.72);
    batch.box(x, 10.65, -12, 1.06, 0.35, 15, gold);
  }

  for (const side of [-1, 1]) {
    for (const z of [-6.5, -11, -15.5]) {
      for (let row = 0; row < 3; row++) {
        const x = side * (7.6 + 0.9 * row);
        const y = 1 + 0.45 * row;
        batch.box(x, 1, z, 0.9, y - 0.55, 3.5, marble);
        batch.box(x, y + 0.45, z, 0.86, 0.065, 3.4, lapis);
        batch.box(x + 0.37 * side, y + 0.51, z, 0.13, 0.53, 3.4, gold);
      }
      const x = side * 8.5;
      obstacles.push({ x0: x - 1.4, x1: x + 1.4, z0: z - 1.8, z1: z + 1.8, level: 0 });
    }
  }

  const width = DAIS.x1 - DAIS.x0;
  for (let i = 1; i <= 3; i++) {
    const end = DAIS.z1 - (i - 1) * 0.5;
    const depth = i === 3 ? end - DAIS.z0 : 0.5;
    const y = 1 + i * DAIS_STEP;
    batch.box(0, 1, end - depth / 2, width, i * DAIS_STEP, depth, marble);
    batch.box(0, y - 0.041, end - 0.028, width, 0.045, 0.06, gold);
  }
  // Access to the dais is through its front steps.
  for (const x of [-3, 3]) obstacles.push({ x0: x - 0.12, x1: x + 0.12,
    z0: DAIS.z0, z1: DAIS.z1 - 1, level: 0 });

  const y = 1 + 3 * DAIS_STEP, z = -18.1;
  batch.box(0, y, z, 2.2, 0.17, 1.6, gold);
  batch.box(0, y + 0.17, z, 1.88, 0.34, 1.22, gold);
  batch.box(0, y + 0.51, z + 0.1, 1.48, 0.13, 0.91, lapis);
  batch.box(0, y + 0.5, z - 0.55, 1.94, 2.07, 0.27, gold);
  batch.box(0, y + 0.76, z - 0.4, 1.42, 1.47, 0.09, lapis);
  batch.box(0, y + 2.57, z - 0.55, 1.25, 0.22, 0.3, glow);
  for (const x of [-0.87, 0.87]) batch.box(x, y + 0.47, z + 0.1, 0.22, 0.48, 1.05, gold);
  obstacles.push({ x0: -1.15, x1: 1.15, z0: z - 0.85, z1: z + 0.85, level: 0 });
}

function buildCourtyard(batch, obstacles) {
  batch.box(0, 0, 7, 18, 0.035, 8, marble);
  const z = 7;
  batch.box(0, 0.035, z, 6.8, 0.23, 4.2, marble);
  batch.box(0, 0.264, z, 6.06, 0.027, 3.45, lapis);
  for (const x of [-3.2, 3.2]) batch.box(x, 0.22, z, 0.36, 0.16, 4.22, gold);
  for (const edge of [z - 1.92, z + 1.92]) batch.box(0, 0.22, edge, 6.05, 0.16, 0.36, gold);
  obstacles.push({ x0: -3.45, x1: 3.45, z0: 4.85, z1: 9.15, level: 0 });

  for (const [x, dz] of [[-1.9, -0.7], [-0.6, 0.65], [0.7, -0.44], [2, 0.6]]) {
    batch.box(x, 0.291, z + dz, 0.48, 0.04, 0.48, gold, { ry: Math.PI / 4 });
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      batch.at(x, 0.35, z + dz, angle, () =>
        batch.box(0, 0, 0.17, 0.13, 0.08, 0.24, marble, { rx: -0.42 }));
    }
    batch.box(x, 0.36, z + dz, 0.12, 0.12, 0.12, glow);
  }
}

function buildLighting(batch) {
  const bakes = [];
  for (const [x, y, z] of [[-2.55, 2.2, 13.78], [2.55, 2.2, 13.78],
    [-6, 3.15, -6], [6, 3.15, -6], [-6, 3.15, -14], [6, 3.15, -14]]) {
    batch.box(x, y, z, 0.3, 0.09, 0.3, gold);
    batch.box(x, y + 0.09, z, 0.21, 0.36, 0.21, glow);
    batch.box(x, y + 0.45, z, 0.3, 0.09, 0.3, gold);
    bakes.push({ id: 'lamp-' + bakes.length, position: [x, y + 0.24, z + 0.2], power: 1.9, radius: 5, direction: null });
  }
  bakes.push({ id: 'throne-glow', position: [0, 4.05, -17.1], power: 2.8, radius: 7, direction: [0, -1, 0] });
  return bakes;
}

export function build({ grid, layer }) {
  buildIsland(grid);
  const batches = { static: new SceneryBatch(layer), roof: new SceneryBatch(layer) };
  buildPlinth(grid, batches.static);
  const obstacles = [];
  const domes = buildShell(grid, batches, obstacles);
  buildInterior(batches.static, obstacles);
  buildCourtyard(batches.static, obstacles);
  const bakes = buildLighting(batches.static);
  const mandapam = new SceneryBatch(layer);
  const hallDomes = buildDanceHall(grid, mandapam, obstacles, bakes);
  batches.mandapam = mandapam;
  batches.nandana = new SceneryBatch(layer);
  batches.nandanaPlants = new SceneryBatch(layer);
  batches.nandanaWater = new SceneryBatch(layer);
  batches.nandanaClouds = new SceneryBatch(layer);
  buildNandana(grid, batches.nandana, batches.nandanaPlants, batches.nandanaWater, obstacles, bakes);
  buildNandanaClouds(batches.nandanaClouds);
  const hotspots = STATIONS.map(({ id, floor, look: [x, z] }) => ({
    id,
    box: new THREE.Box3(new THREE.Vector3(x - 0.85, floor + 0.06, z - 0.55),
      new THREE.Vector3(x + 0.85, floor + 2.6, z + 0.55)),
  }));
  return { batches, obstacles, planes: [domes, hallDomes], bakes, hotspots };
}

// The shared engine creates sea meshes for every world. Detach them before
// the first render, and opt the voxel shell out of the sun's shadow pass.
export function setup({ stage, world, player, rig }) {
  stage.scene.remove(world.coast.sea, stage.scene.getObjectByName('open-sea'));
  for (const group of Object.values(world.groups)) {
    group.traverse(object => { if (object.isMesh) object.castShadow = false; });
  }
  // The standard cutaway keeps an overhead ceiling when the camera is also
  // indoors. Keep the sabha open for the entire visit, including first person.
  const setHidden = world.setHidden;
  world.setHidden = (name, hide) => {
    if (name === 'roof') {
      const { x, z } = player.pos;
      hide = !rig.introActive && player.y < HOUSE.height - 0.5 &&
        x >= HOUSE.x0 && x < HOUSE.x1 && z >= HOUSE.z0 && z < HOUSE.z1;
    }
    setHidden(name, hide);
  };
  const updateAiravata = setupAiravata({ stage, world });
  const updateDance = setupDance({ stage, world });
  const updateWildlife = setupNandanaAnimals({ stage, world });
  const updateClouds = setupNandanaClouds(stage, world.groups.nandanaClouds);
  return {
    update(dt) {
      updateAiravata(dt);
      updateDance(dt);
      updateWildlife(dt);
      updateClouds(dt);
    },
  };
}
