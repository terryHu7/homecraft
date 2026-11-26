import * as THREE from 'three';
import { BoxBatch } from '@engine/world/blocks.js';
import { AIRAVATA_PATH, AIRAVATA_TUSKS } from './layout.js';

const white = { tex: 'cloud', tint: new THREE.Color(0xfff9ee).multiplyScalar(1.8) };
const shade = { tex: 'cloud', tint: new THREE.Color(0xe0d8ce).multiplyScalar(1.65) };
const ivory = { tex: 'cloud', tint: new THREE.Color(0xffecd0).multiplyScalar(1.7) };
const eye = { tex: 'paint', tint: 0x292438 };
const lapis = { tex: 'paint', tint: 0x2b4387 };
const gold = { tex: 'paint', tint: 0xd4a017 };
const gleam = { ...gold, emissive: 1 };

function buildAiravata(layer, materials) {
  const root = new THREE.Group();
  root.name = 'Airavata';
  function part(parent, x, y, z, build) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    parent.add(pivot);
    const batch = new BoxBatch(layer);
    const box = (x, y, z, w, h, d, look = white, options) =>
      batch.box(x, y, z, w, h, d, look, { ...options, shadow: false });
    build(box);
    pivot.add(...batch.build(materials));
    return pivot;
  }

  const body = part(root, 0, 0, 0, box => {
    box(0, -0.95, 0, 2.65, 2.4, 5.35);
    box(0, -1.18, 0.12, 2.2, 0.35, 4.6, shade);
    box(0, 1.4, 0.13, 2.54, 0.3, 3.36);
    box(0, -0.67, -2.58, 2.26, 1.95, 0.78);
    box(0, -0.55, 2.43, 2.35, 1.94, 0.73);
    box(0, 1.7, -0.38, 2.6, 0.095, 2.85, lapis);
    for (const side of [-1, 1]) {
      box(side * 1.35, -0.38, -0.38, 0.1, 1.85, 2.86, lapis);
      box(side * 1.29, 1.43, -0.38, 0.13, 0.3, 2.86, lapis);
      box(side * 1.41, -0.4, -0.38, 0.04, 0.13, 2.88, gold);
      for (const z of [-1.76, 1]) box(side * 1.413, -0.27, z, 0.045, 1.73, 0.13, gold);
      box(side * 1.415, 0.5, -0.38, 0.05, 0.48, 0.48, gold, { rx: Math.PI / 4 });
      box(side * 1.45, 0.63, -0.38, 0.045, 0.22, 0.22, lapis, { rx: Math.PI / 4 });
    }
  });

  const head = part(body, 0, 0.45, 2.72, box => {
    box(0, -1.04, 0.57, 1.86, 2.08, 1.9);
    box(0, 0.96, 0.62, 1.52, 0.22, 1.46);
    box(0, -0.77, 1.49, 1.28, 1.3, 0.42);
    box(0, 0.07, 1.725, 0.87, 0.69, 0.09, gold);
    box(0, 0.29, 1.79, 0.23, 0.23, 0.065, gleam, { rz: Math.PI / 4 });
    for (const side of [-1, 1]) {
      box(side * 0.94, 0.02, 1.13, 0.06, 0.225, 0.26, shade);
      box(side * 0.975, 0.065, 1.175, 0.045, 0.125, 0.13, eye);
      for (let i = side === -1 ? 0 : 1; i < AIRAVATA_TUSKS; i += 2) {
        const lower = Math.floor(i / 2);
        const x = side * (0.79 - lower * 0.145), y = -0.5 - lower * 0.34;
        const z = 1.48 - lower * 0.05;
        const length = lower ? 0.68 : 1.02;
        box(x, y, z + length * 0.4, 0.19, 0.21, length, ivory, { rx: 0.12 });
        box(x + side * 0.025, y + 0.03, z + length * 0.99, 0.15, 0.15, 0.37, ivory, { rx: -0.23 });
        box(x + side * 0.025, y + 0.063, z + length * 0.99 + 0.2, 0.135, 0.13, 0.15, gold, { rx: -0.32 });
      }
    }
  });

  const trunk = part(head, 0, -0.33, 1.55, box => {
    box(0, -1.0, 0.14, 0.65, 1.08, 0.64, white, { rx: -0.13 });
    box(0, -1.77, 0.37, 0.47, 0.95, 0.49, white, { rx: -0.37 });
    box(0, -2.03, 0.79, 0.33, 0.41, 0.64, shade, { rx: -0.27 });
  });

  const ears = [-1, 1].map(side => part(head, side * 0.82, 0.5, -0.03, box => {
    box(side * 0.49, -1.38, 0.03, 1.05, 1.47, 0.34);
    box(side * 1.05, -1.12, 0.035, 0.39, 1.12, 0.31);
    box(side * 0.55, -1.18, 0.212, 0.83, 1.1, 0.04, shade);
    box(side * 0.52, -1.53, 0.02, 0.64, 0.18, 0.25);
  }));

  const legs = [];
  for (const z of [1.84, -1.93]) for (const side of [-1, 1]) {
    legs.push(part(body, side * 0.85, -0.53, z, box => {
      box(0, -1.16, 0, 0.85, 1.27, 0.95);
      box(0, -1.8, -0.23, 0.67, 0.83, 0.72, white, { rx: -0.23 });
      box(0, -1.7, -0.255, 0.73, 0.17, 0.78, gold, { rx: -0.23 });
      box(0, -1.94, -0.27, 0.74, 0.26, 0.79);
      for (const x of [-0.21, 0, 0.21]) box(x, -1.915, 0.133, 0.13, 0.125, 0.04, ivory);
    }));
  }

  const tail = part(body, 0, 0.6, -2.87, box => {
    box(0, -0.94, -0.24, 0.23, 1.05, 0.26, white, { rx: 0.44 });
    box(0, -1.4, -0.51, 0.18, 0.63, 0.18, shade, { rx: 0.36 });
    box(0, -1.58, -0.61, 0.28, 0.4, 0.25, shade, { rx: 0.36 });
  });

  return { root, body, head, trunk, ears, legs, tail };
}

