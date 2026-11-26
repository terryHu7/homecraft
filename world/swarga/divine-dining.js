import * as THREE from 'three';
import { BoxBatch } from '@engine/world/blocks.js';
import { attachBatch, createPivot } from './actor-rig.js';
import { buildPerformer } from './apsaras.js';
import { gait, reachPalm, turnActor, walkActivity } from './npc-activity.js';

const prep = { x: 0, y: 1.84, z: -11 };
const table = { x: 0, y: 2.35, z: -16.55 };
const sideboards = [{ x: -4, y: 1.72, z: -12.8 }, { x: -4, y: 1.72, z: -8.85 }];
const stand = surface => ({ x: surface.x + .20, z: surface.z + .85 });
const prepStand = stand(prep), tableStand = stand(table);
const gold = { tex: 'paint', tint: 0xddaa43 };
const marble = { tex: 'plaster', tint: 0xffefde };
const plum = { tex: 'paint', tint: 0x743d65 };
const green = { tex: 'paint', tint: 0x7d9b4b };
const nectar = { tex: 'paint', tint: 0xf4a83d };

export function buildDining(batch, obstacles) {
  for (const surface of [prep, table, ...sideboards]) {
    const floor = surface === table ? 1.51 : 1;
    batch.box(surface.x, surface.y - .095, surface.z - .15, 1.12, .095, .88, marble);
    batch.box(surface.x, surface.y - .12, surface.z - .15, 1.16, .039, .92, gold);
    for (const x of [-.43, .43]) for (const dz of [-.45, .15]) {
      batch.box(surface.x + x, floor, surface.z + dz, .11, surface.y - floor - .094, .11, gold);
    }
    obstacles.push({ x0: surface.x - .59, x1: surface.x + .59, z0: surface.z - .62, z1: surface.z + .32, level: 0 });
  }
}

const request = (kind, value, seconds = 0) => ({ kind, value, seconds });
const walk = value => request('walk', value);
const perform = (kind, seconds) => request(kind, null, seconds);

const smooth = x => x * x * (3 - 2 * x);
const ease = THREE.MathUtils.lerp;

