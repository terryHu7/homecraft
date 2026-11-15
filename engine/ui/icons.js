// 16×16 pixel icons, drawn once into data URLs: hotbar items, map blips,
// panel headers. One letter per pixel; '.' is transparent.
import { FACE as DEFAULT_FACE, SPRITE } from '../world/skin.js';
import { drawDoor } from '../door-controls.js';

const HOMECRAFT_LOGO_URL = new URL('../assets/homecraft-logo-32.png', import.meta.url).href;

const PALETTE = {
  k: '#1d1d1f', w: '#ffffff', g: '#c6c6c6', G: '#6b6b6b', b: '#9c6b3f', B: '#5c3a1b', t: '#c89b62',
  o: '#e07a2e', O: '#a8501c', y: '#f2c94c', Y: '#b8862a', r: '#d23c3c', R: '#8c2222', c: '#4fb3e0', C: '#2b6c9e',
  e: '#6aa84f', E: '#2f5b46', p: '#f1ece0', P: '#d8ccb0', m: '#a9b0b8', M: '#6c737b', n: '#6b3f22', s: '#ecc59f', h: '#1d1b1b',
  v: '#9d6bff', l: '#ffe7a6', V: '#d9c3ff', u: '#bcdfff',
};

const ART = {
  // Homecraft's mark: a grass block.
  logo: [
    '................',
    '.kkkkkkkkkkkkkk.',
    '.keeeeeeeeeeeek.',
    '.keEeeeEeeeEeek.',
    '.keeeeeeeeeeeek.',
    '.kEeEbeEEbeEeEk.',
    '.kbbEbbbbbEbbbk.',
    '.kbbbbBbbbbbBbk.',
    '.kbBbbbbbBbbbbk.',
    '.kbbbbbbbbbbbbk.',
    '.kbbbBbbbbbBbbk.',
    '.kbbbbbbBbbbbbk.',
    '.kBbbbbbbbbbBbk.',
    '.kbbbbBbbbbbbbk.',
    '.kkkkkkkkkkkkkk.',
    '................',
  ],
  blog: [
    '................',
    '................',
    '..kkkkk..kkkkk..',
    '.kwwwwwkkwwwwwk.',
    '.kwggwwkkwggwwk.',
    '.kwwwwwkkwwwwwk.',
    '.kwgggwkkwgggwk.',
    '.kwwwwwkkwwwwwk.',
    '.kwggwwkkwggwwk.',
    '.kwwwwwkkwwwwwk.',
    '.kwgggwkkwgggwk.',
    '.kPPPPPkkPPPPPk.',
    '.kkkkkkkkkkkkkk.',
    '.......kk.......',
    '................',
    '................',
  ],
  works: [
    '................',
    '.kkkkkkkkkkkkkk.',
    '.kttttttttttttk.',
    '.kBBBBBBBBBBBBk.',
    '.kbbbbbbbbbbbbk.',
    '.kbMMbbbbbbbmbk.',
    '.kbMMMbbbbbmmbk.',
    '.kbbMMbbbbmmbbk.',
    '.kbbbBbbbmmbbbk.',
    '.kbbbbBbmmbbbbk.',
    '.kbbbbbBmbbbbbk.',
    '.kbbbbbbBbbbbbk.',
    '.kbbbbbbbBbbbbk.',
    '.kBBBBBBBBBBBBk.',
    '.kkkkkkkkkkkkkk.',
    '................',
  ],
  honors: [
    '................',
    '..kkkkkkkkkkkk..',
    '.kyyyyyyyyyylYk.',
    'kykyyyyyyyyyYkYk',
    'kykyyyyyyyyyYkYk',
    '.kkyyyyyyyyYYkk.',
    '...kyyyyyyyYk...',
    '....kyyyyyYk....',
    '.....kkyYkk.....',
    '......kyYk......',
    '......kyYk......',
    '.....kyyYYk.....',
    '....kBBBBBBk....',
    '....kbbbbbbk....',
    '....kkkkkkkk....',
    '................',
  ],
  writing: [
    '................',
    '................',
    '..kkkkkkkkkkkk..',
    '..kbwwwwwwwwbk..',
    '..kbwwwwwwwwbk..',
    '..kbEEEEEEEEbk..',
    '..kbEEEEEEEEbk..',
    '..kbEEEEEEEEbk..',
    '..kbEEEEEEEEbk..',
    '..kbEEEEEEEEbk..',
    '..kbbbbbbbbbbk..',
    '..kkkkkkkkkkkk..',
    '..k..........k..',
    '..k..........k..',
    '................',
    '................',
  ],
  lab: [
    '................',
    '..........kkk...',
    '.........kmmMk..',
    '........kmmk.k..',
    '........kmk...k.',
    '.........k...kMk',
    '........kmk.kmMk',
    '.......kmMMkmMk.',
    '......kmMk.kkk..',
    '.....kmMk.......',
    '....kmMk........',
    '...kmMk.........',
    '..kmMk..........',
    '.kmMk...........',
    '.kkk............',
    '................',
  ],
  coffee: [
    '.....w...w......',
    '......w...w.....',
    '.....w...w......',
    '................',
    '..kkkkkkkkkk....',
    '..kwwwwwwwwkkk..',
    '..kwnnnnnnwk.k..',
    '..kwwwwwwwwk.k..',
    '..kwwwwwwwwkkk..',
    '..kwwwwwwwwk....',
    '..kwwwwwwwwk....',
    '...kwwwwwwk.....',
    '....kkkkkk......',
    '.kkkkkkkkkkkkk..',
    '..kPPPPPPPPPk...',
    '................',
  ],
  pool: [
    '................',
    '................',
    '..kkkkkkkkkkkk..',
    '.kmMMMMMMMMMMmk.',
    '.kmccccccccccmk.',
    '.kmcwcccccwccmk.',
    '..kmmmmmmmmmmk..',
    '..kmggggggggmk..',
    '..kmgggggggGmk..',
    '...kmgggggGmk...',
    '...kmggggGGmk...',
    '...kmgggGGGmk...',
    '....kmmmmmmk....',
    '....kkkkkkkk....',
    '................',
    '................',
  ],
  map: [
    '................',
    '.kkkkkkkkkkkkkk.',
    '.kPPPPPPPPPPPPk.',
    '.kPeeeePPccPPPk.',
    '.kPeeeeePcccPPk.',
    '.kPeeEeePPccePk.',
    '.kPPeeePPPceePk.',
    '.kPPPPPPPPeeePk.',
    '.kPcccPPeeeeePk.',
    '.kPccccPeeEeePk.',
    '.kPPcccPPeeePPk.',
    '.kPPPPPPPrPPPPk.',
    '.kPPPPPPPPPPPPk.',
    '.kkkkkkkkkkkkkk.',
    '................',
    '................',
  ],
  scroll: [
    '................',
    '..kkkkkkkkkkkk..',
    '.kPppppppppppPk.',
    '.kkPpppppppppkk.',
    '..kpkkkkkkkpk...',
    '..kpppppppppk...',
    '..kpkkkkkkppk...',
    '..kpppppppppk...',
    '..kpkkkkkpppk...',
    '..kpppppppppk...',
    '..kpppppprRpk...',
    '..kppppprrRRk...',
    '.kkPpppprRRpkk..',
    '.kPppppppppppPk.',
    '..kkkkkkkkkkkk..',
    '................',
  ],
  seal: [
    '................',
    '...kkkkkkkk.....',
    '..kppppppppk....',
    '..kpkkkkkkpk....',
    '..kppppppppk....',
    '..kpkkkkkppk....',
    '..kppppppppk....',
    '..kpkkkkpkkkk...',
    '..kpppppkrrrrk..',
    '..kpkkkkrRrrRrk.',
    '..kppppprRrrrrk.',
    '..kpppppkrRRrk..',
    '..kkkkkkkkrrk...',
    '.........kRk....',
    '................',
    '................',
  ],
  medal: [
    '................',
    '...kk......kk...',
    '...krk....kCk...',
    '....krk..kCk....',
    '.....krkkCk.....',
    '......krCk......',
    '.....kkyykk.....',
    '....kyyllyyk....',
    '...kyylyyyYyk...',
    '...kyylyyyYyk...',
    '...kyyyyyyYyk...',
    '...kyyyyyYYyk...',
    '....kyyYYYyk....',
    '.....kkkkkk.....',
    '................',
    '................',
  ],
  cap: [
    '................',
    '................',
    '.......kk.......',
    '.....kkGGkk.....',
    '...kkGGGGGGkk...',
    '.kkGGGGGGGGGGkk.',
    'kGGGGGGGGGGGGGyk',
    '.kkGGGGGGGGGGkyk',
    '...kkGGGGGGkk.yk',
    '...kGkkGGkkGk.yk',
    '...kGGGkkGGGk.yk',
    '...kGGGGGGGGk.yy',
    '....kkGGGGkk..yy',
    '......kkkk......',
    '................',
    '................',
  ],
  heart: [
    '................',
    '................',
    '..kkk....kkk....',
    '.krrRk..krrRk...',
    'krwrrRkkrrrrRk..',
    'krrrrrRrrrrrRk..',
    'krrrrrrrrrrrRk..',
    '.krrrrrrrrrRk...',
    '..krrrrrrrRk....',
    '...krrrrrRk.....',
    '....krrrRk......',
    '.....krRk.......',
    '......kk........',
    '................',
    '................',
    '................',
  ],
  mountain: [
    '................',
    '.......kyyy.....',
    '.......kyy......',
    '.......k........',
    '......kwk.......',
    '.....kwwwk......',
    '....kwwgwwk.....',
    '...kgggllggk....',
    '...kgllgggGk....',
    '..kgglggggGGk...',
    '..kggglllgGGk.kk',
    '.kgGggggglGGkkGk',
    '.kgggGgglggGGGGk',
    'kgggglllgggGGGGk',
    'kkkkkkkkkkkkkkkk',
    '................',
  ],
  eye: [
    '................',
    '................',
    '................',
    '.....kkkkkk.....',
    '...kkwwwwwwkk...',
    '..kwwwkkkkwwwk..',
    '.kwwwkCCccwwwwk.',
    'kwwwwkCkkcwwwwwk',
    'kwwwwkCkkcwwwwwk',
    '.kwwwkCCccwwwwk.',
    '..kwwwkkkkwwwk..',
    '...kkwwwwwwkk...',
    '.....kkkkkk.....',
    '................',
    '................',
    '................',
  ],
  phone: [
    '................',
    '...kkkkkkkkkk...',
    '..khhhhGGhhhhk..',
    '..khwwcccccchk..',
    '..khwccccccchk..',
    '..khcccccccchk..',
    '..khcccccccChk..',
    '..khccccccCChk..',
    '..khcccccCCChk..',
    '..khccccCCCChk..',
    '..khcccCCCCChk..',
    '..khccCCCCCChk..',
    '..khhhhhhhhhhk..',
    '..khhhhGGhhhhk..',
    '...kkkkkkkkkk...',
    '................',
  ],
  call: [
    '................',
    '................',
    '..kkk...........',
    '.kwwwk..........',
    '.kwwwwk.........',
    '.kwwwgk.........',
    '..kwwk..........',
    '..kwwk..........',
    '..kwwwk.........',
    '...kwwwk...kk...',
    '....kwwwkkkwwk..',
    '.....kgwwwwwwwk.',
    '......kkgwwwwgk.',
    '........kkkggk..',
    '...........kk...',
    '................',
  ],
  chat: [
    '................',
    '................',
    '..kkkkkkkkkkkk..',
    '.kwwwwwwwwwwwwk.',
    '.kwwwwwwwwwwwwk.',
    '.kwwwwwwwwwwwwk.',
    '.kwGGwwGGwwGGwk.',
    '.kwGGwwGGwwGGwk.',
    '.kwwwwwwwwwwwwk.',
    '.kgwwwwwwwwwwgk.',
    '..kkkwwkkkkkkk..',
    '....kwk.........',
    '...kwk..........',
    '...kk...........',
    '................',
    '................',
  ],
  mail: [
    '................',
    '................',
    '.kkkkkkkkkkkkkk.',
    '.kgkwwwwwwwwkgk.',
    '.kwgkwwwwwwkgwk.',
    '.kwwgkwwwwkgwwk.',
    '.kwwwgkwwkgwwwk.',
    '.kwwwwgkkgwwwwk.',
    '.kwwwwwggwwwwwk.',
    '.kwwwwwwwwwwwwk.',
    '.kwwwwwwwwwwwwk.',
    '.kwwwwwwwwwwwwk.',
    '.kggggggggggggk.',
    '.kkkkkkkkkkkkkk.',
    '................',
    '................',
  ],
  camera: [
    '................',
    '................',
    '................',
    '.....kkkkk......',
    '.kkkkkgggkkkkkk.',
    '.kggggggggggygk.',
    '.kggggkkkkggggk.',
    '.kgggkCCCCkgggk.',
    '.kmmmkCwcCkmmmk.',
    '.kmmmkCccCkmmmk.',
    '.kGGGkCCCCkGGGk.',
    '.kGGGGkkkkGGGGk.',
    '.kkkkkkkkkkkkkk.',
    '................',
    '................',
    '................',
  ],
};

