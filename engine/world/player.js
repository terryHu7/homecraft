// Walking, running, jumping, flying and routes. Every station opens a detail page via F.
// On foot the player follows the walk grid, or the ground outside it (a
// shore pier and the mountain behind the house); the surfaces hand over where
// they meet. Space
// jumps; a double tap starts or ends flight, as in Minecraft: Space climbs,
// Ctrl descends and Shift goes faster. Tapping somewhere the player cannot walk to
// flies them there and lands them. Flight checks the house's blocks and
// everything outside, so the player cannot pass through walls, rock or the mountain; from
// inside the house the player leaves by the front doors.
//
// The pool is for swimming. Walking into it from the deck dives in; a tap on
// the water walks to the nearest side first. In the water WASD swim, Shift
// swims the crawl, Space rises and Ctrl dives. Pushing against a side with a
// deck behind it (or the ladder) climbs out.
import * as THREE from 'three';
import * as L from '@world/layout.js';
import { SWIM_PIVOT } from './avatar.js';

const WALK = 3.6, RUN = 6.2, FLY = 8.5, FLY_FAST = 16, CLIMB = 6, JUMP = 6.4, GRAVITY = 19, RADIUS = 0.3, SEA = -0.9;
// What the world has: stations, a spawn point, and optionally a house (left
// and entered by its front door when flying) and a pool to swim in.
const STATIONS = L.STATIONS || [], SPAWN = L.SPAWN || { x: 0, z: 0, heading: Math.PI }, ISLAND = L.ISLAND;
const HOUSE = L.HOUSE || null, POOL = L.POOL || null;
const POOL_LADDER = L.POOL_LADDER || { x0: Infinity, x1: -Infinity, z: 0 };
const inHouse = HOUSE ? (x, z) => x >= HOUSE.x0 && x < HOUSE.x1 && z >= HOUSE.z0 && z < HOUSE.z1 : () => false;
const inPool = POOL ? (x, z) => x >= POOL.x0 && x < POOL.x1 && z >= POOL.z0 && z < POOL.z1 : () => false;
const DOORWAY = L.DOORWAY || [];
const EXIT = L.EXIT || (HOUSE && { x: (HOUSE.x0 + HOUSE.x1) / 2, z: HOUSE.z1 + 2.5 });

// In the water the body is placed by its middle (`c`), pitched and rolled
// about it. Water is slow to start and stop. Without input the player floats back
// up, unless the player has settled on the bottom: there the player turns over and lies
// looking up, until something moves them.
const SWIM = 1.7, SWIM_FAST = 2.9, RISE = 1.5, SINK = 1.6, FLOAT = 0.5, EDGE = 0.4, WATER = POOL ? POOL.water : -1, PIVOT = SWIM_PIVOT;
// At the surface: upright, the chin is at the water; leaning into a stroke,
// the back comes up to just under it.
const surfaceLevel = pitch => Math.min(WATER - 0.18, WATER + 0.15 - 0.575 * Math.cos(pitch));
// The lowest the middle can go: lying flat on the floor, or standing on it.
const bedLevel = pitch => POOL.bed + 0.24 + 0.76 * Math.pow(Math.abs(Math.cos(pitch)), 1.3);
const smooth = t => t * t * (3 - 2 * t);

