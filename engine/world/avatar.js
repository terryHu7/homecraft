// The player, built like a Minecraft player (8-px head, 12-px limbs, 32 px tall) and
// skinned with a standard 64×64 skin. Poses blend so every change looks eased.
import * as THREE from 'three';
import { paintSkin, boxRegions, CAT } from './skin.js';

const PX = 1.8 / 32;
// In the water the body turns about its middle, this high above the feet.
export const SWIM_PIVOT = 1.0;

// Handheld selfie: the arm reaches towards the lens but stays low in the
// frame, leaving only a small foreground section visible. The face turns
// towards the same raised phone rather than a detached third-person camera.
const SELFIE = {
  armR: -1.65, armRy: 0, armRz: -0.38, elbowR: 0,
  armL: 0.08, armLz: 0.12,
  headYaw: -0.26, headPitch: -0.10, headRoll: 0.04,
};

function skinnedBox(w, h, d, regions, material, inflate = 0) {
  const g = new THREE.BoxGeometry((w + inflate) * PX, (h + inflate) * PX, (d + inflate) * PX);
  const uv = g.getAttribute('uv');
  regions.forEach(([x, y, rw, rh], face) => {
    const u0 = x / 64, u1 = (x + rw) / 64, vt = 1 - y / 64, vb = 1 - (y + rh) / 64;
    const o = face * 4;
    uv.setXY(o, u0, vt); uv.setXY(o + 1, u1, vt); uv.setXY(o + 2, u0, vb); uv.setXY(o + 3, u1, vb);
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.receiveShadow = true;
  return mesh;
}

// A skin's 8×8 face, as rows of colours: the Dock's About icon.
function faceOf(ctx) {
  const px = ctx.getImageData(8, 8, 8, 8).data, hex = i => '#' + [0, 1, 2].map(c => px[i + c].toString(16).padStart(2, '0')).join('');
  return Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => hex((y * 8 + x) * 4)));
}
// The face of a skin nobody is wearing: the owner's, while a visitor wears
// the character they came through a door as.
export function readFace(skinUrl, onFace) {
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (img.naturalWidth !== 64 || img.naturalHeight !== 64) return;
    const ctx = Object.assign(document.createElement('canvas'), { width: 64, height: 64 }).getContext('2d', { willReadFrequently: true });
    try { ctx.drawImage(img, 0, 0); onFace(faceOf(ctx)); } catch {}
  };
  img.src = skinUrl;
}

