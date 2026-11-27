import * as THREE from 'three';
import { mergeSwargGeometry } from './swarg-geometry.js';
import { buildSwargReturnGate, SWARG_EARTH, SWARG_REALM } from './swarg-gate.js';

const materials = {
  marble: new THREE.MeshBasicMaterial({ color: 0xf1e9d7 }),
  gold: new THREE.MeshBasicMaterial({ color: 0xd4a23b }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffd77c, emissive: 0xffb742, emissiveIntensity: 1.3, fog: false }),
  leaf: new THREE.MeshBasicMaterial({ color: 0x648d62 }),
  blossom: new THREE.MeshBasicMaterial({ color: 0xe7a7a1, emissive: 0x5d2822, emissiveIntensity: 0.28 }),
  cloud: new THREE.MeshBasicMaterial({ color: 0xf3f2ef, transparent: true, opacity: 0.72 }),
  river: new THREE.MeshBasicMaterial({ color: 0x80dfe3, emissive: 0x36aeb9, emissiveIntensity: 1.25, transparent: true, opacity: 0.78, side: THREE.DoubleSide, fog: false }),
};
function addBox(bags, mat, x, y, z, w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); bags[mat].push(g);
}
function addSphere(bags, mat, x, y, z, sx, sy, sz, segments = 8) {
  const g = new THREE.SphereGeometry(1, segments, Math.max(6, segments - 2)); g.scale(sx, sy, sz); g.translate(x, y, z); bags[mat].push(g);
}
function addCylinder(bags, mat, x, y, z, rt, rb, h, sides = 10) {
  const g = new THREE.CylinderGeometry(rt, rb, h, sides); g.translate(x, y + h / 2, z); bags[mat].push(g);
}
function meshMerged(group, geometries, material) {
  if (!geometries.length) return;
  const geometry = mergeSwargGeometry(geometries); geometries.forEach(g => g.dispose());
  group.add(new THREE.Mesh(geometry, material));
}
function makeRealm() {
  const group = new THREE.Group(); group.name = 'swarg-realm'; group.visible = false;
  group.position.set(SWARG_REALM.x, SWARG_REALM.y, SWARG_REALM.z);
  const bags = Object.fromEntries(Object.keys(materials).map(key => [key, []]));
  // Arrival court and Sudharma Sabha: a symbolic, open-sided assembly hall.
  addBox(bags, 'marble', 0, -0.55, 0, 36, 0.55, 25);
  addBox(bags, 'marble', 24, -0.32, 0, 16, 0.32, 6);
  addBox(bags, 'marble', 0, 0, -13, 27, 0.35, 12);
  addBox(bags, 'gold', 0, 0.34, -18.8, 26, 0.22, 0.4);
  for (const x of [-11, -5.5, 0, 5.5, 11]) {
    addCylinder(bags, 'marble', x, 0.2, -22, 0.55, 0.74, 8.1, 12);
    addCylinder(bags, 'gold', x, 8.3, -22, 0.94, 0.66, 0.45, 12);
    addSphere(bags, 'gold', x, 9.1, -22, 0.72, 0.36, 0.72);
  }
  addBox(bags, 'gold', 0, 8.75, -22, 25, 0.7, 1.7);
  // Raised central dais, a sun symbol, and a wide luminous roof line.
  addBox(bags, 'marble', 0, 0.15, -14.3, 9, 0.42, 5.5);
  addCylinder(bags, 'gold', 0, 9.1, -21, 1.12, 1.12, 0.16, 20);
  addSphere(bags, 'glow', 0, 9.22, -21, 0.58, 0.58, 0.12, 12);
  // Nandana garden. Kalpavriksha and Parijata have blossom clusters, no figures.
  for (const [x, z, pink] of [[-15, 7, false], [-10, 9, true], [10, 8, false], [15, 5, true]]) {
    addCylinder(bags, 'gold', x, 0, z, 0.35, 0.56, 5.6, 9);
    for (let i = 0; i < 12; i++) {
      const a = i * 2.4, r = 1.7 + (i % 3) * 0.35;
      addSphere(bags, pink ? 'blossom' : 'leaf', x + Math.cos(a) * r, 5.4 + (i % 3) * 0.55, z + Math.sin(a) * r, 1.15, 0.88, 1.05);
    }
  }
  // Airavata, a dignified white elephant statue made from merged simple forms.
  addSphere(bags, 'marble', 4.2, 1.65, 1.5, 2.0, 1.25, 1.05, 12);
  addSphere(bags, 'marble', 5.8, 2.7, 1.35, 0.9, 0.92, 0.88, 12);
  for (const x of [3.0, 5.0]) for (const z of [0.9, 2.1]) addBox(bags, 'marble', x, 0.1, z, 0.52, 1.2, 0.55);
  addSphere(bags, 'marble', 6.62, 1.95, 1.0, 0.35, 1.2, 0.3, 10); // symbolic trunk
  for (const x of [5.45, 6.15]) addSphere(bags, 'gold', x, 3.05, 0.65, 0.12, 0.12, 0.08, 8);
  // Mandakini ribbon: several joined translucent planes with a gentle animated shimmer.
  const riverMat = materials.river;
  const river = new THREE.Mesh(new THREE.PlaneGeometry(52, 4.4, 1, 1), riverMat);
  river.rotation.x = -Math.PI / 2; river.position.set(0, 0.035, 16); group.add(river);
  for (const x of [-22, 22]) {
    addSphere(bags, 'cloud', x, -4.2, 0, 8, 2.5, 7, 10);
    addBox(bags, 'marble', x, -1.1, 0, 8, 1.1, 8);
  }
  // Cloud-sea surface and small floating islands under the court.
  for (let i = 0; i < 22; i++) {
    const x = -46 + (i * 23) % 92, z = -40 + (i * 17) % 76;
    addSphere(bags, 'cloud', x, -8.2 - (i % 4) * 0.5, z, 5.2, 1.6, 4.2);
  }
  for (const [x, z, s] of [[-38, 12, 4], [34, -12, 5], [-28, -30, 3.5], [29, 30, 4]]) {
    addBox(bags, 'marble', x, -5.2, z, s * 2, 1.25, s * 1.7);
    addSphere(bags, 'leaf', x, -3.4, z, s * 0.7, s * 0.8, s * 0.65);
  }
  for (const [key, material] of Object.entries(materials)) meshMerged(group, bags[key], material);
  // Mount Meru silhouette is a low-poly cone far beyond the garden.
  const meru = new THREE.Mesh(new THREE.ConeGeometry(20, 65, 7, 3), materials.marble);
  meru.position.set(0, 23, -115); group.add(meru);
  group.add(buildSwargReturnGate());
  // Pet accents are merged into one tiny instanced mesh, animated by the caller.
  const petGeometry = new THREE.SphereGeometry(0.16, 6, 4);
  const petMaterial = new THREE.MeshBasicMaterial({ color: 0xf0a4a1, transparent: true, opacity: 0.8, fog: false });
  const petals = new THREE.InstancedMesh(petGeometry, petMaterial, 12);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 12; i++) { dummy.position.set(-12 + i * 2.2, 4 + (i % 3), 4 + (i % 4) * 1.8); dummy.updateMatrix(); petals.setMatrixAt(i, dummy.matrix); }
  group.add(petals);
  return { group, river, petals };
}

