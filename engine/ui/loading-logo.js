// The startup mark is a rigid 3D grass block, not a projected logo. Only the
// camera moves: a one-shot reveal flows into a slow free orbit with a gentle
// breathing drift, continuing until loading finishes.
import * as THREE from 'three';

const DEFAULTS = {
  duration: 1.8,
  orbitSpeed: 4.5,
  finalYaw: 45,
  finalElevation: 25.5,
  startFov: 28,
  finalFov: 32,
  startDistance: 3.45,
  endDistance: 3.65,
  dolly: 0.1,
  relief: 1,
  grassBrightness: 1,
  dirtBrightness: 1,
};

// RGB samples from the two visible dirt faces in assets/homecraft-logo.png.
// Sampling separates the surface colours from the reference camera; the
// geometry, grass relief and hidden faces below are actual 3D construction.
const DIRT_FRONT = 'cZ00Lj8RlKhJkqVIfJE+MTsTanwzKzYQU2wnRl4iSmIjUm4pQ14fjrJDlrhEmblHeKA3MT4SobRToLNRm6xPUV4kmaxNN0MWeJhAZIc0YIEwbI83YIIuT2okmrlJm7tIUHElVngojJBNZnQzbns1maxKprlTQkoaXTsmbJM6a443dJg6cpo6cZY3akApYj0lX4grZI8wc0YutMVjsMBiVEYmMxsOZz8qgk4zVzYhTTAfUTIfVTUiWDYihlE1jFQ3apUzb5w2gEwyWjgkVzcjZD8pXzwmhE8zhFA0Zz8qXzwmYz8pYz4pYz4okVc5kFg6b0IrdUgvhVA0XzwmYD8qe3BreGxmiVE1iVM3v4VXvH1QvYBRaUEsYj0qkVk7fE00gk40iFI1jlU5Yj4oYT4reW1neG5qcUUubEItv4JUv4NTwYVWaD8rZj4qeUozdkkxXjolb0QsdUgwYDsnZD8pZj8sZj8qcUYwcEQvwoZWyIxduX5TpGlFmmA9yIxayIpYYzsobEErb0QunWE/nGA/a0ItaEArckYwcEUunWA/nmI/omZAnWI/l107xYhYwoZVWDYkbUEpc0Yum18+nWI/bkQuaEArd0kybUItmmRCeUoykVk5mmA/jlg4xotcxIpZw4ZWyIxZxotZnWM/m2A+w4dXwYdXwodWv4VVe0szlV0+omZDmF4+l108qmxFqGtFx4pYyI1byI5coGVAp2lDxIlZxIlYyI5dwIdYgU41ll49pGlFoGNAe001l149kVk7d0gvll08qGpEXTomWDgkomRBpmlFo2ZBo2dCgk83fk40ekwzYz0oZkAqk1w9j1c6eUkvgU81gVA3u31Ss3RMpGhEpmtFp2tFpWpFg1A3fEwzfk00fU41dUgxiVQ6j1k7dUcugE4zg1A1uHtRtXhOpWlEpWpEVzYjVjYkVzckkFo9kFo7j1k7dUgwdkkwdUgxc0cxeUsygk80pGpFnGI/nGA/nmNAWTgkWTUkVDUig1A4fk4zekoydEcwdEcvdUgx';
const DIRT_RIGHT = 'UGUnKTQSOkUbPUkdLDkVMj0WSVomRVYjSVonIiwQKDQTHScNS1smRVQjGh4MIywOUGQmKjQTN0UbO0MdNkUcP0wfUmQtTF0pTmIqKTUUKRcOGxEKVGUsT18pLjsYOkYdLzkUOkYbRFQhLxwSIxULTVsoQUwgQU0jKzYVNEEaMh0TKhkPXm8zU2QrKSUSLSoUR1olRlkkS18nQDk0MSEYWWowU2MtVmYuOUccPEsdNyEVNiEVLxwSLRwTOCEWNCAULBoQKhkQODItQTo1PSogOCEUNyAUNSAUMTsWQ1QiSjAfTDEfPyUZNiAWSC0eSi4ePSQWOSEVQz44Qzs3PyshPSUYPiQXPyYYPUgdR1wmTTEfUjMhQCgaPCUYSy8fTS4eYDwmYDwmTzMhTS4eXjomYj0nd0szdEcwPyUXOSEVZD8paD8rXzwoXTwnXDsnVjcjZD4nYj4oUTMgTzAgYDsmYz4od0szeU0zQCYYPiQXaD8qZj8qXjsnXzwnYD4pXDklRSsbQykaNiAUOiIXXDglYj4oXzwnXjwmVTYjTjEfaUErZ0ArQikZRSscQykaQCgaRiwdRSwcOCIWOSIWWTcjYT4nXzwmXzwnTjEgTTEgbEMsbEIsRSscSC0cRiscRCobRisdRyseOyMWOiMXSS4eSi4dSCwdSS4dWE9LWU9KQSgaQyoaSC0dRSwdeU01dk01b0QtckcvOyMXOiIWRywdSS0eSCweSC4eV09KVk5KRiwdSy8eSC4dRSwdd001cEgxb0YudEkwTS8gTzIhUjQhaEEsc0YucEYvVjYkUjUkUjMiSi4eSCwcRy0deU41c0ozbUcwYj4rUDMiUzMiVTQjaEErbUQtcUYvVjclUDMhTzIhTDEgSy8fSS4eSzAfSCsdPycaPygaSS4eSS0eVzYkVTYjWjklXjwnVjYlUTQjTzMiOSIWOCEWNiAVSjAgRysdQCcaPycZRiseSC0eVDYkUzUiWTckVzUkUjIjSy4gTDEgOCIXNSAWNiEWSiwfSise';