// `skinUrl` is a 64×64 Minecraft skin PNG; until it loads (or without one) the
// default skin from skin.js is worn. `onFace` receives the skin's 8×8 face.
export function createAvatar(skinUrl, { onFace } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  paintSkin(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  if (skinUrl) {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth !== 64 || img.naturalHeight !== 64) return;
      ctx.clearRect(0, 0, 64, 64); ctx.drawImage(img, 0, 0); texture.needsUpdate = true;
      onFace?.(faceOf(ctx));
    };
    img.onerror = () => console.warn('Skin not found:', skinUrl);
    img.src = skinUrl;
  }
  const material = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5 });

  const root = new THREE.Group();   // position on the floor, yaw
  const body = new THREE.Group();   // leans and bobs while walking
  root.add(body);

  const torso = skinnedBox(8, 12, 4, boxRegions(16, 16, 8, 12, 4), material);
  torso.position.y = 18 * PX;
  body.add(torso);

  const head = new THREE.Group();
  head.position.y = 24 * PX;
  const headMesh = skinnedBox(8, 8, 8, boxRegions(0, 0, 8, 8, 8), material);
  headMesh.position.y = 4 * PX;
  head.add(headMesh);
  const hat = skinnedBox(8, 8, 8, boxRegions(32, 0, 8, 8, 8), material, 1);
  hat.position.y = 4 * PX;
  head.add(hat);
  body.add(head);

  // Face order matches BoxGeometry: +x, -x, +y, -y, +z, -z. A split limb cuts
  // the 4x12 side faces at row 6, keeping the shoulder cap on the upper arm
  // and the palm on the forearm. With a straight elbow it reads as one arm.
  const limb = (u, v, x, y, { elbow = false } = {}) => {
    const pivot = new THREE.Group();
    pivot.position.set(x * PX, y * PX, 0);
    body.add(pivot);
    if (!elbow) {
      const mesh = skinnedBox(4, 12, 4, boxRegions(u, v, 4, 12, 4), material);
      mesh.position.y = -5 * PX;
      pivot.add(mesh);
      return { pivot, tip: pivot };
    }
    const upper = [
      [u + 8, v + 4, 4, 6], [u, v + 4, 4, 6],
      [u + 4, v, 4, 4], [u + 8, v, 4, 4],
      [u + 4, v + 4, 4, 6], [u + 12, v + 4, 4, 6],
    ];
    const lower = [
      [u + 8, v + 10, 4, 6], [u, v + 10, 4, 6],
      [u + 4, v, 4, 4], [u + 8, v, 4, 4],
      [u + 4, v + 10, 4, 6], [u + 12, v + 10, 4, 6],
    ];
    const upperMesh = skinnedBox(4, 6, 4, upper, material);
    upperMesh.position.y = -3 * PX;
    pivot.add(upperMesh);
    const joint = new THREE.Group();
    joint.position.y = -6 * PX;
    pivot.add(joint);
    const lowerMesh = skinnedBox(4, 6, 4, lower, material);
    lowerMesh.position.y = -3 * PX;
    joint.add(lowerMesh);
    return { pivot, tip: joint };
  };
  // Character's right is -x when facing +z. Only that arm has an elbow:
  // a selfie keeps it almost straight and reaches towards the lens.
  const right = limb(40, 16, -6, 22, { elbow: true });
  const armR = right.pivot, elbowR = right.tip;
  const armL = limb(32, 48, 6, 22).pivot;
  const legR = limb(0, 16, -2, 12).pivot;
  const legL = limb(16, 48, 2, 12).pivot;
  legR.children[0].position.y = -6 * PX;
  legL.children[0].position.y = -6 * PX;

  // A narrow phone follows the hand during normal phone use. Selfie mode is
  // the view from that phone, so its body is hidden rather than appearing as
  // a black slab in front of the lens; only the outstretched arm remains.
  const dark = new THREE.MeshLambertMaterial({ color: 0x24282f });
  const handset = new THREE.Mesh(new THREE.BoxGeometry(2.0 * PX, 0.35 * PX, 3.6 * PX), [dark, dark, new THREE.MeshBasicMaterial({ color: 0xa9c8ff }), dark, dark, dark]);
  handset.visible = false;
  const phonePivot = new THREE.Group();
  phonePivot.add(handset);
  body.add(phonePivot);
  // Where a web leaves their right hand.
  const hand = new THREE.Object3D();
  hand.position.set(0, -5.5 * PX, 0);
  elbowR.add(hand);
  const handAt = new THREE.Vector3();

  // Minecraft entities wear a soft round shadow rather than a cast one.
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.renderOrder = 1;

  // Pose state, eased every frame.
  const pose = { legR: 0, legL: 0, armR: 0, armL: 0, armRy: 0, armRz: 0, elbowR: 0, armLz: 0, legRz: 0, legLz: 0, lean: 0 };
  const target = { ...pose };
  let phase = 0, idleT = 0, waveT = 0, reachT = 0, reachArm = 'R', phoneOut = false, selfie = false, stroke = 0;
  const look = { yaw: 0, pitch: 0 };

  // In the water: lying on the bottom, climbing out, diving in, treading
  // water, the front crawl (running) or the breaststroke.
  function swimPose(w, dt) {
    const t = idleT;
    stroke = (stroke + dt * (w.fast ? 7.6 : 4.4) * (0.3 + 0.7 * Math.min(1, w.stroke))) % (Math.PI * 20);
    if (w.lie > 0.5) {
      // Face up on the floor, arms and legs loose, swaying a little with the water.
      Object.assign(target, { armR: -0.25 + Math.sin(t * 0.7) * 0.06, armL: -0.25 + Math.sin(t * 0.7 + 1) * 0.06,
        armRz: -1.2 + Math.sin(t * 0.5) * 0.07, armLz: 1.2 - Math.sin(t * 0.5 + 0.6) * 0.07,
        legR: 0.04, legL: -0.04, legRz: -0.14 - Math.sin(t * 0.6) * 0.03, legLz: 0.14 + Math.sin(t * 0.6 + 0.8) * 0.03 });
    } else if (w.climb) {
      Object.assign(target, { armR: -1.1, armL: -1.1, armRz: 0.15, armLz: -0.15, legR: 0.3, legL: -0.1, legRz: 0, legLz: 0 });
    } else if (w.dive) {
      // Head first, arms together past the head, legs straight.
      Object.assign(target, { armR: -3, armL: -3, armRz: 0.12, armLz: -0.12, legR: 0, legL: 0, legRz: 0, legLz: 0 });
    } else if (w.stroke < 0.15) {
      // Treading water: hands sculling out to the sides, legs cycling slowly.
      const scull = Math.sin(t * 3.1), cycle = Math.sin(t * 2.4) * 0.35;
      Object.assign(target, { armR: -0.35 + 0.25 * Math.cos(t * 3.1), armL: -0.35 + 0.25 * Math.cos(t * 3.1 + 0.4),
        armRz: -0.95 + 0.3 * scull, armLz: 0.95 - 0.3 * scull, legR: cycle, legL: -cycle, legRz: -0.1, legLz: 0.1 });
    } else if (w.fast) {
      // The arms windmill in turn; the legs flutter.
      const flutter = Math.sin(t * 15) * 0.32;
      Object.assign(target, { armR: -stroke, armL: -stroke - Math.PI, armRz: -0.12, armLz: 0.12, legR: 0.06 + flutter, legL: 0.06 - flutter, legRz: 0, legLz: 0 });
    } else {
      // Pull out and back, hands together, shoot forward, then glide on the kick.
      const u = stroke / (Math.PI * 2) % 1;
      const pull = u < 0.4 ? Math.sin(u / 0.4 * Math.PI / 2) : u < 0.6 ? 1 - (u - 0.4) / 0.2 : 0;
      const spread = u < 0.4 ? Math.sin(u / 0.4 * Math.PI) : 0, kick = u >= 0.5 && u < 0.85 ? Math.sin((u - 0.5) / 0.35 * Math.PI) : 0;
      Object.assign(target, { armR: -Math.PI + 1.6 * pull, armL: -Math.PI + 1.6 * pull, armRz: -0.9 * spread, armLz: 0.9 * spread,
        legR: 0.35 * kick, legL: 0.35 * kick, legRz: -0.4 * kick, legLz: 0.4 * kick });
    }
    target.lean = 0;
    // A windmilling arm takes the short way round to its next angle.
    for (const key of ['armR', 'armL']) target[key] = pose[key] + Math.atan2(Math.sin(target[key] - pose[key]), Math.cos(target[key] - pose[key]));
  }

  function update(dt, s) {
    // s: { speed, run, lookYaw, lookPitch, fly (-1 on foot, else 0–1 of top speed), air,
    //      swim: { pitch, roll, stroke, fast, surface, lie, climb, dive } in the water }
    const moving = s.speed > 0.05, w = s.swim;
    phase += dt * (s.run ? 12 : 8.5) * Math.min(1, s.speed * 1.2);
    idleT += dt;
    const swingAmp = s.run ? 0.95 : 0.62;
    const swing = Math.sin(phase) * swingAmp * Math.min(1, s.speed * 1.4);
    Object.assign(target, { legR: swing, legL: -swing, armR: -swing * 0.85, armL: swing * 0.85, armRz: 0, elbowR: 0, armLz: 0, legRz: 0, legLz: 0, lean: s.run ? 0.12 : 0 });
    if (!moving) {
      target.armRz = Math.sin(idleT * 1.6) * 0.04 + 0.03;
      target.armLz = -Math.sin(idleT * 1.6) * 0.04 - 0.03;
      target.armR = Math.sin(idleT * 1.1) * 0.03;
      target.armL = -Math.sin(idleT * 1.1) * 0.03;
    }
    if (s.fly >= 0) {
      // Flying: legs trail, arms sweep back and out, leaning into the speed.
      const f = s.fly, drift = Math.sin(idleT * 2.2) * 0.05;
      Object.assign(target, { legR: 0.18 + 0.14 * f + drift, legL: 0.12 + 0.14 * f - drift, armR: 0.3 + 0.55 * f, armL: 0.3 + 0.55 * f, armRz: -0.22 - 0.2 * f, armLz: 0.22 + 0.2 * f, lean: 0.06 + 0.45 * f });
    } else if (s.zip) {
      // Swinging on a web: the right arm reaches up the line, legs tucked.
      Object.assign(target, { legR: -0.7, legL: 0.35, armR: -2.55, armL: 0.55, armRz: 0.12, armLz: 0.3, lean: 0.18 });
    } else if (s.air) {
      Object.assign(target, { legR: -0.5, legL: 0.3, armR: -0.7, armL: -0.45, armRz: -0.12, armLz: 0.12, lean: 0.04 });
    }
    if (w) swimPose(w, dt);
    if (waveT > 0) {
      waveT -= dt;
      target.armR = Math.PI; target.armRz = 0.4 + Math.sin(waveT * 14) * 0.35;
    }
    // Slapping the Vertec vanes: one arm straight up, swung forward to get there.
    if (reachT > 0) {
      reachT -= dt;
      if (reachArm === 'R') { target.armR = -2.95; target.armRz = -0.1; } else { target.armL = -2.95; target.armLz = 0.1; }
    }
    // Hold the phone normally, or reach towards the lens for a selfie.
    if (selfie) {
      Object.assign(target, {
        armR: SELFIE.armR, armRy: SELFIE.armRy, armRz: SELFIE.armRz,
        elbowR: SELFIE.elbowR, armL: SELFIE.armL, armLz: SELFIE.armLz,
      });
    } else if (phoneOut) {
      target.armR = -1.2;
      target.armRz = 0.42;
      target.armRy = 0;
    } else {
      target.armRy = 0;
    }
    const k = 1 - Math.exp(-dt * 14);
    for (const key in pose) pose[key] += (target[key] - pose[key]) * k;

    legR.rotation.x = pose.legR; legL.rotation.x = pose.legL;
    legR.rotation.z = pose.legRz; legL.rotation.z = pose.legLz;
    armR.rotation.x = pose.armR; armL.rotation.x = pose.armL;
    armR.rotation.y = pose.armRy;
    armR.rotation.z = pose.armRz; armL.rotation.z = pose.armLz;
    elbowR.rotation.x = pose.elbowR;
    if (w) {
      // Pitched about the middle of the body, and rolled about its length to
      // lie face up; a slow bob while afloat.
      body.rotation.set(w.pitch, w.roll, 0);
      body.position.set(0, SWIM_PIVOT - SWIM_PIVOT * Math.cos(w.pitch) + Math.sin(idleT * 1.7) * 0.02 * (1 - w.lie), -SWIM_PIVOT * Math.sin(w.pitch));
    } else {
      // A small step bob keeps the walk readable without a physics body.
      body.rotation.set(pose.lean, 0, 0);
      body.position.y = s.fly >= 0 ? Math.sin(idleT * 2) * 0.05 : moving ? Math.abs(Math.sin(phase)) * 0.035 : 0;
      body.position.z = 0;
    }
    // The head looks where it is told, within a natural range. Swimming on
    // top, it lifts to look ahead over the water.
    const headPitch = !w ? THREE.MathUtils.clamp(selfie ? SELFIE.headPitch : (phoneOut ? 0.45 : s.lookPitch ?? 0), -0.5, 0.6)
      : w.lie > 0.5 || w.dive ? 0 : w.surface ? (w.fast ? -0.2 : -THREE.MathUtils.clamp(w.pitch - 0.25, 0, 1.1)) : -0.35;
    look.yaw += (THREE.MathUtils.clamp(selfie ? SELFIE.headYaw : (s.lookYaw ?? 0), -1.1, 1.1) - look.yaw) * k * 0.6;
    look.pitch += (headPitch - look.pitch) * k * 0.6;
    head.rotation.y = look.yaw;
    head.rotation.x = look.pitch;
    head.rotation.z = selfie ? SELFIE.headRoll : 0;
    if (selfie || phoneOut) {
      root.updateMatrixWorld(true);
      hand.getWorldPosition(handAt);
      phonePivot.position.copy(body.worldToLocal(handAt));
      phonePivot.position.z += 1.4 * PX;
      phonePivot.rotation.set(selfie ? -Math.PI / 2 : pose.armR, 0, 0);
    }
  }

  // World-space anchors for the photo camera: the face and the character's
  // axes. The studio puts the lens just in front of the face, on the side of
  // the raised hand, without waiting for the pose to ease in.
  function selfieAnchors() {
    root.updateMatrixWorld(true);
    return {
      face: new THREE.Vector3(0, 1.6, 4 * PX).applyMatrix4(root.matrixWorld),
      forward: new THREE.Vector3(0, 0, 1).transformDirection(root.matrixWorld),
      right: new THREE.Vector3(1, 0, 0).transformDirection(root.matrixWorld),
    };
  }

  function wave() { waveT = 1.4; }
  function reach(arm = 'R') { reachT = 0.75; reachArm = arm; }
  function holdPhone(on) { phoneOut = on; handset.visible = phoneOut && !selfie; }
  function poseSelfie(on) { selfie = on; handset.visible = phoneOut && !selfie; }

  return { root, body, head, armR, armL, legR, legL, hand, blob, update, wave, reach, holdPhone, poseSelfie, selfieAnchors, material };
}

