import * as THREE from 'three';
import { mergeSwargGeometry } from './swarg-geometry.js';
import { SPAWN } from './layout.js';

export const SWARG_EARTH = Object.freeze({ x: -120, y: 165, z: 150 });
export const SWARG_REALM = Object.freeze({ x: 0, y: 600, z: 0 });
// Three.js rotates local +Z toward (sin(yaw), cos(yaw)); use the home approach point.
const HOME_APPROACH = { x: SPAWN.x, z: SPAWN.z };
const YAW = Math.atan2(HOME_APPROACH.x - SWARG_EARTH.x, HOME_APPROACH.z - SWARG_EARTH.z);
const MATS = {
  marble: new THREE.MeshBasicMaterial({ color: 0xf4eee0 }),
  shade: new THREE.MeshBasicMaterial({ color: 0xd8c9af }),
  gold: new THREE.MeshBasicMaterial({ color: 0xd5a642, metalness: 0.1 }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffe6a1, emissive: 0xffbb55, emissiveIntensity: 2.4, fog: false }),
  halo: new THREE.MeshBasicMaterial({ color: 0xffdf9a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, fog: false }),
  cloud: new THREE.MeshBasicMaterial({ color: 0xf6f5f2, transparent: true, opacity: 0.86 }),
};

function box(geometry, x, y, z, w, h, d) {
  const part = new THREE.BoxGeometry(w, h, d);
  part.translate(x, y + h / 2, z);
  geometry.push(part);
}
function cylinder(geometry, x, y, z, radiusTop, radiusBottom, height, sides = 12) {
  const part = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, sides, 1);
  part.translate(x, y + height / 2, z);
  geometry.push(part);
}
function sphere(geometry, x, y, z, sx, sy, sz, detail = 1) {
  const part = new THREE.SphereGeometry(1, detail === 1 ? 8 : 12, detail === 1 ? 6 : 8);
  part.scale(sx, sy, sz); part.translate(x, y, z); geometry.push(part);
}
function addMerged(group, pieces, material, position = null, yaw = 0) {
  if (!pieces.length) return;
  const merged = mergeSwargGeometry(pieces);
  pieces.forEach(g => g.dispose());
  const mesh = new THREE.Mesh(merged, material);
  if (position) { mesh.position.set(position.x, position.y, position.z); mesh.rotation.y = yaw; }
  mesh.frustumCulled = true;
  group.add(mesh);
  return mesh;
}
function buildGate(position, yaw, prefix) {
  const root = new THREE.Group(); root.name = prefix; root.position.set(position.x, position.y, position.z); root.rotation.y = yaw;
  const parts = { marble: [], shade: [], gold: [], glow: [], halo: [], cloud: [] };
  // Cloud-stone platform, two fluted columns, and a torana lintel.
  box(parts.marble, 0, -0.7, -0.2, 15.5, 0.7, 8.5);
  for (const x of [-5.8, 5.8]) {
    cylinder(parts.marble, x, 0, 0, 0.78, 0.95, 13.7, 14);
    for (let i = 0; i < 8; i++) box(parts.shade, x + Math.cos(i * Math.PI / 4) * 0.68, 0.7, Math.sin(i * Math.PI / 4) * 0.68, 0.13, 12.1, 0.13);
    cylinder(parts.gold, x, 13.7, 0, 1.4, 0.8, 0.55, 12);
    // Lotus-petal capital and kalasha finial.
    for (let p = 0; p < 8; p++) {
      const a = p * Math.PI / 4;
      sphere(parts.gold, x + Math.cos(a) * 1.2, 14.4, Math.sin(a) * 1.2, 0.53, 0.25, 0.31);
    }
    cylinder(parts.gold, x, 14.75, 0, 0.2, 0.37, 0.7, 10);
    sphere(parts.gold, x, 15.55, 0, 0.36, 0.45, 0.36);
  }
  box(parts.marble, 0, 13.75, 0, 13.5, 1.15, 1.9);
  box(parts.gold, 0, 15.05, 0, 11.5, 0.22, 2.4);
  // Open gold leaves with raised symbolic panels, not figures.
  for (const x of [-2.45, 2.45]) {
    box(parts.gold, x, 0.1, 0.22, 2.05, 12.5, 0.28);
    box(parts.shade, x, 0.8, 0.03, 1.45, 10.8, 0.14);
    box(parts.gold, x, 1.5, -0.12, 1.02, 9.3, 0.18);
    for (const y of [2.3, 4.8, 7.3, 9.8, 11.6]) sphere(parts.gold, x, y, -0.27, 0.34, 0.48, 0.13);
    cylinder(parts.gold, x + Math.sign(x) * 0.98, 0, 0, 0.13, 0.13, 12.7, 8);
  }
  // Sun disc and hanging bells beneath the torana.
  cylinder(parts.gold, 0, 15.35, 1.2, 0.95, 0.95, 0.16, 20);
  sphere(parts.glow, 0, 15.46, 1.22, 0.56, 0.56, 0.15, 2);
  for (const x of [-4.3, -2.5, 2.5, 4.3]) {
    box(parts.gold, x, 13.1, 0.82, 0.06, 0.72, 0.06);
    sphere(parts.gold, x, 12.95, 0.82, 0.2, 0.22, 0.2);
  }
  // Warm opening, a low-cost halo, and the faint beacon rising above clouds.
  box(parts.glow, 0, 0.2, -0.44, 4.1, 12.2, 0.08);
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(18, 22), MATS.halo);
  aura.position.set(0, 6.6, -1.65); root.add(aura);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.1, 74, 8, 1, true), MATS.halo);
  beam.position.set(0, 41, 0); root.add(beam);
  // Wide white-marble approach stair. Treads descend 0.5 m at a time.
  for (let i = 0; i < 16; i++) {
    const h = 0.5, z = 4.55 + i * 0.9;
    box(parts.marble, 0, -i * h - h, z, 7.8, h, 1.08);
  }
  // Small separated cloud puffs beneath and alongside the landing.
  for (let i = 0; i < 15; i++) {
    const a = i * 2.399, r = 7 + (i % 4) * 1.7;
    sphere(parts.cloud, Math.cos(a) * r, -2 - (i % 3) * 1.2, Math.sin(a) * r, 2.7, 1.2, 2.2);
  }
  for (const [key, mat] of Object.entries(MATS)) if (parts[key]) {
    const mesh = addMerged(root, parts[key], mat);
    if (key === 'cloud') root.userData.clouds = mesh;
  }
  return root;
}

