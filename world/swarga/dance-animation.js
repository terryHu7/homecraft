import * as THREE from 'three';
import { buildPerformer, DANCERS } from './apsaras.js';
import { DANCE_FLOOR, MUSIC_PLATFORM } from './layout.js';

// Reach, elbow flex and wrist angle for each arm, followed by face and body turn.
// Held poses and travelling gestures form a continuous phrase.
const PHRASE = [
  [ .61, -.29, -.62, .23,   .62, -.29, -.62, -.23,   .00,  .00],
  [1.39, -.25, -.42, .44,   .37, -.58, -.92, -.16,  -.34, -.25],
  [1.75, -.15, -.78, .18,  1.47, -.32, -.89, -.34, -.12, -.53],
  [ .78, -.64, -.79, .28,  1.02, -.34, -.51, -.29,  .15, -.05],
  [ .33, -.52, -.94, .25,  1.48, -.22, -.46, -.42,  .35,  .52],
  [1.21, -.36, -.67, .36,  1.18, -.36, -.67, -.37,  .13,  .23],
];

const ENSEMBLE = [
  { id: 'veena-player', name: 'Veena player', instrument: 'veena', x: 45, z: -10.2, skin: 0x9c644a, cloth: 0x654b88, silk: 0xad7455, scale: 1, tempo: .8 },
  { id: 'flute-player', name: 'Flute player', instrument: 'flute', x: 50, z: -11, skin: 0xc28963, cloth: 0x2d5672, silk: 0x6c9ca0, scale: 1.03, tempo: .71 },
  { id: 'mridangam-player', name: 'Mridangam player', instrument: 'mridangam', x: 55, z: -10.2, skin: 0xaf7153, cloth: 0x763c50, silk: 0xc18461, scale: 1.04, tempo: .94 },
];

const mix = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const tau = Math.PI * 2;
const downAxis = new THREE.Vector3(0, -1, 0);
const reach = new THREE.Vector3(), bend = new THREE.Vector3();
const upperArm = new THREE.Vector3(), lowerArm = new THREE.Vector3();
const shoulderInverse = new THREE.Quaternion();

function poseDancer(actor, time, reduced) {
  const { root, design, hips, torso, head, arms, legs } = actor;
  const cycle = reduced ? design.phase : (time * design.tempo / 18 + design.phase) % 1;
  const frame = cycle * PHRASE.length;
  const index = Math.floor(frame);
  const blend = frame - index, ease = blend * blend * (3 - 2 * blend);
  const a = PHRASE[index], b = PHRASE[(index + 1) % PHRASE.length];
  const accent = reduced ? 0 : Math.max(0, (Math.cos(time * tau / 12) - .75) * 4);
  const turn = mix(a[9], b[9], ease) * (1 - accent * .75);
  const reachAccent = design.id === 'rambha' || design.id === 'menaka' ? .23 : -.16;
  const step = cycle * tau * 4;
  const weight = Math.sin(step);
  root.rotation.y = turn * (design.x < 50 ? 1 : -1);
  hips.position.x = weight * .056;
  hips.position.y = .865 - .029 * weight * weight;
  torso.rotation.set(.026 * Math.cos(step), -turn * .17, -.046 * weight);
  head.rotation.set(.027 * Math.sin(step), mix(a[8], b[8], ease), .045 * weight);

  for (let i = 0; i < arms.length; i++) {
    const { shoulder, elbow, wrist, side } = arms[i];
    const j = design.x < 50 ? i * 4 : (1 - i) * 4;
    shoulder.rotation.set(mix(a[j + 1], b[j + 1], ease), side * .09, side * mix(mix(a[j], b[j], ease) + reachAccent, 1.16, accent));
    elbow.rotation.set(mix(a[j + 2], b[j + 2], ease), side * .1, side * .06);
    wrist.rotation.set(.06 * Math.sin(step + side), .18 * weight, mix(a[j + 3], b[j + 3], ease) * (design.x < 50 ? 1 : -1));
    const { thigh, shin, foot } = legs[i];
    const swing = weight * side;
    const lift = .065 * Math.max(0, swing) ** 2 * (1 - accent * .65);
    const forward = .12 * swing;
    const down = hips.position.y - .035 - .075 - lift;
    const len1 = .412, len2 = .37, length = Math.hypot(down, forward);
    const knee = Math.acos(clamp((length * length - len1 * len1 - len2 * len2) / (2 * len1 * len2), -1, 1));
    const hip = Math.atan2(-forward, down) - Math.atan2(len2 * Math.sin(knee), len1 + len2 * Math.cos(knee));
    thigh.rotation.set(hip, 0, side * .08);
    shin.rotation.x = knee;
    foot.rotation.set(-hip - knee - .13 * Math.max(0, swing), side * .12, -side * .08);
  }
}

