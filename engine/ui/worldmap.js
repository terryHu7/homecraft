// The world map: the portal network drawn as a relationship graph. The one-way
// door rings are the edges — this world's doors reach its neighbours, their
// doors reach theirs, discovered recursively through each site's homecraft.json
// doors field. Worlds listed in the portal directory but reachable by no door
// sit in an outer "more worlds" band with no lines. Pure Canvas 2D: zero WebGL
// draw calls, event-driven repaints only.
import { rng } from '../world/textures.js';
import { readSiteInfo, siteText } from '../door-metadata.js';
import { worldKey } from '../door-protocol.js';
import { initialWorlds, getWorlds, isCurrentWorld } from '../portal.js';
import { t } from '../lang.js';

const MAX_DEPTH = 3;        // door hops drawn as rings around this world
const MAX_FETCH = 48;       // homecraft.json reads per open, door graph only
const MAX_NODES = 200;      // door graph + directory bands together
const PAGE = 20;            // directory worlds per band, one band per page
const BAND_GAP = 170;       // metres between directory bands
const CONCURRENT = 5;
const RADIUS = [0, 400, 700, 950, 1180]; // centre, depth 1..3, first directory band
const INK = 'rgba(58, 44, 26, .8)';
const INK_TEXT = '#f3ead2';
const COMPASS_INK = 'rgba(96, 74, 40, .8)';
// Old-chart parchment: warm paper with grain and darker blotches, one tile
// pattern reused across the whole map.
const parchmentTile = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const r = rng(11);
  ctx.fillStyle = '#e9e0c2';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(120, 100, 60, .07)' : 'rgba(255, 250, 235, .09)';
    ctx.fillRect(r() * 256 | 0, r() * 256 | 0, 1 + r() * 2 | 0, 1);
  }
  // Blotches drawn nine times each, wrapped around the tile edges, so the
  // pattern repeats without visible seams.
  for (let i = 0; i < 18; i++) {
    const x = r() * 256, y = r() * 256, rx = 6 + r() * 22, ry = 5 + r() * 16, a = r() * Math.PI;
    ctx.fillStyle = `rgba(${160 + r() * 40 | 0}, ${135 + r() * 35 | 0}, ${85 + r() * 30 | 0}, ${0.035 + r() * 0.045})`;
    for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256], [256, 256], [-256, -256], [256, -256], [-256, 256]]) {
      ctx.beginPath();
      ctx.ellipse(x + ox, y + oy, rx, ry, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return canvas;
})();
let parchmentPattern = null;
const FONT = (px, dpr) => `600 ${px * dpr}px -apple-system, BlinkMacSystemFont, "PingFang SC", system-ui, sans-serif`;

