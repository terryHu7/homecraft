// Weather you can see from where you stand. Rain and snow are one box of
// particles that travels with the camera, so a downpour costs the same couple
// of thousand streaks wherever the player is (in a house, on the beach, up a
// mountain, in the air), and nothing is spent on rain nobody can see. Further
// off, rain is only fog, which is how it looks at that distance anyway.
//
// A top-down height map, the shelter map, records the highest surface in each
// metre. Drops stop on roofs, tree crowns and the mountain; splashes land on
// whatever is highest; and the block shader reads the same map, so only
// surfaces under open sky turn wet or white.
import * as THREE from 'three';
import * as L from '@world/layout.js';
import { rng } from './textures.js';

// One texel a metre over the world (its SHELTER, or the island with a margin),
// heights in quarter metres from -2 m. Everything beyond is open sea.
const POOL = L.POOL;
const SHELTER = { floor: -2, steps: 4, ...(L.SHELTER || { x0: L.ISLAND.x0 - 8, z0: L.ISLAND.z0 - 8, w: L.ISLAND.x1 - L.ISLAND.x0 + 16, d: L.ISLAND.z1 - L.ISLAND.z0 + 16 }) };
const SEA = -1.08;

export function buildShelter(grid, ground, roofTopAt) {
  const { x0, z0, w, d, floor, steps } = SHELTER;
  const heights = new Float32Array(w * d), data = new Uint8Array(w * d);
  const [gx, gy, gz] = grid.min, [sx, sy, sz] = grid.size;
  for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
    const x = x0 + i, z = z0 + j;
    let top = SEA;
    // Glass and leaves shelter too.
    if (x >= gx && x < gx + sx && z >= gz && z < gz + sz) {
      for (let y = gy + sy - 1; y >= gy; y--) if (grid.get(x, y, z)) { top = y + 1; break; }
    }
    top = Math.max(top, ground.topAt(x + 0.5, z + 0.5)?.y ?? SEA);
    if (roofTopAt) top = Math.max(top, roofTopAt(x + 0.5, z + 0.5));
    if (POOL && x >= POOL.x0 && x < POOL.x1 && z >= POOL.z0 && z < POOL.z1) top = Math.max(top, POOL.water);
    heights[i + j * w] = top;
    data[i + j * w] = Math.max(0, Math.min(255, Math.round((top - floor) * steps)));
  }
  const texture = new THREE.DataTexture(data, w, d, THREE.RedFormat, THREE.UnsignedByteType);
  texture.name = 'shelter';
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false; texture.unpackAlignment = 1; texture.needsUpdate = true;
  return {
    texture, box: new THREE.Vector4(x0, z0, 1 / w, 1 / d),
    topAt(x, z) { const i = Math.floor(x - x0), j = Math.floor(z - z0); return i < 0 || j < 0 || i >= w || j >= d ? SEA : heights[i + j * w]; },
  };
}