function poseMusician(actor, time, reduced) {
  const { design, head, arms, legs } = actor;
  const t = reduced ? 0 : time * design.tempo * tau;
  const pulse = Math.sin(t), alternate = Math.sin(t + Math.PI * .76);
  head.rotation.set(design.instrument === 'flute' ? .06 : .17, design.instrument === 'veena' ? .18 : 0, .025 * pulse);
  for (let i = 0; i < arms.length; i++) {
    const { shoulder, elbow, wrist, side } = arms[i];
    const beat = i === 0 ? pulse : alternate;
    if (design.instrument === 'flute') {
      reachInstrument(shoulder, elbow, side, i === 0 ? .06 : .37, 1.07, .245);
      wrist.rotation.set(-.12, .11, .095 * beat);
    } else if (design.instrument === 'veena') {
      reachInstrument(shoulder, elbow, side, i === 0 ? -.34 : .36 + .04 * beat,
        (i === 0 ? .58 : .67) + .022 * beat, .37);
      wrist.rotation.set(.13 * beat, 0, side * .12);
    } else {
      reachInstrument(shoulder, elbow, side, side * (.35 + .07 * Math.max(0, beat)),
        .53 + .04 * Math.max(0, beat), .38 + .017 * beat);
      wrist.rotation.set(.17 * beat, 0, -side * .10);
    }
    const { thigh, shin, foot } = legs[i];
    thigh.rotation.set(-1.25, 0, side * .74);
    shin.rotation.set(.48, -side * .29, -side * 1.16);
    foot.rotation.set(.18, 0, side * .17);
  }
}

// Solve the arm in the torso's local frame. Bias the elbow down and out so
// the hands stay by the instruments, even as the fingers and wrists move.
function reachInstrument(shoulder, elbow, side, x, y, z) {
  reach.set(x - shoulder.position.x, y - .51 - shoulder.position.y, z - shoulder.position.z);
  const distance = reach.length();
  reach.divideScalar(distance);
  bend.set(side * .45, -.85, -.25).addScaledVector(reach, -bend.dot(reach)).normalize();
  const upperLength = .26, forearmLength = .315;
  const span = Math.min(distance, upperLength + forearmLength - .001);
  const along = (upperLength ** 2 - forearmLength ** 2 + span ** 2) / (2 * span);
  const away = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  upperArm.copy(reach).multiplyScalar(along).addScaledVector(bend, away);
  lowerArm.copy(reach).multiplyScalar(span).sub(upperArm).normalize();
  shoulder.quaternion.setFromUnitVectors(downAxis, upperArm.normalize());
  shoulderInverse.copy(shoulder.quaternion).invert();
  elbow.quaternion.setFromUnitVectors(downAxis, lowerArm.applyQuaternion(shoulderInverse));
}

export function setupDance({ stage, world }) {
  const group = new THREE.Group();
  group.name = 'Mandapam performers';
  stage.scene.add(group);
  const actors = [...DANCERS, ...ENSEMBLE].map(design => {
    const actor = buildPerformer(world.tiles.layer, world.materials, design, design.instrument);
    actor.design = design;
    actor.pose = design.instrument ? poseMusician : poseDancer;
    actor.root.position.set(design.x, (design.instrument ? MUSIC_PLATFORM.y : DANCE_FLOOR.y) + .035, design.z);
    actor.bounds = new THREE.Sphere(actor.root.position.clone().add(new THREE.Vector3(0, 1, 0)), 1.9);
    actor.resting = false;
    actor.pose(actor, 0, true);
    actor.upload();
    group.add(actor.root);
    return actor;
  });

  const frustum = new THREE.Frustum();
  const view = new THREE.Matrix4();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let time = 0;
  return function update(dt) {
    const resting = reduced.matches;
    if (!resting) time += Math.max(0, dt);
    const camera = stage.camera;
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (let i = 0; i < actors.length; i++) {
      const actor = actors[i];
      actor.root.visible = frustum.intersectsSphere(actor.bounds);
      if (!actor.root.visible || (resting && actor.resting)) continue;
      actor.pose(actor, time, resting);
      actor.upload();
      actor.resting = resting;
    }
  };
}
