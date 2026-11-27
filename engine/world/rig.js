// Third-person camera. It orbits the player, eases after them, and lowers whichever
// walls (and the roof) stand between it and them, like a dollhouse. The opening
// shot starts on the whole island and swoops down into the house.
// V switches to first person, at eye height, the way Minecraft's F5 does.
// When the player lies still on a pool's floor, the camera sinks into their eyes
// and looks up through the water; a drag looks around, and getting up hands
// the view back.
import * as THREE from 'three';
import * as L from '@world/layout.js';

const HOUSE = L.HOUSE || null, SECRET = L.SECRET || null, LOFT = L.LOFT || null, POOL = L.POOL || null;
const inHouse = HOUSE ? (x, z) => x >= HOUSE.x0 && x < HOUSE.x1 && z >= HOUSE.z0 && z < HOUSE.z1 : () => false;
// The opening shot's start: the world's INTRO, or high over the island's corner
// (no further out than for a 120 m island, so a bigger one isn't lost in the fog).
const B = L.ISLAND, span = Math.min(120, Math.max(B.x1 - B.x0, B.z1 - B.z0)), cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
const INTRO = L.INTRO || { pos: [cx + span * .62, span * .48, cz + span * .78], portrait: [cx + span, span * .78, cz + span * 1.3], look: [cx, 0, cz] };

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const INTRO_HOLD = 1.1, INTRO_SWOOP = 2.4;

