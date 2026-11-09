// Homecraft door protocol v1. No renderer or site settings: other worlds can
// use this same adapter. The wire format is stable; see docs/protocol.md.
export const VERSION = '1';
export const MAX_SKIN = 24000;
const siteName = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
export const sourceLabel = (name, url) => siteName(name) || (() => { const u = worldURL(url); return u ? u.host + u.pathname.replace(/\/$/, '') : ''; })();
const MAX_BYTES = MAX_SKIN * 3 / 4;
const PNG = [137, 80, 78, 71, 13, 10, 26, 10];
export function worldURL(value, base = globalThis.location?.href) {
  try {
    if (!value || typeof value !== 'string') return null;
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.searchParams.delete('from');
    return url;
  } catch { return null; }
}
export const worldKey = (value, base = globalThis.location?.href) => {
  const url = value instanceof URL ? value : worldURL(value, base);
  return url ? url.origin + url.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '') : null;
};
const encode = bytes => {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
// Check the IHDR before decoding: a tiny compressed file can claim enormous
// dimensions. Repaint to discard metadata and send only pixels, never code.
async function pixels(bytes) {
  if (bytes.length < 33 || bytes.length > MAX_BYTES || !PNG.every((b, i) => bytes[i] === b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452 || view.getUint32(16) !== 64 || view.getUint32(20) !== 64) return null;
  try {
    const img = new Image();
    img.src = `data:image/png;base64,${encode(bytes).replace(/-/g, '+').replace(/_/g, '/')}`;
    await img.decode();
    if (img.naturalWidth !== 64 || img.naturalHeight !== 64) return null;
    const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
    canvas.getContext('2d').drawImage(img, 0, 0);
    const url = canvas.toDataURL('image/png'), value = url.split(',')[1].replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return value.length <= MAX_SKIN ? { url, value, carried: false } : null;
  } catch { return null; }
}
export async function decodeSkin(value) {
  if (value === 'default') return { url: '', value, carried: true };
  if (typeof value !== 'string' || value.length > MAX_SKIN || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const skin = await pixels(Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
    return skin && { ...skin, carried: true };
  } catch { return null; }
}
async function readOwnSkin(src) {
  if (!src) return null;
  const url = worldURL(src);
  if (!url) return null;
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 2500);
  let reader;
  try {
    const response = await fetch(url, { signal: abort.signal, credentials: 'omit' });
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES) return null;
    reader = response.body?.getReader();
    if (!reader) return null;
    const chunks = []; let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) return null;
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return await pixels(bytes);
  } catch { return null; }
  finally { clearTimeout(timer); if (reader) void reader.cancel().catch(() => {}); abort.abort(); }
}

export function navigateDoor(href) {
  let target;
  try { target = new URL(href); } catch { return; }
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) return;
  // A fresh HTTPS -> localhost visit also needs an origin referrer. Only
  // loopback development addresses get this policy, never general HTTP.
  const loopback = target.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
  const a = Object.assign(document.createElement('a'), { href: target.href, referrerPolicy: loopback ? 'origin' : 'strict-origin-when-cross-origin' });
  document.body.append(a); a.click(); a.remove();
}

export function createTravelSession(ownSkin = '', defaultSkin = '', ownTitle = '') {
  // Each path is a separate world. Keep a memory copy too: blocking storage
  // must not discard the skin that has just arrived in this page.
  const key = `homecraft-visit:${worldKey(location.href)}`;
  let state = {}, worn;
  try { const saved = JSON.parse(sessionStorage.getItem(key)); if (saved && typeof saved === 'object' && !Array.isArray(saved)) state = saved; } catch {}
  function save() {
    try { sessionStorage.setItem(key, JSON.stringify(state)); } catch {}
    // Separate history entries can represent different journeys in the same
    // world. A fresh Back/Forward load must restore that entry's appearance.
    try { history.replaceState({ ...history.state, homecraftVisit: state }, '', location.href); } catch {}
  }
  return {
    arrive() {
      const url = new URL(location.href), hash = new URLSearchParams(url.hash.slice(1));
      const sent = worldURL(url.searchParams.get('from'));
      let vouched = false;
      try { vouched = !!sent && !!document.referrer && new URL(document.referrer).origin === sent.origin; } catch {}
      // HTTPS -> local HTTP drops referrer. Recognise a return from the world
      // this tab actually left for; do not trust an arbitrary pasted link.
      const door = hash.get('homecraft') === VERSION && sent && worldKey(sent.href) !== worldKey(url.href)
        && (vouched || state.departed === worldKey(sent.href));
      const type = performance.getEntriesByType('navigation')[0]?.type;
      if (door) {
        const skin = hash.get('skin');
        state = { from: sent.origin + sent.pathname, fromName: siteName(hash.get('fromName')), skin: skin?.length <= MAX_SKIN ? skin : null };
      }
      else if (url.searchParams.has('from') || hash.has('homecraft') || (type !== 'reload' && type !== 'back_forward')) state = {};
      else {
        const saved = history.state?.homecraftVisit;
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) state = { ...saved };
      }
      delete state.departed;
      save();
      if (url.searchParams.has('from') || hash.has('homecraft')) {
        url.searchParams.delete('from');
        if (hash.has('homecraft')) { hash.delete('homecraft'); hash.delete('skin'); hash.delete('fromName'); url.hash = hash.toString(); }
        history.replaceState(history.state, '', url);
      }
      return { door: !!door, from: worldURL(state.from)?.href || null, fromName: siteName(state.fromName) };
    },
    wornSkin() {
      return worn ??= (async () => {
        const carried = await decodeSkin(state.skin);
        if (carried) {
          state.skin = carried.value; save();
          if (carried.value === 'default' && defaultSkin) { const preset = await readOwnSkin(defaultSkin); if (preset) return { ...preset, value: 'default', carried: true }; }
          return carried;
        }
        delete state.skin; save();
        return await readOwnSkin(ownSkin) || { url: '', value: 'default', carried: false };
      })();
    },
    async link(world) {
      const url = worldURL(world?.url);
      if (!url || worldKey(url.href) === worldKey(location.href)) return null;
      if (world.homecraft === true) {
        const skin = await this.wornSkin();
        // Only a public address, never this page's query tokens or fragment.
        url.searchParams.set('from', location.origin + location.pathname);
        const carry = new URLSearchParams({ homecraft: VERSION, skin: skin.value });
        const title = typeof ownTitle === 'function' ? await ownTitle() : ownTitle;
        const name = siteName(title) || siteName(document.title);
        if (name) carry.set('fromName', name);
        url.hash = carry.toString();
      }
      state.departed = worldKey(url.href); save();
      return url.href;
    },
  };
}
