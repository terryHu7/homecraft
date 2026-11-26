import * as THREE from 'three';
import { HOUSE_SCALE, JETTY, REAR_EXTENSION, housePlan } from './layout.js';

// One shared bulb material keeps the lanterns and the baked light in sync.
const rooms = [
  ['living', -7.5, 2.63, 3.85, 5.5], ['bedroom', -7.2, 2.63, -6.35 - REAR_EXTENSION, 3.9],
  ['library', 0, 2.63, -6.35 - REAR_EXTENSION, 3.8], ['kitchen', 8.0, 2.63, -6.5 - REAR_EXTENSION, 4.2],
  ['sit-out', 0, 2.75, 7.44, 4.1], ['entry', 0, 2.62, 4.35, 3.8],
  ['courtyard-west', -7.15, 2.7, 0, 4], ['courtyard-east', 7.15, 2.7, 0, 4],
  ['courtyard-rear', 0, 2.7, housePlan.NADUMUTTAM.z0 - 0.55, 4], ['stairs', 8.65, 4.1, 0.4, 3.6],
  ['upper-living', -6.7, 6.18, 4.32, 4.6], ['study', 0, 6.18, 4.35, 4.4],
  ['gallery-west', -6.45, 6.18, 6.8, 4.2], ['gallery-east', 7.1, 6.18, 6.85, 4.1],
  ['balcony', 0, 6.18, 10.45, 4.3], ['back-door', 6.3, 2.58, -8.45 - REAR_EXTENSION, 3.8],
];

export function buildLanterns(ceilingAt, ...surfaces) {
  for (const surface of surfaces) {
    surface.traverse(object => {
      if (object.material?.isMeshStandardMaterial) object.material.userData.interiorLighting = true;
    });
  }
  const group = new THREE.Group();
  group.name = 'House and jetty lanterns';
  const brass = new THREE.MeshStandardMaterial({ color: 0x503b24, roughness: 0.48, metalness: 0.47 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xb59266, roughness: 0.35,
    emissive: 0xffae4f, emissiveIntensity: 0 });
  const jettyLights = [26.1, 29.4, 32.7, 35.9, 38.67].map((z, i) =>
    ['jetty-' + i, i % 2 ? 1.03 : -1.03, JETTY.y + 1.08, z, 4.15]);
  const lanterns = [...rooms, ...jettyLights];
  const fixtures = [], cores = [], bakes = [];
  for (const [id, localX, bulbHeight, localZ, radius] of lanterns) {
    const jetty = id.startsWith('jetty-');
    const x = jetty ? localX : localX * HOUSE_SCALE;
    const z = jetty ? localZ : localZ * HOUSE_SCALE;
    const size = jetty ? 1.11 : 1;
    const ceiling = jetty ? null : ceilingAt(x, z, bulbHeight);
    if (!jetty && ceiling === null) continue;
    const y = jetty ? bulbHeight : Math.min(bulbHeight, ceiling - 0.34);
    const stemBottom = y + 0.212;
    const stemTop = ceiling + 0.03;
    cores.push([x, y, z, 0.19 * size, 0.27 * size, 0.19 * size]);
    fixtures.push([x, y - 0.16 * size, z, 0.27 * size, 0.05, 0.27 * size]);
    fixtures.push([x, y + 0.16 * size, z, 0.28 * size, 0.06, 0.28 * size]);
    fixtures.push([x, y + 0.212 * size, z, 0.17 * size, 0.055, 0.17 * size]);
    fixtures.push(jetty
      ? [x, y - 0.40, z, 0.105, 0.43, 0.105]
      : [x, (stemBottom + stemTop) / 2, z, 0.041, stemTop - stemBottom, 0.041]);
    for (const sideX of [-1, 1]) for (const sideZ of [-1, 1]) {
      fixtures.push([x + sideX * 0.103 * size, y, z + sideZ * 0.103 * size, 0.024, 0.31 * size, 0.024]);
    }
    bakes.push({ id, position: [x, y - 0.17, z], power: jetty ? 1.75 : 2.1, radius: jetty ? radius : radius * HOUSE_SCALE,
      direction: [0, -1, 0] });
  }
  bakes.push({ id: 'study-desk', position: [-10.18 * HOUSE_SCALE, 1.56, -1.4 * HOUSE_SCALE], power: 1.7, radius: 1.45, direction: [0, -1, 0] });
  const cube = new THREE.BoxGeometry();
  const matrix = new THREE.Matrix4();
  for (const [items, material] of [[fixtures, brass], [cores, amber]]) {
    const mesh = new THREE.InstancedMesh(cube, material, items.length);
    items.forEach(([x, y, z, w, h, d], i) => {
      matrix.makeScale(w, h, d).setPosition(x, y, z);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const setBrightness = value => { amber.emissiveIntensity = value * 1.65; };
  return { group, bakes, setBrightness };
}

export function controlLanterns(stage, world) {
  let brightness = 0;
  return dt => {
    const mood = stage.getMood();
    const dimWeather = stage.airNear < mood.fogNear * 0.77;
    const target = Number(mood.night >= 0.3 || dimWeather);
    const next = THREE.MathUtils.damp(brightness, target, 7, dt);
    brightness = Math.abs(target - next) < 0.002 ? target : next;
    world.setLanternBrightness(brightness);
    world.lighting.uniforms.uInteriorBoost.value = brightness * 0.98;
  };
}