// Top-face colour samples, back row first. The height map is independent:
// colour is not being used to fake the relief.
const TOP_COLOURS = [
  '#4f632b', '#253010', '#485a2a', '#293510', '#435628', '#596d31', '#637a38', '#3e5023',
  '#576e2e', '#4e622d', '#4d642c', '#253010', '#455926', '#5a7132', '#5f7737', '#3f5125',
  '#79953e', '#546a2d', '#5a7132', '#263211', '#2a3715', '#5b7332', '#5b7332', '#465827',
  '#3f4f21', '#3b4a21', '#52692f', '#293510', '#415425', '#5e7630', '#5e7735', '#85a04d',
  '#5e7534', '#455827', '#5b7334', '#27330f', '#405324', '#6a8737', '#688537', '#789643',
  '#6d8b3b', '#52672f', '#566e2f', '#496123', '#435727', '#445828', '#556b30', '#759342',
  '#688634', '#5e7831', '#5d7633', '#2b3912', '#445827', '#4c612b', '#728f40', '#849f4a',
  '#92b047', '#a4c052', '#94b44c', '#3a4716', '#526b2d', '#546c2e', '#8fac4e', '#95b253',
];
const HEIGHTS = [
  [1, 1, 1, 2, 2, 1, 1, 1],
  [0, 1, 1, 2, 1, 1, 2, 1],
  [1, 1, 2, 2, 1, 0, 1, 1],
  [1, 2, 2, 1, 1, 2, 2, 1],
  [2, 2, 1, 0, 1, 2, 1, 2],
  [2, 1, 1, 2, 2, 1, 1, 2],
  [1, 1, 2, 2, 1, 2, 2, 1],
  [1, 1, 1, 2, 2, 1, 1, 1],
];
const CURTAINS = {
  front: [0.72, 0.91, 0.80, 0.90, 0.73, 0.88, 0.69, 0.91],
  right: [0.90, 0.75, 0.89, 0.71, 0.91, 0.82, 0.74, 0.90],
  back: [0.88, 0.77, 0.91, 0.75, 0.86, 0.78, 0.90, 0.76],
  left: [0.78, 0.91, 0.73, 0.88, 0.76, 0.91, 0.79, 0.87],
};

