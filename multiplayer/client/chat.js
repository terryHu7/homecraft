// Chat, dressed like the engine's HUD: a fading log above the radar, a field
// opened with T (or by tapping the hint), and a speech bubble over whoever is
// talking. Everything is plain text — never innerHTML — and nothing is kept:
// close the tab and the conversation is gone, as promised.
import * as THREE from 'three';

// The interface copy is Chinese only, per the site owner; other sites that
// copy this module translate these few strings in place.
const MAX_LINES = 6, LINE_TTL = 12000, BUBBLE_TTL = 6000;

const CSS = `
#mp-chat { position: fixed; left: 20px; bottom: calc(max(20px, env(safe-area-inset-bottom)) + 232px); z-index: 12;
  width: min(340px, 62vw); display: flex; flex-direction: column; gap: 5px; font: 500 13px/1.45 var(--text);
  pointer-events: none; }
#mp-chat[hidden] { display: none; }
.mp-log { display: flex; flex-direction: column; gap: 2px; }
.mp-line { width: fit-content; max-width: 100%; padding: 3px 8px; border-radius: 4px; overflow-wrap: anywhere;
  background: rgba(12, 14, 13, .55); color: #f2f0ea; text-shadow: 1px 1px 0 rgba(0, 0, 0, .5); transition: opacity .8s; }
.mp-line b { font-weight: 600; }
.mp-line.sys { color: #cbc8c0; font-size: 12px; padding: 2px 8px; }
.mp-line.fade { opacity: 0; }
.mp-hint { pointer-events: auto; justify-self: start; padding: 3px 10px; border: 0; border-radius: 4px; cursor: pointer;
  background: rgba(12, 14, 13, .55); color: #e8e6df; font: 500 12px/1.4 var(--text); }
.mp-hint.down { opacity: .55; cursor: default; }
.mp-field { pointer-events: auto; display: none; gap: 4px; }
#mp-chat.typing .mp-field { display: flex; }
#mp-chat.typing .mp-hint { display: none; }
.mp-field input { flex: 1; min-width: 0; padding: 7px 9px; border: 0; border-radius: 4px;
  background: var(--field); color: var(--ink); font: 500 13px/1.4 var(--text);
  box-shadow: 0 0 0 2px var(--line), inset 1px 1px 0 rgba(0, 0, 0, .15); }
.mp-field input:focus-visible { outline: 2px solid var(--gold); outline-offset: 1px; }
.mp-layer { position: fixed; inset: 0; z-index: 9; pointer-events: none; overflow: hidden; }
.mp-tag, .mp-bubble { position: absolute; left: 0; top: 0; will-change: transform; }
.mp-tag { padding: 2px 7px; border-radius: 4px; background: rgba(12, 14, 13, .6); color: #fff;
  font: 600 12px/1.3 var(--text); text-shadow: 1px 1px 0 rgba(0, 0, 0, .6); }
.mp-bubble { max-width: 230px; padding: 5px 9px; border-radius: 6px; background: var(--gui); color: var(--ink);
  font: 500 13px/1.4 var(--text); box-shadow: 0 0 0 2px var(--line); overflow-wrap: anywhere; }
.mp-bubble b { font-weight: 600; }
.mp-bubble::after { content: ""; position: absolute; left: 50%; top: 100%; margin-left: -5px;
  border: 5px solid transparent; border-top-color: var(--line); }
`;