// Weather symbols are drawn at 32×32 from real shapes (a rayed sun, a crescent
// moon, puffy clouds with a grey underside) so each reads at a glance like a
// weather-app icon; the 1px dark outline keeps them in the pixel style.
const INK = '#1d1d1f';
const CLOUD_TONES = { white: ['#ffffff', '#e6eaef', '#bcc4cd'], grey: ['#d3d8de', '#b2b9c2', '#8c949e'], dark: ['#97a0aa', '#78818b', '#59616b'] };
const near = (x, y, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(x - ax - vx * t, y - ay - vy * t);
};

// Fill a mask with its shade and ring it with ink; later layers sit on top.
function layer(ctx, mask, shade) {
  const at = (x, y) => x >= 0 && y >= 0 && x < 32 && y < 32 && mask(x + .5, y + .5);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const inside = at(x, y);
    if (!inside && !(at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) continue;
    ctx.fillStyle = inside ? shade(x + .5, y + .5) : INK;
    ctx.fillRect(x, y, 1, 1);
  }
}

function sun(ctx, cx, cy, r) {
  const k = Math.PI / 4;
  layer(ctx, (x, y) => {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    return d > r + 2.2 && d < r * 1.9 + 1 && d * Math.abs(Math.sin(a - Math.round(a / k) * k)) < 1.1;
  }, () => '#f6b02a');
  layer(ctx, (x, y) => Math.hypot(x - cx, y - cy) <= r, (x, y) => {
    const lean = x - cx + y - cy;
    return lean < -r * .55 ? '#ffe788' : lean > r * .6 ? '#f3a42a' : '#ffcb3c';
  });
}