export function setupDining({ stage, world, nav }) {
  const scene = new THREE.Group();
  scene.name = 'Divine dining';
  stage.scene.add(scene);
  const actors = [];

  function rig(id, name, x, y, z, cloth, silk) {
    const actor = buildPerformer(world.tiles.layer, world.materials,
      { id, name, skin: 0xc69870, cloth, silk, scale: 1 });
    scene.add(actor.root);
    actor.root.position.set(x, y, z);
    actor.palm = createPivot(actor.arms[1].wrist, 0, -.08, 0);
    actor.path = null;
    actor.stride = 0;
    actor.index = 0;
    actor.elapsed = 0;
    actors.push(actor);
    return actor;
  }

  function prop(name, parent, draw) {
    const root = createPivot(parent);
    root.name = name;
    const batch = new BoxBatch(world.tiles.layer);
    draw((x, y, z, w, h, d, look) => batch.box(x, y, z, w, h, d, look, { shadow: false }));
    attachBatch(root, batch, world.materials);
    return root;
  }

  const tray = prop('Food tray', scene, box => {
    box(0, 0, -.10, .48, .045, .32, gold);
    box(-.095, .046, -.12, .16, .026, .15, marble);
    box(-.095, .072, -.12, .09, .047, .093, green);
    box(.095, .044, -.20, .10, .115, .10, plum);
    box(.095, .14, -.20, .104, .025, .104, gold);
  });
  tray.position.set(prep.x, prep.y, prep.z + .25);
  const jug = prop('Drink pitcher', tray, box => {
    box(0, 0, 0, .12, .155, .11, gold);
    box(0, .135, 0, .085, .05, .086, marble);
    box(0, .123, -.062, .061, .045, .088, gold);
  });
  jug.position.set(.09, .045, -.045);
  const stream = prop('Pour stream', scene, box => box(0, -1, 0, .024, 1, .024, nectar));
  stream.visible = false;
  const filled = prop('Drink in cup', tray, box => box(.095, .166, -.20, .071, .009, .071, nectar));
  filled.visible = false;

  const host = rig('indra', 'Indra', 0, 1.51, -18.02, 0x405ca1, 0xe8ad44);
  host.hips.position.y = .65;
  for (const leg of host.legs) {
    leg.thigh.rotation.x = -Math.PI / 2;
    leg.shin.rotation.x = Math.PI / 2;
  }
  const server = rig('dining-attendant', 'Dining attendant', prepStand.x, 1, prepStand.z, 0x3d7169, 0xd8c36c);
  const guard = rig('sabha-guard', 'Sabha guard', 4.3, 1, -6.3, 0x6d3852, 0xc99a53);
  const cleaner = rig('sabha-steward', 'Sabha steward', -3.8, 1, -8, 0x955b3c, 0xdfbc66);
  const cloth = prop('Cleaning cloth', cleaner.palm, box => box(0, -.012, 0, .16, .023, .13, marble));

  server.tasks = [walk(prepStand), request('pick', tray, 1.2), walk(tableStand), request('place', table, 1.15),
    request('pick', jug, 1.05), perform('pour', 2.6), request('stow', jug, 1.25),
    perform('serve', 3.6), request('pick', tray, 1.15), walk(prepStand), request('place', prep, 1.15), perform('idle', 2.5)];
  guard.tasks = [walk({ x: 4.3, z: -12 }), perform('idle', 1.1), walk({ x: 4.3, z: -7 }), perform('idle', 1.2)];
  cleaner.tasks = sideboards.flatMap(surface => [walk(stand(surface)), request('clean', surface, 2.8)]);

  const reach = new THREE.Vector3(), contact = new THREE.Vector3();
  const cup = new THREE.Vector3(), spout = new THREE.Vector3(), streamAxis = new THREE.Vector3();
  const vertical = new THREE.Vector3(0, 1, 0), pitchAxis = new THREE.Vector3(1, 0, 0);
  const orientation = new THREE.Quaternion(), parentRotation = new THREE.Quaternion();
  let held = null, transferred = false, serving = 0;

  function orient(object, pitch = 0) {
    object.parent.getWorldQuaternion(parentRotation).invert();
    orientation.setFromAxisAngle(pitchAxis, pitch);
    object.quaternion.copy(parentRotation).multiply(orientation);
  }

  function advance(actor) {
    actor.index = (actor.index + 1) % actor.tasks.length;
    actor.elapsed = 0;
    actor.path = null;
    if (actor === server) transferred = false;
  }

  function reachService(target, amount) {
    const p = server.root.position;
    server.hips.position.y -= .15 * amount;
    server.torso.rotation.x = .49 * amount;
    reach.set(p.x - .2, p.y + 1.05, p.z - .31).lerp(target, amount);
    reachPalm(server, reach);
    server.root.updateMatrixWorld(true);
  }

  function service(task, dt) {
    const p = server.root.position;
    const t = Math.min(1, server.elapsed / task.seconds);
    const amount = smooth(Math.max(0, 1 - Math.abs(t * 2 - 1)));
    turnActor(server, Math.PI, dt);

    if (task.kind === 'serve') {
      serving = Math.sin(t * Math.PI);
      server.head.rotation.x = .26 * serving;
      contact.set(p.x - .22, p.y + 1.22, p.z - .43);
      reachService(contact, serving * .8);
    } else if (task.kind === 'pour') {
      serving = Math.sin(t * Math.PI) * .55;
      cup.set(.095, .18, -.20);
      tray.localToWorld(cup);
      reach.copy(cup);
      reach.y += .12;
      reach.z += .15;
      reachPalm(server, reach);
      server.root.updateMatrixWorld(true);
      const tilt = smooth(Math.min(1, amount * 1.45));
      orient(jug, -1.04 * tilt);
      spout.set(0, .16, -.115);
      jug.localToWorld(spout);
      stream.visible = tilt > .62;
      if (stream.visible) {
        stream.position.copy(spout);
        streamAxis.subVectors(spout, cup);
        stream.scale.y = streamAxis.length();
        stream.quaternion.setFromUnitVectors(vertical, streamAxis.normalize());
        filled.visible = true;
      }
    } else if (task.kind === 'pick' || task.kind === 'place' || task.kind === 'stow') {
      if (task.kind === 'pick') {
        if (!transferred) task.value.getWorldPosition(contact);
      } else if (task.kind === 'stow') {
        contact.set(.09, .045, -.045);
        tray.localToWorld(contact);
      } else {
        const s = task.value;
        contact.set(s.x, s.y, s.z + .25);
      }
      reachService(contact, amount);
      if (t >= .5 && !transferred) {
        if (task.kind === 'pick') {
          server.palm.attach(task.value);
          held = task.value;
        } else {
          (task.kind === 'stow' ? tray : scene).attach(held);
          held = null;
        }
        transferred = true;
      }
    }
  }

  const workers = [server, guard, cleaner];
  function update(dt) {
    dt = Math.min(.08, Math.max(0, dt));
    stream.visible = false;
    serving = 0;
    for (const actor of workers) {
      const task = actor.tasks[actor.index];
      const stride = actor.stride;
      let done;
      if (task.kind === 'walk') {
        done = walkActivity(actor, nav, actors, task.value, dt);
        if (actor === server && held) {
          const p = actor.root.position;
          reach.set(.20, 1.08, .34).applyAxisAngle(vertical, actor.root.rotation.y).add(p);
        }
      } else {
        actor.elapsed += dt;
        done = actor.elapsed >= task.seconds;
      }
      gait(actor, actor.stride !== stride);
      actor.head.rotation.x = 0;
      if (actor === server && task.kind !== 'walk' && task.kind !== 'idle') service(task, dt);
      else if (actor === server && held) reachPalm(actor, reach);
      if (actor === cleaner && task.kind === 'clean') {
        actor.hips.position.y -= .13;
        turnActor(actor, Math.PI, dt);
        actor.torso.rotation.x = .52;
        reach.set(task.value.x + .13 * Math.sin(actor.elapsed * 7), task.value.y + .023, task.value.z + .27);
        reachPalm(actor, reach);
      }
      actor.upload();
      if (actor === cleaner) orient(cloth);
      if (actor === server && held && task.kind !== 'pour') orient(held);
      if (done) {
        if (actor === server && task.kind === 'idle') filled.visible = false;
        advance(actor);
      }
      actor.root.userData.activity = task.kind;
    }
    host.head.rotation.x = .18 * serving;
    host.arms[1].shoulder.rotation.x = -.45 * serving;
    host.arms[1].elbow.rotation.x = -.6 * serving;
    host.upload();
  }

  update(0);
  return update;
}
