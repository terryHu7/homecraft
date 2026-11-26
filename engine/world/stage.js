// A single render pass, sky and baked sun shadows.
// map (buildings never move); the player and pets carry Minecraft-style blob shadows.
import * as THREE from 'three';
import * as L from '@world/layout.js';
import { rng } from './textures.js';

export const LAYER_SHADOW_ONLY = 1;
const UP = new THREE.Vector3(0, 1, 0);

// Fill (hemisphere) colours stay close to neutral: Neutral tone mapping keeps
// saturation that ACES used to hide, so a slight green bias turned the oak
// floor olive at dawn, dusk and night. Exposure makes up the mid-tone lift
// that ACES applied.
export const MOODS = {
  dawn: {
    skyTop: 0x526779, skyHorizon: 0xd3bca0, skyBottom: 0x8eada6,
    fog: 0xabbeb5, fogNear: 70, fogFar: 250,
    sun: 0xffdcc0, sunIntensity: 1.05, sunDir: [-0.85, 0.2, 0.48],
    hemiSky: 0xbcc5c8, hemiGround: 0x908a7f, hemiIntensity: 0.95,
    exposure: 1.08, lamps: 0.75, practical: 0.6, interior: .5, night: 0.3,
  },
  morning: {
    skyTop: 0x5c96ce, skyHorizon: 0xc8dacd, skyBottom: 0x9dc6d3,
    fog: 0xb2cfcf, fogNear: 85, fogFar: 300,
    sun: 0xffe9cf, sunIntensity: 2.1, sunDir: [-0.78, 0.42, 0.47],
    hemiSky: 0xdfe2df, hemiGround: 0xa29684, hemiIntensity: 1.15,
    exposure: 1.1, lamps: 0.4, practical: 0.25, interior: .06, night: 0,
  },
  day: {
    skyTop: 0x3f86e0, skyHorizon: 0xa9d2f2, skyBottom: 0x8dbde6,
    fog: 0xa9cdee, fogNear: 90, fogFar: 320,
    sun: 0xfff0d8, sunIntensity: 2.7, sunDir: [-0.52, 0.62, 0.59],
    hemiSky: 0xe6e3da, hemiGround: 0xa8967a, hemiIntensity: 1.25,
    exposure: 1.1, lamps: 0.35, practical: 0.2, interior: .025, night: 0,
  },
  night: {
    skyTop: 0x03090c, skyHorizon: 0x102522, skyBottom: 0x060f13,
    fog: 0x0b1c18, fogNear: 60, fogFar: 200,
    sun: 0x9aa8b6, sunIntensity: 0.28, sunDir: [0.45, 0.72, -0.53],
    hemiSky: 0x87909a, hemiGround: 0x5d5a52, hemiIntensity: 0.72,
    exposure: 1.05, lamps: 0.9, practical: 0.75, interior: 1, night: 1,
  },
  dusk: {
    skyTop: 0x424a62, skyHorizon: 0xca9973, skyBottom: 0x718b88,
    fog: 0xa89e8b, fogNear: 70, fogFar: 250,
    sun: 0xffd1a0, sunIntensity: 1.2, sunDir: [0.84, 0.18, 0.51],
    hemiSky: 0xa5adb3, hemiGround: 0x867c70, hemiIntensity: 0.9,
    exposure: 1.08, lamps: 0.8, practical: 0.65, interior: .7, night: 0.4,
  },
};

// Weather arrives as a few amounts between 0 and 1 (cloud, rain, snow, fog,
// haze, wind, storm; see weather.js). Named weathers are points in that space,
// so live data can land anywhere between them. Each amount bends the hour's
// light: cloud veils, then removes, the direct sun (and with it the sun's
// shadow lookups); what falls or hangs in the air pulls the visible distance
// in; the cloud deck takes its grey from what is falling.
const CALM = { cloud: 0, rain: 0, snow: 0, fog: 0, haze: 0, wind: 0, storm: 0 };
const DECK = { grey: 0x9cafae, rain: 0x86999a, storm: 0x6c7d7d, snow: 0xb7c4c8, fog: 0xb6c4bd, haze: 0xb0ac98 };

