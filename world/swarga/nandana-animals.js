import * as THREE from 'three';
import { BoxBatch } from '@engine/world/blocks.js';
import { LAKE } from './nandana-layout.js';

const paint = tint => ({ tex: 'paint', tint });
const white = { tex: 'cloud', tint: new THREE.Color(0xfff7e4).multiplyScalar(1.5) };
const wing = paint(0xe9ded1);
const orange = paint(0xe5a549);
const eye = paint(0x322638);
const teal = paint(0x327e7f);
const blue = paint(0x365993);
const green = paint(0x448369);
const gold = paint(0xdaa83f);

export function setupNandanaAnimals({ stage, world }) {
  const root = new THREE.Group();
  root.name = 'Nandana wildlife';
  stage.scene.add(root);
  function part(parent, design) {
    const batch = new BoxBatch(world.tiles.layer);
    design((x, y, z, w, h, d, look, angles) => {
      batch.box(x, y, z, w, h, d, look, { ...angles, shadow: false });
    });
    const [mesh] = batch.build(world.materials);
    parent.add(mesh);
    return mesh;
  }
  function swan() {
    const body = new THREE.Group();
    root.add(body);
    part(body, box => {
      box(0, -.13, 0, .55, .31, 1.02, white);
      box(0, .03, -.41, .4, .25, .5, white, { rx: .22 });
      for (const side of [-1, 1]) box(side * .24, .1, -.12, .23, .14, .72, wing, { rz: side * .19 });
    });
    const head = part(body, box => {
      box(0, .06, .36, .176, .48, .19, white, { rx: -.27 });
      box(0, .47, .46, .17, .27, .18, white, { rx: .35 });
      box(0, .66, .536, .21, .16, .25, white);
      box(0, .67, .713, .14, .075, .14, orange);
      for (const side of [-1, 1]) box(side * .108, .751, .587, .023, .031, .028, eye);
    });
    head.matrixAutoUpdate = true;
    return { body, head };
  }
  function peacock(x, z, heading) {
    const body = new THREE.Group();
    body.position.set(x, 0, z);
    body.rotation.y = heading;
    root.add(body);
    part(body, box => {
      box(0, .31, 0, .43, .48, .67, teal);
      for (const side of [-1, 1]) box(side * .12, .01, .02, .063, .33, .07, gold);
      for (let i = -5; i <= 5; i++) {
        const a = i * .22, h = 1.37 + (5 - Math.abs(i)) * .09;
        const tx = -Math.sin(a) * h * .49, ty = .52 + Math.cos(a) * h * .49;
        box(tx, ty - h / 2, -.33, .23, h, .122, i % 2 ? green : teal, { rz: a });
        box(-Math.sin(a) * h * .82, .47 + Math.cos(a) * h * .81, -.262, .16, .21, .065, gold, { rz: a });
        box(-Math.sin(a) * h * .82, .52 + Math.cos(a) * h * .81, -.217, .086, .104, .045, blue, { rz: a });
      }
    });
    const head = part(body, box => {
      box(0, .61, .262, .19, .62, .207, blue, { rx: -.19 });
      box(0, 1.16, .38, .23, .22, .245, blue);
      box(0, 1.2, .54, .108, .077, .12, gold);
      for (const side of [-1, 1]) box(side * .118, 1.27, .44, .026, .032, .034, white);
      for (const dx of [-.06, 0, .06]) box(dx, 1.36, .35, .025, .17, .026, teal, { rz: -dx * 2 });
    });
    head.matrixAutoUpdate = true;
    return { body, head };
  }

  const swans = [swan(), swan()];
  const peacocks = [peacock(-21.8, 45.2, .57), peacock(-32.4, 57.8, -.5)];
  const frustum = new THREE.Frustum(), view = new THREE.Matrix4();
  const sphere = new THREE.Sphere(new THREE.Vector3(), 2);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let clock = 0;
  function update(dt) {
    const resting = reduced.matches;
    if (!resting) clock += Math.max(0, dt);
    const camera = stage.camera;
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (let i = 0; i < swans.length; i++) {
      const actor = swans[i], phase = clock * .17 + i * 2.12;
      const x = LAKE.x + (i ? 6.1 : -6.1) + 2.65 * Math.sin(phase);
      const z = LAKE.z + 5.1 * Math.cos(phase);
      sphere.center.set(x, .15, z);
      actor.body.visible = frustum.intersectsSphere(sphere);
      if (!actor.body.visible) continue;
      actor.body.position.set(x, -.27 + .032 * Math.sin(phase * 7), z);
      actor.body.rotation.y = Math.atan2(2.65 * Math.cos(phase), -5.1 * Math.sin(phase));
      actor.head.rotation.x = .05 * Math.sin(phase * 5);
    }
    for (let i = 0; i < peacocks.length; i++) {
      const actor = peacocks[i];
      sphere.center.copy(actor.body.position);
      sphere.center.y += .85;
      actor.body.visible = frustum.intersectsSphere(sphere);
      if (!actor.body.visible) continue;
      actor.head.rotation.y = resting ? 0 : .21 * Math.sin(clock * .89 + i);
    }
  }
  update(0);
  return update;
}