const clamp01 = value => Math.max(0, Math.min(1, value));
const smoother = value => {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const lerp = (a, b, t) => a + (b - a) * t;

function dirtTexture(encoded) {
  const rgb = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  const rgba = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < 16 * 16; i++) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(rgba, 16, 16, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = true;
  texture.needsUpdate = true;
  return texture;
}

function dirtMaterial(texture, brightness, tint = 0xffffff) {
  return new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(tint).multiplyScalar(brightness) });
}

// Merge all grass columns into one geometry. Every column is a solid cuboid;
// its top and exposed risers remain fixed relative to every other part.
function grassGeometry(options) {
  const base = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const p = base.getAttribute('position'), n = base.getAttribute('normal');
  const positions = [], normals = [], colours = [];
  const colour = new THREE.Color();
  function box(x0, x1, z0, z1, y0, y1, topHex) {
    const top = new THREE.Color(topHex).multiplyScalar(options.grassBrightness);
    for (let i = 0; i < p.count; i++) {
      positions.push(
        lerp(x0, x1, p.getX(i) + 0.5),
        lerp(y0, y1, p.getY(i) + 0.5),
        lerp(z0, z1, p.getZ(i) + 0.5),
      );
      const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
      normals.push(nx, ny, nz);
      colour.copy(top);
      if (ny < 0.5) {
        // The source has a lit front/left face and a darker right face. These
        // fixed colours preserve that lighting without moving lights or meshes.
        const shade = nz > 0.5 ? 0.9 : nx > 0.5 ? 0.62 : nx < -0.5 ? 0.76 : 0.7;
        const vertical = 0.88 + 0.12 * (p.getY(i) + 0.5);
        colour.multiplyScalar(shade * vertical);
      }
      colours.push(colour.r, colour.g, colour.b);
    }
  }
  const size = 1.06 / 8;
  for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) {
    const x0 = -0.53 + x * size, z0 = -0.53 + z * size;
    const top = 1.075 + HEIGHTS[z][x] * 0.025 * options.relief;
    let bottom = 1;
    if (z === 7) bottom = Math.min(bottom, CURTAINS.front[x]);
    if (x === 7) bottom = Math.min(bottom, CURTAINS.right[z]);
    if (z === 0) bottom = Math.min(bottom, CURTAINS.back[x]);
    if (x === 0) bottom = Math.min(bottom, CURTAINS.left[z]);
    box(x0, x0 + size, z0, z0 + size, bottom, top, TOP_COLOURS[z * 8 + x]);
  }
  base.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildBlock(options) {
  const root = new THREE.Group();
  root.name = 'Homecraft rigid grass block';
  const front = dirtTexture(DIRT_FRONT), right = dirtTexture(DIRT_RIGHT);
  const dirt = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [
    dirtMaterial(right, options.dirtBrightness),
    dirtMaterial(front, options.dirtBrightness * 0.72, 0xd6d6d6),
    new THREE.MeshBasicMaterial({ color: '#435426' }),
    dirtMaterial(front, options.dirtBrightness * 0.48),
    dirtMaterial(front, options.dirtBrightness),
    dirtMaterial(right, options.dirtBrightness * 0.72, 0xd6d6d6),
  ]);
  dirt.position.y = 0.5;
  dirt.name = 'Pixel dirt cube';
  root.add(dirt);
  const grass = new THREE.Mesh(grassGeometry(options), new THREE.MeshBasicMaterial({ vertexColors: true }));
  grass.name = 'Stepped grass top and four solid curtains';
  root.add(grass);
  return root;
}

