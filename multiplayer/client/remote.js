// Everyone else on the island. Movement is not replayed but rebuilt: 150 ms
// behind live, between the last two ticks, with walk, fly, swim and zip poses
// eased locally from the same state the local player feeds its own body. Two
// renderers sit behind one roster:
//   - small crowds (cap ≤ 8): each visitor is their own engine avatar with
//     their own skin, handset and all — 8 draw calls per person;
//   - big crowds: an instanced pool (remotePool.js) draws everyone in 8 draw
//     calls total.
// Up to `cap` are drawn — the nearest ones — the rest stay in chat and on the
// island in name only.
import { createAvatar } from '@engine/world/avatar.js';
import { decodeSkin } from '@engine/door-protocol.js';
import { seedSkinUrl, seedCanvas, pngCanvas } from './skins.js';
import { createPool } from './remotePool.js';
import { hueOf } from './identity.js';

const RUN = 6.2, FLY = 8.5;
const DELAY = 150;  // render this far behind live, to soak up network jitter
const EXTRAP = 250; // keep gliding this long past the newest tick, then stand
const SNAP = 3;     // a gap this size is a teleport, not a stride
const PHONE_BIT = 2, SURFACE_BIT = 4;

const shortAngle = d => Math.atan2(Math.sin(d), Math.cos(d));