// ---------- Pets ----------
// The cat and the dog share one cheap rig. Every coat patch and limb is an
// instance of a single box mesh, so each pet stays one draw plus a blob shadow,
// and limb matrices upload at the controller's 12 Hz while the pet is on screen.
// Poses ease towards a target, so lying down or sitting reads as a movement
// rather than a cut. Closed eyes swap a few instance matrices: no colour upload.
const SHUT = 1e-4;

function petRig() {
  const rig = new THREE.Group(), body = new THREE.Group(), parts = [];
  rig.add(body);
  const group = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const at = (x, y, z, w, h, d) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
  // `shut` is how the part looks with the eyes closed: 'hide', or [w, h] for a lid line.
  const box = (w, h, d, color, x, y, z, parent = body, shut = null) => parts.push({
    parent, color, local: at(x, y, z, w, h, d),
    shut: shut === 'hide' ? at(x, y, z, SHUT, SHUT, SHUT) : shut ? at(x, y - h * 0.1, z, shut[0], shut[1], d) : null,
  });
  function build(name, sphere, blob, { grounded = false } = {}) {
    const root = new THREE.Group();
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), parts.length);
    mesh.name = name; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.boundingSphere = sphere;
    parts.forEach((p, i) => mesh.setColorAt(i, new THREE.Color(p.color)));
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(blob.radius, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: blob.opacity, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = blob.y; shadow.scale.set(blob.sx, blob.sz, 1);
    root.add(mesh, shadow);
    const matrix = new THREE.Matrix4();
    function upload(closed) {
      rig.updateMatrixWorld(true);
      let floor = Infinity;
      parts.forEach((p, i) => {
        matrix.multiplyMatrices(p.parent.matrixWorld, closed && p.shut ? p.shut : p.local);
        mesh.setMatrixAt(i, matrix);
        if (grounded) {
          const e = matrix.elements;
          // Lowest corner of this transformed unit cube, without a Box3 per part.
          floor = Math.min(floor, e[13] - (Math.abs(e[1]) + Math.abs(e[5]) + Math.abs(e[9])) * .5);
        }
      });
      // Side sleep and the roll back upright must not bury the ears or paws.
      if (grounded) mesh.position.y = Math.max(0, .002 - floor);
      mesh.instanceMatrix.needsUpdate = true;
    }
    return { root, mesh, upload };
  }
  return { body, group, box, build };
}

