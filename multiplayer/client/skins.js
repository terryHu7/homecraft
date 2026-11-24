// Deterministic 64×64 skins from a number: the same seed always paints the
// same character, so a visitor keeps their face across reloads without a
// single image byte travelling. The layout is the standard Minecraft skin the
// engine already maps (engine/world/skin.js); only the palette is ours.
// The hat layer stays transparent, like the engine's default skin.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rnd, list) => list[(rnd() * list.length) | 0];
const hsl = (h, s, l) => `hsl(${h}, ${s}%, ${l}%)`;

// Mix a #rrggbb colour towards white (f > 0) or black (f < 0) by f percent.
const tint = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const mix = c => Math.round(f > 0 ? c + (255 - c) * f / 100 : c * (1 + f / 100));
  return `rgb(${mix(n >> 16 & 255)},${mix(n >> 8 & 255)},${mix(n & 255)})`;
};

// Skin tones: [base, shade, deep, mouth].
const TONES = [
  ['#f2c9a4', '#e0b28c', '#c99c76', '#bd8a72'],
  ['#e8b98f', '#d6a47c', '#c79670', '#b06f5c'],
  ['#d9a071', '#c48a5e', '#a9744c', '#a05c48'],
  ['#c68e62', '#b07a50', '#996643', '#96543e'],
  ['#b87a4e', '#a2683e', '#8a5633', '#844a34'],
  ['#8d5a3b', '#7a4c31', '#663e28', '#6e3d2c'],
  ['#f4d3b8', '#e2b99b', '#cfa181', '#c08a74'],
  ['#6b4226', '#5c3820', '#4d2e1b', '#5a3024'],
];

const HAIR = ['#1e1a17', '#2f2318', '#3b2a20', '#4f392b', '#5c4327', '#8a6b3d', '#b8894a', '#caa25a',
  '#8c4a2f', '#a8524a', '#4a5568', '#7d7a73', '#3d5a4e', '#5a4a7d', '#b05a7d', '#2a4d6e'];
const EYES = ['#2a211d', '#2a211d', '#263a4a', '#39543a'];
const TOP_HUES = [5, 20, 35, 50, 90, 130, 165, 200, 220, 260, 300, 340];
const PANTS = [ // [base, light, dark]
  ['#3f5b85', '#4a6895', '#36507a'], ['#33383f', '#3f454d', '#282c32'],
  ['#4a4238', '#564d41', '#3d362e'], ['#54443f', '#61504a', '#463935'],
  ['#2e4a3e', '#38574a', '#263d33'], ['#555b60', '#63696e', '#474c50'],
];
const SHOES = [
  ['#e6e3dc', '#f4f2ec', '#9a978f'], ['#2e2b28', '#3d3a36', '#191715'],
  ['#6e3b36', '#7d4640', '#522c28'], ['#3e4e5e', '#4a5c6d', '#2e3a46'],
];
const WHITE = '#f4efe9';