// A fat crescent opening to the upper right.
function moon(ctx, cx, cy, r) {
  const bx = cx + r * .55, by = cy - r * .45;
  layer(ctx, (x, y) => Math.hypot(x - cx, y - cy) <= r && Math.hypot(x - bx, y - by) > r * .82, (x, y) =>
    Math.hypot(x - bx, y - by) < r * 1.02 ? '#dcc271' : x - cx + y - cy > r * .35 ? '#ead27c' : '#fbedb0');
}

// Cloud standing on (ox, oy), about 21·s wide and 13·s tall.
function cloud(ctx, ox, oy, s, tone = 'white') {
  const [top, mid, low] = CLOUD_TONES[tone];
  layer(ctx, (x, y) => {
    const u = (x - ox) / s, v = (y - oy) / s;
    return near(u, v, -5.5, -4.5, 6.5, -4.5) <= 4.5 || Math.hypot(u - 1, v + 7) <= 6.3 || Math.hypot(u + 4, v + 6.5) <= 4;
  }, (x, y) => {
    const v = (y - oy) / s;
    return v > -2 ? low : v > -4.2 ? mid : top;
  });
}

function inPolygon(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function bolt(ctx) {
  const pts = [[19.5, 18], [12, 25.5], [16.5, 25.5], [13, 31.5], [22, 23], [17.5, 23], [21, 18]];
  layer(ctx, (x, y) => inPolygon(pts, x, y), (x, y) => x + y < 38 ? '#ffe45c' : '#f2b62a');
}

const bars = (ctx, lines, color) => layer(ctx, (x, y) => lines.some(([x0, x1, ly]) => near(x, y, x0, ly, x1, ly) <= 1.2), () => color);
const QUESTION = ['.####.', '##..##', '....##', '...##.', '..##..', '..##..', '......', '..##..'];

const WEATHER = {
  sun: ctx => sun(ctx, 16, 16, 7),
  moon: ctx => moon(ctx, 16, 16, 11),
  'cloud-sun': ctx => { sun(ctx, 11, 11, 5.5); cloud(ctx, 18, 27.5, 1); },
  'cloud-moon': ctx => { moon(ctx, 12, 12, 8.5); cloud(ctx, 18, 27.5, 1); },
  overcast: ctx => { cloud(ctx, 20, 19, .85, 'grey'); cloud(ctx, 14, 27.5, 1); },
  rain: ctx => {
    cloud(ctx, 16, 18, 1, 'grey');
    layer(ctx, (x, y) => [[11, 21], [17.5, 23], [24, 21]].some(([dx, dy]) => near(x, y, dx, dy, dx - 2.5, dy + 6) <= 1.1), () => '#56b8ec');
  },
  snow: ctx => {
    cloud(ctx, 16, 18, 1);
    layer(ctx, (x, y) => [[9.5, 23.5], [22.5, 23.5], [16.5, 27.5]].some(([cx, cy]) => {
      const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
      return (dx < .6 && dy < 3.6) || (dy < .6 && dx < 3.6) || (Math.abs(dx - dy) < .6 && dx < 2.6);
    }), () => '#ffffff');
  },
  thunder: ctx => { cloud(ctx, 16, 18, 1, 'dark'); bolt(ctx); },
  fog: ctx => { cloud(ctx, 16, 17, .95); bars(ctx, [[7, 25, 21], [10, 27, 25], [5, 21, 29]], '#dfe4ea'); },
  haze: ctx => { sun(ctx, 16, 12, 6); bars(ctx, [[5, 27, 19], [8, 25, 23.5], [4, 22, 28]], '#d6c49c'); },
  'weather-unknown': ctx => {
    cloud(ctx, 16, 25, 1.1, 'grey'); ctx.fillStyle = INK;
    QUESTION.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && ctx.fillRect(13 + x, 11 + y, 1, 1)));
  },
};

