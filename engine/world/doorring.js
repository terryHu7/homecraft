// One-way doors: a small gate standing over a glowing ring on the ground,
// each carrying the player to its single destination when stepped on —
// hyperlinks, where the big portal is a list. Placed by DOORS in
// world/layout.js. The destination's name and logo arrive asynchronously from
// its homecraft.json (the one cross-origin readable file): the name goes on
// the sign above the frame, the logo floats at the vortex's centre; until
// they land the hostname and the name's initial stand in.
import * as THREE from 'three';
import * as L from '@world/layout.js';
import { canvasTexture } from './textures.js';
import { readSiteInfo, siteText } from '../door-metadata.js';
import { isTravelling } from '../portal.js';

const RADIUS = 0.9;    // walk-in trigger radius, metres
const REARM = 1.35;    // step this far out before the ring arms again
const WIDTH = 1.5;     // door frame opening, metres
const HEIGHT = 2.3;    // door frame top, metres

// The ring on the ground: a soft disc with a bright rim, like the portal's
// light spill. Smooth gradients, so the texture is not pixelated.
const ringTexture = canvasTexture(128, 128, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0.0, 'rgba(160, 225, 255, .5)');
  g.addColorStop(0.45, 'rgba(120, 205, 250, .18)');
  g.addColorStop(0.62, 'rgba(160, 230, 255, .95)');
  g.addColorStop(0.72, 'rgba(140, 215, 255, .25)');
  g.addColorStop(1.0, 'rgba(120, 200, 250, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}, { pixelated: false });

// The vortex inside the frame: a bright core with spiral arms, spinning slowly.
const vortexTexture = canvasTexture(128, 128, (ctx, w, h) => {
  const cx = w / 2, cy = h / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
  g.addColorStop(0.0, 'rgba(210, 242, 255, .95)');
  g.addColorStop(0.3, 'rgba(140, 215, 252, .55)');
  g.addColorStop(0.7, 'rgba(95, 185, 242, .22)');
  g.addColorStop(1.0, 'rgba(95, 185, 242, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.lineCap = 'round';
  for (let arm = 0; arm < 3; arm++) {
    ctx.beginPath();
    for (let t = 0; t < 1; t += 0.04) {
      const a = arm * 2.094 + t * 4.2, r = 4 + t * 52;
      const x = cx + Math.cos(a) * r * 0.92, y = cy + Math.sin(a) * r;
      t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(200, 238, 255, .5)';
    ctx.lineWidth = 6;
    ctx.stroke();
  }
}, { pixelated: false });

// The name sign above the frame.
function paintSign(ctx, w, h, name) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(12, 16, 20, .82)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(3, 3, w - 6, h - 6, 10); else ctx.rect(3, 3, w - 6, h - 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150, 220, 255, .8)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '600 40px -apple-system, BlinkMacSystemFont, "PingFang SC", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const max = w - 44;
  let text = name;
  while (text.length > 1 && ctx.measureText(text).width > max) text = text.slice(0, -1);
  ctx.fillText(text + (text.length < name.length ? '…' : ''), w / 2, h / 2 + 2);
}

// The emblem at the vortex's centre: the destination's logo once it arrives,
// the name's initial until then. A quiet disc keeps either readable on the
// bright vortex core.
function paintEmblem(ctx, w, h, name, logo) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(10, 14, 18, .78)';
  ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(160, 228, 255, .9)';
  ctx.lineWidth = 4;
  ctx.stroke();
  if (logo) {
    const s = w - 26;
    ctx.drawImage(logo, (w - s) / 2, (h - s) / 2, s, s);
  } else {
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${Math.round(w * 0.42)}px -apple-system, BlinkMacSystemFont, "PingFang SC", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((name || '?').trim().slice(0, 1).toLocaleUpperCase(), w / 2, h / 2 + 2);
  }
}

const hostOf = url => { try { return new URL(url).hostname; } catch { return url; } };

export function createDoorRings({ stage, onEnter }) {
  const doors = L.DOORS || [];
  if (!doors.length) return null;
  const root = new THREE.Group();
  root.name = 'door-rings';
  const frameMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3d2e });
  const rings = doors.map((door, index) => {
    const yaw = Math.round((door.yaw || 0) / (Math.PI / 2)) * (Math.PI / 2);
    const group = new THREE.Group();
    group.name = `door-${index}`;
    group.position.set(door.x, 0, door.z);
    group.rotation.y = yaw;
    // Ground ring: the walk-in trigger is here, the gate marks it.
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(RADIUS * 2.6, RADIUS * 2.6),
      new THREE.MeshBasicMaterial({ map: ringTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    ring.renderOrder = 3;
    group.add(ring);
    // The frame: two posts and a lintel, sharing one material.
    const post = new THREE.BoxGeometry(0.18, HEIGHT, 0.18);
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(post, frameMaterial);
      mesh.position.set(side * WIDTH / 2, HEIGHT / 2, 0);
      group.add(mesh);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(WIDTH + 0.36, 0.2, 0.22), frameMaterial);
    lintel.position.y = HEIGHT + 0.1;
    group.add(lintel);
    // The vortex, standing in the opening, spinning in update().
    const vortex = new THREE.Mesh(
      new THREE.PlaneGeometry(WIDTH - 0.24, HEIGHT - 0.2),
      new THREE.MeshBasicMaterial({ map: vortexTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    vortex.position.y = (HEIGHT - 0.2) / 2 + 0.05;
    vortex.renderOrder = 4;
    group.add(vortex);
    // The emblem at the vortex's centre: the destination's logo once it
    // arrives, the name's initial until then.
    const emblemCanvas = document.createElement('canvas');
    emblemCanvas.width = 96; emblemCanvas.height = 96;
    const emblemCtx = emblemCanvas.getContext('2d');
    const emblemName = door.name || hostOf(door.target);
    paintEmblem(emblemCtx, 96, 96, emblemName, null);
    const emblemTexture = new THREE.CanvasTexture(emblemCanvas);
    emblemTexture.colorSpace = THREE.SRGBColorSpace;
    const emblem = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.62),
      new THREE.MeshBasicMaterial({ map: emblemTexture, transparent: true, side: THREE.DoubleSide }),
    );
    emblem.position.set(0, vortex.position.y, 0.03);
    emblem.renderOrder = 5;
    group.add(emblem);
    // The name sign above the lintel; the hostname is the first guess.
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 320; signCanvas.height = 84;
    const signCtx = signCanvas.getContext('2d');
    paintSign(signCtx, 320, 84, emblemName);
    const signTexture = new THREE.CanvasTexture(signCanvas);
    signTexture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.45),
      new THREE.MeshBasicMaterial({ map: signTexture, transparent: true, side: THREE.DoubleSide }),
    );
    sign.position.y = HEIGHT + 0.62;
    group.add(sign);
    // Name and logo arrive from the destination's homecraft.json. The logo
    // must upload to WebGL, so it loads CORS-clean; a source without CORS
    // headers keeps the initial on the emblem.
    void readSiteInfo(door.target, 4000).then(info => {
      if (!info) return;
      const name = siteText(info.name) || emblemName;
      paintSign(signCtx, 320, 84, name);
      signTexture.needsUpdate = true;
      paintEmblem(emblemCtx, 96, 96, name, null);
      emblemTexture.needsUpdate = true;
      if (!info.logo) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => {
        paintEmblem(emblemCtx, 96, 96, name, img);
        emblemTexture.needsUpdate = true;
      };
      img.src = info.logo;
    });
    root.add(group);
    return { door, ring, vortex, armed: true, pulse: index * 1.7 };
  });
  stage.scene.add(root);

  return {
    root,
    update(dt, player) {
      if (!player) return;
      for (const item of rings) {
        // The vortex spins; ring and vortex breathe, desynced per door.
        item.pulse = (item.pulse + dt * 1.4) % (Math.PI * 2);
        const k = 0.82 + 0.18 * Math.sin(item.pulse);
        item.ring.material.opacity = k;
        item.vortex.material.opacity = 0.75 + 0.25 * k;
        item.vortex.rotation.z += dt * 1.6;
        const s = 1 + 0.04 * Math.sin(item.pulse);
        item.ring.scale.set(s, s, 1);
        // Stepping onto the ring leaves for the one destination, once, until
        // you step back out — the portal's armed pattern, circular.
        const dx = player.pos.x - item.door.x, dz = player.pos.z - item.door.z;
        const dist = Math.hypot(dx, dz);
        const inside = player.mode === 'ground' && !player.island && dist < RADIUS;
        if (inside && item.armed && !isTravelling()) {
          item.armed = false;
          item.ring.material.opacity = 1;
          onEnter?.(item.door);
        } else if (dist > REARM) {
          item.armed = true;
        }
      }
    },
  };
}
