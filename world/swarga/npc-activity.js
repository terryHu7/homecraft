import * as THREE from 'three';

// Reserve the next step in update order. A blocked actor waits and gives
// priority to the actor already in the passage.
export function walkActivity(actor, nav, actors, destination, dt) {
  const p = actor.root.position;
  if (!actor.path) {
    actor.path = nav.findPath(p, destination);
    actor.waypoint = 0;
    if (!actor.path) return false;
  }
  const point = actor.path[actor.waypoint];
  if (!point) return true;
  const dx = point.x - p.x, dz = point.z - p.z;
  const distance = Math.hypot(dx, dz);
  if (distance < .015) {
    actor.waypoint++;
    return actor.waypoint === actor.path.length;
  }
  const step = Math.min(distance, dt * 1.25);
  const x = p.x + dx * step / distance, z = p.z + dz * step / distance;
  turnActor(actor, Math.atan2(dx, dz), dt);
  if (!nav.canStand(x, z, p.y)) return false;
  for (const other of actors) {
    if (other === actor) continue;
    if (Math.hypot(other.root.position.x - x, other.root.position.z - z) < .65) return false;
  }
  p.set(x, nav.heightAt(x, z), z);
  actor.stride += step * 10;
  return false;
}

export function turnActor(actor, yaw, dt) {
  const r = actor.root.rotation;
  const delta = Math.atan2(Math.sin(yaw - r.y), Math.cos(yaw - r.y));
  r.y += THREE.MathUtils.clamp(delta, -dt * 5, dt * 5);
  return Math.abs(delta) < .025;
}

const down = new THREE.Vector3(0, -1, 0);
const aim = new THREE.Vector3(), normal = new THREE.Vector3();
const upper = new THREE.Vector3(), lower = new THREE.Vector3();
const inverse = new THREE.Quaternion();

// Solve two links to the palm socket, including the wrist-to-palm offset.
export function reachPalm(actor, target) {
  const { shoulder, elbow, wrist } = actor.arms[1];
  actor.root.updateMatrixWorld(true);
  aim.copy(target);
  actor.torso.worldToLocal(aim).sub(shoulder.position);
  const distance = aim.length();
  aim.divideScalar(Math.max(distance, .001));
  normal.set(.4, -.2, -.6).addScaledVector(aim, -normal.dot(aim)).normalize();
  const a = .26, b = .315, d = THREE.MathUtils.clamp(distance, .06, a + b - .001);
  const along = (a * a - b * b + d * d) / (2 * d);
  upper.copy(aim).multiplyScalar(along).addScaledVector(normal, Math.sqrt(Math.max(0, a * a - along * along)));
  lower.copy(aim).multiplyScalar(d).sub(upper).normalize();
  shoulder.quaternion.setFromUnitVectors(down, upper.normalize());
  inverse.copy(shoulder.quaternion).invert();
  elbow.quaternion.setFromUnitVectors(down, lower.applyQuaternion(inverse));
  wrist.rotation.set(0, 0, 0);
}

export function gait(actor, walking) {
  const wave = walking ? Math.sin(actor.stride) * .35 : 0;
  actor.hips.position.y = .89 - Math.abs(wave) * .04;
  actor.torso.rotation.set(.035 * (walking ? 1 : 0), 0, 0);
  for (let i = 0; i < 2; i++) {
    const swing = i ? wave : -wave;
    const { thigh, shin, foot } = actor.legs[i];
    thigh.rotation.set(swing, 0, 0);
    shin.rotation.set(Math.max(0, -swing) * .8, 0, 0);
    foot.rotation.set(-swing * .45, 0, 0);
    const { shoulder, elbow, wrist } = actor.arms[i];
    shoulder.rotation.set(-swing * .65, 0, (i ? 1 : -1) * .11);
    elbow.rotation.set(-.12, 0, 0);
    wrist.rotation.set(0, 0, 0);
  }
}