// The corner switches are drawn at 32×32 like the weather symbols: filled
// shapes ringed in ink, so they read on the grey buttons at a glance.
const SWITCH = {
  // The player in the air, side on, as avatar.js poses a flight: leaning in, arms
  // swept back, legs trailing; a small arrow under them points up.
  fly: ctx => {
    layer(ctx, (x, y) => near(x, y, 25, 30, 25, 22.5) <= 1.15 || near(x, y, 21.5, 26, 25, 22.5) <= 1.15 || near(x, y, 28.5, 26, 25, 22.5) <= 1.15, () => '#ffffff');
    outlined(ctx, FLYING, 0, 0);
  },
  // Waves: a block of water with a rolling top and a second crest across it.
  dive: ctx => {
    const top = x => 10 + Math.sin(x * .5) * 2;
    layer(ctx, (x, y) => x > 3 && x < 29 && y < 28 && y > top(x), (x, y) => y < top(x) + 3 ? '#8fd8f5' : y > 22 ? '#1f6fae' : '#3c9ad6');
    layer(ctx, (x, y) => x > 5 && x < 27 && Math.abs(y - (19 + Math.sin(x * .5 + 2.2) * 2)) < 1.1, () => '#e6f7fd');
  },
  // A spider web: eight spokes and two sagging rings.
  web: ctx => {
    const k = Math.PI / 4;
    layer(ctx, (x, y) => {
      const dx = x - 16, dy = y - 16, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      if (d > 14.5) return false;
      const off = a - Math.round(a / k) * k, mid = a - (Math.floor(a / k) + .5) * k;
      if (d * Math.abs(Math.sin(off)) < .75 || d < 1.6) return true;
      const p = d * Math.cos(mid), sag = 1 - (mid / (k / 2)) ** 2;
      return [6.2, 12].some(r => Math.abs(p - (r * Math.cos(k / 2) - sag * r * .09)) < .75);
    }, () => '#f6f6f6');
  },
  sound: ctx => {
    speaker(ctx);
    layer(ctx, (x, y) => {
      const d = Math.hypot(x - 14, y - 16), a = Math.abs(Math.atan2(y - 16, x - 14));
      return a < .8 && [7, 11.5].some(r => Math.abs(d - r) < 1);
    }, () => '#ffffff');
  },
  mute: ctx => {
    speaker(ctx);
    layer(ctx, (x, y) => near(x, y, 21, 12, 28, 20) <= 1.2 || near(x, y, 21, 20, 28, 12) <= 1.2, () => '#ffffff');
  },
};