function toLocal(x, z, position, yaw) {
  const dx = x - position.x, dz = z - position.z;
  return { x: dx * Math.cos(yaw) - dz * Math.sin(yaw), z: dx * Math.sin(yaw) + dz * Math.cos(yaw) };
}
function worldPoint(x, z, position, yaw) {
  return [position.x + x * Math.cos(yaw) + z * Math.sin(yaw), position.z - x * Math.sin(yaw) + z * Math.cos(yaw)];
}
function gateSite(position, yaw, site) {
  return {
    levels(x, z, out) {
      const p = toLocal(x, z, position, yaw);
      if (p.x >= -7.75 && p.x < 7.75 && p.z >= -4.45 && p.z < 4.35) out.push({ y: position.y, site });
      if (p.x < -3.9 || p.x > 3.9) return;
      const nearest = Math.floor((p.z - 4.01) / 0.9);
      for (let i = Math.max(0, nearest - 1); i <= Math.min(15, nearest); i++) {
        const start = 4.01 + i * 0.9;
        if (p.z >= start && p.z < start + 1.08) out.push({ y: position.y - i * 0.5, site, tread: true });
      }
    },
  };
}
const earthGate = buildGate(SWARG_EARTH, YAW, 'swarg-earth-gate');
const realmGatePosition = { x: 15, y: SWARG_REALM.y, z: 0 };
const realmGateYaw = Math.atan2(SWARG_REALM.x - realmGatePosition.x, SWARG_REALM.z - realmGatePosition.z);
const earthAt = worldPoint(0, 3.15, SWARG_EARTH, YAW);
const returnAt = worldPoint(0, 3.15, realmGatePosition, realmGateYaw);

export function createSwargGates() {
  return {
    planes: [earthGate], site: gateSite(SWARG_EARTH, YAW, 'swarg-earth'),
    targets: [
      { id: 'swarg-enter', at: earthAt, floor: SWARG_EARTH.y, name: 'Enter Swarga', en: 'Enter Swarga', icon: 'portal', range: 4.5 },
      { id: 'swarg-return', at: returnAt, floor: SWARG_REALM.y, name: 'Return to Earth', en: 'Return to Earth', icon: 'portal', range: 4.5 },
    ],
    earth: { position: SWARG_EARTH, yaw: YAW, arrival: worldPoint(0, 1.6, SWARG_EARTH, YAW), threshold: worldPoint(0, 0.15, SWARG_EARTH, YAW) },
    realm: { position: realmGatePosition, yaw: realmGateYaw, arrival: [-2.8, 0], arrivalY: SWARG_REALM.y - 7.5,
      threshold: worldPoint(0, 0.15, realmGatePosition, realmGateYaw) },
  };
}
export function createSwargRealmSite() {
  const gate = gateSite(realmGatePosition, realmGateYaw, 'swarg-realm-gate');
  return {
    enabled: false,
    levels(x, z, out) {
      if (!this.enabled) return;
      gate.levels(x, z, out);
      const court = x >= -18 && x < 18 && z >= -12.5 && z < 12.5;
      const stairOpening = x >= -4 && x < 18 && z >= -4.5 && z < 4.5;
      if (court && !stairOpening) out.push({ y: SWARG_REALM.y, site: 'swarg-realm-court' });
      if (x >= -4.3 && x < -1.3 && z >= -4 && z < 4) out.push({ y: SWARG_REALM.y - 7.5, site: 'swarg-realm-arrival' });
    },
  };
}
export function buildSwargReturnGate() { return buildGate(realmGatePosition, realmGateYaw, 'swarg-return-gate'); }