// The cloud map: 64×64 cells of smooth noise, ranked so that a coverage of
// 0.3 clouds over 30% of the sky. Square cells, no filtering, as Minecraft.
function cloudTexture() {
  const N = 64, random = rng(1337), values = new Float32Array(N * N);
  const fade = t => t * t * (3 - 2 * t);
  const octaves = [4, 8].map((n, i) => ({ n, weight: i ? 0.15 : 0.85, grid: Float32Array.from({ length: n * n }, random) }));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (const { n, weight, grid } of octaves) {
      const fx = x * n / N, fy = y * n / N, ix = Math.floor(fx), iy = Math.floor(fy), u = fade(fx - ix), w = fade(fy - iy);
      const at = (i, j) => grid[(i % n) + (j % n) * n];
      v += weight * ((at(ix, iy) * (1 - u) + at(ix + 1, iy) * u) * (1 - w) + (at(ix, iy + 1) * (1 - u) + at(ix + 1, iy + 1) * u) * w);
    }
    values[x + y * N] = v;
  }
  // Merge tiny islands before ranking. The rendered cells stay crisp;
  // only the authored cloud silhouette becomes broader and more coherent.
  const soft = new Float32Array(N * N);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      soft[x + y * N] = values[x + y * N] * .5 + .125 * (
        values[(x + N - 1) % N + y * N] + values[(x + 1) % N + y * N]
        + values[x + ((y + N - 1) % N) * N] + values[x + ((y + 1) % N) * N]);
    }
    values.set(soft);
  }
  const data = new Uint8Array(N * N);
  [...values.keys()].sort((a, b) => values[a] - values[b]).forEach((cell, rank) => { data[cell] = Math.round(rank / (N * N - 1) * 255); });
  const texture = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  texture.name = 'clouds';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false; texture.unpackAlignment = 1; texture.needsUpdate = true;
  return texture;
}

export function detectQuality() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 820;
  const mobile = coarse || small;
  return {
    mobile,
    pixelRatio: Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.5),
    pixelBudget: mobile ? 1200000 : 3200000,
    shadowSize: mobile ? 1024 : 2048,
    maxLights: 2,
  };
}

