import * as THREE from 'three';
import { TREE } from './nandana-layout.js';

const paint = tint => ({ tex: 'paint', tint });
const bark = { tex: 'wood_panel', tint: 0xa4774f };
const green = [0x437451, 0x60995e, 0x77ac68, 0x93b85e].map(tint => ({
  tex: 'leaves', tint: new THREE.Color(tint).multiplyScalar(2.2),
}));
const petals = [0xffe9cc, 0xef99b8, 0xb98ad5, 0xe9c45d].map(paint);
const stone = { tex: 'plaster', tint: 0xffeacb };
const gild = paint(0xcba33d);
const gleam = { ...gild, emissive: 1 };

function limb(batch, from, to, width) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const axis = b.clone().sub(a);
  const height = axis.length();
  const rot = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), axis.normalize()));
  a.lerp(b, .5);
  batch.box(a.x, a.y - height / 2, a.z, width, height, width * .83, bark, { rx: rot.x, ry: rot.y, rz: rot.z });
}

function crown(batch, x, y, z, size, bloom, phase) {
  batch.box(x, y, z, size, size * .34, size * .86, green[phase % 4], { ry: phase * .47 });
  for (let i = 0; i < 6; i++) {
    const a = phase + i * Math.PI / 3;
    const cx = x + Math.cos(a) * size * .41, cz = z + Math.sin(a) * size * .38;
    const base = y + (i % 3 - 1) * size * .11;
    batch.box(cx, base, cz, size * .49, size * .31, size * .46, green[(phase + i + 1) % 4], { ry: a });
    batch.box(cx, base + size * (.12 + .04 * (i % 2)), cz, size * .4, size * .22, size * .39, petals[bloom], { ry: a + .3 });
    if (size > 5) batch.box(cx, base - .28, cz, .14, .38, .14, gleam);
  }
  batch.box(x - size * .09, y + size * .27, z + size * .11, size * .57, size * .22, size * .52, green[2], { ry: .52 });
}

function block(obstacles, x, z, r) {
  obstacles.push({ x0: x - r, x1: x + r, z0: z - r, z1: z + r, level: 0 });
}

export function buildNandanaTrees(plants, masonry, obstacles, bakes) {
  const { x, z } = TREE;
  for (let i = 0; i < 16; i++) masonry.at(x, .025, z, i * Math.PI / 8, () => {
    masonry.box(0, 0, 4.9, 2.16, .16, 3, stone);
    masonry.box(0, .163, 6.3, 2.43, .027, .16, gild);
    masonry.box(0, .163, 5.67, .59, .03, .59, gild, { ry: Math.PI / 4 });
    if (i % 2 === 0) {
      masonry.box(0, .18, 5.5, .38, .09, .38, petals[0]);
      masonry.box(0, .23, 5.5, .18, .13, .18, petals[1]);
    }
  });
  plants.box(x, .02, z, 3.5, 7.8, 3.12, bark);
  limb(plants, [x, 6, z], [x + .8, 14.6, z - .7], 2.65);
  limb(plants, [x + .8, 12.6, z - .7], [x + .35, 21.5, z - 1], 1.65);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + .18;
    const dx = Math.cos(a), dz = Math.sin(a), length = 7.2 + i % 3;
    limb(plants, [x + dx, 1.8, z + dz], [x + dx * 4.9, .15, z + dz * 4.9], .83);
    const h = 8.4 + (i % 3) * 2.2, tx = x + length * dx, tz = z + length * dz;
    limb(plants, [x, h - 2.7, z], [x + dx * 4.5, h + .2, z + dz * 4.5], 1.25);
    limb(plants, [x + dx * 4.1, h, z + dz * 4.1], [tx, h + 4.3, tz], .83);
    crown(plants, tx, h + 3.7, tz, 6.7 + i % 3, i % 2 === 0 ? 3 : 0, i);
  }
  crown(plants, x + .25, 20.1, z - 1, 9.5, 3, 2);
  block(obstacles, x, z, 2.2);
  for (const dx of [-2.8, 2.8]) {
    masonry.box(x + dx, .15, z - 2.8, .25, .6, .25, gild);
    masonry.box(x + dx, .75, z - 2.8, .27, .22, .27, gleam);
    bakes.push({ id: 'kalpa-lamp-' + dx, position: [x + dx, 1.15, z - 2.8], power: 1.8, radius: 7, direction: null });
  }

  const trees = [
    [-24, 40, 6.4, 1], [-11, 40, 5.8, 0], [5, 40, 7.2, 1], [29, 40, 5.5, 3],
    [-36, 43, 7.8, 2], [-34, 62, 5.5, 1], [-36, 83, 7.4, 0], [-24, 91, 5.5, 3],
    [-2, 65, 5.4, 1], [36, 53, 6.4, 0], [35, 78, 6, 3], [37, 89, 6.8, 1],
    [15, 89, 6.6, 0], [-11, 77, 5.6, 2], [-29, 80, 6.5, 0], [8, 87, 5.6, 1],
    [58, 72, 6.7, 0], [-56, 71, 7.4, 1], [-51, 93, 6.7, 2], [-54, 96, 4.6, 3],
  ];
  trees.forEach(([tx, tz, h, bloom], index) => {
    const bend = index % 2 ? -.65 : .75;
    limb(plants, [tx, 0, tz], [tx + bend, h, tz - .28], h * .083);
    limb(plants, [tx, h * .57, tz], [tx - bend * 2.8, h * .88, tz + 1], .3);
    crown(plants, tx + bend, h - 1, tz - .25, h * .68, bloom, index);
    crown(plants, tx - bend * 2.2, h * .77, tz + .8, h * .39, bloom, index + 1);
    block(obstacles, tx, tz, .46);
  });

  const beds = [[-20, 42], [-8, 43], [11, 43], [-32, 57], [-32, 77], [-22, 73], [1, 53],
    [9, 47], [32, 48], [34, 60], [32, 75], [18, 77], [11, 92], [-35, 88], [-5, 92], [61, 64], [-56, 75], [-55, 91]];
  beds.forEach(([bx, bz], i) => {
    for (let j = 0; j < 9; j++) {
      const a = j * 2.39996 + i, radius = .36 + j * .21;
      const fx = bx + Math.cos(a) * radius, fz = bz + Math.sin(a) * radius * .69;
      const tall = .24 + .1 * (j % 4);
      plants.box(fx, .015, fz, .23, tall, .21, green[(i + j) % 4], { ry: a });
      plants.box(fx, tall, fz, .24, .13, .22, petals[(i + j * 3) % 4], { ry: a + .4 });
    }
  });
}
