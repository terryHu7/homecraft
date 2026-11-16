// One rig for everyone: seven InstancedMeshes — head, hat, torso, two arms,
// two legs — plus a pool of blob shadows, so the whole island's crowd costs
// eight draw calls no matter how many players are on it. Each player takes a
// slot in a 64×64 texture array (their skin, painted from a seed or decoded
// from a carried PNG), and their part matrices are composed per frame from
// the same eased walk, fly and swim poses the engine avatar uses
// (engine/world/avatar.js) — walk and fly faithfully, swim and phone
// simplified. The instanced skin trick follows the engine's blocks: a custom
// layer attribute sampled from a sampler2DArray (engine/world/blocks.js).
import * as THREE from 'three';
import { boxRegions } from '@engine/world/skin.js';
import { seedCanvas, pngCanvas } from './skins.js';

const PX = 1.8 / 32;
const SKIN = 64;
const SWIM_PIVOT = 1.0;
const PHONE_BIT = 2, SURFACE_BIT = 4;
const FLY = 8.5, RUN = 6.2;

// Part geometry and rigging, mirroring engine/world/avatar.js. Pivot is where
// the limb turns; offset is the mesh's centre inside the pivot's space. The
// engine places these in skin pixels (× PX = metres); we store metres.
const PARTS = [
  { uv: [16, 16, 8, 12, 4], pivot: [0, 18, 0], offset: [0, 0, 0] },                              // torso
  { uv: [0, 0, 8, 8, 8], pivot: [0, 24, 0], offset: [0, 4, 0], look: true },                     // head
  { uv: [32, 0, 8, 8, 8], pivot: [0, 24, 0], offset: [0, 4, 0], inflate: 1, look: true },        // hat
  { uv: [40, 16, 4, 12, 4], pivot: [-6, 22, 0], offset: [0, -5, 0], key: 'armR', keyZ: 'armRz' }, // right arm
  { uv: [32, 48, 4, 12, 4], pivot: [6, 22, 0], offset: [0, -5, 0], key: 'armL', keyZ: 'armLz' }, // left arm
  { uv: [0, 16, 4, 12, 4], pivot: [-2, 12, 0], offset: [0, -6, 0], key: 'legR', keyZ: 'legRz' }, // right leg
  { uv: [16, 48, 4, 12, 4], pivot: [2, 12, 0], offset: [0, -6, 0], key: 'legL', keyZ: 'legLz' }, // left leg
].map(p => ({
  ...p,
  pivot: p.pivot.map(v => v * PX),
  offset: p.offset.map(v => v * PX),
}));

function skinnedGeometry([u, v, w, h, d], inflate = 0) {
  const g = new THREE.BoxGeometry((w + inflate) * PX, (h + inflate) * PX, (d + inflate) * PX);
  const attr = g.getAttribute('uv');
  boxRegions(u, v, w, h, d).forEach(([x, y, rw, rh], face) => {
    const u0 = x / 64, u1 = (x + rw) / 64, vt = 1 - y / 64, vb = 1 - (y + rh) / 64;
    const o = face * 4;
    attr.setXY(o, u0, vt); attr.setXY(o + 1, u1, vt); attr.setXY(o + 2, u0, vb); attr.setXY(o + 3, u1, vb);
  });
  return g;
}

