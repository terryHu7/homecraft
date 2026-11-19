// A GTA-style radar in the corner and a full map behind M. The map image is
// drawn from the blocks themselves, like a Minecraft map item: one colour per
// top block, lighter where the ground steps up, darker where it falls away.
import * as L from '@world/layout.js';

const ISLAND = L.ISLAND, STATIONS = L.STATIONS || [], POOL = L.POOL || null, HOUSE = L.HOUSE || null, DOORS = L.DOORS || [];
import { icon } from './icons.js';
import { nameOf } from '../lang.js';

const PPM = 8; // map pixels per metre
const COLORS = {
  grass: '#7aa653', sand: '#d5c8a7', leaves: '#3d7a2c', osmanthus: '#4f8a3a', hedge: '#3f7a2d', log: '#6e5434',
  concrete: '#d9d5cd', wood_floor: '#bd956a', epoxy: '#c3c6c9', deck: '#bd956a', pavers: '#b3afa6', travertine: '#ddd4c3', coping: '#ddd4c3',
  pool_tile: '#cfe9ec', pool_deep: '#3fa9cf', wall: '#2b2d30', glass: '#9cc4d6', brick: '#ebe7df',
  loft: '#c39566', bookshelf: '#a97d4f', roof: '#3d4147', parapet: '#3d4147', dirt: '#8c6239', stone: '#8e8e8e',
  planks: '#bd956a', gravel: '#9a958c', deepslate: '#4d4d52',
};

// `decorate(ctx, X, Z, PPM)` lets a world paint extras (a court's lines) over the blocks.
export function drawMapImage(grid, obstacles, decorate = null) {
  const w = (ISLAND.x1 - ISLAND.x0) * PPM, h = (ISLAND.z1 - ISLAND.z0) * PPM;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const top = (x, z) => {
    for (let y = 8; y >= -4; y--) {
      const t = grid.type(x, y, z);
      if (!t) continue;
      if (grid.groups[grid.index(x, y, z)] === grid.groupNames.indexOf('roof')) continue;
      return { t, y };
    }
    return null;
  };
  const shade = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const c = v => Math.max(0, Math.min(255, Math.round(v * k)));
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  };
  for (let x = ISLAND.x0; x < ISLAND.x1; x++) for (let z = ISLAND.z0; z < ISLAND.z1; z++) {
    const here = top(x, z);
    if (!here) continue;
    const north = top(x, z - 1);
    let k = 1;
    if (north && north.y < here.y) k = 1.1;
    if (north && north.y > here.y) k = 0.84;
    const pool = !!POOL && x >= POOL.x0 && x < POOL.x1 && z >= POOL.z0 && z < POOL.z1;
    // A block type can bring its own map colour: grid.define('x', { map: '#hex', ... }).
    ctx.fillStyle = shade(pool ? COLORS.pool_deep : here.t.map || COLORS[here.t.name] || '#888888', k);
    ctx.fillRect((x - ISLAND.x0) * PPM, (z - ISLAND.z0) * PPM, PPM, PPM);
  }
  const X = x => (x - ISLAND.x0) * PPM, Z = z => (z - ISLAND.z0) * PPM;
  decorate?.(ctx, X, Z, PPM);
  // Furniture, as soft shadows.
  ctx.fillStyle = 'rgba(30, 34, 38, .28)';
  for (const o of obstacles) if (o.level === 0) ctx.fillRect(X(o.x0), Z(o.z0), (o.x1 - o.x0) * PPM, (o.z1 - o.z0) * PPM);
  // A crisp outline round the house.
  if (HOUSE) {
    ctx.strokeStyle = 'rgba(0, 0, 0, .55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(X(HOUSE.x0 - 1), Z(HOUSE.z0 - 1), (HOUSE.x1 - HOUSE.x0 + 2) * PPM, (HOUSE.z1 - HOUSE.z0 + 2) * PPM);
  }
  // The one-way doors: little glowing rings on the ground, glowing on the map.
  for (const d of DOORS) {
    ctx.strokeStyle = 'rgba(150, 220, 255, .95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(X(d.x), Z(d.z), 6, 0, Math.PI * 2); ctx.stroke();
  }
  return canvas;
}