export function setupAiravata({ stage, world }) {
  const { root, body, head, trunk, ears, legs, tail } = buildAiravata(world.tiles.layer, world.materials);
  const path = new THREE.CatmullRomCurve3(AIRAVATA_PATH.map(point => new THREE.Vector3(...point)), true);
  path.arcLengthDivisions = 512;
  const lapsPerSecond = 2.2 / path.getLength();
  const tau = 2 * Math.PI;
  const sample = new THREE.Vector3(), behind = new THREE.Vector3(), ahead = new THREE.Vector3();
  const view = new THREE.Matrix4(), frustum = new THREE.Frustum();
  const bounds = new THREE.Sphere(sample, 6.5);
  let phase = 0, time = 0;

  function update(dt, checkVisibility = true) {
    // The first RAF timestamp can precede the boot clock used for its delta.
    dt = Math.max(0, dt);
    phase = (phase + dt * lapsPerSecond) % 1;
    time += dt;
    // Ease by up to 8% around the mean speed, with no discontinuity at the seam.
    const along = phase + 0.08 * Math.sin(tau * phase) / tau;
    path.getPointAt(along, sample);
    sample.y += 0.38 * Math.sin(time * 0.76);
    const camera = stage.camera;
    if (checkVisibility && camera.position.distanceToSquared(sample) > 36 ** 2) {
      camera.updateMatrixWorld();
      view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(view);
      root.visible = frustum.intersectsSphere(bounds);
      if (!root.visible) return;
    } else root.visible = true;

    path.getPointAt((along + 0.995) % 1, behind);
    path.getPointAt((along + 0.005) % 1, ahead);
    const inX = sample.x - behind.x, inZ = sample.z - behind.z;
    const outX = ahead.x - sample.x, outZ = ahead.z - sample.z;
    const turn = Math.atan2(inZ * outX - inX * outZ, inX * outX + inZ * outZ);
    root.position.copy(sample);
    root.rotation.y = Math.atan2(inX + outX, inZ + outZ);
    body.rotation.z = THREE.MathUtils.clamp(-turn * 1.1, -0.17, 0.17);
    body.rotation.x = -Math.atan2(ahead.y - behind.y, Math.hypot(inX + outX, inZ + outZ));
    head.rotation.x = 0.045 * Math.sin(time * 0.76 - 0.45);
    trunk.rotation.set(0.13 * Math.sin(time * 0.82), 0.06 * Math.sin(time * 0.58), 0.16 * Math.sin(time * 0.68));
    ears[0].rotation.y = -0.27 - 0.19 * Math.sin(time * 0.92);
    ears[1].rotation.y = 0.27 + 0.19 * Math.sin(time * 0.92 + 0.6);
    for (let i = 0; i < legs.length; i++) {
      legs[i].rotation.x = (i < 2 ? 0.47 : 0.31) + 0.12 * Math.sin(time * 0.91 + i * 0.65);
    }
    tail.rotation.y = 0.25 * Math.sin(time * 0.77 - 0.9);
    tail.rotation.z = 0.12 * Math.sin(time * 0.77);
  }

  stage.scene.add(root);
  update(0, false);
  return update;
}
