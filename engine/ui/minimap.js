// A GTA-style radar in the corner and a full map behind M. The map image is
// drawn from the blocks themselves, like a Minecraft map item: one colour per
// top block, lighter where the ground steps up, darker where it falls away.
import * as L from '@world/layout.js';

const ISLAND = L.ISLAND, STATIONS = L.STATIONS || [], POOL = L.POOL || null, HOUSE = L.HOUSE || null;
const mapRotation = L.MAP_ROTATION || 0;
const mapCos = Math.cos(mapRotation), mapSin = Math.sin(mapRotation);
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
  return canvas;
}

export function createMinimap({ root, bigRoot, grid, obstacles, decorate = null, getPlayer, getYaw, getRoute, onPick,
  getNavigationTargets = () => [], onNavigationTarget = () => {} }) {
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  let mapImage = drawMapImage(grid, obstacles, decorate);
  const zooms = [2.6, 4, 6.2];
  let zoomIndex = 1;
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const blips = STATIONS.map(s => ({ s, img: icon(s.id).canvas }));
  const navigationTargets = () => getNavigationTargets?.() || [];
  const navDistance = (target, p) => Math.hypot(target.x - p.x, target.z - p.z, (target.y ?? p.y ?? 0) - (p.y ?? 0));
  const distanceLabel = distance => distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)} m`;
  function navigationLabelBounds(context, x, y, target, distance, size) {
    const label = `${target.label} · ${distanceLabel(distance)}`;
    context.save(); context.font = `700 ${Math.max(9, size * 1.12)}px system-ui, sans-serif`;
    const pad = size * 0.55, textWidth = context.measureText(label).width, w = textWidth + pad * 2, h = size * 2.35;
    const W = context.canvas.width, H = context.canvas.height;
    const lx = Math.max(2, Math.min(W - w - 2, x - w / 2));
    const ly = Math.max(2, Math.min(H - h - 2, y + size * 1.15));
    context.restore();
    return { label, x: lx, y: ly, w, h };
  }
  function drawNavigationMarker(context, x, y, centerX, centerY, target, distance, size) {
    const angle = Math.atan2(y - centerY, x - centerX);
    context.save();
    context.globalAlpha = 0.28; context.fillStyle = target.color || '#e4b244';
    context.beginPath(); context.arc(x, y, size * 1.8, 0, Math.PI * 2); context.fill();
    context.globalAlpha = 1; context.translate(x, y); context.rotate(angle);
    context.beginPath(); context.moveTo(size * 1.5, 0); context.lineTo(-size * 0.7, size * 0.76); context.lineTo(-size * 0.35, 0); context.lineTo(-size * 0.7, -size * 0.76); context.closePath();
    context.fillStyle = target.color || '#e4b244'; context.strokeStyle = '#30220b'; context.lineWidth = Math.max(1, size * 0.24); context.fill(); context.stroke();
    context.restore();
    const bounds = navigationLabelBounds(context, x, y, target, distance, size);
    context.save(); context.font = `700 ${Math.max(9, size * 1.12)}px system-ui, sans-serif`;
    context.fillStyle = 'rgba(30, 25, 17, .88)'; context.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    context.fillStyle = '#fff2c4'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(bounds.label, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
    context.restore();
  }
  function radarTargetPoint(target, p, W, H, scale) {
    // The radar follows the avatar's heading: straight ahead is always at the top.
    const bearing = Math.atan2(target.x - p.x, target.z - p.z) - p.heading;
    const distance = Math.hypot(target.x - p.x, target.z - p.z);
    const radius = Math.min(W, H) / 2 - 42 * dpr;
    const rawX = Math.sin(bearing) * distance * scale, rawY = -Math.cos(bearing) * distance * scale;
    const length = Math.hypot(rawX, rawY), k = length > radius ? radius / length : 1;
    return { x: W / 2 + rawX * k, y: H / 2 + rawY * k, clipped: length > radius, distance: navDistance(target, p) };
  }
  function drawWorldRect(context, project, x0, z0, x1, z1, fill, stroke = null) {
    const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => project(x, z));
    context.beginPath(); context.moveTo(...corners[0]);
    for (let i = 1; i < corners.length; i++) context.lineTo(...corners[i]);
    context.closePath();
    if (fill) { context.fillStyle = fill; context.fill(); }
    if (stroke) { context.strokeStyle = stroke; context.lineWidth = 2 * dpr; context.stroke(); }
  }

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
    const p = getPlayer();
    const W = canvas.width, H = canvas.height, physicalScale = zooms[zoomIndex] * (W / 204);
    const cx = ((e.clientX - r.left) / r.width) * W, cy = ((e.clientY - r.top) / r.height) * H;
    for (const target of navigationTargets()) {
      const point = radarTargetPoint(target, p, W, H, physicalScale);
      const label = navigationLabelBounds(ctx, point.x, point.y, target, point.distance, 8 * dpr);
      const onLabel = cx >= label.x && cx <= label.x + label.w && cy >= label.y && cy <= label.y + label.h;
      if (onLabel || Math.hypot(cx - point.x, cy - point.y) <= 18 * dpr) { onNavigationTarget(target); return; }
    }
    const sx = (e.clientX - r.left - r.width / 2), sy = (e.clientY - r.top - r.height / 2);
    const scale = zooms[zoomIndex] * (r.width / 204);
    const a = -(p.heading + Math.PI);
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
    const targets = navigationTargets(), swargaMap = targets.some(target => target.world === 'swarga');
    const scale = zooms[zoomIndex] * (W / 204);
    const yaw = p.heading + Math.PI;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = swargaMap ? '#17243a' : '#9fc6e8';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(yaw);
    ctx.imageSmoothingEnabled = false;
    if (swargaMap) {
      ctx.fillStyle = '#b9ad8d'; ctx.fillRect((-18 - p.x) * scale, (-12.5 - p.z) * scale, 36 * scale, 25 * scale);
      ctx.fillStyle = '#17243a'; ctx.fillRect((-4 - p.x) * scale, (-4.5 - p.z) * scale, 22 * scale, 9 * scale);
      ctx.strokeStyle = '#e5d8b5'; ctx.lineWidth = 2 * dpr;
      ctx.strokeRect((-18 - p.x) * scale, (-12.5 - p.z) * scale, 36 * scale, 25 * scale);
      ctx.fillStyle = '#cbbd9b'; ctx.fillRect((-13 - p.x) * scale, (-25 - p.z) * scale, 26 * scale, 18 * scale);
    } else {
      const k = scale / PPM;
      ctx.drawImage(mapImage, (ISLAND.x0 - p.x) * scale, (ISLAND.z0 - p.z) * scale, mapImage.width * k, mapImage.height * k);
    }
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
    for (const target of targets) {
      const point = radarTargetPoint(target, p, W, H, scale);
      drawNavigationMarker(ctx, point.x, point.y, W / 2, H / 2, target, point.distance, 8 * dpr);
    }
    // North marker on the rim.
    const nAngle = yaw - mapRotation - Math.PI / 2;
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
      const width = ISLAND.x1 - ISLAND.x0, depth = ISLAND.z1 - ISLAND.z0;
      const mapWidth = width * Math.abs(mapCos) + depth * Math.abs(mapSin);
      const mapHeight = width * Math.abs(mapSin) + depth * Math.abs(mapCos);
      const fitScale = Math.min(big.width / mapWidth, big.height / mapHeight) * 0.94;
      const targetRealm = navigationTargets().some(target => target.world === 'swarga');
      const current = getPlayer();
      const outsideMap = current.x < ISLAND.x0 || current.x > ISLAND.x1 || current.z < ISLAND.z0 || current.z > ISLAND.z1;
      view = { cx: targetRealm || outsideMap ? current.x : (ISLAND.x0 + ISLAND.x1) / 2,
        cz: targetRealm || outsideMap ? current.z : (ISLAND.z0 + ISLAND.z1) / 2,
        scale: fitScale, min: fitScale * 0.9, max: fitScale * 4 };
      drawBig();
    }
    return !bigRoot.hidden;
  }
  bigRoot.querySelector('.close').addEventListener('click', () => toggleBig(false));
  bigRoot.addEventListener('click', e => { if (e.target === bigRoot) toggleBig(false); });

  function toWorld(clientX, clientY) {
    const r = big.getBoundingClientRect();
    const sx = (clientX - r.left) * dpr - big.width / 2, sy = (clientY - r.top) * dpr - big.height / 2;
    return {
      x: view.cx + (sx * mapCos + sy * mapSin) / view.scale,
      z: view.cz + (-sx * mapSin + sy * mapCos) / view.scale,
    };
  }
  function projectBigTarget(target, p) {
    const W = big.width, H = big.height, s = view.scale;
    const dx = (target.x - view.cx) * s, dz = (target.z - view.cz) * s;
    const rawX = W / 2 + dx * mapCos - dz * mapSin, rawY = H / 2 + dx * mapSin + dz * mapCos;
    const playerDx = (p.x - view.cx) * s, playerDz = (p.z - view.cz) * s;
    const px = W / 2 + playerDx * mapCos - playerDz * mapSin, py = H / 2 + playerDx * mapSin + playerDz * mapCos;
    const margin = 24 * dpr;
    const minX = margin, maxX = W - margin, minY = margin, maxY = H - margin;
    let x = rawX, y = rawY;
    if (rawX < minX || rawX > maxX || rawY < minY || rawY > maxY) {
      const vx = rawX - px, vy = rawY - py;
      const t = Math.min(vx > 0 ? (maxX - px) / vx : vx < 0 ? (minX - px) / vx : Infinity,
        vy > 0 ? (maxY - py) / vy : vy < 0 ? (minY - py) / vy : Infinity);
      x = px + vx * Math.max(0, t); y = py + vy * Math.max(0, t);
    }
    return { x, y, distance: navDistance(target, p), clipped: x !== rawX || y !== rawY };
  }
  let pan = null;
  big.addEventListener('pointerdown', e => { big.setPointerCapture(e.pointerId); pan = { x: e.clientX, y: e.clientY, moved: false }; });
  big.addEventListener('pointermove', e => {
    if (!pan) return;
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (Math.hypot(dx, dy) > 4) pan.moved = true;
    if (pan.moved) {
      view.cx -= (dx * mapCos + dy * mapSin) * dpr / view.scale;
      view.cz -= (-dx * mapSin + dy * mapCos) * dpr / view.scale;
      pan.x = e.clientX; pan.y = e.clientY; drawBig();
    }
  });
  big.addEventListener('pointerup', e => {
    if (pan && !pan.moved) {
      const r = big.getBoundingClientRect(), x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr, p = getPlayer();
      const target = navigationTargets().find(item => {
        const point = projectBigTarget(item, p), label = navigationLabelBounds(bctx, point.x, point.y, item, point.distance, 11 * dpr);
        const onLabel = x >= label.x && x <= label.x + label.w && y >= label.y && y <= label.y + label.h;
        return onLabel || Math.hypot(point.x - x, point.y - y) <= 22 * dpr;
      });
      if (target) onNavigationTarget(target);
      else { const w = toWorld(e.clientX, e.clientY); onPick(w.x, w.z); }
      toggleBig(false);
    }
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
    const targets = navigationTargets(), swargaMap = targets.some(target => target.world === 'swarga');
    bctx.fillStyle = swargaMap ? '#17243a' : '#9fc6e8';
    bctx.fillRect(0, 0, W, H);
    bctx.imageSmoothingEnabled = false;
    if (!swargaMap) {
      bctx.save();
      bctx.translate(W / 2, H / 2);
      bctx.rotate(mapRotation);
      bctx.drawImage(mapImage, (ISLAND.x0 - view.cx) * s, (ISLAND.z0 - view.cz) * s,
        mapImage.width * s / PPM, mapImage.height * s / PPM);
      bctx.restore();
    }
    const P = (x, z) => {
      const dx = (x - view.cx) * s, dz = (z - view.cz) * s;
      return [W / 2 + dx * mapCos - dz * mapSin, H / 2 + dx * mapSin + dz * mapCos];
    };
    if (swargaMap) {
      drawWorldRect(bctx, P, -18, -12.5, 18, 12.5, '#b9ad8d', '#e5d8b5');
      drawWorldRect(bctx, P, -4, -4.5, 18, 4.5, '#17243a');
      drawWorldRect(bctx, P, -13, -25, 13, -7, '#cbbd9b', '#e5d8b5');
      drawWorldRect(bctx, P, 11, -4, 18, 4, '#c9a85d', '#f4d887');
    }
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
    const [navPx, navPy] = P(p.x, p.z);
    for (const target of targets) {
      const point = projectBigTarget(target, p);
      drawNavigationMarker(bctx, point.x, point.y, navPx, navPy, target, point.distance, 11 * dpr);
    }
    const [px, py] = P(p.x, p.z);
    bctx.save();
    bctx.translate(px, py);
    bctx.rotate(mapRotation - p.heading + Math.PI);
    const a = 11 * dpr;
    bctx.beginPath();
    bctx.moveTo(0, -a); bctx.lineTo(a * 0.72, a * 0.8); bctx.lineTo(0, a * 0.38); bctx.lineTo(-a * 0.72, a * 0.8); bctx.closePath();
    bctx.fillStyle = '#fff'; bctx.strokeStyle = '#111'; bctx.lineWidth = 2 * dpr; bctx.fill(); bctx.stroke();
    bctx.restore();
  }

  function redrawImage() { mapImage = drawMapImage(grid, obstacles, decorate); }

  return { draw, toggleBig, isBigOpen: () => !bigRoot.hidden, drawBig, redrawImage };
}
