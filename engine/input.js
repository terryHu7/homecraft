// Keys, mouse and touch, reduced to what the world needs: a move vector, a run
// flag, up and down for flight, orbit and zoom deltas, taps, and the point
// under the cursor. Space jumps; two quick presses start or end flight, as in
// Minecraft. While flying, Space climbs, Ctrl descends and Shift goes faster.
// P brings the phone up and puts it away. Only the primary button taps.
// On a touch screen the flight pad (handlers.pad) adds its arrows to the keys.

export function createInput(canvas, handlers) {
  const keys = new Set();
  const move = { x: 0, z: 0, run: false, up: false, down: false };
  const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
    'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ']);
  let lastSpace = -1e9;
  const pointers = new Map();
  let drag = null, pinch = null;
  const blocked = () => handlers.blocked?.();

  // Movement follows physical keys, even when an IME/layout changes `key`
  // between keydown and keyup. Keep a fallback for keyboards without `code`.
  const keyId = e => e.code && e.code !== 'Unidentified' ? e.code : e.key.toLowerCase();
  const held = (code, fallback) => keys.has(code) || keys.has(fallback);
  const typing = e => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement ||
    e.target instanceof HTMLSelectElement || e.target instanceof HTMLElement && e.target.isContentEditable;
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase(), id = keyId(e), movement = MOVE_KEYS.has(id);
    // Ctrl is the descend key; with it held, only movement keys pass through.
    if (id === 'ControlLeft' || id === 'ControlRight' || id === 'control') { if (!typing(e) && !blocked()) keys.add(id); return; }
    if (typing(e) || e.metaKey || e.altKey || (e.ctrlKey && !movement)) return;
    if (k === 'escape') { handlers.escape?.(); return; }
    if (!movement && /^[1-9]$/.test(k) && !handlers.shortcutsBlocked?.()) {
      if (!e.repeat) handlers.slot?.(Number(k));
      return;
    }
    if (blocked()) return;
    // Own movement keys while exploring, including browser actions such as
    // Ctrl+D (bookmark on Windows) and the IME's default text handling.
    if (movement) e.preventDefault();
    if (id === 'Space' || id === ' ') {
      // Keep a focused button from being pressed by the same Space.
      if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
      if (!e.repeat) {
        const now = performance.now();
        if (now - lastSpace < 300) { lastSpace = -1e9; handlers.toggleFly?.(); }
        else { lastSpace = now; handlers.jump?.(); }
        handlers.anyKey?.(e);
      }
      keys.add(id);
      return;
    }
    if (!e.repeat) {
      if (!movement) {
        if (k === 'f' || k === 'e' || k === 'enter') handlers.interact?.();
        else if (k === 'm') { e.preventDefault(); handlers.map?.(); }
        else if (k === 'tab') { e.preventDefault(); handlers.bigMap?.(); }
        else if (k === 'v') handlers.view?.();
        else if (k === 'p') handlers.phone?.();
      }
      handlers.anyKey?.(e);
    }
    keys.add(id);
  });
  addEventListener('keyup', e => keys.delete(keyId(e)));
  addEventListener('blur', clear);
  const isTouch = e => e.pointerType === 'touch';

  canvas.addEventListener('pointerdown', e => {
    if (blocked()) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    handlers.anyKey?.(e);
    // Tap anywhere to walk; drag anywhere to orbit. A second finger cancels
    // the tap candidate, so releasing a pinch never sends the player walking.
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      drag = null;
      return;
    }
    if (!drag) drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, touch: isTouch(e), button: e.button };
  });

  canvas.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      handlers.zoom?.(pinch.d / Math.max(d, 1));
      pinch.d = d;
      return;
    }
    if (drag && e.pointerId === drag.id) {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > (drag.touch ? 10 : 5)) drag.moved = true;
      if (drag.moved) handlers.orbit?.(e.clientX - drag.lx, e.clientY - drag.ly);
      drag.lx = e.clientX; drag.ly = e.clientY;
      return;
    }
    if (!e.buttons && !isTouch(e)) handlers.hover?.(e.clientX, e.clientY);
  });

  const end = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && e.pointerId === drag.id) {
      if (!drag.moved && e.type === 'pointerup' && !blocked() && (drag.touch || drag.button === 0)) handlers.tap?.(e.clientX, e.clientY);
      drag = null;
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);
  canvas.addEventListener('pointerleave', () => handlers.hover?.(-1, -1));
  canvas.addEventListener('wheel', e => { e.preventDefault(); if (!blocked()) handlers.zoom?.(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  function read() {
    const pad = handlers.pad?.();
    let x = pad?.x || 0, z = pad?.z || 0;
    if (held('KeyA', 'a') || held('ArrowLeft', 'arrowleft')) x -= 1;
    if (held('KeyD', 'd') || held('ArrowRight', 'arrowright')) x += 1;
    if (held('KeyW', 'w') || held('ArrowUp', 'arrowup')) z -= 1;
    if (held('KeyS', 's') || held('ArrowDown', 'arrowdown')) z += 1;
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    move.x = x; move.z = z;
    move.run = held('ShiftLeft', 'shift') || keys.has('ShiftRight');
    move.up = held('Space', ' ') || !!pad?.up;
    move.down = held('ControlLeft', 'control') || keys.has('ControlRight') || !!pad?.down;
    return move;
  }

  function clear() { keys.clear(); drag = null; pinch = null; pointers.clear(); }

  return { read, clear };
}