export function paintSeed(ctx, seed) {
  const rnd = mulberry32(seed);
  const [skin, skinShade, skinDeep, mouth] = pick(rnd, TONES);
  const hair = pick(rnd, HAIR), hairHi = tint(hair, 12);
  const roll = rnd();
  const style = roll < 0.08 ? 'bald' : roll < 0.38 ? 'long' : 'short';
  const eye = pick(rnd, EYES);
  const hue = pick(rnd, TOP_HUES), sat = 26 + (rnd() * 16 | 0), lit = 36 + (rnd() * 14 | 0);
  const top = hsl(hue, sat, lit), topHi = hsl(hue, sat, lit + 8), topLo = hsl(hue, sat + 6, lit - 9);
  const [pants, pantsHi, pantsLo] = pick(rnd, PANTS);
  const [shoe, shoeHi, sole] = pick(rnd, SHOES);

  const region = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  const paint = (x0, y0, w, h, fn) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { ctx.fillStyle = fn(x, y); ctx.fillRect(x0 + x, y0 + y, 1, 1); }
  };
  const knit = (x, y) => ((x * 3 + y * 5) % 11 === 0 ? topHi : top);
  const denim = (x, y) => ((x + y) % 6 === 0 ? pantsHi : (x * 5 + y) % 9 === 0 ? pantsLo : pants);
  const hairAt = (x, y) => ((x + y * 3) % 7 === 0 ? hairHi : hair);

  // Head (u 0, v 0): hair on top, the face below it, long hair down the sides.
  paint(8, 0, 8, 8, (x, y) => (style === 'bald' ? (y > 4 ? skin : skinShade) : hairAt(x, y)));
  region(16, 0, 8, 8, skinDeep);
  paint(8, 8, 8, 8, (x, y) => {
    const fringe = style === 'bald' ? (y < 1 ? skinShade : skin) : y < 2 ? hairAt(x, y) : y === 2 ? (x < 2 || x > 5 ? hair : skin) : skin;
    if (y === 3) return skin;
    if (y === 4) return x === 1 || x === 6 ? WHITE : x === 2 || x === 5 ? eye : skin;
    if (y === 5) return x === 3 || x === 4 ? skinShade : skin;
    if (y === 6) return x === 3 || x === 4 ? mouth : skin;
    if (y === 7) return x === 0 || x === 7 ? skinShade : skin;
    return fringe;
  });
  const sideHair = (x, y) => {
    if (style === 'bald') return y === 7 ? skinShade : skin;
    if (style === 'long') return y < 7 ? hairAt(x, y) : hair;
    return y < 3 || (y === 3 && (x < 2 || x > 5)) ? hairAt(x, y) : y === 7 ? skinShade : skin;
  };
  paint(0, 8, 8, 8, sideHair);
  paint(16, 8, 8, 8, sideHair);
  paint(24, 8, 8, 8, (x, y) => style === 'bald' ? (y === 7 ? skinShade : skin)
    : style === 'long' ? hairAt(x, y) : y < 7 ? hairAt(x, y) : skinShade);

  // Body (u 16, v 16): a plain tee with a collar and a pocket, trousers below.
  paint(20, 16, 8, 4, (x, y) => (y === 3 && x > 1 && x < 6 ? topLo : top));
  region(28, 16, 8, 4, pants);
  paint(20, 20, 8, 12, (x, y) => {
    if (y >= 10) return denim(x, y);
    if (y === 0 && x >= 1 && x <= 6) return topLo;
    if (y >= 6 && y <= 8 && x >= 1 && x <= 6) return y === 6 ? topLo : topHi;
    return knit(x, y);
  });
  paint(32, 20, 8, 12, (x, y) => (y >= 10 ? denim(x, y) : y <= 2 && x >= 1 && x <= 6 ? topLo : knit(x, y)));
  for (const x0 of [16, 28]) paint(x0, 20, 4, 12, (x, y) => (y >= 10 ? denim(x, y) : knit(x, y)));

  // Arms: a sleeve to the wrist, then the hand.
  const arm = (u, v) => {
    paint(u + 4, v, 4, 4, () => top);
    region(u + 8, v, 4, 4, skinShade);
    for (let face = 0; face < 4; face++) {
      paint(u + face * 4, v + 4, 4, 12, (x, y) => {
        if (y >= 10) return y === 11 ? skinShade : skin;
        if (y === 9) return topLo;
        return knit(x + face, y);
      });
    }
  };
  arm(40, 16);
  arm(32, 48);

  // Legs: trousers, shoes with a sole line.
  const leg = (u, v) => {
    region(u + 4, v, 4, 4, pants);
    region(u + 8, v, 4, 4, sole);
    for (let face = 0; face < 4; face++) {
      paint(u + face * 4, v + 4, 4, 12, (x, y) => {
        if (y === 11) return sole;
        if (y >= 9) return face === 1 && y === 9 ? shoeHi : shoe;
        return denim(x + face * 4, y);
      });
    }
  };
  leg(0, 16);
  leg(16, 48);
}

const cache = new Map();

// The 64×64 canvas for a seed, painted once and kept — the pool copies its
// pixels into a texture-array layer.
export function seedCanvas(seed) {
  let canvas = cache.get(seed);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    paintSeed(canvas.getContext('2d'), seed);
    cache.set(seed, canvas);
    if (cache.size > 128) cache.delete(cache.keys().next().value);
  }
  return canvas;
}

// The URL createAvatar() wears for a seed, painted once and kept.
export function seedSkinUrl(seed) {
  return seedCanvas(seed).toDataURL('image/png');
}

// A carried PNG (already validated by decodeSkin) as a canvas, for the pool.
export function pngCanvas(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth !== 64 || img.naturalHeight !== 64) return resolve(null);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