export function createSwargRealm({ stage, world, player, rig }) {
  let realm = null, active = false, transition = null, disposed = false;
  const overlay = document.createElement('div');
  overlay.className = 'swarg-transition'; overlay.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '10001', opacity: '0', pointerEvents: 'none', background: 'radial-gradient(circle at center, #fff8e5 0%, #fff1c2 26%, #fff 100%)', transition: 'opacity 900ms ease-in-out', display: 'none' });
  document.body.append(overlay);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function build() {
    if (realm) return;
    realm = makeRealm(); stage.scene.add(realm.group);
  }
  function requestTransition(destination) {
    if (transition || disposed) return;
    overlay.style.display = 'block'; overlay.style.pointerEvents = 'auto';
    transition = { destination, time: 0, phase: 'in', white: reduced ? 0.18 : 0.9, hold: reduced ? 0.05 : 0.4, out: reduced ? 0.2 : 1.2, swapped: false };
  }
  function swap(destination) {
    player.cancel();
    if (destination === 'realm') {
      build(); realm.group.visible = true; active = true;
      const [x, z] = world.swargGates.realm.arrival;
      player.teleport(x, z, { floor: 600, look: [38, 0] });
    } else {
      if (realm) realm.group.visible = false;
      active = false;
      const [x, z] = world.swargGates.earth.arrival;
      player.teleport(x, z, { floor: SWARG_EARTH.y, look: [x, z + 8] });
    }
    rig.recenter(player);
  }
  function shouldEnter(p) {
    const gate = active ? world.swargGates.realm : world.swargGates.earth;
    const [x, z] = gate.threshold;
    return Math.hypot(p.pos.x - x, p.pos.z - z) < 1.0 && Math.abs(p.floorY - gate.position.y) < 1.3;
  }
  function update(dt, elapsed) {
    const cloud = world.swargGates.planes[0].userData.clouds;
    if (cloud) { cloud.position.x = Math.sin(elapsed * 0.08) * 1.4; cloud.position.z = Math.cos(elapsed * 0.06) * 0.8; }
    if (realm && active) {
      realm.river.material.opacity = 0.72 + Math.sin(elapsed * 1.1) * 0.08;
      realm.petals.rotation.y = elapsed * 0.035;
      realm.petals.position.y = Math.sin(elapsed * 0.55) * 0.25;
    }
    if (!transition) return;
    const t = transition; t.time += dt;
    const elapsedTime = t.time;
    if (elapsedTime >= t.white && !t.swapped) { t.swapped = true; swap(t.destination); }
    let opacity, progress;
    if (elapsedTime < t.white) { progress = elapsedTime / t.white; opacity = progress; }
    else if (elapsedTime < t.white + t.hold) opacity = 1;
    else opacity = 1 - Math.min(1, (elapsedTime - t.white - t.hold) / t.out);
    if (progress !== undefined && !reduced) overlay.style.backgroundSize = `${100 + progress * 260}% ${100 + progress * 260}%`;
    overlay.style.opacity = String(opacity);
    if (elapsedTime >= t.white + t.hold + t.out) {
      transition = null; overlay.style.opacity = '0'; overlay.style.pointerEvents = 'none'; overlay.style.display = 'none';
    }
  }
  return {
    update, shouldEnter, requestTransition, get active() { return active; }, get transitioning() { return !!transition; },
    dispose() { disposed = true; overlay.remove(); if (realm) stage.scene.remove(realm.group); },
  };
}
