import * as THREE from 'three';
import { BoxBatch } from '@engine/world/blocks.js';
import { attachBatch, createPivot } from './actor-rig.js';
import { AIRAVATA_PATH, AIRAVATA_TUSKS } from './layout.js';

const white = { tex: 'cloud', tint: new THREE.Color(0xfff9ee).multiplyScalar(1.8) };
const shade = { tex: 'cloud', tint: new THREE.Color(0xe0d8ce).multiplyScalar(1.65) };
const ivory = { tex: 'cloud', tint: new THREE.Color(0xffecd0).multiplyScalar(1.7) };
const eye = { tex: 'paint', tint: 0x292438 };
const lapis = { tex: 'paint', tint: 0x2b4387 };
const gold = { tex: 'paint', tint: 0xd4a017 };
const gleam = { ...gold, emissive: 1 };

const snow = new THREE.MeshLambertMaterial({ color: 0xfff0da });
const innerEar = new THREE.MeshLambertMaterial({ color: 0xdbac9e });
const tusk = new THREE.MeshLambertMaterial({ color: 0xffdfaa });
const sphere = new THREE.SphereGeometry(1, 16, 10);
function oval(parent, x, y, z, sx, sy, sz, material = snow) {
  const mesh = new THREE.Mesh(sphere, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}
function curve(parent, points, radius, material) {
  const path = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  parent.add(new THREE.Mesh(new THREE.TubeGeometry(path, 18, radius, 8, false), material));
}
function featheredWing(parent, side) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * 1, 1.15, .55);
  shoulder.name = side < 0 ? 'Airavata left wing' : 'Airavata right wing';
  parent.add(shoulder);
  oval(shoulder, side * 1.15, 0, -.28, 1.55, .31, .94);
  const feathers = new THREE.InstancedMesh(sphere, snow, 15);
  const plume = new THREE.Object3D();
  for (let i = 0; i < feathers.count; i++) {
    const progress = i / (feathers.count - 1);
    plume.position.set(side * (.45 + 3.45 * progress), .04 * progress, -.8 - .5 * progress);
    plume.rotation.y = -side * (.23 + progress * 1.03);
    plume.scale.set(.23 - .072 * progress, .08, .67 + .56 * progress);
    plume.updateMatrix();
    feathers.setMatrixAt(i, plume.matrix);
  }
  feathers.instanceMatrix.needsUpdate = true;
  shoulder.add(feathers);
  return shoulder;
}

function buildAiravata(layer, materials) {
  const root = new THREE.Group();
  root.name = 'Airavata';
  function part(parent, x, y, z, build) {
    const pivot = createPivot(parent, x, y, z);
    const batch = new BoxBatch(layer);
    const box = (x, y, z, w, h, d, look = white, options) =>
      batch.box(x, y, z, w, h, d, look, { ...options, shadow: false });
    build(box);
    attachBatch(pivot, batch, materials);
    return pivot;
  }

  const body = part(root, 0, 0, 0, box => {
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

  oval(body, 0, .29, 0, 1.38, 1.43, 2.96);
  const wings = [-1, 1].map(side => featheredWing(body, side));
  const head = part(body, 0, 0.45, 2.72, box => {
    box(0, 0.07, 1.725, 0.87, 0.69, 0.09, gold);
    box(0, 0.29, 1.79, 0.23, 0.23, 0.065, gleam, { rz: Math.PI / 4 });
    for (const side of [-1, 1]) {
      box(side * 0.94, 0.02, 1.13, 0.06, 0.225, 0.26, shade);
      box(side * 0.975, 0.065, 1.175, 0.045, 0.125, 0.13, eye);

    }
  });

  oval(head, 0, .14, .76, .96, 1.08, 1.04);
  for (const side of [-1, 1]) {
    oval(head, side * .53, -.38, 1.16, .48, .57, .6);
    for (let i = side === -1 ? 0 : 1; i < AIRAVATA_TUSKS; i += 2) {
      const lower = Math.floor(i / 2), x = side * (.75 - lower * .16), y = -.49 - lower * .31;
      const d = lower ? .82 : 1.21;
      curve(head, [[x,y,1.24],[x,y-.13,1.24+d*.46],[x+side*.04,y+.04,1.24+d*.85],
        [x+side*.07,y+.21,1.24+d]], lower ? .078 : .106, tusk);
    }
  }
  const trunk = new THREE.Group();
  trunk.position.set(0, -.29, 1.53);
  head.add(trunk);
  oval(trunk, 0, -.32, .02, .4, .57, .37);
  curve(trunk, [[0,-.14,.14],[0,-.83,.2],[0,-1.5,.39],[0,-1.81,.8],[0,-1.67,1.07]], .205, snow);
  const ears = [-1, 1].map(side => {
    const ear = new THREE.Group();
    ear.position.set(side * .72, .43, .12);
    head.add(ear);
    oval(ear, side * .52, -.53, .06, .75, .92, .19);
    oval(ear, side * .55, -.5, .185, .55, .73, .095, innerEar);
    return ear;
  });

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

  return { root, body, head, trunk, ears, legs, tail, wings };
}

export function setupAiravata({ stage, world }) {
  const { root, body, head, trunk, ears, legs, tail, wings } = buildAiravata(world.tiles.layer, world.materials);
  const path = new THREE.CatmullRomCurve3(AIRAVATA_PATH.map(point => new THREE.Vector3(...point)), true);
  path.arcLengthDivisions = 512;
  const lapsPerSecond = 2.2 / path.getLength();
  const tau = 2 * Math.PI;
  const sample = new THREE.Vector3(), behind = new THREE.Vector3(), ahead = new THREE.Vector3();
  const view = new THREE.Matrix4(), frustum = new THREE.Frustum();
  const bounds = new THREE.Sphere(sample, 8);
  let phase = 0, time = 0, wingPhase = 0;

  function update(dt, checkVisibility = true) {
    // The first RAF timestamp can precede the boot clock used for its delta.
    dt = Math.max(0, dt);
    phase = (phase + dt * lapsPerSecond) % 1;
    time += dt;
    const speedFactor = 1 + .08 * Math.cos(tau * phase);
    wingPhase += dt * (1.6 + speedFactor * 1.5);
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
    const stroke = Math.sin(wingPhase);
    for (let i = 0; i < wings.length; i++) {
      const side = i ? 1 : -1;
      wings[i].rotation.z = side * (.16 + .5 * stroke);
      wings[i].rotation.y = side * (.09 + .08 * Math.cos(wingPhase));
    }
    tail.rotation.y = 0.25 * Math.sin(time * 0.77 - 0.9);
    tail.rotation.z = 0.12 * Math.sin(time * 0.77);
  }

  stage.scene.add(root);
  update(0, false);
  return update;
}
