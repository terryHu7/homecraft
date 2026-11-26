import { LAKE } from './nandana-layout.js';

const marble = { tex: 'plaster', tint: 0xffecd2 };
const gold = { tex: 'paint', tint: 0xd8ad45 };
const leaf = { tex: 'paint', tint: 0x62a56e };
const foam = { tex: 'cloud', tint: 0xeef8eb };
const fall = { tex: 'cloud', tint: 0xdfac56 };
const fallLight = { tex: 'cloud', tint: 0xffdf96, emissive: .35 };
const waterLooks = [0x498e97, 0x599f9b, 0x64ada1].map(tint => ({ tex: 'water', tint }));
const petals = [0xe68ab4, 0xfff4e1, 0xb08bdb].map(tint => ({ tex: 'paint', tint }));

function lotus(batch, x, z, size, style, y = -.27) {
  batch.box(x, y, z, size, .055, size * .86, leaf, { ry: x * .6 });
  const color = petals[style % 3];
  for (let i = 0; i < 5; i++) batch.at(x, y + .052, z, i * Math.PI * .4 + style, () => {
    batch.box(0, 0, size * .22, size * .2, size * .13, size * .43, color, { rx: -.37 });
  });
  batch.box(x, y + .13, z, size * .2, size * .16, size * .2, gold, { ry: .65 });
}

function pond(grid, batch, decor, x, z, rx, rz, bridge = false) {
  for (let dz = -rz; dz < rz; dz++) {
    const f = (dz + .5) / rz;
    const width = Math.floor(rx * Math.sqrt(1 - f * f) + .65 * Math.sin(dz * 1.38));
    if (width < 2) continue;
    const lo = x - width, hi = x + width, row = z + dz;
    grid.fill(lo, -1, row, hi, 0, row + 1, null, 'nandanaTerrain');
    grid.fill(lo, -2, row, hi, -1, row + 1, 'marble', 'nandanaTerrain');
    for (const edge of [lo - .18, hi + .18]) decor.box(edge, .014, row + .5, .44, .13, 1.03, marble);
    if (bridge) {
      batch.box((lo + x - 1.5) / 2, -.39, row + .5, x - 1.5 - lo, .1, 1, waterLooks[(dz + rz) % 3]);
      batch.box((hi + x + 1.5) / 2, -.39, row + .5, hi - x - 1.5, .1, 1, waterLooks[(dz + rz) % 3]);
    } else {
      batch.box(x, -.39, row + .5, width * 2, .1, 1, waterLooks[(dz + rz) % 3]);
    }
  }
}

function rail(batch, obstacles, x, z, d) {
  batch.box(x, .74, z, .13, .14, d, gold);
  for (let k = -d / 2 + .45; k < d / 2; k += 1.5) {
    batch.box(x, .02, z + k, .12, .75, .12, gold);
  }
  obstacles.push({ x0: x - .15, x1: x + .15, z0: z - d / 2, z1: z + d / 2, level: 0 });
}

function waterfall(grid, water, decor, x, z, height, width, tiers) {
  const lo = x - width / 2, hi = x + width / 2;
  grid.fill(lo - 2, 0, z, hi + 2, height, z + 5, 'marble', 'nandanaTerrain');
  grid.fill(lo - 3, 0, z + 1, lo - 2, height - 1, z + 5, 'celestial_grass', 'nandanaTerrain');
  grid.fill(hi + 2, 0, z + 1, hi + 3, height - 1, z + 5, 'celestial_grass', 'nandanaTerrain');
  water.box(x, height + .05, z + 2.4, width - .35, .11, 4.32, waterLooks[1]);
  for (let i = 0; i < tiers; i++) {
    const zFace = z - .84 * i, base = height * (tiers - i - 1) / tiers;
    const top = height * (tiers - i) / tiers + .09;
    const w = width - i * .65;
    if (i) decor.box(x, 0, zFace, w + .48, base + .075, 1.8, marble);
    water.box(x, base - .26, zFace - .23, w, top - base + .24, .47, fall);
    water.box(x, top - .055, zFace + .58, w, .12, 1.56, waterLooks[1]);
    for (let j = 0; j < 7; j++) {
      const dx = (j + .5) / 7 * w - w / 2;
      const streak = (top - base) * (.52 + .22 * ((j + i) % 3));
      water.box(x + dx, top - streak, zFace - .485, .07 + .033 * (j % 3), streak, .065, j % 2 ? fallLight : foam);
      water.box(x + dx, base - .23, zFace - .54, .32, .082, .68, foam, { ry: j * .31 });
    }
  }
  for (const side of [-1, 1]) {
    decor.box(x + side * (width * .5 + .42), height, z + .13, .53, .53, .53, gold);
    decor.box(x + side * (width * .5 + .42), height + .53, z + .13, .43, .42, .43, gold, { ry: .78 });
  }
}

export function buildNandanaWater(grid, water, decor, obstacles) {
  const { x, z, rx, rz } = LAKE;
  pond(grid, water, decor, x, z, rx, rz, true);
  grid.fill(x - 2, -1, z - rz - 1, x + 2, 0, z + rz + 1, 'marble', 'nandanaTerrain');
  decor.box(x, .018, z, 3.8, .085, 2 * rz + 2.6, marble);
  for (const side of [-1, 1]) rail(decor, obstacles, x + side * 1.73, z, 2 * rz - 2);
  for (const [dx, dz, size, style] of [[-9,-4,1.2,0],[-8,-5,.84,1],[-9.7,-2.8,.65,2],[-11,1,.83,2],[-8,6,1.23,1],
    [-5,7,1.14,0],[-5.6,8.4,.72,2],[-3,-6,.88,1],[4,-7,1.12,2],[5.2,-7.7,.76,1],[7.4,-6.4,1,0],
    [9,-3,1.17,1],[10,-1,.92,2],[8,3,1.28,0],[9,3.9,.72,1],[11,2.8,.65,0],[5.5,6,.93,2],[4.5,8,.68,1],
    [-5,1,.82,1],[-6.3,.4,.58,0],[4,1,.84,2]]) lotus(water, x + dx, z + dz, size, style);
  for (const [dx, dz] of [[-8,2.2],[8,-1.8]]) {
    decor.box(x + dx, -.46, z + dz, 2.7, .61, 1.65, marble, { ry: .31 });
    decor.box(x + dx, .13, z + dz, 1.95, .15, 1.26, leaf, { ry: .31 });
    lotus(decor, x + dx, z + dz, 1.04, dx < 0 ? 0 : 2, .28);
  }
  for (const edge of [z - rz - .6, z + rz + .6]) {
    for (let i = 0; i < 3; i++) decor.box(x + 4.8, -.2 + .085 * i, edge - .21 * i, 2.25, .085, .23, marble);
  }
  for (const [px, pz, r] of [[-3, 55, 3], [57, 64, 4], [-34, 70, 3], [-13, 85, 6], [5, 84, 6]]) {
    pond(grid, water, decor, px, pz, r, 4);
    lotus(water, px - 1, pz - 1, .95, 0);
    lotus(water, px + 1.4, pz + .6, .82, 2);
  }
  waterfall(grid, water, decor, -13, 88, 7, 8, 1);
  waterfall(grid, water, decor, 5, 88, 6, 6, 3);
}