export function createRig(camera, world) {
  const target = new THREE.Vector3();
  const focus = new THREE.Vector3();
  // Portrait screens see less sideways, so start higher and look down into the
  // room; a near-level view filled the lower half of a phone with bare floor.
  const portrait = innerHeight > innerWidth * 1.1;
  const HOME_VIEW = portrait ? [0.1, 0.4, 8.5] : [0.14, 0.035, 8];
  let [yaw, pitch, distance] = HOME_VIEW;
  let yawGoal = yaw, pitchGoal = pitch, distanceGoal = distance;
  let intro = null;
  // A held shot (the mountain from over the roof): the camera glides there,
  // stays until any input, then glides back behind the player.
  let show = null;
  const look = new THREE.Vector3();
  let firstPerson = false, lookPitch = -0.12;
  let closeView = false, lensGoal = 1;
  const EYE = 1.62;
  // Looking up from the pool's floor: how far the camera has gone into their
  // eyes (0 to 1), and where it looks from there.
  let gazeT = 0, lying = false;
  const gaze = { yaw: 0, pitch: 1.2 }, gazeFrom = new THREE.Vector3(), gazeAt = new THREE.Vector3();
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const followTurn = new THREE.Quaternion(), gazeTurn = new THREE.Quaternion();

  function orbit(dx, dy) {
    if (lying) {
      gaze.yaw -= dx * 0.0042;
      gaze.pitch = THREE.MathUtils.clamp(gaze.pitch - dy * 0.0036, 0.15, 1.55);
      return;
    }
    if (firstPerson) {
      yawGoal -= dx * 0.0042;
      lookPitch = THREE.MathUtils.clamp(lookPitch - dy * 0.0036, -1.35, 1.35);
      return;
    }
    yawGoal -= dx * 0.0052;
    pitchGoal = THREE.MathUtils.clamp(pitchGoal + dy * 0.0042, -1.05, 1.38);
  }
  // Scrolling out of first person steps back behind the player.
  function zoom(f) {
    if (L.houseCutaway && firstPerson) {
      lensGoal = THREE.MathUtils.clamp(lensGoal / f, 1, 1.8);
      return;
    }
    if (firstPerson) { if (f > 1.03) setFirstPerson(false); return; }
    distanceGoal = THREE.MathUtils.clamp(distanceGoal * f, closeView ? 1.9 : 3.2, closeView ? 7 : 34);
  }

  // Entering first person looks where the player faces; leaving puts the camera behind them.
  function setFirstPerson(on, heading) {
    if (on && heading !== undefined) yaw = yawGoal = heading + Math.PI;
    if (on) lookPitch = -0.12;
    if (on !== firstPerson) lensGoal = 1;
    firstPerson = on;
  }

  function setViewMode(mode, heading) {
    setFirstPerson(mode === 'first', heading);
    if (firstPerson) return;
    closeView = mode === 'close';
    pitchGoal = closeView ? 0.16 : HOME_VIEW[1];
    distanceGoal = closeView ? 3.15 : HOME_VIEW[2];
    reach = Infinity;
  }

  // The opening shot: the whole island from high up, then a swoop down behind
  // the player, keeping any roof in place. A portrait screen stands further back so
  // the house and the mountain still fit across its narrow width.
  function startIntro(player, pos = camera.aspect < 0.8 ? INTRO.portrait : INTRO.pos, at = INTRO.look) {
    const from = { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...at) };
    intro = { t: 0, from, player };
  }
  function skipIntro() {
    if (intro) intro.t = Math.max(intro.t, INTRO_HOLD + INTRO_SWOOP / 2);
    if (show && show.back < 0) show.back = 0;
  }
  function showcase(pos, at) {
    show = { t: 0, back: -1, pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...at), from: camera.position.clone(), fromLook: focus.clone() };
  }

  function placeFollow(out) {
    const lift = L.houseCutaway && !closeView ? THREE.MathUtils.clamp((distance - HOME_VIEW[2]) * 0.018, 0, 0.35) : 0;
    const angle = Math.min(pitch + lift, 1.38);
    const cp = Math.cos(angle);
    // Shorten a downward orbit at the ground so the chosen upward sightline survives.
    const radius = angle < 0 ? Math.min(distance, Math.max(.2, focus.y - .22) / -Math.sin(angle)) : distance;
    out.set(
      focus.x + Math.sin(yaw) * cp * radius,
      Math.max(.22, focus.y + Math.sin(angle) * radius),
      focus.z + Math.cos(yaw) * cp * radius,
    );
    return out;
  }

  const followPos = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let reach = Infinity;
  // Keep the camera out of trees, walls and the mountainside: pull it in front
  // of whatever solid sits between it and the player (lowered walls and glass do not count).
  function collide(dt, out) {
    dir.subVectors(out, focus);
    const full = dir.length();
    dir.divideScalar(full);
    const hit = world.grid.raycast(focus, dir, full, (type, group) => type.kind !== 'glass' && !world.hidden.has(group));
    const slope = world.viewBlock?.(focus, dir, full) ?? Infinity;
    const block = Math.min(hit ? hit.t : Infinity, slope);
    const clearance = L.houseCutaway ? 0.15 : 0.4;
    const want = block < full ? Math.max(L.houseCutaway ? 0.08 : 1.4, block - clearance) : full;
    reach = want < reach ? want : reach + (want - reach) * (1 - Math.exp(-dt * 3));
    reach = Math.min(reach, full);
    out.copy(focus).addScaledVector(dir, reach);
  }

  function update(dt, player) {
    target.set(player.pos.x, player.y + 1.25, player.pos.z);
    if (!focus.lengthSq()) focus.copy(target);
    focus.lerp(target, 1 - Math.exp(-dt * 7));
    const k = 1 - Math.exp(-dt * 9);
    yaw += (yawGoal - yaw) * k;
    pitch += (pitchGoal - pitch) * k;
    distance += (distanceGoal - distance) * k;
    if (L.houseCutaway && camera.zoom !== lensGoal) {
      const next = camera.zoom + (lensGoal - camera.zoom) * k;
      camera.zoom = Math.abs(next - lensGoal) < 0.001 ? lensGoal : next;
      camera.updateProjectionMatrix();
    }
    placeFollow(followPos);

    if (show) {
      if (show.back < 0) {
        show.t += dt;
        const p = ease(Math.min(1, show.t / 0.9));
        camera.position.lerpVectors(show.from, show.pos, p); look.lerpVectors(show.fromLook, show.look, p);
      } else {
        show.back += dt;
        const p = ease(Math.min(1, show.back / 1.1));
        camera.position.lerpVectors(show.pos, followPos, p); look.lerpVectors(show.look, focus, p);
        if (p >= 1) { show = null; reach = Infinity; }
      }
      camera.lookAt(look);
      cutaway(player, camera.position);
      return;
    }
    if (intro) {
      intro.t += dt;
      if (intro.t < INTRO_HOLD) {
        // Briefly show the complete house before moving down into it.
        const a = intro.t * 0.05;
        camera.position.copy(intro.from.pos).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
        camera.lookAt(intro.from.look);
      } else {
        const p = ease(THREE.MathUtils.clamp((intro.t - INTRO_HOLD) / INTRO_SWOOP, 0, 1));
        const start = intro.from.pos.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), INTRO_HOLD * 0.05);
        camera.position.lerpVectors(start, followPos, p);
        const look = intro.from.look.clone().lerp(focus, p);
        camera.lookAt(look);
        if (p >= 1) intro = null;
      }
    } else if (firstPerson) {
      // Swimming, the eyes are wherever the stroke puts them, but kept out
      // of the water while the player swims on top.
      const e = player.swimming ? player.eye : null;
      camera.position.set(player.pos.x, player.y + EYE, player.pos.z);
      if (e) camera.position.set(e.x, player.swim?.surface ? Math.max(e.y, POOL.water + 0.12) : e.y, e.z);
      const cp = Math.cos(lookPitch), p = camera.position;
      camera.lookAt(p.x - Math.sin(yaw) * cp, p.y + Math.sin(lookPitch), p.z - Math.cos(yaw) * cp);
      lookUp(dt, player);
      cutaway(player, camera.position);
      return;
    } else {
      if (!L.houseCutaway) cutaway(player, followPos);
      collide(dt, followPos);
      if (player.swimming || gazeT > 0) keepOffWater(followPos);
      camera.position.copy(followPos);
      camera.lookAt(focus);
      lookUp(dt, player);
      if (L.houseCutaway) cutaway(player, camera.position);
      return;
    }
    cutaway(player, camera.position);
  }

  // Lying on the pool's floor: ease from wherever the camera was into their
  // eyes, looking up the way the camera faced; breathing lifts it a little.
  function lookUp(dt, player) {
    const now = player.gazing;
    // Up and towards the house, whose dark edge then rims the window of sky;
    // with a wall close that way, towards the most open water instead.
    if (now && !lying && gazeT === 0 && POOL) {
      const e = player.eye, room = [[0, e.z - POOL.z0], [Math.PI, POOL.z1 - e.z], [Math.PI / 2, e.x - POOL.x0], [-Math.PI / 2, POOL.x1 - e.x]];
      gaze.yaw = room[0][1] > 2.2 ? 0 : room.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      gaze.pitch = 1.15;
    }
    // Getting up, the camera comes back behind them facing where the player looked.
    if (!now && lying) yawGoal = gaze.yaw;
    lying = now;
    gazeT = still.matches ? (now ? 1 : 0) : now ? Math.min(1, gazeT + dt / 2.2) : Math.max(0, gazeT - dt / 0.9);
    // A slightly wider lens down there takes in more of the window overhead.
    // (The usual lens is the stage's: wider on portrait screens.)
    const usual = innerHeight > innerWidth * 1.1 ? 58 : 46, fov = usual + 12 * ease(gazeT);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (gazeT <= 0) return;
    const g = ease(gazeT), e = player.eye, cp = Math.cos(gaze.pitch);
    gazeFrom.copy(camera.position); followTurn.copy(camera.quaternion);
    gazeAt.set(e.x, e.y + Math.sin(performance.now() / 1000 * 1.3) * 0.012, e.z);
    camera.position.copy(gazeAt);
    camera.lookAt(gazeAt.x - Math.sin(gaze.yaw) * cp, gazeAt.y + Math.sin(gaze.pitch), gazeAt.z - Math.cos(gaze.yaw) * cp);
    gazeTurn.copy(camera.quaternion);
    camera.position.lerpVectors(gazeFrom, gazeAt, g);
    camera.quaternion.slerpQuaternions(followTurn, gazeTurn, g);
  }

  // The camera never sits in the water's surface, nor in the ground beside
  // the pool when it follows the player down into it.
  function keepOffWater(p) {
    if (!POOL) return;
    if (p.x > POOL.x0 && p.x < POOL.x1 && p.z > POOL.z0 && p.z < POOL.z1) {
      const d = p.y - POOL.water;
      if (Math.abs(d) < 0.16) p.y = POOL.water + (d >= 0 ? 0.16 : -0.16);
      p.y = Math.max(p.y, POOL.bed + 0.15);
    } else if (p.y < 0.25 && p.x > POOL.x0 - 3 && p.x < POOL.x1 + 3 && p.z > POOL.z0 - 3 && p.z < POOL.z1 + 3) p.y = 0.25;
  }

  // Lower the shell between the camera and the player.
  function cutaway(player, c) {
    if (!HOUSE) return;
    const p = player.pos;
    if (L.houseCutaway) {
      if (!firstPerson && !intro && L.houseCutaway(player, c, world)) {
        world.setHidden('roof', world.roofBlocksView(focus, c));
        return;
      }
      for (const group of ['roof', 'wallS', 'wallN', 'wallE', 'wallW']) world.setHidden(group, false);
      return;
    }
    // Keep the house whole in the aerial view; use the normal interior
    // cutaway once the camera has descended below the roof.
    if (intro && c.y >= HOUSE.height - 0.4) {
      for (const g of ['roof', 'wallS', 'wallN', 'wallE', 'wallW', 'secretTop']) world.setHidden(g, false);
      return;
    }
    // Flying above the roof counts as outside, so the roof stays on.
    const inside = player.y < HOUSE.height - 0.5 && (inHouse(p.x, p.z) || (p.x >= HOUSE.x0 - 1 && p.x < HOUSE.x1 + 1 && p.z >= HOUSE.z0 - 1 && p.z < HOUSE.z1 + 1 && player.y > 0.5));
    const camInside = inHouse(c.x, c.z) && c.y < HOUSE.height - 0.4;
    world.setHidden('roof', inside && !camInside);
    world.setHidden('wallS', inside && c.z > HOUSE.z1 + 0.5);
    world.setHidden('wallN', inside && c.z < HOUSE.z0 - 0.5);
    world.setHidden('wallE', inside && c.x > HOUSE.x1 + 0.5);
    world.setHidden('wallW', inside && c.x < HOUSE.x0 - 0.5);
    const inSecret = !!SECRET && p.x >= SECRET.x0 && p.x < SECRET.x1 && p.z >= SECRET.z0 && p.z < SECRET.z1 && player.y > LOFT.y - 1 && player.y < HOUSE.height - 0.5;
    world.setHidden('secretTop', inSecret);
  }

  return {
    update, orbit, zoom, startIntro, skipIntro, setFirstPerson, setViewMode, showcase,
    recenter(player, faceStation = false) {
      intro = null; gazeT = 0; lying = false;
      focus.set(player.pos.x, player.y + 1.25, player.pos.z);
      reach = Infinity;
      if (firstPerson) setFirstPerson(true, player.heading);
      else if (faceStation) yaw = yawGoal = player.heading + Math.PI;
      update(1 / 60, player);
    },
    get yaw() { return yaw; },
    get firstPerson() { return firstPerson; },
    get viewMode() { return firstPerson ? 'first' : closeView ? 'close' : 'follow'; },
    // Looking up through the player's eyes from the pool's floor (wholly or easing in).
    get gazing() { return gazeT > 0; }, get gazeAmount() { return gazeT; },
    get introActive() { return !!intro; },
    get showcaseActive() { return !!show && show.back < 0; },
    get distance() { return distance; },
    reset() { [yawGoal, pitchGoal, distanceGoal] = HOME_VIEW; },
    set(y, p, d) { yaw = yawGoal = y; pitch = pitchGoal = p; distance = distanceGoal = d; },
  };
}