// Ease every value towards the goal pose; dt <= 0 snaps (first frame, reduced motion).
function settle(pose, goal, dt, rate) {
  const k = dt > 0 ? 1 - Math.exp(-dt * rate) : 1;
  for (const key in goal) pose[key] += (goal[key] - pose[key]) * k;
}

// A quick blink every few seconds; a slow one (a cat's "I trust you") when the player is close.
function blinker(slow) {
  let t = 0, next = 2 + Math.random() * 3, until = 0;
  return (dt, near) => {
    t += dt;
    if (t >= next) {
      const lingering = slow && near;
      until = t + (lingering ? 0.6 : 0.16); next = t + (lingering ? 3.5 : 2.5) + Math.random() * 3.5;
    }
    return t < until;
  };
}

// The cat: rounded ginger-and-white proportions.
const CAT_POSES = {
  stand: { by: 0, bz: 0, pitch: 0, roll: 0, hy: 0.43, hp: 0, yaw: 0, front: 0, hind: 0, tx: 0.5, ty: 0 },
  // Loaf: paws tucked under, belly down, tail along one side.
  loaf: { by: -0.14, bz: 0, pitch: 0, roll: 0, hy: 0.41, hp: 0.06, yaw: 0, front: 1.5, hind: -1.5, tx: -0.45, ty: 1.35 },
  // Upright on the haunches; the hind legs fold out of sight, tail on the floor.
  sit: { by: -0.068, bz: 0.113, pitch: -0.55, roll: 0, hy: 0.43, hp: 0.5, yaw: 0, front: 0.55, hind: 0, tx: -0.1, ty: 1.4 },
  // Curled on one side, chin tucked towards the tail.
  sleep: { by: -0.15, bz: 0, pitch: 0, roll: 0.32, hy: 0.36, hp: 0.45, yaw: 0.85, front: 1.5, hind: -1.5, tx: -0.45, ty: 1.6 },
};