export function createPool({ stage, nav, cap }) {
  const scene = stage.scene;

  // ---------- the skin texture array, one layer per slot ----------
  const data = new Uint8Array(SKIN * SKIN * 4 * cap);
  const texture = new THREE.DataArrayTexture(data, SKIN, SKIN, cap);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  // Canvas rows run top-down, texture rows bottom-up: copy flipped.
  function paintLayer(slot, canvas) {
    if (!canvas) return;
    const src = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, SKIN, SKIN).data;
    const base = slot * SKIN * SKIN * 4;
    for (let y = 0; y < SKIN; y++) data.set(src.subarray(y * SKIN * 4, (y + 1) * SKIN * 4), base + (SKIN - 1 - y) * SKIN * 4);
    texture.needsUpdate = true;
  }

  // ---------- materials: Lambert + the layer attribute ----------
  // One shared material. The engine's baked lighting (world.lighting.apply,
  // called after setup() returns) replaces onBeforeCompile wholesale, so the
  // skin-array patch is wrapped around it in prime(), which the world's
  // warmup hook calls after lighting but before the shaders are compiled.
  const material = new THREE.MeshLambertMaterial({ alphaTest: 0.5 });
  let primed = false;
  function prime() {
    if (primed) return;
    primed = true;
    const prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey;
    material.onBeforeCompile = shader => {
      if (prev) prev(shader);
      shader.uniforms.uSkins = { value: texture };
      shader.vertexShader = 'attribute float aLayer;\nvarying float vLayer;\nvarying vec2 vSkinUv;\n' + shader.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLayer = aLayer;\nvSkinUv = uv;');
      shader.fragmentShader = 'uniform highp sampler2DArray uSkins;\nvarying float vLayer;\nvarying vec2 vSkinUv;\n' + shader.fragmentShader
        .replace('#include <map_fragment>', 'diffuseColor *= texture(uSkins, vec3(vSkinUv, vLayer));');
    };
    material.customProgramCacheKey = () => 'homecraft-mp-pool-v1::' + (prevKey ? prevKey() : 'plain');
    material.needsUpdate = true;
  }

  // ---------- the meshes ----------
  const layers = new Float32Array(cap);
  const layerAttr = new THREE.InstancedBufferAttribute(layers, 1);
  const meshes = PARTS.map(part => {
    const mesh = new THREE.InstancedMesh(skinnedGeometry(part.uv, part.inflate), material, cap);
    mesh.geometry.setAttribute('aLayer', layerAttr);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  });
  const blobs = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.42, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
    cap,
  );
  blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blobs.frustumCulled = false;
  blobs.count = 0;
  scene.add(blobs);
  // The instance buffers start zeroed, and a zero matrix hides its instance.

  // ---------- per-player animation state, by slot ----------
  const anims = [];
  for (let i = 0; i < cap; i++) {
    anims.push({
      phase: Math.random() * 6, idleT: 0, stroke: 0, phone: false,
      pose: { legR: 0, legL: 0, armR: 0, armL: 0, armRz: 0, armLz: 0, legRz: 0, legLz: 0, lean: 0 },
      lookY: 0, lookP: 0,
      st: { speed: 0, run: false, lookYaw: 0, lookPitch: 0, fly: -1, air: false, zip: false },
      swim: { pitch: 0, roll: 0, stroke: 0, fast: false, surface: false, lie: 0, climb: false, dive: false },
    });
  }

  // The engine avatar's easing (avatar.js update), without the swim branches
  // the wire format does not carry (lie, climb, dive).
  function ease(a, dt) {
    const s = a.st, moving = s.speed > 0.05, t = a.idleT, target = a.pose;
    a.phase += dt * (s.run ? 12 : 8.5) * Math.min(1, s.speed * 1.2);
    a.idleT += dt;
    const swing = Math.sin(a.phase) * (s.run ? 0.95 : 0.62) * Math.min(1, s.speed * 1.4);
    target.legR = swing; target.legL = -swing;
    target.armR = -swing * 0.85; target.armL = swing * 0.85;
    target.armRz = 0; target.armLz = 0; target.legRz = 0; target.legLz = 0;
    target.lean = s.run ? 0.12 : 0;
    if (!moving) {
      target.armRz = Math.sin(t * 1.6) * 0.04 + 0.03;
      target.armLz = -Math.sin(t * 1.6) * 0.04 - 0.03;
      target.armR = Math.sin(t * 1.1) * 0.03;
      target.armL = -Math.sin(t * 1.1) * 0.03;
    }
    if (s.fly >= 0) {
      const f = s.fly, drift = Math.sin(t * 2.2) * 0.05;
      target.legR = 0.18 + 0.14 * f + drift; target.legL = 0.12 + 0.14 * f - drift;
      target.armR = 0.3 + 0.55 * f; target.armL = 0.3 + 0.55 * f;
      target.armRz = -0.22 - 0.2 * f; target.armLz = 0.22 + 0.2 * f;
      target.lean = 0.06 + 0.45 * f;
    } else if (s.zip) {
      target.legR = -0.7; target.legL = 0.35; target.armR = -2.55; target.armL = 0.55;
      target.armRz = 0.12; target.armLz = 0.3; target.lean = 0.18;
    } else if (s.air) {
      target.legR = -0.5; target.legL = 0.3; target.armR = -0.7; target.armL = -0.45;
      target.armRz = -0.12; target.armLz = 0.12; target.lean = 0.04;
    } else if (s.swim) {
      const w = s.swim;
      a.stroke = (a.stroke + dt * (w.fast ? 7.6 : 4.4) * (0.3 + 0.7 * Math.min(1, w.stroke))) % (Math.PI * 20);
      if (w.stroke < 0.15) {
        // Treading water: sculling hands, slow cycling legs.
        const scull = Math.sin(t * 3.1), cycle = Math.sin(t * 2.4) * 0.35;
        target.armR = -0.35 + 0.25 * Math.cos(t * 3.1); target.armL = -0.35 + 0.25 * Math.cos(t * 3.1 + 0.4);
        target.armRz = -0.95 + 0.3 * scull; target.armLz = 0.95 - 0.3 * scull;
        target.legR = cycle; target.legL = -cycle; target.legRz = -0.1; target.legLz = 0.1;
      } else if (w.fast) {
        // Front crawl: windmilling arms, fluttering legs.
        const flutter = Math.sin(t * 15) * 0.32;
        target.armR = -a.stroke; target.armL = -a.stroke - Math.PI;
        target.armRz = -0.12; target.armLz = 0.12;
        target.legR = 0.06 + flutter; target.legL = 0.06 - flutter; target.legRz = 0; target.legLz = 0;
      } else {
        // Breaststroke: pull out and back, then glide on the kick.
        const u = a.stroke / (Math.PI * 2) % 1;
        const pull = u < 0.4 ? Math.sin(u / 0.4 * Math.PI / 2) : u < 0.6 ? 1 - (u - 0.4) / 0.2 : 0;
        const spread = u < 0.4 ? Math.sin(u / 0.4 * Math.PI) : 0;
        const kick = u >= 0.5 && u < 0.85 ? Math.sin((u - 0.5) / 0.35 * Math.PI) : 0;
        target.armR = -Math.PI + 1.6 * pull; target.armL = -Math.PI + 1.6 * pull;
        target.armRz = -0.9 * spread; target.armLz = 0.9 * spread;
        target.legR = 0.35 * kick; target.legL = 0.35 * kick;
        target.legRz = -0.4 * kick; target.legLz = 0.4 * kick;
      }
      target.lean = 0;
      // A windmilling arm takes the short way round to its next angle.
      for (const key of ['armR', 'armL']) target[key] = a.pose[key] + Math.atan2(Math.sin(target[key] - a.pose[key]), Math.cos(target[key] - a.pose[key]));
    }
    if (a.phone) { target.armR = -1.2; target.armRz = 0.42; }
    const k = 1 - Math.exp(-dt * 14);
    for (const key in a.pose) a.pose[key] += (target[key] - a.pose[key]) * k;
    const headPitch = a.phone ? 0.45 : s.swim && s.swim.surface ? -0.2 : 0;
    a.lookY += (0 - a.lookY) * k * 0.6;
    a.lookP += (headPitch - a.lookP) * k * 0.6;
  }

  // ---------- matrix composition ----------
  const rootM = new THREE.Matrix4(), bodyM = new THREE.Matrix4(), bodyW = new THREE.Matrix4();
  const partM = new THREE.Matrix4(), m = new THREE.Matrix4();
  const v = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1), off = new THREE.Vector3();
  const qy = new THREE.Quaternion(), qb = new THREE.Quaternion(), qp = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  const eu = new THREE.Euler();
  const AXIS_X = new THREE.Vector3(1, 0, 0), AXIS_Y = new THREE.Vector3(0, 1, 0), AXIS_Z = new THREE.Vector3(0, 0, 1);
  const FLAT = new THREE.Quaternion().setFromAxisAngle(AXIS_X, -Math.PI / 2);

  function draw(r, dt, visible) {
    const slot = r.slot;
    if (slot === undefined || slot < 0) return;
    const a = anims[slot];
    if (!visible) {
      m.makeScale(0, 0, 0);
      for (const mesh of meshes) mesh.setMatrixAt(slot, m);
      blobs.setMatrixAt(slot, m);
      return;
    }
    // The state the engine avatar would have been fed (player.js place()).
    const out = r.out, st = a.st, swim = a.swim;
    const speed = Math.hypot(out.vx, out.vz);
    st.speed = speed / RUN * 1.6;
    st.run = speed > 3.7;
    st.fly = -1; st.air = false; st.zip = false; st.swim = null;
    if (out.m === 2) { st.speed = 0; st.fly = Math.min(1, speed / FLY); }
    else if (out.m === 1) st.air = true;
    else if (out.m === 3) {
      st.speed = 0; st.swim = swim;
      swim.stroke = Math.min(1, speed / 2.2);
      swim.fast = speed > 2.6;
      swim.surface = !!(out.f & SURFACE_BIT);
    } else if (out.m === 4) st.zip = true;
    a.phone = !!(out.f & PHONE_BIT);
    ease(a, dt);

    const bob = st.fly >= 0 ? Math.sin(a.idleT * 2) * 0.05 : st.speed > 0.05 ? Math.abs(Math.sin(a.phase)) * 0.035 : 0;
    rootM.compose(v.set(out.x, out.y, out.z), qy.setFromAxisAngle(AXIS_Y, out.ry), ONE);
    if (st.swim) {
      const pitch = st.swim.pitch, roll = st.swim.roll;
      qb.setFromEuler(eu.set(pitch, roll, 0));
      bodyM.compose(v.set(0, SWIM_PIVOT - SWIM_PIVOT * Math.cos(pitch) + Math.sin(a.idleT * 1.7) * 0.02 * (1 - swim.lie), -SWIM_PIVOT * Math.sin(pitch)), qb, ONE);
    } else {
      qb.setFromEuler(eu.set(a.pose.lean, 0, 0));
      bodyM.compose(v.set(0, bob, 0), qb, ONE);
    }
    bodyW.multiplyMatrices(rootM, bodyM);
    const p = a.pose;
    for (let i = 0; i < PARTS.length; i++) {
      const part = PARTS[i];
      const rotX = part.look ? a.lookP : part.key ? p[part.key] : 0;
      const rotZ = part.key ? p[part.keyZ] : 0;
      qp.setFromAxisAngle(AXIS_X, rotX);
      if (part.look) qp.multiply(q2.setFromAxisAngle(AXIS_Y, a.lookY));
      if (rotZ) qp.multiply(q2.setFromAxisAngle(AXIS_Z, rotZ));
      off.set(part.offset[0], part.offset[1], part.offset[2]).applyQuaternion(qp);
      partM.compose(v.set(part.pivot[0] + off.x, part.pivot[1] + off.y, part.pivot[2] + off.z), qp, ONE);
      meshes[i].setMatrixAt(slot, m.multiplyMatrices(bodyW, partM));
    }
    const floor = nav.heightAt(out.x, out.z), lift = out.y - floor;
    if (out.m !== 3 && lift < 8) blobs.setMatrixAt(slot, m.compose(v.set(out.x, floor + 0.015, out.z), FLAT, ONE));
    else blobs.setMatrixAt(slot, m.makeScale(0, 0, 0));
  }

  function flush() {
    const count = cap - free.length;
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = count;
    }
    blobs.instanceMatrix.needsUpdate = true;
    blobs.count = count;
  }

  // ---------- slots ----------
  const free = [];
  for (let i = cap - 1; i >= 0; i--) free.push(i);
  const slots = new Map(); // id → slot

  function acquire(id) {
    let slot = slots.get(id);
    if (slot !== undefined) return slot;
    if (!free.length) return -1;
    slot = free.pop();
    slots.set(id, slot);
    // Point this instance's skin sample at its own array layer.
    layers[slot] = slot;
    layerAttr.needsUpdate = true;
    return slot;
  }
  function release(id) {
    const slot = slots.get(id);
    if (slot === undefined) return;
    slots.delete(id);
    free.push(slot);
    data.fill(0, slot * SKIN * SKIN * 4, (slot + 1) * SKIN * SKIN * 4);
    texture.needsUpdate = true;
  }
  function paint(id, canvas) {
    const slot = slots.get(id);
    if (slot !== undefined && slot >= 0) paintLayer(slot, canvas);
  }
  const has = id => slots.get(id) !== undefined;

  return { acquire, release, paint, has, draw, flush, prime, cap };
}