// ---------- Rain, splashes and snow ----------
// Each particle is a seed; the vertex shader moves it with the wind and wraps
// it into the box around the camera. Streaks narrower than a pixel are widened
// to one pixel and faded instead, so distant rain neither flickers nor vanishes.
const FIELD_VERTEX = /* glsl */`
  uniform vec3 uCenter, uBox, uOffset, uCam, uDir;
  uniform float uTime, uSize, uLen, uPixel, uAlpha, uSplash;
  uniform sampler2D uShelter;
  uniform vec4 uShelterBox;
  attribute vec4 aSeed;
  attribute float aKind;
  varying vec2 vUv;
  varying float vAlpha, vLife, vSplash;
  float shelterTop(vec2 xz) { return texture2D(uShelter, (xz - uShelterBox.xy) * uShelterBox.zw).r * 63.75 - 2.0; }
  vec3 wrapped(vec3 p) { vec3 o = uCenter - 0.5 * uBox; return o + mod(p - o, uBox); }
  void main() {
    vec2 corner = position.xy;
    float alpha = uAlpha;
    vec3 p, pos;
    vUv = corner; vLife = 0.0; vSplash = 0.0;
    #ifdef SNOW
      p = wrapped(aSeed.xyz * uBox + uOffset);
      p.x += sin(uTime * 0.5 + aSeed.w * 37.0) * 0.45;
      p.z += sin(uTime * 0.3 + aSeed.x * 53.0) * 0.45;
      if (p.y < shelterTop(p.xz)) alpha = 0.0;
    #else
      if (aKind > 0.5) {
        // Every seventh seed is a splash: a few droplets hop up where rain lands.
        float cycle = uTime / (0.42 + 0.3 * aSeed.z) + aSeed.w * 13.0, n = floor(cycle);
        vLife = fract(cycle); vSplash = 1.0;
        vec2 jitter = fract(sin(vec2(n * 12.9898 + aSeed.x * 78.233, n * 39.425 + aSeed.y * 11.135)) * 43758.5453);
        vec3 o = uCenter - 0.5 * uBox;
        vec2 xz = o.xz + mod(fract(aSeed.xy + jitter) * uBox.xz - o.xz, uBox.xz);
        p = vec3(xz.x, shelterTop(xz) + 0.01, xz.y);
        alpha = 0.6 * uSplash * (1.0 - vLife * vLife) * (1.0 - smoothstep(12.0, 22.0, length(p - uCam)));
      } else {
        p = wrapped(aSeed.xyz * uBox + uOffset);
        if (p.y < shelterTop(p.xz)) alpha = 0.0;
      }
    #endif
    vec3 rel = abs(p - uCenter) / (0.5 * uBox);
    alpha *= (1.0 - smoothstep(0.72, 1.0, max(rel.x, rel.z))) * (1.0 - smoothstep(0.8, 1.0, rel.y));
    alpha *= smoothstep(1.0, 3.0, length(p - uCam));
    if (alpha < 0.004) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; return; }
    vec4 view = viewMatrix * vec4(p, 1.0);
    float pixel = max(-view.z, 0.1) * uPixel;
    #ifdef SNOW
      float size = uSize * (0.6 + 0.8 * aSeed.z), s = max(size, pixel * 1.6);
      alpha *= size / s;
      vUv = corner * vec2(1.0, 2.0) - vec2(0.0, 1.0);
      view.xy += vUv * 0.5 * s;
      gl_Position = projectionMatrix * view;
    #else
      if (vSplash > 0.5) {
        vec3 look = p - uCam, right = normalize(vec3(-look.z, 0.0, look.x));
        pos = p + right * corner.x * 0.16 + vec3(0.0, corner.y * 0.24, 0.0);
      } else {
        float width = max(uSize, pixel * 1.25);
        alpha *= uSize / width;
        vec3 tail = p - uDir * uLen * (0.8 + 0.4 * aSeed.w), side = normalize(cross(uDir, p - uCam));
        pos = mix(tail, p, corner.y) + side * corner.x * 0.5 * width;
      }
      gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
    #endif
    vAlpha = alpha;
  }
`;