export function createCat() {
  const { body, group, box, build } = petRig();
  const torso = group(body, 0, 0.28, 0);
  box(0.32, 0.26, 0.52, CAT.cream, 0, 0, 0, torso);
  box(0.27, 0.12, 0.47, CAT.white, 0, -0.1, 0.03, torso);
  box(0.3, 0.2, 0.1, CAT.white, 0, -0.03, 0.26, torso);
  box(0.24, 0.055, 0.42, CAT.cream, 0, 0.15, -0.02, torso);
  const head = group(body, 0, 0.43, 0.28);
  box(0.34, 0.27, 0.27, CAT.cream, 0, 0, 0, head);
  box(0.3, 0.12, 0.06, CAT.white, 0, -0.07, 0.14, head);
  box(0.075, 0.18, 0.016, CAT.white, 0, 0.035, 0.142, head);
  box(0.06, 0.035, 0.025, CAT.nose, 0, -0.045, 0.18, head);
  for (const s of [-1, 1]) {
    box(0.066, 0.06, 0.012, CAT.eye, s * 0.09, 0.014, 0.143, head, 'hide');
    box(0.039, 0.048, 0.014, CAT.pupil, s * 0.09, 0.014, 0.15, head, [0.07, 0.012]);
    box(0.011, 0.012, 0.015, CAT.white, s * 0.09 - 0.01, 0.03, 0.156, head, 'hide');
    box(0.09, 0.095, 0.07, CAT.cream, s * 0.115, 0.17, -0.02, head);
    box(0.058, 0.06, 0.014, CAT.inner, s * 0.115, 0.17, 0.02, head);
    box(0.021, 0.052, 0.012, CAT.creamDark, s * 0.15, 0.07, 0.14, head);
  }
  const legs = [];
  for (const [x, z] of [[-0.1, 0.19], [0.1, 0.19], [-0.1, -0.18], [0.1, -0.18]]) {
    const pivot = group(body, x, 0.19, z);
    box(0.09, 0.17, 0.1, CAT.white, 0, -0.07, 0, pivot);
    box(0.105, 0.055, 0.14, CAT.white, 0, -0.16, 0.025, pivot);
    legs.push(pivot);
  }
  // Pitch first, then swing sideways, so a lowered tail can curl along the floor.
  const tail = group(body, 0, 0.32, -0.28); tail.rotation.order = 'YXZ';
  box(0.075, 0.075, 0.34, CAT.cream, 0, 0, -0.16, tail);
  for (const z of [-0.09, -0.19, -0.29]) box(0.078, 0.078, 0.035, CAT.creamDark, 0, 0, z, tail);
  const { root, mesh, upload } = build('ginger-white-cat', new THREE.Sphere(new THREE.Vector3(0, 0.3, 0), 0.85), { radius: 0.32, opacity: 0.25, y: 0.011, sx: 0.8, sz: 1.2 });
  const pose = { ...CAT_POSES.sleep }, blink = blinker(true);
  let t = 0;
  function update(dt, { moving = false, sleeping = false, rest = 'loaf', look = 0, near = false } = {}) {
    t += dt;
    const name = moving ? 'stand' : sleeping ? 'sleep' : CAT_POSES[rest] ? rest : 'loaf';
    const goal = { ...CAT_POSES[name] };
    if (!moving && !sleeping) goal.yaw = look;
    settle(pose, goal, dt, moving ? 30 : 5);
    const stride = moving ? Math.sin(t * 9) * 0.5 : 0;
    legs.forEach((leg, i) => { leg.rotation.x = (i < 2 ? pose.front : pose.hind) + (i === 0 || i === 3 ? stride : -stride); });
    body.position.set(0, pose.by + (moving ? Math.abs(Math.sin(t * 9)) * 0.012 : 0), pose.bz);
    body.rotation.set(pose.pitch, 0, pose.roll);
    torso.scale.y = name === 'sleep' || name === 'loaf' ? 1 + Math.sin(t * 1.3) * 0.008 : 1;
    head.position.y = pose.hy; head.rotation.set(pose.hp, pose.yaw, 0);
    // Awake, the tip of the tail flicks now and then.
    const flick = !moving && !sleeping && Math.sin(t * 0.45) > 0.7 ? Math.sin(t * 7) * 0.18 : 0;
    tail.rotation.set(pose.tx, pose.ty + (moving ? Math.sin(t * 1.6) * 0.22 : flick), 0);
    upload(sleeping || blink(dt, near));
  }
  update(0, { sleeping: true });
  return { root, update, head, mesh };
}

