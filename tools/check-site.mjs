// What other worlds and visitors get from this site, read straight from its
// files: no server and no npm install. `npm run check` runs it first.
//
//   node tools/check-site.mjs [folder]     (default: the repository root)
//
// Only what breaks something for visitors fails (exit 1): a homecraft.json
// other worlds can't read, or a skin the engine would refuse and quietly swap
// for the default. Everything else warns.
// The intro and the logo are the owner's to give: never make one up to clear
// a warning.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { engineFiles } from './engine-manifest.mjs';
import { TEMPLATE_LOGO } from './directory.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const site = resolve(process.argv[2] || repo);
const errors = [], warnings = [];
const read = file => { try { return readFileSync(file); } catch { return null; } };
const json = file => { const bytes = read(file); if (!bytes) return { missing: true }; try { return { data: JSON.parse(bytes) }; } catch { return { broken: true }; } };
const local = (value, base = site) => join(base, value.replace(/^\.?\//, ''));
const strings = value => (typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value) : [])
  .filter(v => typeof v === 'string').map(v => v.replace(/\s+/g, ' ').trim()).filter(Boolean);

// ---------- homecraft.json: what portals show (docs/site-metadata.md) ----------
const LOGO_BYTES = 100 * 1024;
const info = json(join(site, 'homecraft.json'));
if (info.missing || info.broken) errors.push(`homecraft.json: other worlds can't read it (${info.missing ? 'missing' : 'not valid JSON'}). See docs/site-metadata.md`);
else {
  const data = info.data, names = strings(data.name), intros = strings(data.intro);
  if (data.version !== 1 || !names.length) errors.push('homecraft.json: other worlds need "version": 1 and a "name"');
  const html = read(join(site, 'index.html'))?.toString() || '';
  const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
  if (names.includes('My Home')) warnings.push(`homecraft.json: the name is still the template's "My Home"`);
  else if (names.length && title && !names.some(name => title.includes(name))) warnings.push(`homecraft.json: the name doesn't match the page title "${title}"; change both together`);
  if (names.some(name => name.length > 60)) warnings.push('homecraft.json: portals cut the name after 60 characters');
  if (!intros.length) warnings.push(`homecraft.json: no intro, so the public directory can't list this world. Ask the owner for one line; don't make one up`);
  if (intros.some(intro => intro.length > 120)) warnings.push('homecraft.json: portals cut the intro after 120 characters');
  if (data.avatar !== undefined && data.logo === undefined) warnings.push('homecraft.json: "avatar" is now called "logo"');
  const logo = data.logo ?? data.avatar;
  if (!logo) warnings.push(`homecraft.json: no logo, so the public directory can't list this world (portals show the name's first letter). Ask the owner for one`);
  else if (!/^https?:\/\//.test(logo)) {
    const bytes = read(local(logo));
    if (!bytes) warnings.push(`homecraft.json: the logo ${logo} isn't there`);
    else if (createHash('sha256').update(bytes).digest('hex') === TEMPLATE_LOGO) warnings.push(`homecraft.json: the logo is still the template's grass block. Ask the owner for theirs`);
    else if (bytes.length > LOGO_BYTES) warnings.push(`homecraft.json: the logo is ${Math.ceil(bytes.length / 1024)} KB; keep it under 100 KB (128×128 is plenty)`);
  }
  if (data.url && !/^https:\/\//.test(data.url)) warnings.push('homecraft.json: "url" is the public https:// address (leave it empty until there is one)');
  if (data.homecraft !== true) warnings.push('homecraft.json: "homecraft": true tells other worlds this one has a portal');
}

// ---------- home.config.js: the owner's character ----------
let config = {};
try { config = (await import(pathToFileURL(join(site, 'home.config.js')).href)).default || {}; }
catch (e) { errors.push(`home.config.js: can't be read (${e.message.split('\n')[0]})`); }

// The engine refuses a skin that isn't a 64×64 PNG of at most 18,000 bytes
// (docs/avatar.md) and quietly wears the default instead, here and on every
// world the owner visits. Say so here rather than let it pass unseen.
if (config.skin && !/^https?:\/\//.test(config.skin)) {
  const png = read(local(config.skin));
  const size = png?.length >= 24 && png.readUInt32BE(0) === 0x89504e47 ? [png.readUInt32BE(16), png.readUInt32BE(20)] : null;
  if (!png) errors.push(`home.config.js: the skin ${config.skin} isn't there`);
  else if (!size || size[0] !== 64 || size[1] !== 64) errors.push(`skin: the engine only wears a 64×64 PNG${size ? ` (this one is ${size[0]}×${size[1]})` : ''}; it would show the default character instead`);
  else if (png.length > 18000) errors.push(`skin: ${png.length} bytes; the engine only carries skins up to 18,000. Save it again without metadata or extra colours`);
  else {
    const pixels = rgba(png);
    const solid = (x0, y0, w, h) => { let n = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) n += pixels[(y * 64 + x) * 4 + 3] >= 128; return n / (w * h); };
    if (pixels && [solid(8, 8, 8, 8), solid(20, 20, 8, 12), solid(4, 20, 4, 12)].some(share => share < 0.9)) {
      warnings.push(`skin: the face, body or legs are see-through. Is it laid out as a standard 64×64 skin? Start from assets/skin-template.png`);
    }
    // A slim skin leaves the end of the right arm's back face empty.
    if (pixels && solid(54, 20, 2, 12) === 0 && solid(51, 20, 3, 12) > 0.9) warnings.push('skin: looks like a slim (3-pixel-arm) skin; Homecraft draws 4-pixel arms, so they would show a gap. Use the classic arm width');
  }
}

// ---------- engine/: the same for every world ----------
// The interface, the portal and the protocol live in engine/; worlds stay
// alike, and portals keep working between sites, while it is left as released.
const manifest = json(join(repo, 'engine/manifest.json')).data;
if (manifest?.files) {
  const now = engineFiles(), changed = [];
  for (const [file, hash] of Object.entries(manifest.files)) if (now[file] !== hash) changed.push(now[file] ? `changed ${file}` : `missing ${file}`);
  for (const file of Object.keys(now)) if (!manifest.files[file]) changed.push(`added ${file}`);
  if (changed.length) warnings.push(`engine/ differs from Homecraft ${manifest.version}: ${changed.slice(0, 6).join(', ')}${changed.length > 6 ? `, and ${changed.length - 6} more` : ''}. Preserve intentional local changes; follow engine/UPDATING.md for official updates instead of overwriting customized files`);
}

const where = relative(process.cwd(), site) || '.';
console.log(`${where}: ${errors.length ? `${errors.length} to fix` : 'fine'}${warnings.length ? `, ${warnings.length} to look at` : ''}`);
for (const e of errors) console.log(`  error: ${e}`);
for (const w of warnings) console.log(`  warning: ${w}`);
process.exit(errors.length ? 1 : 0);

// A non-interlaced 8-bit PNG as RGBA bytes, or null for anything else
// (the size checks above still apply to those).
function rgba(png) {
  let at = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0, palette = null, alpha = null;
  const data = [];
  while (at + 8 <= png.length) {
    const size = png.readUInt32BE(at), name = png.toString('latin1', at + 4, at + 8), body = png.subarray(at + 8, at + 8 + size);
    if (name === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (name === 'PLTE') palette = body;
    else if (name === 'tRNS') alpha = body;
    else if (name === 'IDAT') data.push(body);
    else if (name === 'IEND') break;
    at += 12 + size;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (depth !== 8 || interlace || !channels || (type === 3 && !palette)) return null;
  let raw;
  try { raw = inflateSync(Buffer.concat(data)); } catch { return null; }
  const stride = width * channels, out = new Uint8Array(width * height * 4);
  if (raw.length < height * (stride + 1)) return null;
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0, b = previous[i], c = i >= channels ? previous[i - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const guess = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter] ?? 0;
      row[i] = (line[i] + guess) & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4, i = x * channels, k = row[i];
      if (type === 6) out.set(row.subarray(i, i + 4), o);
      else if (type === 2) out.set([row[i], row[i + 1], row[i + 2], 255], o);
      else if (type === 0) out.set([k, k, k, 255], o);
      else if (type === 4) out.set([k, k, k, row[i + 1]], o);
      else out.set([palette[k * 3], palette[k * 3 + 1], palette[k * 3 + 2], alpha && k < alpha.length ? alpha[k] : 255], o);
    }
    previous = row;
  }
  return out;
}
