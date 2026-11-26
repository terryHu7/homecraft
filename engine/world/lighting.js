// Static interior irradiance: bake once, then one filtered texture lookup per
// lit fragment. Adding a fitting never adds a real light or a shadow pass.
// The volume covers the world's LIGHT_VOLUME, or else the whole island at
// about a metre per texel.
import * as THREE from 'three';
import * as L from '@world/layout.js';

const RANGE = 4;
const glsl = v => v.toFixed(3);
function volumeOf(given) {
  if (given) return given;
  const B = L.ISLAND, min = [B.x0, -1, B.z0], extent = [B.x1 - B.x0, 12, B.z1 - B.z0];
  return { min, extent, size: [Math.ceil(extent[0]), 12, Math.ceil(extent[2])] };
}

const HEAD = /* glsl */`
  uniform highp sampler3D uInteriorLight;
  uniform float uInteriorBoost;
  uniform vec3 uInteriorColor;
  varying vec3 vInteriorPosition;
`;
const VERTEX = /* glsl */`
  #include <project_vertex>
  vec4 interiorPosition = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    interiorPosition = instanceMatrix * interiorPosition;
  #endif
  vInteriorPosition = (modelMatrix * interiorPosition).xyz;
`;
const fragment = (min, extent) => /* glsl */`
  #include <emissivemap_fragment>
  vec3 interiorNormal = inverseTransformDirection(normal, viewMatrix);
  // Sample on the lit side of walls/floors; solid cells carry no irradiance.
  vec3 lightUV = (vInteriorPosition + interiorNormal * 0.45 - vec3(${min.map(glsl)})) / vec3(${extent.map(glsl)});
  if (uInteriorBoost > 0.0 && all(greaterThan(lightUV, vec3(0.0))) && all(lessThan(lightUV, vec3(1.0)))) {
    vec4 field = texture(uInteriorLight, lightUV);
    // First-order directional coefficients keep tops brighter than undersides.
    vec3 direction = (field.gba - vec3(128.0 / 255.0)) * 8.0;
    float irradiance = max(0.0, field.r * 4.0 + dot(interiorNormal, direction));
    totalEmissiveRadiance += diffuseColor.rgb * uInteriorColor * irradiance * uInteriorBoost;
  }
`;

export function createInteriorLighting(grid, sources, volume = null) {
  const start = performance.now();
  const { min: MIN, extent: EXTENT, size: SIZE } = volumeOf(volume), FRAGMENT = fragment(MIN, EXTENT);
  const HOUSE = L.HOUSE;
  const [sx, sy, sz] = SIZE, data = new Uint8Array(sx * sy * sz * 4);
  const opaque = grid.types.map(t => !!t && t.kind === 'opaque' && !t.noOcclude);
  // Reuse the collision shell for occlusion. Glass transmits light; the loft,
  // roof and sealed walls block it. Furniture keeps its existing contact shade.
  const blocked = (x, y, z) => opaque[grid.get(Math.floor(x), Math.floor(y), Math.floor(z))];
  function occluded(x, y, z, dx, dy, dz, distance) {
    const steps = Math.ceil(distance / .65);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (blocked(x + dx * t, y + dy * t, z + dz * t)) return true;
    }
    return false;
  }
  const lamps = sources.map(source => ({ ...source,
    direction: source.direction ? new THREE.Vector3(...source.direction).normalize().toArray() : null,
  }));
  const encode = value => Math.max(0, Math.min(255, Math.round(128 + value * 255 / (RANGE * 2))));
  let peak = 0;
  for (let k = 0; k < sz; k++) for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) {
    const x = MIN[0] + (i + .5) * EXTENT[0] / sx;
    const y = MIN[1] + (j + .5) * EXTENT[1] / sy;
    const z = MIN[2] + (k + .5) * EXTENT[2] / sz;
    let energy = 0, vx = 0, vy = 0, vz = 0;
    if (!blocked(x, y, z)) {
      // Restrained bounced fill belongs to the house, not the night sky/sea.
      if (HOUSE && x > HOUSE.x0 && x < HOUSE.x1 && z > HOUSE.z0 && z < HOUSE.z1 && y > 0 && y < HOUSE.height) energy = .095;
      for (const lamp of lamps) {
        const dx = lamp.position[0] - x, dy = lamp.position[1] - y, dz = lamp.position[2] - z;
        const distance = Math.hypot(dx, dy, dz);
        if (distance >= lamp.radius || occluded(x, y, z, dx, dy, dz, distance)) continue;
        const inv = 1 / Math.max(distance, .1), edge = 1 - (distance / lamp.radius) ** 2;
        let amount = lamp.power * edge * edge / (1 + distance * distance * .12);
        if (lamp.direction) {
          const facing = -(dx * lamp.direction[0] + dy * lamp.direction[1] + dz * lamp.direction[2]) * inv;
          const cone = Math.max(0, Math.min(1, (facing - .05) / .8));
          amount *= .16 + .84 * cone * cone * (3 - 2 * cone);
        }
        energy += amount * .6;
        vx += amount * dx * inv * .4; vy += amount * dy * inv * .4; vz += amount * dz * inv * .4;
      }
    }
    peak = Math.max(peak, energy);
    const offset = (i + sx * (j + sy * k)) * 4;
    data[offset] = Math.round(Math.min(1, energy / RANGE) * 255);
    data[offset + 1] = encode(vx); data[offset + 2] = encode(vy); data[offset + 3] = encode(vz);
  }
  const texture = new THREE.Data3DTexture(data, sx, sy, sz);
  texture.name = 'interior-irradiance';
  texture.format = THREE.RGBAFormat; texture.type = THREE.UnsignedByteType;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false; texture.unpackAlignment = 1; texture.needsUpdate = true;
  const uniforms = {
    uInteriorLight: { value: texture }, uInteriorBoost: { value: 0 },
    uInteriorColor: { value: new THREE.Color(0xffefd9) },
  };
  const applied = new WeakSet();
  function applyMaterial(material) {
    const lit = material?.isMeshLambertMaterial || (material?.isMeshStandardMaterial && material.userData.interiorLighting);
    if (!lit || material.transparent || applied.has(material)) return;
    applied.add(material);
    const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
    material.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = 'varying vec3 vInteriorPosition;\n' + shader.vertexShader.replace('#include <project_vertex>', VERTEX);
      // Block materials already augment this chunk; retain their emissive trim.
      shader.fragmentShader = HEAD + shader.fragmentShader.replace('#include <emissivemap_fragment>', FRAGMENT);
    };
    material.customProgramCacheKey = () => `${key}-interior-irradiance-v1-${MIN.join()}-${EXTENT.join()}`;
    material.needsUpdate = true;
  }
  function apply(root) {
    root.traverse(object => {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) applyMaterial(material);
    });
  }
  return { texture, uniforms, apply, sources, stats: { sources: sources.length, bytes: data.byteLength, bakeMs: performance.now() - start, peak } };
}