export function createRemotes({ stage, world, nav, cap = 6 }) {
  const scene = stage.scene;
  const all = new Map(); // id → remote
  const ranked = [];     // reused scratch for the nearest-N pass
  const pool = cap > 8 ? createPool({ stage, nav, cap }) : null;

  // ---------- skins → renderers ----------
  // A seeded skin paints locally; a carried PNG is validated exactly like the
  // portal validates the skins travellers wear through doors.
  function attach(r) {
    if (pool) {
      if (r.slot !== undefined) return;
      r.slot = pool.acquire(r.id);
      if (r.slot < 0) { r.slot = undefined; return; }
      if (r.skin.k === 'seed') pool.paint(r.id, seedCanvas(r.skin.s));
      else if (r.skin.k === 'png') {
        r.skinPending = true;
        decodeSkin(r.skin.d).then(res => {
          r.skinPending = false;
          if (all.has(r.id) && res) pngCanvas(res.url).then(c => pool.paint(r.id, c));
        }).catch(() => { r.skinPending = false; });
      }
      return;
    }
    if (r.avatar || r.skinPending) return;
    if (r.skin.k === 'seed') return build(r, seedSkinUrl(r.skin.s));
    if (r.skin.k === 'png') {
      r.skinPending = true;
      decodeSkin(r.skin.d).then(res => {
        r.skinPending = false;
        if (all.has(r.id)) build(r, res?.url || '');
      }).catch(() => { r.skinPending = false; });
      return;
    }
    build(r, '');
  }

  function build(r, url) {
    const avatar = createAvatar(url);
    // Spawned after the engine's warm-up lighting pass, so re-apply it here.
    world.lighting.apply(avatar.root);
    scene.add(avatar.root, avatar.blob);
    avatar.blob.visible = false;
    avatar.root.visible = false;
    r.avatar = avatar;
  }

  function detach(r) {
    if (pool) {
      if (r.slot !== undefined) pool.release(r.id);
      r.slot = undefined;
      return;
    }
    if (!r.avatar) return;
    scene.remove(r.avatar.root, r.avatar.blob);
    r.avatar.root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) m.dispose();
    });
    r.avatar.material.map.dispose();
    r.avatar.material.dispose();
    r.avatar.blob.geometry.dispose();
    r.avatar.blob.material.dispose();
    r.avatar = null;
  }

  function drop(id) {
    const r = all.get(id);
    if (!r) return null;
    detach(r);
    all.delete(id);
    return r;
  }

  function ensure(id, name, skin) {
    let r = all.get(id);
    if (!r) {
      r = {
        id, name, skin, hue: hueOf(id),
        states: [],
        out: { x: 0, y: 0, z: 0, ry: 0, m: 0, sp: 0, f: 0, vx: 0, vz: 0 },
        st: null, swimObj: null,
        avatar: null, slot: undefined, skinPending: false, phone: false, visible: false, d2: Infinity,
      };
      r.st = { speed: 0, run: false, lookYaw: 0, lookPitch: 0, fly: -1, air: false, zip: false, swim: null };
      r.swimObj = { pitch: 0, roll: 0, stroke: 0, fast: false, surface: false, lie: 0, climb: false, dive: false };
      all.set(id, r);
    } else {
      r.name = name;
      if (skin) r.skin = skin;
    }
    attach(r);
    return r;
  }

  // ---------- events in ----------
  function join(p) {
    if (!p?.id) return;
    const r = ensure(p.id, p.name || `Token-${p.id.slice(-4)}`, p.skin);
    if (p.state) pushState(r, p.state);
  }
  function replaceAll(players) {
    const keep = new Set();
    for (const p of players || []) { join(p); keep.add(p.id); }
    for (const id of [...all.keys()]) if (!keep.has(id)) drop(id);
  }
  function pushState(r, s) {
    if (!r) return;
    r.states.push({ t: performance.now(), x: s.x, y: s.y, z: s.z, ry: s.ry, m: s.m, sp: s.sp, f: s.f });
    if (r.states.length > 4) r.states.shift();
  }
  const state = msg => {
    const r = all.get(msg.id);
    if (r) pushState(r, msg);
  };

  // ---------- interpolation ----------
  function sample(r, now) {
    const out = r.out, s = r.states;
    if (!s.length) return false;
    const t = now - DELAY;
    let a, b = s[s.length - 1];
    if (t <= b.t) {
      a = b = s[0];
      for (let i = s.length - 2; i >= 0; i--) {
        if (s[i].t <= t) { a = s[i]; b = s[i + 1]; break; }
      }
      const span = b.t - a.t;
      const k = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 1;
      if (Math.abs(b.x - a.x) + Math.abs(b.z - a.z) > SNAP) {
        out.x = b.x; out.y = b.y; out.z = b.z; out.vx = 0; out.vz = 0;
      } else {
        out.x = a.x + (b.x - a.x) * k;
        out.y = a.y + (b.y - a.y) * k;
        out.z = a.z + (b.z - a.z) * k;
        out.vx = span > 0 ? (b.x - a.x) / span * 1000 : 0;
        out.vz = span > 0 ? (b.z - a.z) / span * 1000 : 0;
      }
      out.ry = a.ry + shortAngle(b.ry - a.ry) * k;
    } else {
      a = s.length > 1 ? s[s.length - 2] : b;
      const over = t - b.t;
      const span = Math.max(1, b.t - a.t);
      const jump = Math.abs(b.x - a.x) + Math.abs(b.z - a.z) > SNAP;
      const glide = over <= EXTRAP && !jump;
      out.vx = glide ? (b.x - a.x) / span * 1000 : 0;
      out.vz = glide ? (b.z - a.z) / span * 1000 : 0;
      out.x = b.x + out.vx * Math.min(over, EXTRAP) / 1000;
      out.y = b.y;
      out.z = b.z + out.vz * Math.min(over, EXTRAP) / 1000;
      out.ry = b.ry;
    }
    out.m = b.m; out.sp = b.sp; out.f = b.f;
    return true;
  }

  // ---------- the frame ----------
  function update(dt, now, selfX, selfZ) {
    ranked.length = 0;
    for (const r of all.values()) {
      if (!pool && !r.avatar) continue;
      if (!sample(r, now)) continue;
      r.d2 = (r.out.x - selfX) ** 2 + (r.out.z - selfZ) ** 2;
      ranked.push(r);
    }
    ranked.sort((a, b) => a.d2 - b.d2);
    if (pool) {
      for (let i = 0; i < ranked.length; i++) {
        const r = ranked[i];
        r.visible = i < cap;
        pool.draw(r, dt, r.visible);
      }
      pool.flush();
      return;
    }
    for (let i = 0; i < ranked.length; i++) {
      const r = ranked[i], out = r.out;
      r.visible = i < cap;
      r.avatar.root.visible = r.visible;
      if (!r.visible) continue;
      r.avatar.update(dt, poseState(r));
      r.avatar.root.position.set(out.x, out.y, out.z);
      r.avatar.root.rotation.y = out.ry;
      const phone = !!(out.f & PHONE_BIT);
      if (phone !== r.phone) { r.phone = phone; r.avatar.holdPhone(phone); }
      const floor = nav.heightAt(out.x, out.z), lift = out.y - floor;
      const blob = r.avatar.blob;
      blob.position.set(out.x, floor + 0.015, out.z);
      blob.visible = out.m !== 3 && lift < 8;
      if (blob.visible) blob.material.opacity = 0.32 * Math.max(0, 1 - lift / 8);
    }
  }

  // The state the engine avatar would have been fed (player.js place()),
  // rebuilt per remote from the interpolated ticks. Objects persist on r.
  function poseState(r) {
    const out = r.out, st = r.st;
    const speed = Math.hypot(out.vx, out.vz);
    st.speed = speed / RUN * 1.6;
    st.run = speed > 3.7;
    st.fly = -1; st.air = false; st.zip = false; st.swim = null;
    if (out.m === 2) {          // flying
      st.speed = 0;
      st.fly = Math.min(1, speed / FLY);
    } else if (out.m === 1) {   // mid-jump
      st.air = true;
    } else if (out.m === 3) {   // swimming
      st.speed = 0;
      st.swim = st.swimObj;
      st.swimObj.stroke = Math.min(1, speed / 2.2);
      st.swimObj.fast = speed > 2.6;
      st.swimObj.surface = !!(out.f & SURFACE_BIT);
    } else if (out.m === 4) {   // web-zip
      st.speed = 0;
      st.zip = true;
    }
    return st;
  }

  // Where a player's head is, for tags and bubbles; null keeps them hidden.
  function anchorOf(id) {
    const r = all.get(id);
    if (!r || !r.visible) return null;
    if (pool) return r.slot !== undefined ? r.out : null;
    return r.avatar ? r.avatar.root.position : null;
  }
  const info = id => {
    const r = all.get(id);
    return r ? { name: r.name, hue: r.hue } : null;
  };

  // The socket dropped: keep everyone frozen for a moment in case it is a
  // blip, then send the island back to being empty.
  let graceTimer = 0;
  function grace() {
    clearTimeout(graceTimer);
    graceTimer = setTimeout(clear, 5000);
  }
  function clear() {
    clearTimeout(graceTimer);
    for (const r of all.values()) detach(r);
    all.clear();
  }
  // A fresh roster cancels the grace: this is the blip resolving.
  const resync = players => { clearTimeout(graceTimer); replaceAll(players); };

  return { join, replaceAll: resync, state, leave: drop, info, anchorOf, update, grace, clear, prime: () => pool?.prime(), cap };
}
