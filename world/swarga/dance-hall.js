import * as THREE from 'three';
import { DANCE_BRIDGE as BRIDGE, DANCE_FLOOR as FLOOR, DANCE_HALL as HALL,
  DANCE_STAIRS as STAIRS, MUSIC_PLATFORM as MUSIC, ISLAND } from './layout.js';

const marble = { tex: 'plaster', tint: 0xfff4e4 };
const pearl = { tex: 'cloud', tint: 0xffebce };
const gold = { tex: 'paint', tint: 0xd9a321 };
const lapis = { tex: 'paint', tint: 0x233e82 };
const flame = { tex: 'paint', tint: 0xffce72, emissive: 1 };
const shade = { tex: 'paint', tint: 0x526aa2 };
const lampDirection = [0, -1, 0];

function buildTerrace(grid) {
  for (const [y, inset, depth] of [[-2, 0, 2], [-4, 2, 2], [-6, 5, 2], [-8, 9, 2]]) {
    for (let z = -19 + inset; z < 23 - inset; z++) {
      const clip = Math.max(0, 3 - Math.min(z - (-19 + inset), 22 - inset - z));
      grid.fill(33 + inset + clip, y, z, ISLAND.x1 - inset - clip, y + depth, z + 1, 'cloud');
      if (inset) continue;
      const west = 33 + clip, east = ISLAND.x1 - clip;
      if (z < BRIDGE.z0 || z >= BRIDGE.z1) grid.set(west, 0, z, 'cloud');
      grid.set(east - 1, 0, z, 'cloud');
      if (z === -19 || z === 22) grid.fill(west, 0, z, east, 1, z + 1, 'cloud');
    }
  }
  grid.fill(BRIDGE.x0, -2, BRIDGE.z0, BRIDGE.x1, 0, BRIDGE.z1, 'marble');
  grid.fill(30, 0, BRIDGE.z0, BRIDGE.x1, 1, BRIDGE.z0 + 1, 'marble');
  grid.fill(30, 0, BRIDGE.z1 - 1, BRIDGE.x1 + 1, 1, BRIDGE.z1, 'marble');
}

function arch(batch, x, z, turn, span, spring, depth) {
  const segments = 13, r = span / 2;
  batch.at(x, spring, z, turn, () => {
    for (let i = 0; i < segments; i++) {
      const a = (i + 0.5) * Math.PI / segments;
      const width = 2 * r * Math.tan(Math.PI / (2 * segments)) + 0.045;
      const cx = r * Math.cos(a), cy = r * Math.sin(a), rz = a - Math.PI / 2;
      batch.box(cx, cy - 0.2, 0, width, 0.4, depth, gold, { rz });
      batch.box(cx, cy - 0.11, depth / 2 + 0.055, width, 0.19, 0.14, pearl, { rz });
      batch.box(cx, cy - 0.11, -depth / 2 - 0.055, width, 0.19, 0.14, pearl, { rz });
    }
  });
}

function lotus(batch, x, y, z, size, petal = gold) {
  batch.box(x, y, z, size * 0.3, size * 0.16, size * 0.3, flame, { ry: Math.PI / 4 });
  for (let i = 0; i < 8; i++) batch.at(x, y, z, i * Math.PI / 4, () => {
    batch.box(0, 0.055 * size, size * 0.31, size * 0.18, size * 0.11, size * 0.39, petal, { rx: -0.48 });
  });
}

function domeGroup(batch) {
  const profile = [[0, 0], [1, 0], [1, 0.21], [.92, .48], [.72, .72], [.39, .9], [.12, 1], [0, 1]];
  const geom = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 16);
  const material = new THREE.MeshStandardMaterial({ color: 0xd9a321, roughness: .6, flatShading: true });
  const domes = new THREE.InstancedMesh(geom, material, 5);
  domes.name = 'Mandapam domes';
  const matrix = new THREE.Matrix4();
  const plans = [[50, -1, 5.7, 4], [39, -8, 2.25, 2.18], [61, -8, 2.25, 2.18],
    [39, 8, 2.25, 2.18], [61, 8, 2.25, 2.18]];
  plans.forEach(([x, z, r, h], i) => {
    domes.setMatrixAt(i, matrix.makeScale(r, h, r).setPosition(x, 12.15, z));
    batch.box(x, 11.83, z, r * 1.85, .34, r * 1.85, marble);
    batch.box(x, 12.05, z, r * 1.9, .13, r * 1.9, gold);
    batch.box(x, 12.15 + h, z, .55, .16, .55, gold);
    batch.box(x, 12.31 + h, z, .4, .33, .4, gold, { ry: Math.PI / 4 });
    batch.box(x, 12.64 + h, z, .13, .28, .13, flame);
  });
  return domes;
}

