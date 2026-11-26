import * as THREE from 'three';
import { POOL } from './layout.js';

function buildLotuses({ x0, z0, water }) {
  const clusters = [
    [2.0, 4.2, 0.86], [3.6, 8.5, 1.08], [6.2, 9.1, 0.83],
    [10.1, 8.4, 1.12], [13.1, 9.2, 0.92], [14.0, 6.4, 1.05],
  ];
  const lotuses = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 4),
    new THREE.MeshStandardMaterial({ roughness: 0.78, flatShading: true }), clusters.length * 16);
  lotuses.name = 'Pink lotuses';
  const part = new THREE.Object3D(), tint = new THREE.Color();
  let index = 0;
  function place(x, y, z, sx, sy, sz, yaw, tilt, color) {
    part.position.set(x, y, z);
    part.scale.set(sx, sy, sz);
    part.rotation.set(tilt, yaw, 0, 'YXZ');
    part.updateMatrix();
    lotuses.setMatrixAt(index, part.matrix);
    lotuses.setColorAt(index++, tint.setHex(color));
  }

  for (const [dx, dz, size] of clusters) {
    const x = x0 + dx, z = z0 + dz;
    for (let leaf = 0; leaf < 3; leaf++) {
      const angle = leaf * Math.PI * 2 / 3 + dx;
      place(x + Math.sin(angle) * 0.47 * size, water + 0.025,
        z + Math.cos(angle) * 0.47 * size, 0.39 * size, 0.035, 0.51 * size,
        angle, 0.055, [0x426e3c, 0x628845, 0x507a47][leaf]);
    }
    for (let petal = 0; petal < 12; petal++) {
      const outer = petal < 8;
      const angle = petal * Math.PI * 2 / (outer ? 8 : 4) + (outer ? dx : dx + 0.4);
      const radius = (outer ? 0.22 : 0.12) * size;
      place(x + Math.sin(angle) * radius, water + (outer ? 0.15 : 0.23) * size,
        z + Math.cos(angle) * radius, 0.083 * size, 0.052 * size, 0.19 * size,
        angle, outer ? -0.46 : -0.82, outer ? 0xe889ac : 0xffbdd0);
    }
    place(x, water + 0.24 * size, z, 0.1 * size, 0.065 * size, 0.1 * size, 0, 0, 0xeec766);
  }
  return lotuses;
}

export function buildPond(grid) {
  const { x0, x1, z0, z1, bed } = POOL;
  grid.fill(x0, bed, z0, x1, 0, z1, null);
  grid.fill(x0, bed - 1, z0, x1, bed, z1, 'stone');

  const pond = new THREE.Group();
  pond.name = 'Laterite pond';
  const masonry = [];
  const colors = [0x9b4c32, 0x843d2b, 0xb66242, 0xa55439, 0x784530];
  function stone(x, y, z, width, height, depth, index) {
    masonry.push({ x, y, z, width, height, depth, color: colors[index % colors.length] });
  }
  function course(ax, az, bx, bz, y, height, depth, row) {
    const length = Math.abs(bx - ax) + Math.abs(bz - az);
    const count = Math.ceil(length / 0.68);
    const alongX = az === bz;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const size = length / count - 0.023;
      stone(THREE.MathUtils.lerp(ax, bx, t), y, THREE.MathUtils.lerp(az, bz, t),
        alongX ? size : depth, height - 0.014, alongX ? depth : size, i * 7 + row * 3);
    }
  }

  const stairWidth = 8, center = (x0 + x1) / 2;
  const stairLeft = center - stairWidth / 2, stairRight = center + stairWidth / 2;
  const tread = 0.47, rise = 0.275;
  for (let row = 0; row < 9; row++) {
    const y = bed + (row + 0.5) / 3;
    course(x0, z1 - 0.15, x1, z1 - 0.15, y, 1 / 3, 0.30, row);
    course(x0 + 0.15, z0, x0 + 0.15, z1 - 0.3, y, 1 / 3, 0.30, row + 1);
    course(x1 - 0.15, z0, x1 - 0.15, z1 - 0.3, y, 1 / 3, 0.30, row + 2);
    if (row < 8) course(x0, z0 + 0.15, x1, z0 + 0.15, y, 1 / 3, 0.30, row + 3);
    else {
      course(x0, z0 + 0.15, stairLeft, z0 + 0.15, y, 1 / 3, 0.30, row + 3);
      course(stairRight, z0 + 0.15, x1, z0 + 0.15, y, 1 / 3, 0.30, row + 3);
    }
  }
  course(x0 - 0.35, z1, x1 + 0.35, z1, 0.025, 0.17, 0.62, 10);
  course(x0 - 0.35, z0, stairLeft, z0, 0.025, 0.17, 0.62, 10);
  course(stairRight, z0, x1 + 0.35, z0, 0.025, 0.17, 0.62, 10);
  for (const x of [x0, x1]) course(x, z0 + 0.31, x, z1 - 0.31, 0.025, 0.17, 0.62, 11);

  // The house-facing ghat spans the middle of the north bank.
  for (let step = 0; step < 8; step++) {
    const y = -(step + 1) * rise;
    const z = z0 + step * tread;
    course(stairLeft, z + tread / 2, stairRight, z + tread / 2, (bed + y) / 2, y - bed, tread, step);
    course(stairLeft - 0.20, z, stairLeft - 0.20, z + tread, y + 0.095, 0.24, 0.38, step + 1);
    course(stairRight + 0.20, z, stairRight + 0.20, z + tread, y + 0.095, 0.24, 0.38, step + 2);
  }

  // A low landing joins the stairs to the lawn without blocking the main path.
  for (let row = 0; row < 3; row++) {
    course(stairLeft, z0 - 0.35 - row * 0.54, stairRight, z0 - 0.35 - row * 0.54, 0.01, 0.10, 0.52, row);
  }

  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({ roughness: 0.96 }), masonry.length);
  const matrix = new THREE.Matrix4(), tint = new THREE.Color();
  masonry.forEach(({ x, y, z, width, height, depth, color }, index) => {
    matrix.makeScale(width, height, depth).setPosition(x, y, z);
    blocks.setMatrixAt(index, matrix);
    blocks.setColorAt(index, tint.setHex(color));
  });
  blocks.castShadow = blocks.receiveShadow = true;
  pond.add(blocks, buildLotuses(POOL));
  return pond;
}
