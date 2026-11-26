import * as THREE from 'three';
import { GARDEN, CAUSEWAYS, LOOKOUT, LOOKOUT_STAIRS } from './nandana-layout.js';
import { buildNandanaWater } from './nandana-water.js';
import { buildNandanaTrees } from './nandana-trees.js';

const marble = { tex: 'plaster', tint: 0xfff2df };
const gold = { tex: 'paint', tint: 0xd4a72e };
const jade = { tex: 'paint', tint: 0x47836a };
const flame = { tex: 'paint', tint: 0xffcb62, emissive: 1 };
const vapor = { tex: 'cloud', tint: 0xffebcf };

function island(grid, { x0, x1, z0, z1 }, openings = [], corner = 7) {
  for (const [y, inset, depth] of [[-2, 0, 2], [-4, 2, 2], [-7, 5, 3], [-10, 9, 3]]) {
    if (x0 + inset * 2 >= x1 - 2 || z0 + inset * 2 >= z1 - 2) break;
    for (let z = z0 + inset; z < z1 - inset; z++) {
      const clip = Math.max(0, corner - inset - Math.min(z - z0 - inset, z1 - inset - 1 - z));
      const west = x0 + inset + clip, east = x1 - inset - clip;
      grid.fill(west, y, z, east, y + depth, z + 1, 'cloud', 'nandanaTerrain');
      if (inset) continue;
      grid.fill(west, -1, z, east, 0, z + 1, 'celestial_grass', 'nandanaTerrain');
      for (let x = west; x < east; x++) {
        const edge = z === z0 || z === z1 - 1 || x <= west + (clip > 0 ? 1 : 0) || x >= east - (clip > 0 ? 2 : 1);
        if (edge && !openings.some(o => x >= o.x0 && x < o.x1 && z >= o.z0 && z < o.z1)) {
          grid.set(x, 0, z, 'garden_rail', 'nandanaTerrain');
        }
      }
    }
  }
}

function bridge(grid, batch, x0, x1, z0, z1, northSouth) {
  grid.fill(x0, -2, z0, x1, 0, z1, 'marble', 'nandanaTerrain');
  const w = x1 - x0, d = z1 - z0, x = x0 + w / 2, z = z0 + d / 2;
  if (northSouth) {
    for (const edge of [x0, x1 - 1]) {
      grid.fill(edge, 0, z0, edge + 1, 1, z1, 'garden_rail', 'nandanaTerrain');
      batch.box(edge + .5, 1, z, .64, .08, d, gold);
    }
  } else {
    for (const edge of [z0, z1 - 1]) {
      grid.fill(x0, 0, edge, x1, 1, edge + 1, 'garden_rail', 'nandanaTerrain');
      batch.box(x, 1, edge + .5, w, .08, .64, gold);
    }
  }
  batch.box(x, .005, z, northSouth ? w - 2.18 : w - .18, .022, northSouth ? d - .18 : d - 2.18, marble);
  for (const offset of [-1, 1]) {
    if (northSouth) batch.box(x + offset * (w / 2 - 1.22), .027, z, .09, .018, d, gold);
    else batch.box(x, .027, z + offset * (d / 2 - 1.22), w, .018, .09, gold);
  }
}

function terrain(grid, batch) {
  grid.define('celestial_grass', { tex: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, map: '#74a66a', merge: true });
  grid.define('garden_rail', { tex: { all: 'plaster' }, tint: 0xffebc3, map: '#d5bd81', merge: true });
  const gates = CAUSEWAYS.map(x => ({ x0: x - 2, x1: x + 3, z0: 23, z1: 35 }));
  const east = { x0: 40, x1: 54, z0: 64, z1: 70 };
  const west = { x0: -54, x1: -40, z0: 68, z1: 74 };
  island(grid, GARDEN, [...gates, east, west]);
  island(grid, { x0: 49, x1: 64, z0: 60, z1: 77 }, [east], 3);
  island(grid, { x0: -62, x1: -48, z0: 63, z1: 79 }, [west], 3);
  island(grid, { x0: -59, x1: -45, z0: 87, z1: 102 }, [], 4);
  for (const gate of gates) {
    grid.fill(gate.x0 + 1, 0, 24, gate.x1 - 1, 1, 25, null);
    bridge(grid, batch, gate.x0, gate.x1, 24, 34, true);
  }
  bridge(grid, batch, east.x0, east.x1, east.z0, east.z1, false);
  bridge(grid, batch, west.x0, west.x1, west.z0, west.z1, false);
  for (const [x, z, w, d] of [[.5, 38, 43, 3.8], [-16.5, 43, 2.8, 16], [17.5, 42.5, 2.8, 13],
    [-27, 68, 3, 48], [37, 65, 2.8, 49], [3, 78, 62, 3], [-5, 49, 21, 2.8],
    [-6, 69, 43, 2.9], [4, 58, 2.8, 19], [-26, 71, 33, 2.8], [40, 67, 11, 2.8]]) {
    batch.box(x, .004, z, w, .023, d, marble);
    if (w > d) batch.box(x, .031, z - d / 2 + .2, w - .2, .018, .13, gold);
    else batch.box(x - w / 2 + .2, .031, z, .13, .018, d - .2, gold);
  }
}

function foot(obstacles, x, z, w, d) {
  obstacles.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, level: 0 });
}