export function buildDanceHall(grid, batch, obstacles, bakes) {
  buildTerrace(grid);
  grid.fill(HALL.x0, 0, HALL.z0, HALL.x1, 1, HALL.z1, 'marble');
  grid.fill(35, 11, -13, 65, 12, 13, 'marble', 'mandapamRoof');
  function foot(x, z, w, d) {
    obstacles.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, level: 0 });
  }
  function pillar(x, z, width) {
    batch.box(x, 1, z, width + .43, .25, width + .43, marble);
    batch.box(x, 1.25, z, width + .26, .19, width + .26, gold);
    batch.box(x, 1.44, z, width, 7.49, width, marble);
    batch.box(x, 8.93, z, width + .25, .32, width + .25, gold);
    batch.box(x, 9.25, z, width + .53, .43, width + .53, gold);
    for (const side of [-1, 1]) {
      batch.box(x + side * width * .5, 1.6, z, .08, 7.2, .17, pearl);
      batch.box(x, 1.6, z + side * width * .5, .17, 7.2, .08, pearl);
    }
    foot(x, z, width + .49, width + .49);
  }

  for (let i = 0; i < STAIRS.count; i++) {
    const y = 1 - i / STAIRS.count, z = STAIRS.z0 + (i + .5) * STAIRS.tread;
    batch.box(HALL.x, 0, z, STAIRS.x1 - STAIRS.x0, y, STAIRS.tread, marble);
    batch.box(HALL.x, y - .041, z + .235, STAIRS.x1 - STAIRS.x0, .045, .036, gold);
  }
  for (const x of [35.5, 41, 45, 55, 59, 64.5]) {
    pillar(x, 13, x === 45 || x === 55 ? 1.35 : .9);
    pillar(x, -13, .9);
  }

  for (const z of [-13, 13]) {
    for (const [x, span, spring] of [[38.25, 5.5, 6.65], [43, 4, 6.65], [50, 10, 4.55], [57, 4, 6.65], [61.75, 5.5, 6.65]]) {
      arch(batch, x, z, 0, span, spring, .83);
    }
    batch.box(50, 9.68, z, 30.2, 1.33, 1.22, marble);
    batch.box(50, 10.67, z, 30.6, .15, 1.32, gold);
    for (let x = 36; x <= 64; x += 1.4) {
      batch.box(x, 10.05, z === 13 ? 13.63 : -13.63, .39, .39, .1, gold, { rz: Math.PI / 4 });
    }
  }
  for (const x of [35.5, 64.5]) {
    for (const z of [-6.5, 0, 6.5]) pillar(x, z, .9);
    for (const z of [-9.75, -3.25, 3.25, 9.75]) arch(batch, x, z, Math.PI / 2, 6.5, 6.25, .77);
    batch.box(x, 9.68, 0, 1.14, 1.33, 26, marble);
    batch.box(x, 10.67, 0, 1.4, .15, 26, gold);
    // The side galleries stay walkable along the arches.
    const edge = x < HALL.x ? HALL.x0 + .12 : HALL.x1 - .12;
    batch.box(edge, 1, 0, .2, .23, 25, marble);
    batch.box(edge, 1.91, 0, .2, .12, 25, gold);
    for (let z = -12; z <= 12; z += 1.2) batch.box(edge, 1.2, z, .12, .72, .12, gold);
    foot(edge, 0, .31, 25);
  }
  for (const z of [-13, 13]) for (const x of [38, 62]) {
    batch.box(x, 1, z + Math.sign(z) * .62, 6, .19, .24, marble);
    batch.box(x, 1.92, z + Math.sign(z) * .62, 6, .11, .24, gold);
    for (let i = -2; i <= 2; i++) batch.box(x + i * 1.1, 1.18, z + Math.sign(z) * .62, .12, .74, .13, gold);
    foot(x, z + Math.sign(z) * .62, 6.1, .35);
  }
  batch.box(50, 11.79, 0, 31, .2, 27, gold);

  for (const area of [FLOOR, MUSIC]) {
    const w = area.x1 - area.x0, d = area.z1 - area.z0, z = (area.z0 + area.z1) / 2;
    batch.box(50, 1, z, w, area.y - 1, d, marble);
    for (const x of [area.x0 + .18, area.x1 - .18]) batch.box(x, area.y, z, .18, .012, d - .36, gold);
    for (const edge of [area.z0 + .18, area.z1 - .18]) batch.box(50, area.y, edge, w - .36, .012, .18, gold);
  }
  batch.box(50, FLOOR.y, 0, 18.5, .014, 10.5, lapis);
  batch.box(50, FLOOR.y + .016, 0, 6.2, .013, 6.2, gold, { ry: Math.PI / 4 });
  batch.box(50, FLOOR.y + .031, 0, 5.94, .013, 5.94, shade, { ry: Math.PI / 4 });
  for (let i = 0; i < 8; i++) batch.at(50, FLOOR.y + .046, 0, i * Math.PI / 4, () => {
    batch.box(0, 0, 1.33, .85, .012, 2, pearl, { ry: Math.PI / 4 });
  });
  for (const x of [42, 58]) for (const z of [-3.8, 3.8]) {
    batch.box(x, FLOOR.y + .018, z, 1.1, .012, 1.1, gold, { ry: Math.PI / 4 });
    batch.box(x, FLOOR.y + .032, z, .8, .012, .8, pearl, { ry: Math.PI / 4 });
  }

  for (const x of [38.5, 61.5]) {
    batch.box(x, 0, 18, 5, .32, 3.3, marble);
    batch.box(x, .32, 18, 4.6, .025, 2.9, lapis);
    for (const edge of [x - 2.37, x + 2.37]) batch.box(edge, .30, 18, .21, .17, 3.3, gold);
    for (const z of [16.46, 19.54]) batch.box(x, .30, z, 4.55, .17, .21, gold);
    for (const dx of [-1.15, 0, 1.15]) lotus(batch, x + dx, .36, 18 + dx * .42, .59, pearl);
    foot(x, 18, 5.13, 3.43);
  }

  for (const [x, z] of [[40, 9], [60, 9], [40, -8], [60, -8]]) {
    batch.box(x, 1, z, .66, .18, .66, marble);
    batch.box(x, 1.18, z, .22, .83, .22, gold);
    lotus(batch, x, 2.01, z, .78);
    foot(x, z, .78, .78);
    bakes.push({ id: 'mandapam-lamp-' + bakes.length, position: [x, 2.22, z], power: 1.6, radius: 5, direction: null });
  }
  for (const [x, z] of [[41, 2], [50, -1], [59, 2], [50, -10]]) {
    batch.box(x, 7.65, z, .13, 3.35, .13, gold);
    batch.box(x, 7.45, z, 1.35, .2, 1.35, gold, { ry: Math.PI / 4 });
    for (let i = 0; i < 8; i++) batch.at(x, 7.4, z, i * Math.PI / 4, () => {
      batch.box(0, 0, .82, .16, .15, .67, gold);
      batch.box(0, .11, 1.04, .27, .11, .27, gold);
      batch.box(0, .22, 1.04, .14, .24, .14, flame);
    });
    bakes.push({ id: 'mandapam-chandelier-' + bakes.length, position: [x, 7.05, z], power: 4.2, radius: 13, direction: lampDirection });
  }
  for (const x of [44, 50, 56]) {
    bakes.push({ id: 'mandapam-stage-' + x, position: [x, 4.15, 1], power: 1.35, radius: 6, direction: lampDirection });
  }
  for (const x of [37.8, 62.2]) for (const z of [-9.9, 9.9]) {
    batch.box(x, 1, z, .58, .62, .58, lapis, { ry: Math.PI / 4 });
    for (const dx of [-.24, 0, .24]) lotus(batch, x + dx, 1.62 + (.24 - Math.abs(dx)), z + dx, .3, pearl);
    foot(x, z, .8, .8);
  }
  return domeGroup(batch);
}