export function createMinimap({ root, bigRoot, grid, obstacles, decorate = null, getPlayer, getYaw, getRoute, onPick }) {
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  let mapImage = drawMapImage(grid, obstacles, decorate);
  const zooms = [2.6, 4, 6.2];
  let zoomIndex = 1;
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const blips = STATIONS.map(s => ({ s, img: icon(s.id).canvas }));

  function fit() {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
  }
  fit();
  addEventListener('resize', fit);

  root.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    zoomIndex = Math.max(0, Math.min(zooms.length - 1, zoomIndex + (b.dataset.zoom === 'in' ? 1 : -1)));
  }));
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    zoomIndex = Math.max(0, Math.min(zooms.length - 1, zoomIndex + (e.deltaY < 0 ? 1 : -1)));
  }, { passive: false });
  root.querySelector('.expand').style.backgroundImage = `url(${icon('map').url})`;
  root.querySelector('.expand').addEventListener('click', () => toggleBig(true));

  // Screen point on the radar → world point, undoing the rotation.
  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    const sx = (e.clientX - r.left - r.width / 2), sy = (e.clientY - r.top - r.height / 2);
    const scale = zooms[zoomIndex] * (r.width / 204);
    const a = -getYaw();
    const p = getPlayer();
    const dx = sx * Math.cos(a) - sy * Math.sin(a), dz = sx * Math.sin(a) + sy * Math.cos(a);
    onPick(p.x + dx / scale, p.z + dz / scale);
  });

  // The pixel mark already has its own ink outline, so it sits on the map
  // without a disc behind it.
  function drawBlip(context, x, y, img, glyph) {
    context.imageSmoothingEnabled = false;
    context.drawImage(img, x - glyph / 2, y - glyph / 2, glyph, glyph);
  }

  function draw() {
    if (!canvas.width) fit();
    const W = canvas.width, H = canvas.height;
    if (!W) return;
    const p = getPlayer();
    const scale = zooms[zoomIndex] * (W / 204);
    const yaw = getYaw();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#9fc6e8';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(yaw);
    ctx.imageSmoothingEnabled = false;
    const k = scale / PPM;
    ctx.drawImage(mapImage, (ISLAND.x0 - p.x) * scale, (ISLAND.z0 - p.z) * scale, mapImage.width * k, mapImage.height * k);
    // Route to the waypoint.
    const route = getRoute();
    if (route && route.length) {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const path = () => { ctx.beginPath(); ctx.moveTo(0, 0); for (const q of route) ctx.lineTo((q.x - p.x) * scale, (q.z - p.z) * scale); };
      path(); ctx.strokeStyle = 'rgba(30, 10, 60, .55)'; ctx.lineWidth = 7 * dpr; ctx.stroke();
      path(); ctx.strokeStyle = '#a77bff'; ctx.lineWidth = 4 * dpr; ctx.stroke();
    }
    ctx.restore();
    // Blips stay upright; ones off the edge are pinned to the rim.
    const R = W / 2 - 14 * dpr;
    for (const { s, img } of blips) {
      let dx = (s.at[0] - p.x) * scale, dz = (s.at[1] - p.z) * scale;
      const rx = dx * Math.cos(yaw) - dz * Math.sin(yaw), rz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      let bx = rx, bz = rz;
      const d = Math.hypot(bx, bz);
      if (d > R) { bx = bx / d * R; bz = bz / d * R; }
      drawBlip(ctx, W / 2 + bx, H / 2 + bz, img, 18 * dpr);
    }
    // North marker on the rim.
    const nAngle = yaw - Math.PI / 2;
    const nr = W / 2 - 11 * dpr;
    const npx = W / 2 + Math.cos(nAngle) * nr, npz = H / 2 + Math.sin(nAngle) * nr;
    ctx.fillStyle = 'rgba(12, 14, 16, .85)';
    ctx.beginPath(); ctx.arc(npx, npz, 9 * dpr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${12 * dpr}px -apple-system, BlinkMacSystemFont, "PingFang SC", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', npx, npz + 1 * dpr);
    // The player: a white arrow pointing where they face.
    const heading = p.heading;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(yaw - heading + Math.PI);
    ctx.beginPath();
    const a = 9 * dpr;
    ctx.moveTo(0, -a); ctx.lineTo(a * 0.72, a * 0.8); ctx.lineTo(0, a * 0.38); ctx.lineTo(-a * 0.72, a * 0.8); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2 * dpr;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ---------- Full map ----------
  const big = bigRoot.querySelector('canvas');
  const bctx = big.getContext('2d');
  let view = null;
  function toggleBig(open = bigRoot.hidden) {
    bigRoot.hidden = !open;
    if (open) {
      const r = big.getBoundingClientRect();
      big.width = Math.round(r.width * dpr); big.height = Math.round(r.height * dpr);
      const fitScale = Math.min(big.width / (ISLAND.x1 - ISLAND.x0), big.height / (ISLAND.z1 - ISLAND.z0)) * 0.94;
      view = { cx: (ISLAND.x0 + ISLAND.x1) / 2, cz: (ISLAND.z0 + ISLAND.z1) / 2, scale: fitScale, min: fitScale * 0.9, max: fitScale * 4 };
      drawBig();
    }
    return !bigRoot.hidden;
  }
  bigRoot.querySelector('.close').addEventListener('click', () => toggleBig(false));
  bigRoot.addEventListener('click', e => { if (e.target === bigRoot) toggleBig(false); });

  function toWorld(clientX, clientY) {
    const r = big.getBoundingClientRect();
    const sx = (clientX - r.left) * dpr - big.width / 2, sy = (clientY - r.top) * dpr - big.height / 2;
    return { x: view.cx + sx / view.scale, z: view.cz + sy / view.scale };
  }
  let pan = null;
  big.addEventListener('pointerdown', e => { big.setPointerCapture(e.pointerId); pan = { x: e.clientX, y: e.clientY, moved: false }; });
  big.addEventListener('pointermove', e => {
    if (!pan) return;
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (Math.hypot(dx, dy) > 4) pan.moved = true;
    if (pan.moved) { view.cx -= dx * dpr / view.scale; view.cz -= dy * dpr / view.scale; pan.x = e.clientX; pan.y = e.clientY; drawBig(); }
  });
  big.addEventListener('pointerup', e => {
    if (pan && !pan.moved) { const w = toWorld(e.clientX, e.clientY); onPick(w.x, w.z); toggleBig(false); }
    pan = null;
  });
  big.addEventListener('wheel', e => {
    e.preventDefault();
    const before = toWorld(e.clientX, e.clientY);
    view.scale = Math.max(view.min, Math.min(view.max, view.scale * Math.exp(-e.deltaY * 0.0015)));
    const after = toWorld(e.clientX, e.clientY);
    view.cx += before.x - after.x; view.cz += before.z - after.z;
    drawBig();
  }, { passive: false });

  function drawBig() {
    if (bigRoot.hidden || !view) return;
    const W = big.width, H = big.height, s = view.scale;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.fillStyle = '#9fc6e8';
    bctx.fillRect(0, 0, W, H);
    bctx.imageSmoothingEnabled = false;
    const ox = W / 2 - (view.cx - ISLAND.x0) * s, oz = H / 2 - (view.cz - ISLAND.z0) * s;
    bctx.drawImage(mapImage, ox, oz, mapImage.width * s / PPM, mapImage.height * s / PPM);
    const P = (x, z) => [ox + (x - ISLAND.x0) * s, oz + (z - ISLAND.z0) * s];
    bctx.font = `600 ${13 * dpr}px -apple-system, BlinkMacSystemFont, "PingFang SC", system-ui, sans-serif`;
    bctx.textAlign = 'left'; bctx.textBaseline = 'middle';
    for (const { s: st, img } of blips) {
      const [x, y] = P(st.at[0], st.at[1]);
      const glyph = 22 * dpr;
      drawBlip(bctx, x, y, img, glyph);
      const label = nameOf(st);
      const tw = bctx.measureText(label).width;
      const lx = x + glyph / 2 + 5 * dpr;
      bctx.fillStyle = 'rgba(12, 14, 16, .72)';
      bctx.fillRect(lx, y - 10 * dpr, tw + 12 * dpr, 20 * dpr);
      bctx.fillStyle = '#fff';
      bctx.fillText(label, lx + 6 * dpr, y + 1 * dpr);
    }
    const p = getPlayer();
    const [px, py] = P(p.x, p.z);
    bctx.save();
    bctx.translate(px, py);
    bctx.rotate(-p.heading + Math.PI);
    const a = 11 * dpr;
    bctx.beginPath();
    bctx.moveTo(0, -a); bctx.lineTo(a * 0.72, a * 0.8); bctx.lineTo(0, a * 0.38); bctx.lineTo(-a * 0.72, a * 0.8); bctx.closePath();
    bctx.fillStyle = '#fff'; bctx.strokeStyle = '#111'; bctx.lineWidth = 2 * dpr; bctx.fill(); bctx.stroke();
    bctx.restore();
  }

  function redrawImage() { mapImage = drawMapImage(grid, obstacles, decorate); }

  return { draw, toggleBig, isBigOpen: () => !bigRoot.hidden, drawBig, redrawImage };
}