function pavilion(batch, obstacles, bakes, x, z, kind, y = 0) {
  const w = kind === 'lotus' ? 10 : kind === 'view' ? 11 : 8;
  const d = kind === 'view' ? 6 : 8;
  const h = kind === 'view' ? 3.45 : 4.1;
  batch.box(x, y, z, w, .13, d, marble);
  batch.box(x, y + h, z, w + .5, .22, d + .5, marble);
  batch.box(x, y + h + .20, z, w + .85, .14, d + .85, gold);
  for (const dx of [-w / 2 + .75, w / 2 - .75]) {
    for (const dz of [-d / 2 + .75, d / 2 - .75]) {
      batch.box(x + dx, y + .13, z + dz, .71, .26, .71, marble);
      batch.box(x + dx, y + .39, z + dz, .48, h - .78, .48, kind === 'mandapam' ? gold : marble);
      batch.box(x + dx, y + h - .39, z + dz, .82, .41, .82, gold);
      foot(obstacles, x + dx, z + dz, .85, .85);
    }
  }
  if (kind === 'lotus') {
    for (let i = 0; i < 8; i++) batch.at(x, y + h, z, i * Math.PI / 4, () => {
      batch.box(0, .4, 2.25, 1.12, .34, 4.25, gold, { rx: -.35 });
      batch.box(0, .75, 1.18, .62, .32, 2.5, jade, { rx: -.42 });
    });
  } else if (kind === 'mandapam') {
    for (let i = 0; i < 5; i++) batch.box(x, y + h + .34 + i * .38, z, w - i * 1.38, .38, d - i * 1.38, i % 2 ? gold : marble);
    for (const dz of [-3.25, 3.25]) {
      for (let i = 0; i < 11; i++) {
        const a = (i + .5) * Math.PI / 11;
        batch.box(x + 2.75 * Math.cos(a), y + 1.38 + 2.7 * Math.sin(a), z + dz, .79, .24, .36, gold, { rz: a - Math.PI / 2 });
      }
    }
  } else {
    batch.box(x, y + h + .35, z, 1.6, 1, d + .2, jade);
    for (const side of [-1, 1]) batch.box(x + side * 2.7, y + h + .47, z, 5.65, .19, d + .5, jade, { rz: -side * .23 });
  }
  batch.box(x, y + h + (kind === 'mandapam' ? 2.16 : 1.34), z, .35, .45, .35, flame);
  for (const side of [-1, 1]) {
    const bx = x + side * (w / 2 - 1.3);
    batch.box(bx, y + .18, z, .65, .43, 2.4, marble);
    batch.box(bx + side * .44, y + .62, z, .1, .42, d - 1, gold);
    foot(obstacles, bx, z, .86, 2.5);
  }
  batch.box(x, y + h - .54, z, .18, .54, .18, gold);
  batch.box(x, y + h - .71, z, .5, .21, .5, flame, { ry: Math.PI / 4 });
  bakes.push({ id: 'nandana-' + kind, position: [x, y + h - .75, z], power: 2.8, radius: 8, direction: [0, -1, 0] });
}

export function buildNandana(grid, batch, plants, water, obstacles, bakes) {
  terrain(grid, batch);
  buildNandanaTrees(plants, batch, obstacles, bakes);
  buildNandanaWater(grid, water, batch, obstacles);
  pavilion(batch, obstacles, bakes, 20, 46, 'lotus');
  pavilion(batch, obstacles, bakes, -31, 52, 'mandapam');
  pavilion(batch, obstacles, bakes, 27, 87, 'view', LOOKOUT.height);
  batch.box(27, 0, 87.5, 14, LOOKOUT.height, 9, marble);
  const stairs = LOOKOUT_STAIRS;
  for (let i = 0; i < stairs.count; i++) {
    const y = LOOKOUT.height * (i + 1) / stairs.count;
    batch.box(27, 0, stairs.z0 + (i + .5) * stairs.tread, 6, y, stairs.tread, marble);
  }
  for (const x of [20.2, 33.8]) {
    batch.box(x, LOOKOUT.height, 87.5, .32, 1, 9, gold);
    foot(obstacles, x, 87.5, .49, 9);
  }
  batch.box(27, LOOKOUT.height, 91.8, 13.6, 1, .28, gold);
  foot(obstacles, 27, 91.8, 13.6, .44);
  for (const x of CAUSEWAYS) {
    for (const dx of [-2.3, 2.3]) {
      batch.box(x + dx, 0, 35.6, .65, 4.55, .65, marble);
      batch.box(x + dx, 4.55, 35.6, .95, .27, .91, gold);
      foot(obstacles, x + dx, 35.6, .76, .76);
    }
    batch.box(x, 4.66, 35.6, 5.45, .35, .73, gold);
    batch.box(x, 5.01, 35.6, 2.86, .29, .61, marble);
  }
}

export function buildNandanaClouds(batch) {
  for (const [x, y, z, size] of [[-43, -8, 37, 10], [37, -9, 37, 8], [47, -10, 53, 14],
    [48, -9, 83, 12], [-46, -11, 84, 9], [-24, -10, 100, 12], [8, -11, 103, 14]]) {
    batch.box(x, y, z, size, 1.55, size * .45, vapor);
    batch.box(x - size * .17, y + 1.51, z + .42, size * .64, .85, size * .37, vapor);
    batch.box(x + size * .3, y + .97, z - .8, size * .44, 1.12, size * .36, vapor);
  }
}

export function setupNandanaClouds(stage, group) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const view = new THREE.Matrix4(), frustum = new THREE.Frustum();
  const bounds = new THREE.Box3(new THREE.Vector3(-57, -12, 26), new THREE.Vector3(59, -5, 108));
  let phase = 0;
  return function update(dt) {
    if (!reduced.matches) phase += Math.max(0, dt) * .12;
    const camera = stage.camera;
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    group.visible = frustum.intersectsBox(bounds);
    if (group.visible) group.position.x = Math.sin(phase) * 3.2;
  };
}