// Final camera settings for the one-shot reveal and the free orbit.
export function createLoadingLogo(host) {
  const options = DEFAULTS;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(options.startFov, 1, 0.1, 30);
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.replaceChildren(renderer.domElement);

  let model = null, frame = 0, disposed = false, ready = Promise.resolve(), settle = null;
  let lastProgress = 0, lastOrbitSeconds = 0;
  const target = new THREE.Vector3(0, 0.57, 0);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function cameraAt(progress, orbitSeconds = 0) {
    const orbit = smoother(progress);
    const lift = smoother((progress - 0.06) / 0.94);
    const finalYaw = THREE.MathUtils.degToRad(options.finalYaw);
    const speed = THREE.MathUtils.degToRad(options.orbitSpeed);
    // Match the reveal's angular velocity to the free orbit at the handoff.
    // The logo angle is still reached exactly at `duration`; there is no pause,
    // reverse, or camera cut before the ongoing orbit.
    const handoff = speed * options.duration / 3;
    const yaw = orbitSeconds > 0
      ? finalYaw + speed * orbitSeconds
      : (finalYaw - handoff) * orbit + handoff * clamp01(progress) ** 3;
    let elevation = THREE.MathUtils.degToRad(options.finalElevation) * lift;
    let distance = lerp(options.startDistance, options.endDistance, orbit) + Math.sin(Math.PI * orbit) * options.dolly;
    // A slow breathing drift keeps a long load from feeling mechanical. It is
    // camera-only, starts smoothly after the reveal, and stays within 1.4° and
    // 0.05 block lengths, so the block never appears to wobble.
    if (orbitSeconds > 0) {
      const drift = smoother(orbitSeconds / 1.6);
      elevation += THREE.MathUtils.degToRad(1.4) * Math.sin(orbitSeconds * Math.PI * 2 / 13) * drift;
      distance += 0.05 * Math.sin(orbitSeconds * Math.PI * 2 / 9 + 1.6) * drift;
    }
    const fov = lerp(options.startFov, options.finalFov, orbit);
    const horizontal = Math.cos(elevation) * distance;
    camera.position.set(
      Math.sin(yaw) * horizontal,
      target.y + Math.sin(elevation) * distance,
      Math.cos(yaw) * horizontal,
    );
    camera.fov = fov;
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    lastProgress = clamp01(progress);
    lastOrbitSeconds = orbitSeconds;
  }

  function renderAt(progress, orbitSeconds = 0) {
    cameraAt(progress, orbitSeconds);
    renderer.render(scene, camera);
  }

  function resize() {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    renderAt(lastProgress, lastOrbitSeconds);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  function disposeModel() {
    if (!model) return;
    scene.remove(model);
    const textures = new Set();
    model.traverse(object => {
      object.geometry?.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material) continue;
        if (material.map) textures.add(material.map);
        material.dispose();
      }
    });
    for (const texture of textures) texture.dispose();
    model = null;
  }

  function start() {
    cancelAnimationFrame(frame);
    settle?.();
    disposeModel();
    model = buildBlock(options);
    scene.add(model);
    // No transforms are assigned to the model here or in the animation loop.
    ready = new Promise(resolve => { settle = resolve; });
    if (reducedMotion) {
      frame = 0;
      renderAt(1);
      settle?.(); settle = null;
      return;
    }
    const started = performance.now();
    renderAt(0);
    function tick(now) {
      if (disposed) return;
      const seconds = (now - started) / 1000;
      const progress = clamp01(seconds / options.duration);
      renderAt(progress, Math.max(0, seconds - options.duration));
      if (progress >= 1 && settle) { settle(); settle = null; }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }

  start();
  resize();

  return {
    get ready() { return ready; },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      settle?.();
      settle = null;
      disposeModel();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

let active = null;
const initialHost = document.querySelector('#loading [data-loading-logo]');
if (initialHost && location.protocol !== 'file:' && !new URLSearchParams(location.search).has('plain')) {
  try { active = createLoadingLogo(initialHost); }
  catch { initialHost.remove(); }
}

export function loadingLogoReady() {
  return active?.ready || Promise.resolve();
}

export function disposeLoadingLogo() {
  active?.dispose();
  active = null;
}