// A compass rose, the old-chart way: rings, a long-short point star, NESW.
function drawCompass(c, x, y, r) {
  c.save(); c.translate(x, y);
  c.strokeStyle = COMPASS_INK;
  c.lineWidth = Math.max(1, r * 0.025);
  c.beginPath(); c.arc(0, 0, r * 0.6, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(0, 0, r * 0.1, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 4, len = i % 2 ? r * 0.38 : r * 0.56, w = i % 2 ? r * 0.055 : r * 0.085;
    c.beginPath();
    c.moveTo(Math.cos(a) * len, Math.sin(a) * len);
    c.lineTo(Math.cos(a + Math.PI / 2) * w + Math.cos(a) * r * 0.08, Math.sin(a + Math.PI / 2) * w + Math.sin(a) * r * 0.08);
    c.lineTo(Math.cos(a - Math.PI / 2) * w + Math.cos(a) * r * 0.08, Math.sin(a - Math.PI / 2) * w + Math.sin(a) * r * 0.08);
    c.closePath();
    c.fillStyle = i % 2 ? 'rgba(96, 74, 40, .45)' : COMPASS_INK;
    c.fill();
  }
  c.fillStyle = COMPASS_INK;
  c.font = `600 ${Math.round(r * 0.14)}px -apple-system, BlinkMacSystemFont, "PingFang SC", system-ui, sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('N', 0, -r * 0.84); c.fillText('S', 0, r * 0.84);
  c.fillText('E', r * 0.84, 0); c.fillText('W', -r * 0.84, 0);
  c.restore();
}

// A little sailing ship, drawn in chart ink.
function drawShip(c, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.strokeStyle = COMPASS_INK; c.lineWidth = 2; c.lineJoin = 'round';
  c.fillStyle = 'rgba(96, 74, 40, .14)';
  c.beginPath();
  c.moveTo(-36, -2); c.quadraticCurveTo(-32, 11, -14, 13); c.lineTo(18, 13);
  c.quadraticCurveTo(36, 9, 40, -4); c.closePath();
  c.fill(); c.stroke();
  c.beginPath(); c.moveTo(-8, -2); c.lineTo(-8, -46); c.moveTo(12, -2); c.lineTo(12, -38); c.stroke();
  c.fillStyle = 'rgba(96, 74, 40, .16)';
  c.beginPath(); c.moveTo(-8, -44); c.quadraticCurveTo(12, -32, -8, -12); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(12, -36); c.quadraticCurveTo(28, -26, 12, -10); c.closePath(); c.fill(); c.stroke();
  c.restore();
}

// A sea serpent: three humps, a neck, a head. Here be dragons.
function drawSerpent(c, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.strokeStyle = COMPASS_INK; c.lineWidth = 2;
  for (const [hx, hr] of [[-34, 8], [-10, 12], [14, 8]]) {
    c.beginPath(); c.arc(hx, 2, hr, Math.PI, 0); c.stroke();
  }
  c.beginPath(); c.moveTo(22, 2); c.quadraticCurveTo(34, 2, 36, -10); c.stroke();
  c.beginPath(); c.arc(38, -13, 4.5, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.moveTo(-42, 2); c.quadraticCurveTo(-50, -2, -48, -9); c.stroke();
  c.restore();
}

export function createWorldMap({ root, onChoose }) {
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const statusEl = root.querySelector('.worldmap-status');
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  let view = null, decor = null, generation = 0, rafId = 0;
  // key → { key, url, name, logo, intro, depth, band, a, x, z, source: 'door'|'directory' }
  const nodes = new Map();
  const edges = []; // [fromKey, toKey]
  const edgeSeen = new Set(); // 'from>to', keeps relationship lines unique
  const logos = new Map();
  // Cursor pagination over the directory: the list is fetched whole, painted
  // PAGE at a time as the visitor pans towards the edge of the painted map.
  let directoryList = [], directoryCursor = 0;
  // Painted directory worlds still awaiting their metadata read: dragging the
  // map pumps this queue, so the network work happens as the visitor explores.
  const enrichPending = new Map();
  let enriching = 0;
  // Once everything listed is loaded, a drag re-checks the directory itself
  // (throttled), so new listings show up without closing the map.
  let lastDirectoryCheck = 0;
  const DIRECTORY_CHECK_TTL = 30000;

  const selfKey = () => worldKey(location.href);
  const hostOf = url => { try { return new URL(url).hostname; } catch { return url; } };
  const logoOf = node => {
    let img = logos.get(node.key);
    if (!img && node.logo) {
      img = Object.assign(new Image(), { src: node.logo, alt: '', decoding: 'async', referrerPolicy: 'no-referrer' });
      img.addEventListener('load', schedule);
      logos.set(node.key, img);
    }
    return img && img.complete && img.naturalWidth ? img : null;
  };
  const selfName = () => document.title.split('-')[0].trim() || t('当前世界', 'This world');

  function pushEdge(from, to) {
    const id = from + '>' + to;
    if (!edgeSeen.has(id)) { edgeSeen.add(id); edges.push([from, to]); }
  }
  function addNode(url, source, depth, parent = null) {
    const key = worldKey(url);
    if (!key || nodes.has(key) || nodes.size >= MAX_NODES) return null;
    const node = { key, url, name: hostOf(url), logo: '', intro: '', depth, a: 0, x: 0, z: 0, source };
    nodes.set(key, node);
    if (parent && nodes.has(parent)) pushEdge(parent, key);
    return node;
  }

  // ---------- Deterministic concentric layout ----------
  function layout() {
    const children = new Map();
    for (const node of nodes.values()) {
      if (node.source === 'directory') continue;
      const parent = edges.find(e => e[1] === node.key)?.[0];
      if (parent) (children.get(parent) || children.set(parent, []).get(parent)).push(node);
    }
    // Each parent hands its own slice of the circle down to its children, so
    // siblings cluster around it and branches stay in their sectors.
    const walk = (key, angle, half) => {
      const kids = children.get(key) || [];
      kids.forEach((node, i) => {
        node.a = half ? angle - half + (2 * half * (i + 0.5)) / kids.length : angle;
        node.placed = true;
        walk(node.key, node.a, half / Math.max(kids.length, 1.4));
      });
    };
    const self = nodes.get(selfKey());
    if (self) { self.x = 0; self.z = 0; }
    const first = children.get(selfKey()) || [];
    first.forEach((node, i) => {
      node.a = (2 * Math.PI * (i + 0.5)) / first.length;
      node.placed = true;
      walk(node.key, node.a, Math.PI / Math.max(first.length, 1.4));
    });
    for (const node of nodes.values()) {
      if (node.source === 'directory' || node.depth === 0 || node.orphan) continue;
      const r = RADIUS[Math.min(node.depth, 3)];
      node.x = Math.sin(node.a) * r;
      node.z = -Math.cos(node.a) * r;
    }
    // Directory worlds nobody's doors reach: the first page rings the outer
    // band, further pages ring outwards as the visitor pans — one band per
    // page, so painted nodes never move when more load.
    const bands = new Map();
    for (const node of nodes.values()) {
      if (node.source !== 'directory') continue;
      const b = node.band || 0;
      (bands.get(b) || bands.set(b, []).get(b)).push(node);
    }
    for (const [band, list] of bands) {
      const r = RADIUS[4] + band * BAND_GAP;
      list.forEach((node, i) => {
        const a = Math.PI * 0.5 + (2 * Math.PI * (i + 0.5)) / list.length;
        node.x = Math.sin(a) * r;
        node.z = -Math.cos(a) * r;
      });
    }
    // Door worlds discovered through a directory node sit just outside their
    // parent's band slot, fanned outwards from the island's centre.
    const orphans = new Map();
    for (const node of nodes.values()) {
      if (node.source !== 'door' || !node.orphan || node.placed) continue;
      const p = edges.find(e => e[1] === node.key)?.[0];
      if (p) (orphans.get(p) || orphans.set(p, []).get(p)).push(node);
    }
    for (const [pKey, list] of orphans) {
      const p = nodes.get(pKey);
      if (!p) continue;
      const a0 = Math.atan2(p.x, -p.z || 1e-6);
      list.forEach((node, i) => {
        const a = a0 + (i - (list.length - 1) / 2) * 0.8;
        node.x = p.x + Math.sin(a) * 95;
        node.z = p.z + Math.cos(a) * 95;
      });
    }
  }

  // ---------- Painting ----------
  function P(x, z) { return [canvas.width / 2 + (x - view.cx) * view.scale, canvas.height / 2 + (z - view.cz) * view.scale]; }
  function toWorld(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return { x: view.cx + ((clientX - r.left) * dpr - canvas.width / 2) / view.scale, z: view.cz + ((clientY - r.top) * dpr - canvas.height / 2) / view.scale };
  }
  function drawEdge([from, to]) {
    const a = nodes.get(from), b = nodes.get(to);
    if (!a || !b) return;
    const [x1, z1] = P(a.x, a.z), [x2, z2] = P(b.x, b.z);
    const mx = (x1 + x2) / 2 - (z2 - z1) * 0.12, mz = (z1 + z2) / 2 + (x2 - x1) * 0.12;
    ctx.strokeStyle = 'rgba(96, 74, 40, .5)';
    ctx.lineWidth = Math.max(1, 2 * dpr);
    ctx.beginPath(); ctx.moveTo(x1, z1); ctx.quadraticCurveTo(mx, mz, x2, z2); ctx.stroke();
    // A small direction bead two-thirds along the curve.
    const t = 0.66, u = 1 - t;
    const bx = u * u * x1 + 2 * u * t * mx + t * t * x2, bz = u * u * z1 + 2 * u * t * mz + t * t * z2;
    ctx.fillStyle = 'rgba(96, 74, 40, .75)';
    ctx.beginPath(); ctx.arc(bx, bz, 3 * dpr, 0, Math.PI * 2); ctx.fill();
  }
  function drawNode(node) {
    const [X, Z] = P(node.x, node.z);
    const r = (node.source === 'directory' ? 22 : 30) * dpr;
    const current = isCurrentWorld(node.url);
    const img = logoOf(node);
    ctx.beginPath(); ctx.arc(X, Z, r, 0, Math.PI * 2);
    ctx.fillStyle = current ? '#ffe9b0' : node.source === 'directory' ? 'rgba(243, 234, 210, .85)' : '#fbf6e8';
    ctx.fill();
    ctx.lineWidth = (current ? 5 : node.source === 'directory' ? 1.5 : 3) * dpr;
    ctx.strokeStyle = current ? '#c8871b' : node.source === 'directory' ? 'rgba(120, 100, 60, .45)' : '#2b6ea8';
    ctx.stroke();
    if (img) {
      ctx.save(); ctx.beginPath(); ctx.arc(X, Z, r - 2 * dpr, 0, Math.PI * 2); ctx.clip();
      ctx.imageSmoothingEnabled = img.naturalWidth > 32;
      ctx.drawImage(img, X - r, Z - r, r * 2, r * 2);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(90, 70, 40, .9)';
      ctx.font = FONT(node.source === 'directory' ? 15 : 19, dpr);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(node.name.trim().slice(0, 1).toLocaleUpperCase() || '?', X, Z + 1);
    }
    ctx.font = FONT(12, dpr);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(node.name).width, lx = X - tw / 2 - 5 * dpr, ly = Z + r + 13 * dpr;
    ctx.fillStyle = INK;
    ctx.fillRect(lx, ly - 9 * dpr, tw + 10 * dpr, 18 * dpr);
    ctx.fillStyle = INK_TEXT;
    ctx.fillText(node.name, lx + 5 * dpr, ly + 1 * dpr);
  }
  function render() {
    if (root.hidden || !view || !canvas.width) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!parchmentPattern) parchmentPattern = ctx.createPattern(parchmentTile, 'repeat');
    ctx.fillStyle = parchmentPattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (decor) ctx.drawImage(decor, 0, 0);
    for (const e of edges) drawEdge(e);
    // Directory nodes first, so door-linked ones paint on top.
    for (const n of nodes.values()) if (n.source === 'directory') drawNode(n);
    for (const n of nodes.values()) if (n.source !== 'directory') drawNode(n);
  }
  const schedule = () => { if (!rafId && !root.hidden) rafId = requestAnimationFrame(() => { rafId = 0; render(); }); };

  // ---------- Hover legend ----------
  // Hovering a node shows its details next to the pointer; clicking one
  // travels right away. The card never takes pointer events, so it can't get
  // between the visitor and the map.
  const card = document.createElement('div'); card.className = 'worldmap-card'; card.hidden = true;
  const cardFace = document.createElement('span'); cardFace.className = 'world-icon'; cardFace.setAttribute('aria-hidden', 'true');
  const cardText = document.createElement('div'); cardText.className = 'world-text';
  const cardName = document.createElement('strong'), cardHost = document.createElement('span'), cardIntro = document.createElement('p');
  cardHost.className = 'world-meta'; cardIntro.className = 'world-intro';
  cardText.append(cardName, cardHost, cardIntro);
  card.append(cardFace, cardText);
  root.append(card);
  let hovered = null;
  function face(holder, node) {
    holder.replaceChildren(node.name.trim().slice(0, 1).toLocaleUpperCase());
    if (!node.logo) return;
    const img = Object.assign(new Image(48, 48), { src: node.logo, alt: '', decoding: 'async', referrerPolicy: 'no-referrer' });
    img.addEventListener('load', () => img.classList.toggle('is-pixel', img.naturalWidth <= 32));
    img.addEventListener('error', () => img.remove());
    holder.append(img);
  }
  function showCard(node) {
    if (hovered === node && !card.hidden) return;
    hovered = node;
    const url = new URL(node.url);
    face(cardFace, node);
    cardName.textContent = node.name;
    cardHost.textContent = url.host + url.pathname.replace(/\/$/, '');
    cardIntro.textContent = node.intro || '';
    card.hidden = false;
  }
  function moveCard(e) {
    card.style.left = Math.min(innerWidth - card.offsetWidth - 14, e.clientX + 18) + 'px';
    card.style.top = Math.min(innerHeight - card.offsetHeight - 14, e.clientY + 18) + 'px';
  }
  const hideCard = () => { if (card.hidden) return; hovered = null; card.hidden = true; };

  // ---------- Pan, zoom, pinch, pick ----------
  const pointers = new Map();
  let pan = null, pinch = null;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pan = null;
    } else if (pointers.size === 1) pan = { x: e.clientX, y: e.clientY, moved: false };
  });
  canvas.addEventListener('pointermove', e => {
    // The hover legend only tracks a free pointer, never a drag.
    if (!pointers.size && view) {
      const node = nodeAt(e.clientX, e.clientY);
      if (node) { showCard(node); moveCard(e); canvas.style.cursor = 'pointer'; }
      else { hideCard(); canvas.style.cursor = ''; }
    }
    const prev = pointers.get(e.pointerId);
    if (prev) { prev.x = e.clientX; prev.y = e.clientY; }
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const before = toWorld(pinch.x, pinch.y);
      view.scale = Math.max(view.min, Math.min(view.max, pinch.scale * dist / pinch.dist));
      const after = toWorld(pinch.x, pinch.y);
      view.cx += before.x - after.x; view.cz += before.z - after.z;
      maybeLoadMore();
      schedule();
    } else if (pan) {
      const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
      if (Math.hypot(dx, dy) > 4) { pan.moved = true; hideCard(); }
      if (pan.moved) { view.userMoved = true; view.cx -= dx * dpr / view.scale; view.cz -= dy * dpr / view.scale; pan.x = e.clientX; pan.y = e.clientY; schedule(); }
    }
  });
  // Hit-test in screen pixels against the drawn circle, so the whole badge
  // responds at any zoom level.
  function nodeAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const px = (clientX - r.left) * dpr, py = (clientY - r.top) * dpr;
    for (const node of nodes.values()) {
      const [X, Z] = P(node.x, node.z);
      const rad = ((node.source === 'directory' ? 22 : 30) + 6) * dpr;
      if (Math.hypot(px - X, py - Z) <= rad) return node;
    }
    return null;
  }
  const release = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pan && pointers.size === 0) {
      // A plain click (no drag) on a node leaves for it right away.
      if (!pan.moved) {
        const node = nodeAt(e.clientX, e.clientY);
        if (node) {
          close();
          onChoose({ url: node.url, name: node.name, homecraft: true, preview: null });
          return;
        }
      }
      pan = null;
    }
    if (e.type !== 'pointercancel') maybeLoadMore();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { hideCard(); canvas.style.cursor = ''; });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const before = toWorld(e.clientX, e.clientY);
    view.scale = Math.max(view.min, Math.min(view.max, view.scale * Math.exp(-e.deltaY * 0.0015)));
    const after = toWorld(e.clientX, e.clientY);
    view.cx += before.x - after.x; view.cz += before.z - after.z;
    view.userMoved = true;
    maybeLoadMore();
    schedule();
  }, { passive: false });

  // ---------- Refitting the view to the graph so far ----------
  function refit() {
    let span = 0;
    for (const n of nodes.values()) span = Math.max(span, Math.abs(n.x), Math.abs(n.z));
    const fitScale = Math.min(canvas.width, canvas.height) / (2 * span + 320) * 0.92;
    if (view?.userMoved) return; // the visitor owns the view once they move it
    view = { cx: 0, cz: 0, scale: fitScale, min: fitScale * 0.85, max: fitScale * 6, userMoved: false };
  }

  // ---------- Discovery ----------
  // A breadth-first walk over the door graph: this world's doors first, then
  // their doors, up to MAX_DEPTH hops. The status line shows done over the
  // number of fetches known so far — the total grows as doors reveal more.
  async function discover() {
    const self = selfKey();
    if (!nodes.has(self)) addNode(location.origin + location.pathname, 'door', 0);
    const queue = [{ url: nodes.get(self)?.url || location.href, depth: 0 }];
    const seen = new Set([self]);
    let done = 0;
    const worker = async () => {
      while (queue.length && !root.hidden && done < MAX_FETCH) {
        const job = queue.shift();
        done++;
        statusEl.textContent = t(`正在发现世界… ${done}/${done + queue.length}`, `Discovering worlds… ${done}/${done + queue.length}`);
        const info = await readSiteInfo(job.url, 4000).catch(() => null);
        if (root.hidden) return;
        const parentKey = worldKey(job.url);
        if (info) {
          const node = nodes.get(parentKey);
          if (node) {
            const name = siteText(info.name);
            if (name) node.name = name;
            node.logo = info.logo || node.logo;
            node.intro = info.intro || node.intro;
          }
          if (job.depth < MAX_DEPTH) {
            for (const door of info.doors || []) {
              const key = worldKey(door);
              if (!key || seen.has(key)) continue;
              seen.add(key);
              // The directory may have drawn this world already; a door link
              // promotes it into the graph and gives it its line.
              const known = nodes.get(key);
              if (known) {
                if (known.source === 'directory') {
                  known.source = 'door';
                  known.depth = job.depth + 1;
                  pushEdge(parentKey, key);
                }
              } else if (addNode(door, 'door', job.depth + 1, parentKey)) {
                queue.push({ url: door, depth: job.depth + 1 });
              }
            }
          }
        }
        layout(); refit(); schedule();
      }
    };
    await Promise.all(Array.from({ length: CONCURRENT }, worker));
    if (!root.hidden) statusEl.textContent = '';
  }
  async function load() {
    const ticket = ++generation;
    nodes.clear(); edges.length = 0; edgeSeen.clear(); logos.clear();
    enrichPending.clear();
    directoryList = []; directoryCursor = 0;
    // Paint what we have at once — this world plus the cached directory's
    // first page — then let the directory refresh and the door BFS refine.
    addNode(location.origin + location.pathname, 'door', 0);
    nodes.get(selfKey()).name = selfName();
    directoryList = initialWorlds().worlds || [];
    paintDirectoryPage();
    layout(); refit(); render();
    const result = await getWorlds();
    if (ticket !== generation || root.hidden) return;
    lastDirectoryCheck = Date.now();
    if (JSON.stringify(result.worlds) !== JSON.stringify(directoryList)) {
      // The reviewed list changed: drop the painted directory and repaint
      // from the fresh one (door-discovered nodes and their lines stay).
      for (const n of [...nodes.values()]) if (n.source === 'directory') nodes.delete(n.key);
      directoryList = result.worlds || [];
      directoryCursor = 0;
      paintDirectoryPage();
    } else {
      directoryList = result.worlds || [];
    }
    layout(); refit(); schedule();
    void discover();
  }
  function paintDirectoryPage() {
    const band = Math.floor(directoryCursor / PAGE);
    const batch = directoryList.slice(directoryCursor, directoryCursor + PAGE);
    batch.forEach((world, i) => {
      if (isCurrentWorld(world.url) || nodes.size >= MAX_NODES) return;
      const node = addNode(world.url, 'directory', 0);
      if (!node) return;
      const name = typeof world.name === 'string' ? world.name : siteText(world.name);
      if (name) node.name = name;
      node.logo = world.logo || '';
      node.intro = world.intro || '';
      node.band = band;
      node.bandIndex = i;
      enrichPending.set(node.key, world);
    });
    directoryCursor += batch.length;
  }
  // Load the next page when the visitor's view reaches the painted edge, like
  // dragging a map towards unexplored water.
  function maybeLoadMore() {
    if (root.hidden || !view) return;
    if (directoryCursor < directoryList.length && nodes.size < MAX_NODES) {
      const hw = canvas.width / (2 * view.scale), hh = canvas.height / (2 * view.scale);
      const reach = Math.max(
        Math.hypot(view.cx - hw, view.cz - hh), Math.hypot(view.cx + hw, view.cz - hh),
        Math.hypot(view.cx - hw, view.cz + hh), Math.hypot(view.cx + hw, view.cz + hh));
      let painted = RADIUS[4];
      for (const n of nodes.values()) if (n.source === 'directory' && n.band !== undefined) painted = Math.max(painted, RADIUS[4] + n.band * BAND_GAP);
      if (reach >= painted + BAND_GAP * 0.6) {
        paintDirectoryPage();
        layout();
        // The visitor owns the view; never move or rescale it. Just let them
        // zoom out far enough for the newly painted bands.
        let span = 0;
        for (const n of nodes.values()) span = Math.max(span, Math.abs(n.x), Math.abs(n.z));
        view.min = Math.min(view.min, Math.min(canvas.width, canvas.height) / (2 * span + 320) * 0.92);
        schedule();
      }
    }
    // Dragging always moves real network work forward, even when every listed
    // world is already painted.
    if (enrichPending.size) pumpEnrichment();
    else if (directoryCursor >= directoryList.length && !enriching) void refreshDirectory();
  }
  // Everything listed is loaded and read: ask the network whether the listing
  // has grown. Throttled, so wandering around the map checks at most every
  // DIRECTORY_CHECK_TTL.
  async function refreshDirectory() {
    const now = Date.now();
    if (now - lastDirectoryCheck < DIRECTORY_CHECK_TTL) return;
    lastDirectoryCheck = now;
    statusEl.textContent = t('正在检查新世界…', 'Checking for new worlds…');
    const result = await getWorlds(true).catch(() => null);
    if (root.hidden) return;
    statusEl.textContent = '';
    if (!result || JSON.stringify(result.worlds) === JSON.stringify(directoryList)) return;
    mergeDirectory(result.worlds || []);
  }
  // The reviewed listing changed: keep everything already on the map (and the
  // nodes the doors discovered), drop listings that left, and paint the new
  // ones onto the next band. Their metadata joins the drag queue.
  function mergeDirectory(list) {
    const listed = new Set(list.map(w => worldKey(w.url)).filter(Boolean));
    for (const n of [...nodes.values()]) {
      if (n.source !== 'directory' || listed.has(n.key)) continue;
      nodes.delete(n.key);
      for (let i = edges.length - 1; i >= 0; i--) {
        const [a, b] = edges[i];
        if (a === n.key || b === n.key) { edgeSeen.delete(a + '>' + b); edges.splice(i, 1); }
      }
    }
    directoryList = list;
    const fresh = list.filter(w => {
      const k = worldKey(w.url);
      return k && !nodes.has(k) && !isCurrentWorld(w.url);
    });
    let painted = [...nodes.values()].filter(n => n.source === 'directory').length;
    for (let i = 0; i < fresh.length; i += PAGE) {
      const band = Math.floor(painted / PAGE);
      fresh.slice(i, i + PAGE).forEach((world, j) => {
        if (nodes.size >= MAX_NODES) return;
        const node = addNode(world.url, 'directory', 0);
        if (!node) return;
        const name = typeof world.name === 'string' ? world.name : siteText(world.name);
        if (name) node.name = name;
        node.logo = world.logo || '';
        node.intro = world.intro || '';
        node.band = band;
        node.bandIndex = j;
        enrichPending.set(node.key, world);
        painted++;
      });
    }
    directoryCursor = list.length;
    layout();
    let span = 0;
    for (const n of nodes.values()) span = Math.max(span, Math.abs(n.x), Math.abs(n.z));
    view.min = Math.min(view.min, Math.min(canvas.width, canvas.height) / (2 * span + 320) * 0.92);
    schedule();
  }
  // Every painted directory world gets its homecraft.json read once: the intro
  // and logo fill in, and any doors it publishes join the relationship graph.
  // Each drag pumps up to 10 of those reads, visible in the network panel.
  function pumpEnrichment(limit = 10) {
    if (root.hidden) return;
    const batch = [...enrichPending.values()].slice(0, limit);
    for (const w of batch) enrichPending.delete(worldKey(w.url));
    if (!batch.length) {
      if (!enriching) statusEl.textContent = '';
      return;
    }
    statusEl.textContent = t(`正在加载世界详情… 剩余 ${enrichPending.size + batch.length}`, `Loading world details… ${enrichPending.size + batch.length} left`);
    const worker = async () => {
      while (batch.length && !root.hidden) {
        const world = batch.shift();
        enriching++;
        const info = await readSiteInfo(world.url, 4000).catch(() => null);
        enriching--;
        if (root.hidden) return;
        const node = nodes.get(worldKey(world.url));
        if (info && node) {
          const name = siteText(info.name);
          if (name) node.name = name;
          node.logo = info.logo || node.logo;
          node.intro = info.intro || node.intro;
          for (const door of info.doors || []) {
            const key = worldKey(door);
            if (!key || key === node.key) continue;
            if (nodes.has(key)) pushEdge(node.key, key);
            else {
              const child = addNode(door, 'door', 1, node.key);
              if (child) child.orphan = true;
            }
          }
        }
        statusEl.textContent = (enrichPending.size || enriching)
          ? t(`正在加载世界详情… 剩余 ${enrichPending.size}`, `Loading world details… ${enrichPending.size} left`) : '';
        layout(); schedule();
      }
    };
    for (let i = 0; i < Math.min(4, batch.length); i++) void worker();
  }
  // The chart furniture: vignette, compass with radiating lines, ship and
  // serpent. Drawn once per open at canvas size, then just blitted.
  function buildDecor() {
    decor = document.createElement('canvas');
    decor.width = canvas.width; decor.height = canvas.height;
    const c = decor.getContext('2d');
    const W = canvas.width, H = canvas.height, u = Math.max(1, dpr);
    const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.72);
    v.addColorStop(0, 'rgba(90, 62, 30, 0)');
    v.addColorStop(1, 'rgba(90, 62, 30, .16)');
    c.fillStyle = v; c.fillRect(0, 0, W, H);
    const cx = 170 * u, cy = H - 170 * u, cr = 105 * u;
    c.strokeStyle = 'rgba(96, 74, 40, .16)';
    c.lineWidth = u;
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * cr * 1.06, cy + Math.sin(a) * cr * 1.06);
      c.lineTo(cx + Math.cos(a) * W, cy + Math.sin(a) * H); c.stroke();
    }
    drawCompass(c, cx, cy, cr);
    drawShip(c, W * 0.6, H * 0.86, 1.5 * u);
    drawSerpent(c, W * 0.8, H * 0.7, 1.3 * u);
  }
  function open() {
    if (!root.hidden) return;
    // Unhide before measuring: a display:none canvas has no box to fit to.
    root.hidden = false;
    hideCard();
    canvas.width = Math.round(canvas.getBoundingClientRect().width * dpr);
    canvas.height = Math.round(canvas.getBoundingClientRect().height * dpr);
    buildDecor();
    void load();
  }
  function close() {
    if (root.hidden) return;
    generation++;
    root.hidden = true; hideCard(); statusEl.textContent = '';
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }
  const toggle = () => (root.hidden ? open() : close());
  root.addEventListener('click', e => { if (e.target === root) close(); });
  root.querySelector('.close').addEventListener('click', close);
  return { open, close, toggle, isOpen: () => !root.hidden, nodeCount: () => nodes.size };
}