export function createChat({ onSend, selfId }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const root = document.createElement('div');
  root.id = 'mp-chat';
  root.hidden = true;
  const layer = document.createElement('div');
  layer.className = 'mp-layer';
  const log = document.createElement('div');
  log.className = 'mp-log';
  const hint = document.createElement('button');
  hint.className = 'mp-hint';
  hint.type = 'button';
  const field = document.createElement('form');
  field.className = 'mp-field';
  const input = document.createElement('input');
  input.maxLength = 120;
  input.placeholder = '说点什么…';
  input.autocomplete = 'off';
  field.append(input);
  root.append(log, hint, field);
  document.body.append(root, layer);

  const folks = new Map(); // id → { tag, bubble, until, name, hue }
  let online = 0, connected = false;

  // ---------- log ----------
  function retire(line, delay) {
    const fade = setTimeout(() => line.classList.add('fade'), delay);
    setTimeout(() => line.remove(), delay + 900);
    return fade;
  }
  function addLine(el, ttl = LINE_TTL) {
    log.append(el);
    while (log.children.length > MAX_LINES) log.firstElementChild.remove();
    retire(el, ttl);
  }
  const nameEl = (name, hue) => {
    const b = document.createElement('b');
    b.textContent = name;
    b.style.color = `hsl(${hue}, 62%, 70%)`;
    return b;
  };
  function line(id, text) {
    const folk = folks.get(id);
    const el = document.createElement('div');
    el.className = 'mp-line';
    el.append(nameEl(folk?.name || id, folk?.hue || 0), ` ${text}`);
    addLine(el);
  }
  function system(text) {
    const el = document.createElement('div');
    el.className = 'mp-line sys';
    el.textContent = text;
    addLine(el, 6000);
  }

  // ---------- the hint / presence ----------
  function hint_text() {
    hint.textContent = connected ? `${online} 人在岛上 · 按 T 聊天` : '重连中…';
    hint.classList.toggle('down', !connected);
  }
  function presence(n) { online = n; hint_text(); }
  function status(s) {
    connected = s === 'up';
    root.hidden = s === 'offline';
    if (!root.hidden) { hint_text(); if (connected) system('连上了小岛'); }
  }

  // ---------- the field ----------
  const sent = [];
  function open() {
    root.classList.add('typing');
    input.focus();
  }
  function close() {
    root.classList.remove('typing');
    input.value = '';
    input.blur();
  }
  hint.addEventListener('click', () => { if (connected) open(); });
  field.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim().slice(0, 120);
    close();
    if (!text) return;
    const now = Date.now();
    while (sent.length && now - sent[0] > 10000) sent.shift();
    if (sent.length >= 4) { system('说得太快了，歇口气'); return; }
    sent.push(now);
    onSend(text);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  });
  addEventListener('keydown', e => {
    if (root.hidden || document.activeElement === input) return;
    const typing = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 't' || e.key === 'T' || e.key === '/') {
      e.preventDefault();
      if (connected) open();
    }
  }, true);

  // ---------- tags and bubbles over heads ----------
  function track(id, name, hue) {
    let folk = folks.get(id);
    if (!folk) {
      const tag = document.createElement('div');
      tag.className = 'mp-tag';
      const bubble = document.createElement('div');
      bubble.className = 'mp-bubble';
      bubble.style.visibility = 'hidden';
      layer.append(tag, bubble);
      folk = { tag, bubble, until: 0, name, hue };
      folks.set(id, folk);
    }
    folk.name = name; folk.hue = hue;
    folk.tag.textContent = name;
    folk.tag.style.color = `hsl(${hue}, 62%, 72%)`;
    return folk;
  }
  function untrack(id) {
    const folk = folks.get(id);
    if (!folk) return;
    folk.tag.remove(); folk.bubble.remove();
    folks.delete(id);
  }
  // The server went away: everyone but ourselves disappears from the island.
  function clear() {
    for (const [id, folk] of folks) {
      if (id === selfId) {
        folk.tag.style.visibility = 'hidden';
        folk.bubble.style.visibility = 'hidden';
        continue;
      }
      folk.tag.remove(); folk.bubble.remove();
      folks.delete(id);
    }
  }
  function sayBubble(id, text) {
    const folk = folks.get(id);
    if (!folk) return;
    folk.bubble.replaceChildren(nameEl(folk.name, folk.hue), ` ${text}`);
    folk.bubble.style.visibility = 'visible';
    folk.until = performance.now() + BUBBLE_TTL;
  }
  // For one's own lines: the self record exists even though the engine
  // renders that body itself.
  track(selfId, '', 0);

  const _v = new THREE.Vector3();
  function place(el, x, y, z, camera, lift, w, h) {
    _v.set(x, y + lift, z).applyMatrix4(camera.matrixWorldInverse);
    if (_v.z > -0.3) return false;
    _v.applyMatrix4(camera.projectionMatrix);
    if (_v.z >= 1) return false;
    el.style.transform = `translate(${((_v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - (_v.y + 1) / 2) * h).toFixed(1)}px) translate(-50%, -100%)`;
    return true;
  }
  function update(now, camera, anchorOf) {
    if (root.hidden) return;
    const w = innerWidth, h = innerHeight;
    for (const [id, folk] of folks) {
      const anchor = anchorOf(id);
      if (!anchor) {
        folk.tag.style.visibility = 'hidden';
        folk.bubble.style.visibility = 'hidden';
        continue;
      }
      const x = anchor.x, y = anchor.y, z = anchor.z;
      const showBubble = folk.until > now;
      if (place(folk.tag, x, y, z, camera, 2.16, w, h)) folk.tag.style.visibility = 'visible';
      else folk.tag.style.visibility = 'hidden';
      if (showBubble) {
        if (place(folk.bubble, x, y, z, camera, folk.tag.style.visibility === 'visible' ? 2.62 : 2.2, w, h)) folk.bubble.style.visibility = 'visible';
        else folk.bubble.style.visibility = 'hidden';
      } else folk.bubble.style.visibility = 'hidden';
    }
  }

  return { line, system, presence, status, track, untrack, clear, sayBubble, update };
}
