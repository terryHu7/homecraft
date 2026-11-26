import * as THREE from 'three';
import { BoxBatch } from '@engine/world/blocks.js';
import { attachBatch, createPivot } from './actor-rig.js';
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
  function part(parent, design, x = 0, y = 0, z = 0) {
    const batch = new BoxBatch(world.tiles.layer);
    design((x, y, z, w, h, d, look, angles) => {
      batch.box(x, y, z, w, h, d, look, { ...angles, shadow: false });
    });
    const pivot = createPivot(parent, x, y, z);
    attachBatch(pivot, batch, world.materials);
    return pivot;
  }
  function swan() {
    const body = new THREE.Group();
    root.add(body);
    part(body, box => {
      box(0, -.13, 0, .55, .31, 1.02, white);
      box(0, .03, -.41, .4, .25, .5, white, { rx: .22 });

    });
    const wings = [-1, 1].map(side => part(body, box => {
      box(side * .12, 0, -.1, .25, .14, .72, wing);
    }, side * .19, .12, 0));
    const neck = part(body, box => {
      box(0, 0, .035, .176, .43, .19, white, { rx: -.27 });
      box(0, .35, .1, .17, .23, .18, white, { rx: .35 });
    }, 0, .06, .36);
    const head = part(neck, box => {
      box(0, .06, .036, .21, .16, .25, white);
      box(0, .07, .213, .14, .075, .14, orange);
      for (const side of [-1, 1]) box(side * .108, .151, .087, .023, .031, .028, eye);
    }, 0, .54, .14);
    return { body, neck, head, wings };
  }
  function peacock(x, z, heading) {
    const body = new THREE.Group();
    body.position.set(x, 0, z);
    body.rotation.y = heading;
    root.add(body);
    part(body, box => {
      box(0, .31, 0, .43, .48, .67, teal);
    });
    const legs = [-1, 1].map(side => part(body, box => box(0, -.32, .02, .063, .33, .07, gold), side * .12, .33, 0));
    const tail = part(body, box => {
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
    return { body, head, tail, legs, x, z, heading };
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
      const actor = swans[i], phase = clock * (i ? .133 : .17) + i * 2.12;
      const x = LAKE.x + (i ? 6.1 : -6.1) + (2.15 + i * .32) * Math.sin(phase) + .46 * Math.sin(phase * 2);
      const z = LAKE.z + 5.1 * Math.cos(phase);
      sphere.center.set(x, .15, z);
      actor.body.visible = frustum.intersectsSphere(sphere);
      if (!actor.body.visible) continue;
      actor.body.position.set(x, -.27 + .032 * Math.sin(phase * 7), z);
      actor.body.rotation.y = Math.atan2((2.15 + i * .32) * Math.cos(phase) + .92 * Math.cos(phase * 2), -5.1 * Math.sin(phase));
      const preen = resting ? 0 : Math.max(0, Math.cos(phase * 2 + i) - .83) / .17;
      actor.neck.rotation.set(.16 * preen, .85 * preen, .19 * preen);
      actor.head.rotation.x = .055 * Math.sin(phase * 5) + .48 * preen;
      for (let j = 0; j < 2; j++) actor.wings[j].rotation.z = (j ? 1 : -1) * (.06 + .07 * Math.sin(phase * 6));
    }
    for (let i = 0; i < peacocks.length; i++) {
      const actor = peacocks[i];
      const pace = clock * (.58 - .08 * i) + i;
      actor.body.position.set(actor.x + 1.15 * Math.sin(pace), 0, actor.z + .75 * Math.cos(pace));
      sphere.center.copy(actor.body.position);
      sphere.center.y += .85;
      actor.body.visible = frustum.intersectsSphere(sphere);
      if (!actor.body.visible) continue;
      const display = resting ? 0 : Math.max(0, Math.cos(pace * .5) - .24) / .76;
      actor.body.rotation.y = resting ? actor.heading : Math.atan2(1.15 * Math.cos(pace), -.75 * Math.sin(pace));
      actor.body.position.y = resting ? 0 : .018 * Math.sin(clock * 11);
      actor.tail.rotation.x = -.8 * (1 - display);
      actor.tail.scale.x = .28 + .72 * display;
      actor.head.rotation.y = resting ? 0 : .21 * Math.sin(clock * .89 + i);
      actor.head.rotation.x = resting ? 0 : .09 * Math.sin(clock * 5);
      for (let j = 0; j < 2; j++) actor.legs[j].rotation.x = resting ? 0 : (j ? 1 : -1) * .36 * Math.sin(clock * 5.5);
    }
  }
  update(0);
  return update;
}