const SKY_VERTEX = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const SKY_FRAGMENT = /* glsl */`
  uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor, uFogColor, uCloudLit, uCloudShade, uCamPos;
  uniform float uNight, uCloud, uFlash, uCover;
  uniform vec2 uCloudShift;
  uniform sampler2D uClouds;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.55, h));
    col = mix(col, uBottom, smoothstep(0.02, -0.35, h));
    // Minecraft's clouds: one flat layer of square puffs drifting with the
    // wind, 160 m up and 16 m to a cell. Coverage chooses how many cells are cloud.
    float puff = 0.0, v = 0.0;
    if (h > 0.015 && uCover > 0.0) {
      float lift = max(0.0, 160.0 - uCamPos.y), t = lift / h;
      v = texture2D(uClouds, (uCamPos.xz + d.xz * t + uCloudShift) / 1024.0).r;
      puff = step(1.0 - uCover, v) * smoothstep(0.035, 0.26, h) * exp(-t * 0.0015) * smoothstep(0.0, 16.0, lift);
    }
    float clear = (1.0 - uCloud) * (1.0 - puff);
    // A square sun or moon, as it should be in a block world, with a soft halo.
    vec3 s = normalize(uSunDir);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), s));
    vec3 up = cross(s, right);
    float facing = dot(d, s);
    vec2 q = vec2(dot(d, right), dot(d, up)) / max(facing, 0.001);
    float size = mix(0.05, 0.04, uNight);
    float disc = facing > 0.0 ? step(abs(q.x), size) * step(abs(q.y), size) : 0.0;
    float halo = pow(max(facing, 0.0), mix(24.0, 60.0, uNight));
    col += uSunColor * (halo * mix(0.35, 0.25, uNight)) * (1.0-uCloud);
    col = mix(col, uSunColor * mix(1.6, 1.25, uNight), disc * clear);
    if (uNight > 0.0) {
      vec3 cell = floor(d * 260.0);
      float star = step(0.9975, hash(cell)) * smoothstep(0.05, 0.35, h);
      col += vec3(star) * uNight * 0.9 * clear;
    }
    col = mix(col, mix(uCloudLit, uCloudShade, smoothstep(1.0 - uCover, 1.0, v) * 0.7), puff * 0.93);
    // At and below the horizon the sky is the fog, so the far edge of the
    // world, where the camera stops drawing, melts into it.
    col = mix(col, uFogColor, smoothstep(0.02, -0.03, h));
    col += vec3(0.22, 0.27, 0.28) * uFlash;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createStage(container, quality) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });
  const ratio = () => Math.min(quality.pixelRatio, Math.sqrt(quality.pixelBudget / (innerWidth * innerHeight)));
  renderer.setPixelRatio(ratio());
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Khronos PBR Neutral keeps authored colours: ACES greyed the oak floor and
  // pressed the Prada-green sofa, table and planters towards black in daylight.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 80, 220);

  // Portrait phones get a wider lens so the house is not seen through a slot.
  const lens = () => (innerHeight > innerWidth * 1.1 ? 58 : 46);
  const camera = new THREE.PerspectiveCamera(lens(), innerWidth / innerHeight, 0.1, 600);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 16, 8),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() }, uNight: { value: 0 }, uCloud: { value: 0 }, uFlash: { value: 0 },
        uFogColor: { value: new THREE.Color() }, uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() },
        uCamPos: { value: new THREE.Vector3() }, uCover: { value: 0 }, uCloudShift: { value: new THREE.Vector2() }, uClouds: { value: cloudTexture() },
      },
    }),
  );
  // Drawn after everything opaque: the depth test then skips every pixel that
  // a wall, the ground or the sea already covers, so only visible sky is shaded.
  sky.renderOrder = 100;
  sky.frustumCulled = false;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
  const sc = sun.shadow.camera;
  // The baked shadow covers the whole island: at least 104 m across, more for a bigger one.
  const span = Math.max(L.ISLAND.x1 - L.ISLAND.x0, L.ISLAND.z1 - L.ISLAND.z0), reach = Math.max(52, Math.ceil(span * 0.55));
  sc.left = -reach; sc.right = reach; sc.top = reach; sc.bottom = -reach; sc.near = 1; sc.far = Math.max(260, 120 + reach * 2);
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  sun.shadow.camera.layers.enable(LAYER_SHADOW_ONLY);
  sun.target.position.set(0, 0, 4);
  scene.add(sun, sun.target);

  // ---------- Light for the hour and the weather ----------
  // The hour and the weather each set a goal; colours and amounts glide there
  // in about two seconds, so a change in the live weather or a preview rolls in rather
  // than cuts. The sun's direction moves at once (its shadow is baked once).
  let mood = MOODS.day, moodName = 'day', practicalLights = [], weather = { ...CALM }, clearance = 0;
  let baseHemi = 1, flash = 0, settling = false, shadowDirty = false, sunSeen = true;
  // With the camera in the pool, the fog is the water: { color, near, far }.
  let submerged = null;
  const COLORS = ['top', 'horizon', 'bottom', 'fog', 'cloudLit', 'cloudShade', 'hemiSky', 'hemiGround', 'sun'];
  const AMOUNTS = { sunI: 1, hemiI: 1, near: 100, far: 100, cover: 1, veil: 1, night: 1, exposure: 1 };
  const state = () => ({ ...Object.fromEntries(COLORS.map(k => [k, new THREE.Color()])), sunI: 0, hemiI: 1, near: 80, far: 220, cover: 0, veil: 0, night: 0, exposure: 1 });
  const goal = state(), now = state();
  const deck = new THREE.Color(), tone = new THREE.Color(), dark = new THREE.Color(0x152922), white = new THREE.Color(0xffffff);
  const smooth = THREE.MathUtils.smoothstep, still = matchMedia('(prefers-reduced-motion: reduce)');
  const drift = new THREE.Vector2(0.82, 0.57).normalize();

  function retarget() {
    const m = mood, w = weather, night = m.night;
    const overcast = smooth(w.cloud, 0.55, 0.95), murk = Math.max(overcast, w.fog, w.haze * 0.75);
    deck.setHex(DECK.grey).lerp(tone.setHex(DECK.rain), w.rain).lerp(tone.setHex(DECK.storm), w.storm)
      .lerp(tone.setHex(DECK.snow), w.snow).lerp(tone.setHex(DECK.fog), w.fog).lerp(tone.setHex(DECK.haze), w.haze).lerp(dark, night);
    // Keep the warm dawn/dusk horizon beneath cloud cover.
    goal.horizon.setHex(m.skyHorizon).lerp(deck, 0.82 * murk);
    goal.top.setHex(m.skyTop).lerp(tone.copy(deck).multiplyScalar(0.7), murk);
    goal.bottom.setHex(m.skyBottom).lerp(goal.horizon, murk);
    goal.fog.setHex(m.fog).lerp(goal.horizon, murk);
    // Puffs catch the colour of the hour; a full deck takes the weather's grey.
    goal.cloudLit.setHex(m.skyHorizon).lerp(white, 0.72 * (1 - night)).lerp(tone.copy(deck).multiplyScalar(1.12), overcast);
    goal.cloudShade.copy(goal.cloudLit).multiplyScalar(0.84);
    goal.hemiSky.setHex(m.hemiSky); goal.hemiGround.setHex(m.hemiGround); goal.sun.setHex(m.sun);
    goal.sunI = m.sunIntensity * (1 - overcast) * (1 - w.fog) * (1 - 0.6 * w.haze);
    goal.hemiI = m.hemiIntensity * (1 + 0.18 * overcast) * (1 - 0.12 * w.rain - 0.12 * w.storm - 0.07 * w.fog + 0.05 * w.snow);
    const seen = 1 / (1 + 1.1 * w.rain + 2.3 * w.fog + 1.3 * w.haze + 1.1 * w.snow + 0.2 * w.storm);
    goal.near = m.fogNear * Math.pow(seen, 1.15); goal.far = m.fogFar * seen;
    goal.cover = w.cloud * (0.36 + 0.64 * smooth(w.cloud, 0.3, 0.85)); goal.veil = Math.max(overcast, w.fog); goal.night = night; goal.exposure = m.exposure;
    settling = true;
  }

  function apply() {
    const u = sky.material.uniforms;
    u.uTop.value.copy(now.top); u.uHorizon.value.copy(now.horizon); u.uBottom.value.copy(now.bottom);
    u.uFogColor.value.copy(now.fog); u.uCloudLit.value.copy(now.cloudLit); u.uCloudShade.value.copy(now.cloudShade);
    u.uSunColor.value.copy(now.sun); u.uCover.value = now.cover; u.uCloud.value = now.veil; u.uNight.value = now.night;
    scene.fog.color.copy(now.fog);
    scene.fog.near = Math.max(now.near, clearance * 1.3); scene.fog.far = Math.max(now.far, clearance * 2.8);
    if (submerged) { scene.fog.color.copy(submerged.color); scene.fog.near = submerged.near; scene.fog.far = submerged.far; }
    hemi.color.copy(now.hemiSky); hemi.groundColor.copy(now.hemiGround);
    baseHemi = now.hemiI; hemi.intensity = baseHemi + flash * 0.85;
    sun.color.copy(now.sun); sun.intensity = now.sunI;
    // Under a full deck there is no direct sun. Dropping the light also drops
    // its shadow lookups, the costliest part of a frame; both shader variants
    // are compiled while loading, so the switch costs nothing.
    const lit = now.sunI > 0.004;
    if (sun.visible !== lit) { sun.visible = lit; if (lit) shadowDirty = true; }
    renderer.toneMappingExposure = now.exposure;
    // The camera draws only as far as anyone can see through the weather
    // (under water, no further than the pool's walls).
    const far = submerged ? 40 : Math.max(90, scene.fog.far * 1.04);
    if (Math.abs(camera.far - far) > 0.5) { camera.far = far; camera.updateProjectionMatrix(); }
  }

  function update(dt) {
    const shift = sky.material.uniforms.uCloudShift.value;
    if (!still.matches) { shift.addScaledVector(drift, (1.2 + 6 * weather.wind) * dt); shift.set(shift.x % 1024, shift.y % 1024); }
    if (!settling) return;
    const k = 1 - Math.exp(-dt / 0.7);
    let left = 0;
    for (const key of COLORS) {
      const a = now[key], b = goal[key];
      left += Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
      a.lerp(b, k);
    }
    for (const key in AMOUNTS) { left += Math.abs(now[key] - goal[key]) / AMOUNTS[key]; now[key] += (goal[key] - now[key]) * k; }
    if (left < 0.002) settle(); else apply();
  }
  // Jump to the goal (on startup, before the first frame).
  function settle() {
    for (const key of COLORS) now[key].copy(goal[key]);
    for (const key in AMOUNTS) now[key] = goal[key];
    settling = false; apply();
  }

  function setMood(name, lights = practicalLights) {
    if (!MOODS[name]) return;
    const directionChanged = moodName !== name;
    moodName = name; practicalLights = lights;
    mood = MOODS[name];
    const u = sky.material.uniforms;
    u.uSunDir.value.fromArray(mood.sunDir).applyAxisAngle(UP, L.MAP_ROTATION || 0).normalize();
    sun.position.copy(sun.target.position).addScaledVector(u.uSunDir.value, 120);
    for (const light of lights) light.intensity = light.userData.base * mood.practical * (mood.night > 0 ? 1 : light.userData.day ?? 0.25);
    if (directionChanged || !sun.shadow.map) shadowDirty = true;
    retarget();
  }
  function setWeather(params) {
    weather = { ...CALM, ...params };
    retarget();
  }
  // The pool calls this every frame while the camera is under water, and with
  // null once it is out again.
  function setSubmerged(value) {
    if (!value && !submerged) return;
    submerged = value; apply();
  }
  function setLightning(value) {
    // The non-shadow-casting hemisphere light and existing sky change only
    // uniforms. A flash never invalidates the baked directional shadow map.
    flash = value;
    sky.material.uniforms.uFlash.value = value;
    hemi.intensity = baseHemi + value * .85;
  }

  function resize() {
    camera.fov = lens();
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(ratio());
    renderer.setSize(innerWidth, innerHeight);
  }

  function setPixelRatio(ratio) {
    quality.pixelRatio = ratio;
    resize();
  }

  function render() {
    sky.position.copy(camera.position);
    sky.material.uniforms.uCamPos.value.copy(camera.position);
    // three.js gathers a frame's lights after drawing its shadows, so a shadow
    // pass in the frame the sun returns would compile shaders for a sunless
    // sky. Re-bake one frame later; the sun is still near zero by then.
    if (shadowDirty && sun.visible && sunSeen) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
    renderer.render(scene, camera);
    sunSeen = sun.visible;
  }

  camera.layers.set(0);
  // While the opening shot looks down from far away, the fog starts beyond the
  // island, so a foggy or rainy hour does not open on a grey wall. It follows
  // the camera's distance, so the weather closes in as the camera comes down.
  function setClearance(distance) {
    if (Math.abs(distance - clearance) < 0.25) return;
    clearance = distance; apply();
  }

  return {
    renderer, scene, camera, sun, hemi, sky, quality, setMood, setWeather, setLightning, setClearance, setSubmerged, update, settle,
    getMood: () => mood, getMoodName: () => moodName, resize, render, setPixelRatio,
    // How much of the sun the cloud hides now, and the fog colour being headed for.
    get veil() { return now.veil; }, get fogTarget() { return goal.fog; },
    // The air's own fog and how dark the hour is; seen from under water, the
    // pool shows them through its surface while the scene's fog is the water.
    airFog: now.fog, get airNear() { return now.near; }, get airFar() { return now.far; }, get night() { return now.night; },
  };
}