// The default player's colours from skin.js.
const BODY = SPRITE;
// Drawn from the avatar flying at full speed, seen from the side: the model's
// boxes at its flight angles, drawn large and reduced to whole pixels. The head
// is drawn upright by hand (hair over the top and down the back, eye at the
// front), since a tilted 8-pixel head turns to mush. One tone per part: the
// button shows it at about 30 px, where shading only muddies it.
const FLYING = [
  '...................hhhhhhhh.....',
  '...................hhhhhhhh.....',
  '...................hhhhhsss.....',
  '...................hhhsssss.....',
  '...................hhsssses.....',
  '...................hhsssses.....',
  '...................ssssssss.....',
  '...................ssssssss.....',
  '..................KKKKK.........',
  '...........ssKKKKKKKKKKk........',
  '...........ssKKKKKKKKKK.........',
  '...........sssKKKKKKKKK.........',
  '...........sssKKKKkkkk..........',
  '.................kkkk...........',
  '................kkkkk...........',
  '...............kkkkk............',
  '...............kkkkk............',
  '..............kkkkk.............',
  '.............ppkkk..............',
  '............pppppk..............',
  '...........pppppp...............',
  '.........ppppppp................',
  '........ppppppp.................',
  '.......pppppp...................',
  '......oopppp....................',
  '......ooppp.....................',
  '.......oop......................',
  '.......oo.......................',
];

