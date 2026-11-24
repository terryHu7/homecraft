// The visitor's persistent identity, kept in localStorage: a random number
// plus a random skin seed, drawn once and kept forever, so the same person
// comes back as the same character. Nothing here identifies anyone — it is a
// costume, not an account.
const KEY = 'homecraft.mp';

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && typeof saved.uid === 'string' && /^[0-9a-f]{8}$/.test(saved.uid)
      && Number.isInteger(saved.seed) && saved.seed >= 0 && saved.seed < 2 ** 32) return saved;
  } catch {}
  return null;
}

export function identity() {
  let saved = read();
  if (!saved) {
    const uid = [...crypto.getRandomValues(new Uint8Array(4))].map(b => b.toString(16).padStart(2, '0')).join('');
    saved = { uid, seed: crypto.getRandomValues(new Uint32Array(1))[0] >>> 0 };
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {}
  }
  return { uid: saved.uid, seed: saved.seed, name: `Token-${saved.uid.slice(-4)}` };
}

// A stable colour per visitor, for chat names and name tags.
export function hueOf(uid) {
  let h = 7;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return h % 360;
}