const FIELD_FRAGMENT = /* glsl */`
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vAlpha, vLife, vSplash;
  void main() {
    float a = vAlpha;
    #ifdef SNOW
      a *= smoothstep(1.0, 0.25, length(vUv));
    #else
      if (vSplash > 0.5) {
        // Three square droplets on little arcs, as Minecraft's rain splashes.
        float drop = 0.0;
        for (int k = 0; k < 3; k++) {
          float s = float(k) - 1.0;
          vec2 c = vec2(s * 0.8 * vLife, (0.18 + 0.5 * (1.0 - 0.45 * abs(s))) * sin(3.1416 * vLife));
          vec2 q = abs(vUv - c) / vec2(0.15, 0.1);
          drop = max(drop, step(max(q.x, q.y), 1.0));
        }
        a *= drop;
      } else a *= (1.0 - abs(vUv.x)) * mix(0.15, 1.0, vUv.y);
    #endif
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

function createField(count, snow, common) {
  const random = rng(snow ? 6284 : 2815);
  const seeds = new Float32Array(count * 4), kinds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 4; k++) seeds[i * 4 + k] = random();
    kinds[i] = !snow && i % 7 === 6 ? 1 : 0;
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geometry.setAttribute('aKind', new THREE.InstancedBufferAttribute(kinds, 1));
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const material = new THREE.ShaderMaterial({
    name: snow ? 'snow' : 'rain', defines: snow ? { SNOW: '' } : {},
    uniforms: { ...common, uBox: { value: new THREE.Vector3() }, uOffset: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, -1, 0) },
      uSize: { value: snow ? 0.075 : 0.014 }, uLen: { value: 0.7 }, uAlpha: { value: 0 }, uSplash: { value: 0 }, uColor: { value: new THREE.Color() } },
    vertexShader: FIELD_VERTEX, fragmentShader: FIELD_FRAGMENT, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = material.name; mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.visible = false;
  return { mesh, count, box: material.uniforms.uBox.value, offset: material.uniforms.uOffset.value };
}

// ---------- Lightning ----------
// A forked ribbon facing the camera, rebuilt for each strike somewhere around
// the player, out of reach of the light it throws: the sky and the fill light flash,
// and the baked shadow map is never touched.
const BOLT_POINTS = [26, 10, 10];
function createBolt() {
  const total = BOLT_POINTS.reduce((a, b) => a + b, 0);
  const position = new Float32Array(total * 2 * 3), edge = new Float32Array(total * 2), glow = new Float32Array(total * 2), index = [];
  let at = 0;
  for (const n of BOLT_POINTS) {
    for (let i = 0; i < n; i++) { edge[(at + i) * 2] = -1; edge[(at + i) * 2 + 1] = 1; }
    for (let i = 0; i < n - 1; i++) { const a = (at + i) * 2; index.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    at += n;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
  geometry.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(index);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const material = new THREE.ShaderMaterial({
    name: 'lightning', uniforms: { uFlash: { value: 0 } }, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`attribute float aEdge, aGlow; varying float vEdge, vGlow;
      void main() { vEdge = aEdge; vGlow = aGlow; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`uniform float uFlash; varying float vEdge, vGlow;
      void main() { float core = 1.0 - abs(vEdge); gl_FragColor = vec4(vec3(0.86, 0.9, 1.0) * core * core * vGlow * uFlash, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'lightning'; mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.visible = false;
  const right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  // A channel from the cloud base down to the ground, with two forks.
  function shape(random, camera, x, z, ground) {
    right.set(z - camera.position.z, 0, camera.position.x - x).normalize();
    const strips = [], main = [];
    let lateral = 0;
    for (let i = 0; i < BOLT_POINTS[0]; i++) {
      const t = i / (BOLT_POINTS[0] - 1);
      if (i) lateral += (random() - 0.5) * 7;
      main.push([lateral, 78 + (ground - 78) * t, 1.2 - 0.6 * t, 1]);
    }
    strips.push(main);
    for (let b = 1; b < BOLT_POINTS.length; b++) {
      const from = main[4 + Math.floor(random() * 10)], side = random() < 0.5 ? -1 : 1, fork = [];
      let [u, y] = from;
      for (let i = 0; i < BOLT_POINTS[b]; i++) {
        fork.push([u, y, 0.5 * (1 - i / BOLT_POINTS[b]), 0.7 * (1 - i / BOLT_POINTS[b])]);
        u += side * (1.2 + random() * 2.6); y -= 2.2 + random() * 2.4;
      }
      strips.push(fork);
    }
    let v = 0;
    for (const strip of strips) for (let i = 0; i < strip.length; i++) {
      const [u, y, width, light] = strip[i], prev = strip[Math.max(0, i - 1)], next = strip[Math.min(strip.length - 1, i + 1)];
      // The ribbon's width runs across the channel, within the plane facing the camera.
      const du = next[0] - prev[0], dy = next[1] - prev[1], len = Math.hypot(du, dy) || 1;
      const nu = -dy / len * width / 2, ny = du / len * width / 2;
      for (const s of [-1, 1]) {
        position[v * 3] = x + right.x * (u + s * nu); position[v * 3 + 1] = y + s * ny; position[v * 3 + 2] = z + right.z * (u + s * nu);
        glow[v] = light; v++;
      }
    }
    geometry.attributes.position.needsUpdate = true; geometry.attributes.aGlow.needsUpdate = true;
  }
  return { mesh, material, shape, up };
}

// ---------- Putting it together ----------
const CALM = { cloud: 0, rain: 0, snow: 0, fog: 0, haze: 0, wind: 0, storm: 0 };
const WIND = new THREE.Vector2(0.82, 0.57).normalize();
const wrap = (v, size) => ((v % size) + size) % size;

export function createWeatherFx({ stage, world, quality, sound }) {
  const shelter = buildShelter(world.grid, world.ground, world.roofTopAt);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const common = {
    uCenter: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() },
    uTime: { value: 0 }, uPixel: { value: 0.001 }, uShelter: { value: shelter.texture }, uShelterBox: { value: shelter.box },
  };
  const rain = createField(quality.mobile ? 840 : 1820, false, common);
  const snow = createField(quality.mobile ? 700 : 1500, true, common);
  rain.box.set(30, 18, 30); snow.box.set(26, 16, 26);
  const bolt = createBolt();
  stage.scene.add(rain.mesh, snow.mesh, bolt.mesh);

  // Wet ground and settling snow, read by every block surface.
  const blocks = world.materials.uniforms;
  blocks.uShelter.value = shelter.texture; blocks.uShelterBox.value = shelter.box;
  blocks.uSkyTint.value = stage.sky.material.uniforms.uFogColor.value;

  const random = rng(951), look = new THREE.Vector3(), velocity = new THREE.Vector3(), white = new THREE.Color(0.75, 0.82, 0.86);
  let target = { ...CALM }, now = { ...CALM }, wet = 0, cover = 0, time = 0, veil = -1;
  let strikeIn = 1.6, flashAge = -1;

  function setWeather(params) {
    target = { ...CALM, ...params };
    if (!(target.storm > 0)) { flashAge = -1; bolt.mesh.visible = false; stage.setLightning(0); }
    else if (!(now.storm > 0.05)) strikeIn = 1.6;
  }

  function strike(camera) {
    // Mostly somewhere ahead, where it can be seen, and inside the visible distance.
    const a = Math.atan2(look.z, look.x) + (random() - 0.5) * 0.9, distance = Math.min(145, (0.55 + 0.4 * random()) * camera.far);
    const x = camera.position.x + Math.cos(a) * distance, z = camera.position.z + Math.sin(a) * distance;
    bolt.shape(random, camera, x, z, shelter.topAt(x, z));
    flashAge = 0;
    strikeIn = (8 + random() * 12) / Math.max(0.35, now.storm);
    sound?.play('thunder', 1.1 - distance / 300, distance / 343);
  }
  // A return stroke flickers: a flash, a dip, a second flash, then a fade.
  const flicker = t => (t < 0.05 ? 1 : t < 0.09 ? 0.25 : t < 0.16 ? 0.85 : Math.max(0, 0.85 * (1 - (t - 0.16) / 0.4)));

  function layer(field, amount, dt, camera, { fall, drift, alpha }) {
    const on = amount > 0.002 && !reduced.matches;
    field.mesh.visible = on;
    if (!on) { field.mesh.geometry.instanceCount = 0; return; }
    field.mesh.geometry.instanceCount = Math.ceil(field.count * Math.min(1, amount));
    velocity.set(WIND.x * drift, -fall, WIND.y * drift);
    const u = field.mesh.material.uniforms, o = field.offset;
    o.set(wrap(o.x + velocity.x * dt, field.box.x), wrap(o.y + velocity.y * dt, field.box.y), wrap(o.z + velocity.z * dt, field.box.z));
    u.uDir.value.copy(velocity).normalize();
    u.uAlpha.value = alpha;
  }

  function update(dt, camera, focus = camera.position) {
    // Amounts glide towards the new weather; ground wets fast and dries slowly.
    const k = 1 - Math.exp(-dt / 0.8);
    for (const key in now) now[key] += (target[key] - now[key]) * k;
    const wetGoal = target.rain > 0.01 ? Math.min(1, 0.45 + target.rain) : 0;
    wet += (wetGoal - wet) * (1 - Math.exp(-dt / (wetGoal > wet ? 2.5 : 9)));
    const coverGoal = target.snow > 0.01 ? Math.min(1, 0.35 + target.snow) : 0;
    cover += (coverGoal - cover) * (1 - Math.exp(-dt / (coverGoal > cover ? 5 : 8)));
    blocks.uWet.value = wet < 0.003 ? 0 : wet; blocks.uSnow.value = cover < 0.003 ? 0 : cover;

    world.coast.follow(camera);
    if (Math.abs(stage.veil - veil) > 0.002) { veil = stage.veil; world.coast.setWeather(veil); }

    time = (time + dt) % (Math.PI * 20);
    camera.getWorldDirection(look);
    common.uTime.value = time;
    common.uCam.value.copy(camera.position);
    common.uPixel.value = 2 / (camera.projectionMatrix.elements[5] * Math.max(1, stage.renderer.domElement.height));
    // The box sits between the camera and the player and a little ahead, where the eye is.
    common.uCenter.value.lerpVectors(camera.position, focus, 0.55);
    common.uCenter.value.x += look.x * 4; common.uCenter.value.y += 1.5; common.uCenter.value.z += look.z * 4;

    // Light the drops by the light they fall through.
    const light = THREE.MathUtils.clamp(stage.hemi.intensity / 1.25, 0.2, 1.1), fog = stage.scene.fog.color;
    const rainU = rain.mesh.material.uniforms, snowU = snow.mesh.material.uniforms;
    rainU.uColor.value.copy(fog).lerp(white, 0.45).multiplyScalar(0.55 + 0.45 * light);
    snowU.uColor.value.setRGB(0.92, 0.94, 0.96).multiplyScalar(0.35 + 0.65 * light);
    rainU.uLen.value = 0.55 + 0.35 * now.rain;
    rainU.uSplash.value = Math.min(1, now.rain * 1.2);
    layer(snow, now.snow, dt, camera, { fall: 1.15, drift: now.wind * 1.6, alpha: 0.9 });
    layer(rain, now.rain, dt, camera, { fall: 9 + 2 * now.storm, drift: now.wind * 5, alpha: 0.4 + 0.3 * now.rain });

    if (reduced.matches || target.storm <= 0) {
      if (flashAge >= 0) { flashAge = -1; bolt.mesh.visible = false; stage.setLightning(0); }
      return;
    }
    strikeIn -= dt;
    if (strikeIn <= 0 && flashAge < 0) strike(camera);
    if (flashAge >= 0) {
      flashAge += dt;
      const s = flicker(flashAge);
      stage.setLightning(s * 0.65); bolt.material.uniforms.uFlash.value = s; bolt.mesh.visible = s > 0.01;
      if (flashAge >= 0.6) { flashAge = -1; bolt.mesh.visible = false; stage.setLightning(0); }
    }
  }

  // Jump straight to the current weather (at startup), skipping the glide.
  function settle() {
    now = { ...target };
    wet = target.rain > 0.01 ? Math.min(1, 0.45 + target.rain) : 0;
    cover = target.snow > 0.01 ? Math.min(1, 0.35 + target.snow) : 0;
    update(0, stage.camera);
  }

  return {
    shelter, rain: rain.mesh, snow: snow.mesh, lightning: bolt.mesh, setWeather, update, settle,
    get rainIntensity() { return now.rain; },
    get state() { return { ...now, wet, cover }; },
    // Draw every layer once under the loading screen so no weather choice
    // compiles a shader or uploads a buffer later.
    warmup(on) {
      for (const field of [rain, snow]) { field.mesh.visible = on; field.mesh.geometry.instanceCount = on ? field.count : 0; }
      if (on) bolt.shape(random, stage.camera, 0, -400, 0);
      bolt.mesh.visible = on;
      if (!on) settle();
    },
  };
}