// The dog (a Doberman) has knees and wrists, so it can lie like a sphinx and sit
// upright on folded hind legs. It sleeps lying the same way, belly down, with
// its head lowered onto its paws; never stretched out on its side.
const DOG_POSES = {
  stand: { bx: 0, by: 0, bz: 0, pitch: 0, roll: 0, hy: .99, hz: .54, hp: .04, yaw: 0, lf: 0, lh: 0, kf: 0, kh: 0, wf: 0, wh: 0, tx: .25 },
  // Belly down, chest a little raised, forelegs out in front, head up and watching.
  sphinx: { bx: 0, by: -.5, bz: 0, pitch: -.1, roll: 0, hy: 1.04, hz: .56, hp: .1, yaw: 0, lf: -1.4, lh: -1.45, kf: 0, kh: 2.9, wf: 1.5, wh: 0, tx: -.45 },
  // The chest lifts around the hips; front legs stay straight, hind paws flat.
  sit: { bx: 0, by: -.068, bz: .386, pitch: -.75, roll: 0, hy: .99, hz: .54, hp: .64, yaw: 0, lf: .75, lh: -.6, kf: 0, kh: 2.75, wf: 0, wh: -1.4, tx: .5 },
  // Belly down like the sphinx, the head lowered and turned a little, chin towards the paws.
  sleep: { bx: 0, by: -.52, bz: 0, pitch: -.04, roll: 0, hy: .86, hz: .62, hp: .5, yaw: .18, lf: -1.4, lh: -1.45, kf: 0, kh: 2.9, wf: 1.5, wh: 0, tx: -.5 },
};