export function createPlayer({ avatar, nav, grid = null, ground = null, onArrive, onWater }) {
  ground?.setNav(nav);
  const pos = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
  let heading = SPAWN.heading, y = 0, vy = 0, speed = 0;
  let path = null, goal = null, then = null, rush = false, through = false;
  // `island` names the outside surface underfoot (null on the house's grid);
  // `level` is the height of whatever the player is standing on.
  let mode = 'ground', island = null, level = 0, pilot = null, standing = null;
  const velocity = new THREE.Vector3();
  const solidAt = (x, y, z) => !!grid?.type(x, y, z);
  // A web-zip, Spider-Man style: a web shoots from their hand to the point
  // aimed at, then pulls them along a rising arc to where the player lands. The web is
  // one stretched box, shown only while it is out.
  let zip = null, ladder = null;
  const web = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xf2f4f6, transparent: true, opacity: 0.92 }));
  web.name = 'web'; web.visible = false; web.frustumCulled = false;
  const handAt = new THREE.Vector3(), anchorAt = new THREE.Vector3();
  // In the pool: the body's middle, its drift, pitch and roll, and whether
  // it is resting on the bottom (`rest`), lying there (`lie`, eased), heading
  // down or up on its own (`dive`, `rise`), or in a dive or a climb (`anim`).
  let swim = null, flewOut = 0;
  const eye = new THREE.Vector3(), mouth = new THREE.Vector3(), bodyTurn = new THREE.Euler(0, 0, 0, 'XYZ'), up = new THREE.Vector3(0, 1, 0);
  const swimInfo = { x: 0, z: 0, c: 0, speed: 0, surface: false };

  // One step on foot. Stepping from the house's grid onto something outside
  // it (the pier, a bridge) hands over to that, and back again.
  function stepBy(dx, dz, guide = null) {
    const tx = pos.x + dx, tz = pos.z + dz;
    if (island) {
      const reference = guide?.route ? { ...standing, route: guide.route, index: guide.index, y: level, expectedY: guide.y, guided: true } : standing;
      const here = ground.move(pos, dx, dz, level, reference);
      standing = here; level = here.y; island = here.site;
      return;
    }
    const out = ground?.canStand(tx, tz, level);
    if (out && (!nav.canStand(tx, tz, level) || out.y > nav.heightAt(tx, tz) + 0.02)) {
      pos.x = tx; pos.z = tz; island = out.site; level = out.y; standing = out;
      return;
    }
    nav.move(pos, dx, dz); level = nav.heightAt(pos.x, pos.z); standing = null;
  }

  // What is below (x, z) at or under height `top`: the floor to fly over, and
  // whether the player could land on it (outside ground, or the walkable grid).
  function floorBelow(x, z, top) {
    let best = { y: SEA, island: null, landable: false };
    const bx = Math.floor(x), bz = Math.floor(z);
    if (!grid || solidAt(bx, -1, bz)) best = { y: 0, island: null, landable: false };
    const raised = nav.heightAt(x, z);
    if (raised > 0.05 && raised <= top + 0.01 && (!grid || solidAt(bx, Math.floor(raised + 0.01) - 1, bz))) best = { y: raised, island: null, landable: false };
    const g = ground?.topAt(x, z, top);
    if (g && g.y >= best.y) best = { y: g.y, island: g.site, landable: false };
    best.landable = best.island ? !!ground.canStand(x, z, best.y) : best.y > SEA && nav.canStand(x, z) && Math.abs(nav.heightAt(x, z) - best.y) < 0.3;
    return best;
  }
  // Would a body at (x, feet, z) overlap a block of the house or anything outside?
  function blocked(x, feet, z) {
    for (const h of [0.15, 0.95, 1.7]) for (const [ox, oz] of [[0, 0], [RADIUS, 0], [-RADIUS, 0], [0, RADIUS], [0, -RADIUS]]) {
      if (solidAt(Math.floor(x + ox), Math.floor(feet + h), Math.floor(z + oz))) return true;
    }
    return !!ground?.collides(x, feet, z);
  }
  // Is there a clear drop from the feet straight down to `to`?
  function clearDrop(to) {
    for (let cy = Math.floor(y - 0.01); cy >= Math.floor(to + 0.01); cy--) if (solidAt(Math.floor(pos.x), cy, Math.floor(pos.z))) return false;
    return true;
  }

  function cancel() { path = null; goal = null; then = null; rush = false; through = false; }
  function goTo(x, z, station = null) {
    if (mode !== 'ground') return false;
    if (island && nav.canStand(pos.x, pos.z, level) && nav.canStand(x, z)) {
      const found = nav.findPath(pos, { x, z });
      if (found) { island = null; standing = null; level = nav.heightAt(pos.x, pos.z); path = found; goal = station; return true; }
    }
    if (island) {
      const top = ground.topAt(x, z), stand = top && ground.nearestStand(x, z, top.y);
      if (!stand) return false;
      path = [stand]; goal = station; return true;
    }
    const found = nav.findPath(pos, { x, z });
    if (!found) return false;
    path = found; goal = station; return true;
  }
  // Walk a line of points (the mountain road), first walking on the house's
  // grid to `via` when the player is not on the mountain yet. Climbs run.
  function follow(points, via = null, after = null) {
    if (!['ground', 'ladder'].includes(mode) || !points.length) return false;
    if (via && !island) {
      if (!goTo(via.x, via.z)) return false;
      then = () => { path = points.slice(); rush = true; then = after; };
      return true;
    }
    cancel(); path = points.slice(); rush = true; then = after;
    return true;
  }
  // Walk straight through what the walkable grid keeps people out of: a
  // portal's light, on the way into it or out of it. `look` is the point to
  // face at the end.
  function walkThrough(points, after = null, look = null) {
    if (mode !== 'ground' || island || !points.length) return false;
    cancel(); path = points.slice(); then = after; goal = look ? { look } : null; through = true;
    return true;
  }
  function visit(id) { const s = STATIONS.find(s => s.id === id); return s ? goTo(...s.at, s) : false; }
  function settle() { velocity.set(0, 0, 0); vy = 0; speed = 0; pilot = null; zip = null; ladder = null; web.visible = false; standing = null; swim = null; flewOut = 0; }
  function teleport(x, z, station = null) {
    cancel(); settle();
    const stand = nav.nearestStand(x, z);
    if (!stand || !nav.canStand(stand.x, stand.z)) return false;
    pos.set(stand.x, 0, stand.z); mode = 'ground'; island = null;
    y = level = nav.heightAt(pos.x, pos.z);
    if (station?.look) heading = Math.atan2(station.look[0] - pos.x, station.look[1] - pos.z);
    place(0);
    return true;
  }
  function arrive() {
    const s = goal, next = then; path = null; goal = null; then = null; rush = false; through = false;
    if (s?.look) heading = Math.atan2(s.look[0] - pos.x, s.look[1] - pos.z);
    if (s) onArrive?.(s);
    next?.();
  }

  function jump() {
    if (mode !== 'ground') return;
    mode = 'air'; vy = JUMP;
  }
  function startFlying() {
    if (mode === 'fly') return;
    const fromWater = leaveWater(0.7);
    cancel(); ladder = null; mode = 'fly'; island = null; standing = null; velocity.set(0, 0, 0); vy = 0; zip = null; web.visible = false;
    // Out of the pool in a burst, so the player does not drop straight back in.
    if (fromWater) { velocity.y = CLIMB; flewOut = 0.8; }
  }

  // ---------- In the pool ----------
  // A point on the player's body, given as an offset from its middle when standing
  // upright and facing +z, where it is now in the water.
  function onBody(out, bx, by, bz) {
    bodyTurn.set(swim.pitch, swim.roll, 0);
    out.set(bx, by, bz).applyEuler(bodyTurn).applyAxisAngle(up, heading);
    return out.set(out.x + pos.x, out.y + swim.c, out.z + pos.z);
  }
  // Into the water with the body's middle at height c (above the surface the player
  // falls in first, with a splash).
  function intoWater(c, fall = 0) {
    ladder = null; pilot = null; zip = null; web.visible = false; island = null; standing = null;
    mode = 'swim'; velocity.set(0, 0, 0); vy = 0; speed = 0;
    swim = { c, vx: 0, vy: fall, vz: 0, pitch: 0, roll: 0, lie: 0, rest: false, dive: false, rise: false, still: 0, push: 0, breath: 2.5, anim: null, wet: c < WATER + 0.5 };
    y = c - PIVOT;
  }
  // Leaving the water any way but climbing out (flying, a web): a splash.
  function leaveWater(power) {
    if (mode !== 'swim') return false;
    onWater?.('splash', pos.x, WATER, pos.z, power);
    y = swim.c - PIVOT; swim = null;
    return true;
  }
  // The body stays a little clear of the walls, and of the ladder's rungs.
  function inPoolBounds(x, z, c = WATER) {
    x = Math.min(POOL.x1 - EDGE, Math.max(POOL.x0 + EDGE, x));
    z = Math.min(POOL.z1 - EDGE, Math.max(POOL.z0 + EDGE, z));
    if (c > -1.9 && x > POOL_LADDER.x0 - 0.3 && x < POOL_LADDER.x1 + 0.3) z = Math.max(z, POOL_LADDER.z + 0.32);
    return { x, z };
  }
  // A way out over the side at (x, z) on the wall's line, facing out along
  // (ox, oz): where the hands go and where the player stands, or null where there is
  // no deck (the sea side). Near the ladder the player goes up it, between its rails.
  function exitAt(x, z, ox, oz) {
    if (oz < 0 && x > POOL_LADDER.x0 - 0.45 && x < POOL_LADDER.x1 + 0.45) {
      const mid = (POOL_LADDER.x0 + POOL_LADDER.x1) / 2, out = { x: mid, z: POOL.z0 - 0.9 };
      return nav.canStand(out.x, out.z) ? { edge: { x: mid, z: POOL_LADDER.z - 0.05 }, out, ox, oz } : null;
    }
    const out = { x: x + ox * 0.55, z: z + oz * 0.55 };
    return nav.canStand(out.x, out.z) ? { edge: { x: x - ox * 0.25, z: z - oz * 0.25 }, out, ox, oz } : null;
  }
  // Pushing against a side: the way out there, if there is one.
  function wallExit(dx, dz) {
    const ladderSide = pos.x > POOL_LADDER.x0 - 0.3 && pos.x < POOL_LADDER.x1 + 0.3;
    const north = (ladderSide ? POOL_LADDER.z + 0.32 : POOL.z0 + EDGE) + 0.06;
    if (dz < -0.5 && pos.z < north) return exitAt(pos.x, POOL.z0, 0, -1);
    if (dx < -0.5 && pos.x < POOL.x0 + EDGE + 0.06) return exitAt(POOL.x0, pos.z, -1, 0);
    if (dx > 0.5 && pos.x > POOL.x1 - EDGE - 0.06) return exitAt(POOL.x1, pos.z, 1, 0);
    return null;
  }

  // From the deck, a running dive: up, over and head first into the water.
  function diveIn(nx, nz) {
    const from = { x: pos.x, z: pos.z, c: y + PIVOT }, to = inPoolBounds(pos.x + nx * 1.9, pos.z + nz * 1.9);
    intoWater(from.c);
    swim.wet = false;
    swim.anim = { kind: 'in', t: 0, T: 0.72, from, to, nx, nz };
    heading = Math.atan2(nx, nz);
  }
  // From the air: straight down into the water where the player is.
  function dropIn() { intoWater(y + PIVOT, Math.min(-1.5, velocity.y)); swim.wet = false; flewOut = 0; }
  function climbOut(exit, after = null) {
    cancel();
    const depth = Math.max(0, surfaceLevel(0.3) - swim.c);
    swim.anim = { kind: 'out', t: 0, T: 0.9 + depth * 0.45, from: { x: pos.x, z: pos.z, c: swim.c, pitch: swim.pitch, roll: swim.roll }, exit, after };
    swim.rest = swim.dive = swim.rise = false;
    heading = Math.atan2(exit.ox, exit.oz);
  }

  // Walking to the nearest side, diving in and swimming to (x, z).
  function enterPool(x, z) {
    if (mode !== 'ground' || island) return false;
    const along = (v, lo, hi) => Math.min(hi - 0.6, Math.max(lo + 0.6, v));
    const north = { x: along(x, POOL.x0, POOL.x1), z: POOL.z0 - 0.55, nx: 0, nz: 1 };
    // Not off the ladder: beside it.
    if (north.x > POOL_LADDER.x0 - 0.6 && north.x < POOL_LADDER.x1 + 0.6) north.x = north.x < (POOL_LADDER.x0 + POOL_LADDER.x1) / 2 ? POOL_LADDER.x0 - 0.6 : POOL_LADDER.x1 + 0.6;
    const sides = [north, { x: POOL.x0 - 0.55, z: along(z, POOL.z0, POOL.z1), nx: 1, nz: 0 }, { x: POOL.x1 + 0.55, z: along(z, POOL.z0, POOL.z1), nx: -1, nz: 0 }];
    const cost = s => Math.hypot(s.x - pos.x, s.z - pos.z) + 1.5 * Math.hypot(s.x - x, s.z - z);
    const target = inPoolBounds(x, z);
    for (const side of sides.filter(s => nav.canStand(s.x, s.z)).sort((a, b) => cost(a) - cost(b))) {
      if (!goTo(side.x, side.z)) continue;
      then = () => { diveIn(side.nx, side.nz); path = [target]; };
      return true;
    }
    return false;
  }
  function swimTo(x, z) {
    if (mode !== 'swim' || swim.anim) return false;
    cancel(); swim.rest = swim.dive = false;
    path = [inPoolBounds(x, z, swim.c)];
    return true;
  }
  // Out of the water towards (x, z): swim to the side nearest the way,
  // climb out, then carry on with `after`.
  function leavePool(x, z, after = null) {
    if (mode !== 'swim' || swim.anim) return false;
    const along = (v, lo, hi) => Math.min(hi - 0.5, Math.max(lo + 0.5, v));
    const exits = [exitAt(along(x, POOL.x0, POOL.x1), POOL.z0, 0, -1), exitAt(POOL.x0, along(z, POOL.z0, POOL.z1), -1, 0), exitAt(POOL.x1, along(z, POOL.z0, POOL.z1), 1, 0)].filter(Boolean);
    const cost = e => Math.hypot(e.edge.x - pos.x, e.edge.z - pos.z) + Math.hypot(e.out.x - x, e.out.z - z);
    const exit = exits.sort((a, b) => cost(a) - cost(b))[0];
    if (!exit) return false;
    cancel(); swim.rest = swim.dive = false; swim.rise = true;
    path = [inPoolBounds(exit.edge.x, exit.edge.z, WATER)];
    then = () => climbOut(exit, after);
    return true;
  }
  // The dive button: down to the bottom (to lie there), or back up.
  function toggleDive() {
    if (mode !== 'swim' || swim.anim) return false;
    cancel();
    if (swim.rest || swim.dive) { swim.rest = swim.dive = false; swim.rise = true; return true; }
    swim.dive = true; swim.rise = false;
    // Down into open water, clear of the walls, so there is sky to look up at.
    const to = { x: Math.min(POOL.x1 - 2, Math.max(POOL.x0 + 2, pos.x)), z: Math.min(POOL.z1 - 2.2, Math.max(POOL.z0 + 2.2, pos.z)) };
    if (Math.hypot(to.x - pos.x, to.z - pos.z) > 0.3) path = [to];
    return true;
  }

  // The dive in and the climb out, played through.
  function animateSwim(dt) {
    const s = swim, a = s.anim, u = Math.min(1, (a.t += dt) / a.T);
    if (a.kind === 'in') {
      const e = 1 - (1 - u) * (1 - u), end = WATER - 1.05;
      pos.x = a.from.x + (a.to.x - a.from.x) * e; pos.z = a.from.z + (a.to.z - a.from.z) * e;
      s.c = a.from.c + (end - a.from.c) * u + 5 * u * (1 - u);
      s.pitch = THREE.MathUtils.smoothstep(u, 0.08, 0.8) * (Math.PI / 2 + 0.6);
      if (!s.wet && s.c < WATER + 0.35) { s.wet = true; onWater?.('splash', pos.x, WATER, pos.z, 1); }
      if (u >= 1) { s.anim = null; s.wet = true; s.vy = -1.1; s.vx = a.nx * 1.3; s.vz = a.nz * 1.3; }
    } else {
      // Up to the lip with the hands on the coping, then over onto the deck.
      const { from, exit } = a, lip = WATER + 0.62, rise = smooth(Math.min(1, u / 0.5)), over = smooth(Math.max(0, (u - 0.5) / 0.5));
      pos.x = from.x + (exit.edge.x - from.x) * rise + (exit.out.x - exit.edge.x) * over;
      pos.z = from.z + (exit.edge.z - from.z) * rise + (exit.out.z - exit.edge.z) * over;
      s.c = u < 0.5 ? from.c + (lip - from.c) * rise : lip + (PIVOT - lip) * over;
      s.pitch = u < 0.5 ? from.pitch + (0.3 - from.pitch) * rise : 0.3 * (1 - over);
      s.roll = from.roll * (1 - rise); s.lie = 0;
      if (!a.dripped && u > 0.45) { a.dripped = true; onWater?.('climb', exit.edge.x, WATER, exit.edge.z, 0.45); }
      if (u >= 1) {
        pos.x = exit.out.x; pos.z = exit.out.z;
        mode = 'ground'; island = null; standing = null; swim = null; y = level = 0;
        a.after?.();
        return;
      }
    }
    y = s.c - PIVOT;
  }

  function swimming(dt, input, cameraYaw) {
    const s = swim;
    if (s.anim) return animateSwim(dt);
    // Dropping in from the air: fall until the water takes them.
    if (!s.wet) {
      s.vy -= GRAVITY * dt; s.c += s.vy * dt;
      if (s.c < WATER + 0.5) { s.wet = true; onWater?.('splash', pos.x, WATER, pos.z, Math.min(1.2, 0.4 - s.vy / 9)); s.vy *= 0.3; }
      y = s.c - PIVOT;
      return;
    }
    let dx = 0, dz = 0;
    const manual = Math.hypot(input.x, input.z) > 0.08;
    if (manual) {
      if (path) cancel();
      ({ x: dx, z: dz } = steer(input, cameraYaw));
    } else if (path?.length) {
      const next = path[0], x = next.x - pos.x, z = next.z - pos.z, d = Math.hypot(x, z);
      if (d > 0.12) { const k = Math.min(1, d) / d; dx = x * k; dz = z * k; }
      else { path.shift(); if (!path.length) arrive(); if (mode !== 'swim' || s.anim) return; }
    }
    const want = Math.hypot(dx, dz), fast = input.run || (rush && !!path);
    if (want > 0.05 || input.up) { s.rest = false; s.still = 0; }
    if (input.up) s.dive = false;
    if (input.down) s.rise = false;
    const top = fast ? SWIM_FAST : SWIM, ease = 1 - Math.exp(-dt * 2.4);
    s.vx += (dx * top - s.vx) * ease; s.vz += (dz * top - s.vz) * ease;

    // Up and down: rising, diving, floating back up, or staying put on the bottom.
    const surface = surfaceLevel(s.pitch), bed = bedLevel(s.pitch);
    const rise = input.up || s.rise ? RISE : input.down || s.dive ? -SINK : !s.rest && s.c < surface - 0.02 ? FLOAT : 0;
    s.vy += (rise - s.vy) * (1 - Math.exp(-dt * 3));
    s.c += s.vy * dt;
    if (s.c > surface) { s.c += (surface - s.c) * (1 - Math.exp(-dt * 4)); s.vy = Math.min(s.vy, 0); s.rise = false; }
    if (s.c < bed) { s.c += (bed - s.c) * (1 - Math.exp(-dt * 10)); s.vy = Math.max(s.vy, 0); }
    // Resting, the player settles onto the floor as the player turns over onto their back.
    else if (s.rest) s.c += (bed - s.c) * (1 - Math.exp(-dt * 1.5));
    // Still on the bottom for a moment, the player settles there and turns over.
    if (s.c < bed + 0.06 && want < 0.05 && !input.up && !s.rise) { if ((s.still += dt) > 0.5) { s.rest = true; s.dive = false; } }
    else if (!s.rest) s.still = 0;
    s.lie += ((s.rest ? 1 : 0) - s.lie) * (1 - Math.exp(-dt * 1.4));

    const to = inPoolBounds(pos.x + s.vx * dt, pos.z + s.vz * dt, s.c);
    if (Math.abs(to.x - pos.x - s.vx * dt) > 1e-4) s.vx = 0;
    if (Math.abs(to.z - pos.z - s.vz * dt) > 1e-4) s.vz = 0;
    pos.x = to.x; pos.z = to.z;
    // Pushing against a side at the surface climbs out there.
    if (manual && s.c > surface - 0.25) {
      const exit = wallExit(dx, dz);
      if (exit && (s.push += dt) > 0.18) { climbOut(exit); y = s.c - PIVOT; return; }
      if (!exit) s.push = 0;
    } else s.push = 0;

    // The body follows the stroke: upright treading water, leaning into a
    // stroke at the surface, head first along the way the player swims under it.
    const sp = Math.hypot(s.vx, s.vz), atTop = s.c > surface - 0.15;
    const pitchGoal = s.rest ? Math.PI / 2
      : atTop ? (sp > 0.35 ? (sp > SWIM * 1.15 ? 1.42 : 1.12) : 0.2)
      : sp > 0.35 ? Math.PI / 2 - Math.atan2(s.vy, sp) * 0.8
      : s.vy < -0.3 ? Math.PI / 2 + 0.95 : s.vy > 0.3 ? 0.2 : 0.35;
    s.pitch += (pitchGoal - s.pitch) * (1 - Math.exp(-dt * 2.6));
    s.roll += ((s.rest ? Math.PI : 0) - s.roll) * (1 - Math.exp(-dt * 1.6));
    if (sp > 0.25 && !s.rest) turnTowards(s.vx, s.vz, dt * 0.45);

    // Under water, a breath goes out now and then, slowly while lying still.
    y = s.c - PIVOT;
    onBody(eye, 0, 0.575, 0.25);
    if (eye.y < WATER - 0.05) {
      if ((s.breath -= dt) <= 0) {
        // Lying still, the breath shows a little way above the face, rising
        // away from their eyes rather than across them.
        if (s.rest) onBody(mouth, 0, 0.5, 0.6); else onBody(mouth, 0, 0.43, 0.26);
        onWater?.('exhale', mouth.x, mouth.y, mouth.z);
        s.breath = s.rest ? 4.5 + Math.random() * 3 : 2.5 + Math.random() * 2;
      }
    } else s.breath = 1.2;
  }
  // Zip to a place the player can stand ({ x, y, z, island, anchor, normal }), as in
  // the Spider-Man games: pulled straight along the web towards the anchor,
  // then, letting go, up and over onto their feet. A ledge (a wall's face) ends
  // with their hands at the anchor and a vault over the top; a floor or a top
  // ends just above it and a short drop.
  function zipTo(target) {
    if (mode === 'zip') return false;
    leaveWater(0.6);
    // The previous support belongs to the departure point, not the landing.
    cancel(); standing = null; ladder = null; pilot = null; velocity.set(0, 0, 0); vy = 0;
    const a = target.anchor, n = target.normal || [0, 1, 0], ledge = Math.abs(n[1]) < 0.5;
    const end = ledge ? { x: a.x + n[0] * 0.45, y: a.y - 1.7, z: a.z + n[2] * 0.45 }
      : { x: target.x, y: target.y + (target.y > y + 0.5 ? 0.8 : 0.05), z: target.z };
    const d = Math.hypot(end.x - pos.x, end.y - y, end.z - pos.z);
    zip = { from: { x: pos.x, y, z: pos.z }, end, to: target, t: -0.1, pull: THREE.MathUtils.clamp(d / 34, 0.22, 1.6), hop: ledge ? 0.34 : 0.14, peak: Math.max(target.y, a.y) + 1, ledge, released: false };
    anchorAt.set(a.x, a.y, a.z);
    mode = 'zip'; heading = Math.atan2(end.x - pos.x, end.z - pos.z);
    return true;
  }
  function zipping(dt) {
    zip.t += dt;
    if (zip.t <= 0) return;
    const { from, end, to } = zip;
    if (zip.t < zip.pull) {
      // Fastest at the start, easing in at the end.
      const u = zip.t / zip.pull, e = 1 - (1 - u) * (1 - u);
      pos.x = from.x + (end.x - from.x) * e; pos.z = from.z + (end.z - from.z) * e; y = from.y + (end.y - from.y) * e;
      return;
    }
    zip.released = true; web.visible = false;
    const u = Math.min(1, (zip.t - zip.pull) / zip.hop);
    if (zip.ledge) {
      // Up past the edge first, then over and down onto the top.
      const across = THREE.MathUtils.smoothstep(u, 0.35, 0.9);
      pos.x = end.x + (to.x - end.x) * across; pos.z = end.z + (to.z - end.z) * across;
      y = u < 0.6 ? end.y + (zip.peak - end.y) * Math.sin((u / 0.6) * Math.PI / 2) : zip.peak + (to.y - zip.peak) * ((u - 0.6) / 0.4) ** 2;
    } else {
      pos.x = end.x + (to.x - end.x) * u; pos.z = end.z + (to.z - end.z) * u; y = end.y + (to.y - end.y) * u * u;
    }
    if (u >= 1) { mode = 'ground'; island = to.island; y = level = to.y; zip = null; }
  }
  // The web runs from their hand to the anchor; for the first instant it is
  // still shooting out.
  function drawWeb() {
    if (!zip || zip.released) return;
    avatar.hand.getWorldPosition(handAt);
    const reach = zip.t < 0 ? 1 + zip.t / 0.1 : 1;
    const end = handAt.clone().lerp(anchorAt, Math.max(0.02, reach)), length = handAt.distanceTo(end);
    web.position.copy(handAt).add(end).multiplyScalar(0.5);
    web.lookAt(end); web.scale.set(0.028, 0.028, Math.max(0.01, length));
    web.visible = length > 0.05;
  }

  // Ending flight drops the player onto whatever is below if they can stand there.
  // Over the sea or a roof the player flies to the nearest place to stand and lands:
  // the closest point of the home island, a floating island or a peak.
  function stopFlying() {
    if (mode !== 'fly') return false;
    // Over the pool, the player simply drops into it.
    if (inPool(pos.x, pos.z)) { dropIn(); return true; }
    const below = floorBelow(pos.x, pos.z, y);
    if (below.landable && clearDrop(below.y)) { mode = 'air'; vy = 0; island = below.island; level = below.y; pilot = null; return true; }
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const spots = [{ x: clamp(pos.x, ISLAND.x0 + 3, ISLAND.x1 - 3), z: clamp(pos.z, ISLAND.z0 + 3, ISLAND.z1 - 3) }];
    if (ground) spots.push(...ground.spots());
    spots.sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z));
    return spots.some(spot => flyTo(spot.x, spot.z));
  }
  function toggleFly() { if (mode === 'fly') return stopFlying(); startFlying(); return true; }

  // Fly to a tapped point and land there. Points inside the house are reached
  // on foot from the terrace; leaving the house goes out by the front doors.
  function flyTo(x, z) {
    let target = null;
    const g = ground?.topAt(x, z), stand = g && ground.nearestStand(x, z, g.y);
    if (stand) target = { x: stand.x, z: stand.z, y: stand.y, island: stand.site };
    else {
      const stand = nav.nearestStand(x, z);
      if (!nav.canStand(stand.x, stand.z)) return false;
      target = { x: stand.x, z: stand.z, y: nav.heightAt(stand.x, stand.z), island: null };
    }
    let after = null;
    if (!target.island && inHouse(target.x, target.z)) { const end = target; after = () => goTo(end.x, end.z); target = { x: EXIT.x, z: EXIT.z, y: 0, island: null }; }
    if (mode === 'ground' && !island && inHouse(pos.x, pos.z)) {
      if (!goTo(EXIT.x, EXIT.z)) return false;
      then = () => launch(target, after);
      return true;
    }
    launch(target, after);
    return true;
  }
  function launch(target, after) {
    const legs = [];
    if (inHouse(pos.x, pos.z) && y < HOUSE.height) legs.push(...DOORWAY.map(p => ({ ...p })));
    const high = Math.max(target.y, island ? level : 0, ridge(pos.x, pos.z, target.x, target.z));
    const crossesHouse = segmentCrosses(pos.x, pos.z, target.x, target.z);
    legs.push({ x: target.x, z: target.z, y: target.y, cruise: Math.max(high + 2.5, crossesHouse ? HOUSE.height + 2.5 : 0), final: true });
    startFlying();
    pilot = { legs, target, after, best: Infinity, stuck: 0 };
  }
  // The highest ground along the way (islands, the stair, the mountain), short of
  // the last few metres, where the landing takes over.
  function ridge(ax, az, bx, bz) {
    const length = Math.hypot(bx - ax, bz - az);
    let top = 0;
    for (let k = 1; k < 24 && (1 - k / 24) * length > 4; k++) top = Math.max(top, ground?.topAt(ax + (bx - ax) * k / 24, az + (bz - az) * k / 24)?.y ?? 0);
    return top;
  }
  // Does the straight line pass over the house (with a margin for its roof edge)?
  function segmentCrosses(ax, az, bx, bz) {
    if (!HOUSE) return false;
    for (let k = 1; k <= 20; k++) {
      const x = ax + (bx - ax) * k / 20, z = az + (bz - az) * k / 20;
      if (x > HOUSE.x0 - 1.5 && x < HOUSE.x1 + 1.5 && z > HOUSE.z0 - 1.5 && z < HOUSE.z1 + 1.5) return true;
    }
    return false;
  }

  // ---------- Per-frame movement ----------
  function steer(input, cameraYaw) {
    const s = Math.sin(cameraYaw), c = Math.cos(cameraYaw);
    return { x: input.x * c + input.z * s, z: -input.x * s + input.z * c };
  }
  function turnTowards(dx, dz, dt) {
    const diff = Math.atan2(Math.sin(Math.atan2(dx, dz) - heading), Math.cos(Math.atan2(dx, dz) - heading));
    heading += diff * Math.min(1, dt * 12);
  }

  function attachLadder(value) {
    ladder = value; mode = 'ladder'; island = value.site; standing = null;
    pos.x = value.x; pos.z = value.z; level = y;
    vy = 0; speed = 0; heading = -Math.PI / 2;
  }
  function climbLadder(dt, input, cameraYaw) {
    let direction = 0;
    if (Math.hypot(input.x, input.z) > .08) {
      if (path) cancel();
      const flat = steer(input, cameraYaw);
      direction = Math.abs(input.z) > .08 ? -input.z : -flat.x;
    } else if (path?.length) {
      const next = path.find(q => q.ladder);
      if (next) direction = Math.sign(next.y - y);
    }
    speed = Math.abs(direction) * 2.8;
    y = level = THREE.MathUtils.clamp(y + direction * 2.8 * dt, ladder.bottom, ladder.top);
    // The last 70 cm carries the feet smoothly over the lip onto the roof.
    const over = THREE.MathUtils.smoothstep(y, ladder.top - .7, ladder.top);
    pos.x = ladder.x + (ladder.exit.x - ladder.x) * over;
    if (direction > 0 && y >= ladder.top || direction < 0 && y <= ladder.bottom) {
      const end = direction > 0 ? ladder.exit : ladder.foot;
      pos.x = end.x; pos.z = end.z; y = level = end.y;
      island = direction > 0 ? 'roof' : null; mode = 'ground'; ladder = null;
      standing = island ? ground.canStand(pos.x, pos.z, level) : null;
      if (path?.[0]?.ladder) { path.shift(); if (!path.length) arrive(); }
    }
  }

  function walk(dt, input, cameraYaw, airborne) {
    let dx = 0, dz = 0;
    const manual = Math.hypot(input.x, input.z) > .08;
    const climb = !airborne && ground?.ladderAt(pos.x, y, pos.z);
    const next = path?.[0];
    if (climb && (next?.ladder || manual && (y < climb.top - .1 ? input.z < -.35 || steer(input, cameraYaw).x < -.35 : input.z > .35 || steer(input, cameraYaw).x > .35))) {
      if (manual) cancel();
      attachLadder(climb); climbLadder(dt, input, cameraYaw); return;
    }

    if (Math.hypot(input.x, input.z) > 0.08) {
      if (path) cancel();
      ({ x: dx, z: dz } = steer(input, cameraYaw));
      // Walking (or jumping) off the deck into the pool dives in.
      const l = Math.hypot(dx, dz);
      if (!island && inPool(pos.x + dx / l * 0.7, pos.z + dz / l * 0.7) &&
        pos.x > POOL.x0 - 1.2 && pos.x < POOL.x1 + 1.2 && pos.z > POOL.z0 - 1.2 && pos.z < POOL.z1 + 1.2) { diveIn(dx / l, dz / l); return; }
    } else if (path?.length) {
      // Consume reached waypoints in this frame so a turn does not insert a
      // stop/start tick. Corners still finish within 3.5 cm to clear door jambs.
      while (path?.length) {
        const next = path[0], x = next.x - pos.x, z = next.z - pos.z, d = Math.hypot(x, z);
        // Keep a vertical waypoint for the ladder handler on the next frame.
        // Its x/z can match the foot exactly while its height is still above us.
        if (next.ladder && d < .035) return;
        if (d >= .035) { dx = x / d; dz = z / d; break; }
        path.shift(); if (!path.length) arrive();
      }
    }

    const length = Math.hypot(dx, dz), mag = Math.min(1, length);
    speed += (mag * (input.run || (rush && path) ? RUN : WALK) - speed) * (1 - Math.exp(-dt * (airborne ? 4 : 10)));
    if (mag > 0.01) {
      const step = path?.length ? Math.min(speed * dt, Math.hypot(path[0].x - pos.x, path[0].z - pos.z)) : speed * dt;
      if (through) { pos.x += dx / length * step; pos.z += dz / length * step; }
      else stepBy(dx / length * step, dz / length * step, path?.[0]);
      turnTowards(dx, dz, dt);
    }
  }

  function fall(dt, input, cameraYaw) {
    walk(dt, input, cameraYaw, true);
    if (mode !== 'air') return;
    vy -= GRAVITY * dt;
    const next = y + vy * dt;
    if (vy > 0 && solidAt(Math.floor(pos.x), Math.floor(next + 1.8), Math.floor(pos.z))) vy = 0;
    else y = next;
    if (y <= level) { y = level; vy = 0; mode = 'ground'; }
  }

  function fly(dt, input, cameraYaw) {
    let want = { x: 0, y: 0, z: 0 }, fast = input.run;
    const manual = Math.hypot(input.x, input.z) > 0.08 || input.up || input.down;
    if (manual && pilot) pilot = null;
    if (pilot) {
      const leg = pilot.legs[0], dx = leg.x - pos.x, dz = leg.z - pos.z, d = Math.hypot(dx, dz);
      const height = leg.final && d > 3 ? Math.max(leg.cruise, leg.y) : leg.y;
      const reach = Math.min(1, d / 3);
      want = { x: d > 0.05 ? dx / d * reach : 0, y: Math.max(-1, Math.min(1, (height - y) / 1.2)), z: d > 0.05 ? dz / d * reach : 0 };
      // On the way up, wait until clear of the roof before heading across.
      if (HOUSE && leg.final && leg.cruise > HOUSE.height && y < leg.cruise - 1 && segmentCrosses(pos.x, pos.z, leg.x, leg.z)) { want.x *= 0.15; want.z *= 0.15; }
      fast = d > 25;
      const left = d + Math.abs(height - y);
      if (left < pilot.best - 0.2) { pilot.best = left; pilot.stuck = 0; } else if ((pilot.stuck += dt) > 2.5) pilot = null;
      if (pilot && (leg.final ? d < 0.3 && Math.abs(y - leg.y) < 0.12 : d < 0.5 && Math.abs(y - leg.y) < 0.6)) {
        pilot.legs.shift();
        if (!pilot.legs.length) {
          const { target, after } = pilot;
          pilot = null;
          if (target.pool) { velocity.set(0, 0, 0); dropIn(); after?.(); return; }
          mode = 'ground'; island = target.island; y = level = target.y; velocity.set(0, 0, 0);
          after?.();
          return;
        }
      }
    } else {
      const flat = steer(input, cameraYaw);
      want = { x: flat.x, y: (input.up ? 1 : 0) - (input.down ? 1 : 0), z: flat.z };
    }
    const top = fast ? FLY_FAST : FLY, k = 1 - Math.exp(-dt * 6);
    velocity.x += (want.x * top - velocity.x) * k;
    velocity.z += (want.z * top - velocity.z) * k;
    velocity.y += (want.y * CLIMB - velocity.y) * k;
    const nx = pos.x + velocity.x * dt, nz = pos.z + velocity.z * dt, ny = y + velocity.y * dt;
    if (!blocked(nx, y, pos.z)) pos.x = nx; else velocity.x = 0;
    if (!blocked(pos.x, y, nz)) pos.z = nz; else velocity.z = 0;
    const below = floorBelow(pos.x, pos.z, Math.max(y, ny));
    if (!blocked(pos.x, ny, pos.z) && ny >= below.y) y = ny;
    else { if (ny < below.y) y = below.y; velocity.y = 0; }
    // Flying down onto somewhere walkable lands, as in Minecraft. Down against
    // a wall or a piece of furniture, the player first edges over to the nearest place
    // to stand, so holding descend always brings them down onto their feet.
    if (!pilot && input.down && y - below.y < 0.05) {
      if (below.landable) { mode = 'ground'; island = below.island; y = level = below.y; velocity.set(0, 0, 0); }
      else if (below.y > SEA) {
        const s = below.island ? ground.nearestStand(pos.x, pos.z, below.y) : nav.nearestStand(pos.x, pos.z);
        const d = s ? Math.hypot(s.x - pos.x, s.z - pos.z) : Infinity;
        if (d < 1.6 && (below.island || nav.canStand(s.x, s.z))) {
          const k = Math.min(1, 2.5 * dt / Math.max(d, 1e-3)), nx = pos.x + (s.x - pos.x) * k, nz = pos.z + (s.z - pos.z) * k;
          if (!blocked(nx, y, nz)) { pos.x = nx; pos.z = nz; }
        }
      }
    }
    // Flying down into the pool goes in with a splash.
    if (flewOut > 0) flewOut -= dt;
    else if (!pilot && velocity.y < -0.3 && y < WATER - 0.3 && inPool(pos.x, pos.z)) { dropIn(); return; }
    const horizontal = Math.hypot(velocity.x, velocity.z);
    if (horizontal > 0.3) turnTowards(velocity.x, velocity.z, dt);
  }

  function update(dt, input, cameraYaw, firstPerson = false) {
    if (mode === 'zip') zipping(dt);
    else if (mode === 'swim') swimming(dt, input, cameraYaw);
    else if (mode === 'ladder') climbLadder(dt, input, cameraYaw);
    else if (mode === 'fly') fly(dt, input, cameraYaw);
    else if (mode === 'air') fall(dt, input, cameraYaw);
    else {
      walk(dt, input, cameraYaw, false);
      if (mode === 'ground') y += (level - y) * (1 - Math.exp(-dt * 18));
    }
    // In first person the body faces the view, except lying on the pool's floor.
    if (firstPerson && !(mode === 'swim' && swim.rest)) heading = cameraYaw + Math.PI;
    place(dt, input);
    drawWeb();
  }

  // Avatar, pose and the blob shadow on whatever is below.
  function place(dt, input = { run: false }) {
    if (mode === 'swim') {
      // In the water the avatar is placed by its middle; falling in, it keeps the jump's pose.
      const s = swim, sp = Math.hypot(s.vx, s.vz);
      avatar.root.position.set(pos.x, s.c - PIVOT, pos.z); avatar.root.rotation.y = heading;
      avatar.update(dt, s.wet || s.anim ? { speed: 0, fly: -1, swim: { pitch: s.pitch, roll: s.roll, stroke: sp / SWIM, fast: sp > SWIM * 1.15,
        surface: !s.anim && s.c > surfaceLevel(s.pitch) - 0.15, lie: s.lie, climb: s.anim?.kind === 'out', dive: s.anim?.kind === 'in' } } : { speed: 0, fly: -1, air: true });
      avatar.blob.visible = false;
      onBody(eye, 0, 0.575, 0.25);
      return;
    }
    avatar.root.position.set(pos.x, y, pos.z); avatar.root.rotation.y = heading;
    const flying = mode === 'fly', horizontal = flying ? Math.hypot(velocity.x, velocity.z) : speed;
    avatar.update(dt, { speed: flying || mode === 'zip' ? 0 : speed / RUN * (input.run ? 1 : 1.6), run: !flying && input.run && speed > WALK, fly: flying ? Math.min(1, horizontal / FLY) : -1, air: mode === 'air', zip: mode === 'zip' });
    const below = floorBelow(pos.x, pos.z, y + 0.01), lift = y - below.y;
    avatar.blob.position.set(pos.x, below.y + 0.015, pos.z);
    if (avatar.blob.material) { avatar.blob.visible = below.y > SEA && lift < 8; avatar.blob.material.opacity = 0.32 * Math.max(0, 1 - lift / 8); }
  }

  // Fly to the pool and drop in (from the roof, the mountain, the air).
  function flyIntoPool(x, z) {
    const at = inPoolBounds(x, z), target = { x: at.x, z: at.z, y: WATER + 1.4, island: null, pool: true };
    if (mode === 'ground' && !island && inHouse(pos.x, pos.z)) {
      if (!goTo(EXIT.x, EXIT.z)) return false;
      then = () => launch(target, null);
      return true;
    }
    launch(target, null);
    return true;
  }

  return {
    pos, web, update, goTo, follow, walkThrough, visit, cancel, teleport, jump, toggleFly, startFlying, stopFlying, flyTo, zipTo,
    enterPool, swimTo, leavePool, toggleDive, flyIntoPool,
    get y() { return y; }, get heading() { return heading; }, get floorY() { return y; },
    get moving() { return speed > 0.3 || !!zip || (mode === 'fly' && velocity.lengthSq() > 0.1) || (mode === 'swim' && Math.hypot(swim.vx, swim.vz) > 0.3); },
    get travelling() { return !!path?.length || !!pilot || !!zip; }, get path() { return path; },
    get zipping() { return !!zip; },
    get flying() { return mode === 'fly'; }, get island() { return island; }, get mode() { return mode; },
    // Flying themselves to a tapped place, rather than steered by hand.
    get piloting() { return !!pilot; },
    get swimming() { return mode === 'swim'; },
    // Where their eyes are in the water, whether they are under it, and whether
    // the player lies still on the bottom (the camera then looks up through their eyes).
    get eye() { return eye; },
    get underwater() { return mode === 'swim' && eye.y < WATER; },
    // Heading for the bottom, or lying on it: what the dive button shows.
    get diving() { return mode === 'swim' && (swim.dive || swim.rest); },
    get gazing() { return mode === 'swim' && swim.rest && swim.lie > 0.9 && !swim.anim; },
    get swim() {
      if (mode !== 'swim') return null;
      swimInfo.x = pos.x; swimInfo.z = pos.z; swimInfo.c = swim.c; swimInfo.speed = Math.hypot(swim.vx, swim.vz);
      swimInfo.surface = swim.wet && !swim.anim && swim.c > surfaceLevel(swim.pitch) - 0.15;
      return swimInfo;
    },
  };
}