// A pixel sprite in the player's colours at (ox, oy), ringed in ink.
function outlined(ctx, rows, ox, oy) {
  const at = (x, y) => BODY[rows[y]?.[x]];
  for (let y = -1; y <= rows.length; y++) for (let x = -1; x <= rows[0].length; x++) {
    const color = at(x, y);
    if (!color && !(at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) continue;
    ctx.fillStyle = color || INK;
    ctx.fillRect(ox + x, oy + y, 1, 1);
  }
}

function speaker(ctx) {
  layer(ctx, (x, y) => (x > 4 && x < 10 && y > 12 && y < 20) || (x >= 9.5 && x < 17 && Math.abs(y - 16) < 4 + (x - 9.5) * 1.15), (x, y) => y < 14 ? '#ffffff' : y > 19 ? '#b9c2cc' : '#e4e8ec');
}

// Sprites are drawn at 2× on 32 px, the size of the drawn switch icons. The
// Dock's four (works, mail, phone, the head) all fill the same 28 px box, so
// none reads larger than another.
function draw(rows) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.' || !PALETTE[ch]) return;
    ctx.fillStyle = PALETTE[ch];
    ctx.fillRect(x * 2, y * 2, 2, 2);
  }));
  return c;
}

function weatherIcon(name) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  (WEATHER[name] || SWITCH[name])(c.getContext('2d'));
  return c;
}

function ball() {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy);
    if (d > 7.3) continue;
    let color = d > 6.4 ? '#1d1d1f' : (dx + dy > 4 ? '#b9581f' : dx + dy < -6 ? '#f09a5a' : '#e07a2e');
    const seam = Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6 || Math.abs(Math.hypot(dx + 9, dy) - 8.2) < 0.55 || Math.abs(Math.hypot(dx - 9, dy) - 8.2) < 0.55;
    if (seam && d <= 6.4) color = '#2a1a12';
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  }
  return c;
}

// A grey cog with eight teeth, outlined like the drawn icons.
function gear() {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d');
  const solid = (x, y) => {
    const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy);
    return d >= 2.2 && d <= (Math.cos(Math.atan2(dy, dx) * 8) > 0.3 ? 7.3 : 5.5);
  };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (!solid(x, y)) continue;
    const edge = !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1);
    const lean = x + y - 15;
    ctx.fillStyle = edge ? '#1d1d1f' : lean > 3 ? '#8d949c' : lean < -4 ? '#f2f3f5' : '#c3c8ce';
    ctx.fillRect(x, y, 1, 1);
  }
  return c;
}

// The face at 3× inside a 2 px ink ring: the same 28 px box as the sprites.
// A skin PNG brings its own face (setFace), read from the skin's 8×8 front.
let FACE = DEFAULT_FACE;
export function setFace(rows) { FACE = rows; delete cache.about; }
function head() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  ctx.fillStyle = INK;
  ctx.fillRect(2, 2, 28, 28);
  FACE.forEach((row, y) => row.forEach((color, x) => { ctx.fillStyle = color; ctx.fillRect(4 + x * 3, 4 + y * 3, 3, 3); }));
  return c;
}

const cache = {};
export function icon(name) {
  if (cache[name]) return cache[name];
  if (name === 'logo') {
    const canvas = Object.assign(document.createElement('canvas'), { width: 32, height: 32 });
    const img = new Image();
    img.onload = () => canvas.getContext('2d').drawImage(img, 0, 0, 32, 32);
    img.src = HOMECRAFT_LOGO_URL;
    cache.logo = { canvas, url: HOMECRAFT_LOGO_URL };
    return cache.logo;
  }
  let canvas;
  if (name === 'portal') {
    canvas = Object.assign(document.createElement('canvas'), { width: 16, height: 16 });
    drawDoor(canvas);
  } else canvas = WEATHER[name] || SWITCH[name] ? weatherIcon(name) : name === 'court' ? ball() : name === 'about' ? head() : name === 'gear' ? gear() : draw(ART[name] || ART.map);
  cache[name] = { canvas, url: canvas.toDataURL() };
  return cache[name];
}