export function createDog() {
  const { body, group, box, build } = petRig();
  const black = 0x343b39, rust = 0x95623e, nose = 0x141a19;
  const torso = group(body, 0, .73, 0);
  box(.34, .34, .95, black, 0, 0, 0, torso);
  box(.29, .35, .3, black, 0, -.09, .36, torso); box(.19, .24, .03, rust, 0, -.09, .52, torso);
  const head = group(body, 0, .99, .54);
  box(.24, .26, .25, black, 0, -.1, -.14, head);
  box(.27, .27, .31, black, 0, .08, 0, head);
  box(.18, .14, .3, rust, 0, .015, .24, head);
  box(.18, .07, .31, black, 0, .08, .24, head);
  box(.17, .1, .06, nose, 0, .055, .415, head);
  for (const s of [-1, 1]) {
    box(.045, .04, .02, rust, s * .12, .13, .14, head);
    box(.035, .025, .02, nose, s * .115, .105, .16, head, [.04, .008]);
    box(.01, .01, .015, 0xc8b691, s * .115, .11, .176, head, 'hide');
    box(.105, .23, .1, black, s * .175, .055, -.07, head);
  }
  const legs = [];
  for (const [x, z] of [[-.14, .34], [.14, .34], [-.14, -.36], [.14, -.36]]) {
    const hip = group(body, x, .62, z), knee = group(hip, 0, -.4, 0), wrist = group(knee, 0, -.155, 0);
    box(.085, .42, .11, black, 0, -.2, 0, hip);
    box(.095, .22, .13, rust, 0, -.08, .015, knee);
    box(.1, .07, .2, rust, 0, -.03, .05, wrist);
    legs.push({ hip, knee, wrist, front: z > 0 });
  }
  const tail = group(body, 0, .77, -.49); tail.rotation.order = 'YXZ';
  box(.055, .06, .43, black, 0, .04, -.21, tail);
  box(.045, .06, .17, black, 0, .13, -.45, tail);
  const { root, mesh, upload } = build('doberman', new THREE.Sphere(new THREE.Vector3(0, .5, 0), 1.25), { radius: .47, opacity: .22, y: .013, sx: .8, sz: 1.7 }, { grounded: true });
  const pose = { ...DOG_POSES.sleep }, blink = blinker(false);
  let t = 0;
  function update(dt, { moving = false, sleeping = false, rest = 'sphinx', look = 0, near = false } = {}) {
    t += dt;
    const name = moving ? 'stand' : sleeping ? 'sleep' : DOG_POSES[rest] ? rest : 'sphinx';
    const goal = { ...DOG_POSES[name] };
    if (!moving && !sleeping) goal.yaw = look;
    settle(pose, goal, dt, moving ? 30 : 4.5);
    legs.forEach(({ hip, knee, wrist, front }, i) => {
      const gait = moving ? Math.sin(t * 7 + (i === 0 || i === 3 ? 0 : Math.PI)) * .45 : 0;
      hip.rotation.x = (front ? pose.lf : pose.lh) + gait;
      knee.rotation.x = front ? pose.kf : pose.kh;
      wrist.rotation.x = front ? pose.wf : pose.wh;
    });
    body.position.set(pose.bx, pose.by + (moving ? Math.sin(t * 14) * .018 : 0), pose.bz);
    body.rotation.set(pose.pitch, 0, pose.roll);
    const breath = Math.sin(t * 1.25);
    // Breathing belongs to the ribcage; the planted paws and head stay still.
    torso.scale.set(1, name === 'sphinx' || name === 'sleep' ? 1 + breath * (name === 'sleep' ? .011 : .008) : 1, 1);
    head.position.set(0, pose.hy, pose.hz); head.rotation.set(pose.hp, pose.yaw, 0);
    // A lazy sway when idle; a fast wag, or a thump on the floor, when the player is near.
    const wag = moving ? Math.sin(t * 3) * .3 : sleeping ? 0 : near ? Math.sin(t * 11) * .5 : Math.sin(t * 1.4) * .25;
    tail.rotation.set(pose.tx, wag, 0);
    upload(sleeping || blink(dt, near));
  }
  update(0, { sleeping: true });
  return { root, update, mesh, head };
}
