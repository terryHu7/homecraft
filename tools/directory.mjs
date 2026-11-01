// The shared Homecraft directory: one JSON file per world in directory/, and
// directory/_settings.json. Only the main repository publishes it (see
// docs/worlds.md); forks never need this.
//
//   node tools/directory.mjs check [--online] [file …]   check every entry (and
//                                                        open the given ones, or all)
//   node tools/directory.mjs build <out.json> [--online]  write the published list
//
// --online also opens each world, loads its logo and looks for its portal.
// `build --online` leaves out any world that cannot be reached, so a dead site
// drops out of every door until it is back.
// The published format is a contract with every Homecraft world ever made:
// add fields, never rename or remove them (docs/protocol.md).
import { readFileSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readSiteInfo } from '../engine/door-metadata.js';

const DIR = fileURLToPath(new URL('../directory/', import.meta.url));
const FIELDS = new Set(['name', 'url', 'owner', 'lang', 'intro', 'preview', 'logo', 'homecraft', 'added']);
const LANGS = new Set(['zh', 'en']);
const HEADERS = { 'user-agent': 'Homecraft directory check (+https://github.com/terryHu7/homecraft)' };
// A logo shows at 48 px in every portal: 128×128 is plenty.
const LOGO_BYTES = 100 * 1024;
// The template's grass block (assets/favicon.png as shipped) and name: an
// untouched template isn't anyone's world yet.
export const TEMPLATE_LOGO = '55fd4562515e92c53e1bdc8bceccc6cd0b36b4abafef5941d687a36a0e0ade5e';
const TEMPLATE_NAME = 'My Home';

// Plain text: no markup, no backticks (entries are quoted in pull requests).
const text = (value, max) => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max && !/[\u0000-\u001f<>`]/.test(value);
const words = (value, max) => text(value, max) || (value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).every(k => LANGS.has(k)) && Object.keys(value).length > 0 && Object.values(value).every(v => text(v, max)));
export function httpsUrl(value) {
  if (typeof value !== 'string' || /[\s<>`]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && url.hostname.includes('.') && !/^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(url.hostname) && !/\.(?:local|localhost|internal)$/i.test(url.hostname) && value.length <= 200 ? url : null;
  } catch { return null; }
}
export const keyOf = value => { const url = new URL(value); return url.origin + url.pathname.replace(/\/$/, ''); };
export const isBlocked = (value, blocked = []) => blocked.some(address => keyOf(value) === keyOf(address) || keyOf(value).startsWith(keyOf(address) + '/'));

// The most every portal shows before cutting (engine/portal.js, door-metadata.js),
// so nothing listed is ever cut short.
const MAX = { name: 60, owner: 40, intro: 120 };

// Problems with one entry, in plain words; [] when it is fine. Every listed
// world has a name, an intro, a logo and a portal, so no row in any portal is blank.
export function problems(entry) {
  const out = [];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return ['not a JSON object'];
  for (const k of Object.keys(entry)) if (!FIELDS.has(k)) out.push(`unknown field "${k}"`);
  if (!words(entry.name, MAX.name)) out.push(`name: 1–${MAX.name} characters, or { "zh": …, "en": … }`);
  else if ((typeof entry.name === 'string' ? [entry.name] : Object.values(entry.name)).includes(TEMPLATE_NAME)) out.push(`name: still the template's "${TEMPLATE_NAME}"`);
  const url = httpsUrl(entry.url);
  if (!url) out.push('url: an https:// address');
  else if (url.search || url.hash) out.push('url: no ?query or #fragment');
  if (!text(entry.owner, MAX.owner)) out.push(`owner: 1–${MAX.owner} characters`);
  const langs = Array.isArray(entry.lang) ? entry.lang : [entry.lang];
  if (!langs.length || !langs.every(l => LANGS.has(l))) out.push('lang: "zh", "en" or ["zh", "en"]');
  if (!words(entry.intro, MAX.intro)) out.push(`intro: one line, 1–${MAX.intro} characters, or { "zh": …, "en": … }`);
  const logo = httpsUrl(entry.logo);
  if (!logo || (url && logo.origin !== url.origin)) out.push('logo: a square https:// image on the world’s own site (128×128 is plenty)');
  if (entry.preview !== undefined && (!httpsUrl(entry.preview) || (url && httpsUrl(entry.preview).origin !== url.origin))) out.push('preview: an https:// image address on the world’s own site');
  if (entry.homecraft !== true) out.push('homecraft: true (only worlds with a portal are listed: a Homecraft world, or a site with the portal plugin)');
  if (entry.added !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(entry.added)) out.push('added: YYYY-MM-DD');
  return out;
}

// A file name for a world: its host and path, e.g. alex-github-io-home.
export function slugFor(value) {
  const url = new URL(value);
  return `${url.hostname}${url.pathname}`.toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'world';
}

// Is the world there? Three tries over about ten seconds; a refusal for
// robots (401/403/429) still means the site exists.
export async function reachable(value) {
  for (const wait of [0, 2000, 6000]) {
    await new Promise(resolve => setTimeout(resolve, wait));
    try {
      const res = await fetch(value, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: HEADERS });
      await res.body?.cancel();
      if (res.status < 400 || [401, 403, 429].includes(res.status)) return true;
      if ([404, 410].includes(res.status)) return false;
    } catch {}
  }
  return false;
}

// Does the logo load as a small image? '' when it does.
export async function inspectLogo(value) {
  try {
    const res = await fetch(value, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: HEADERS });
    if (!res.ok) { await res.body?.cancel(); return { status: [401, 403, 429].includes(res.status) || res.status >= 500 ? 'review' : 'fail' }; }
    if (!(res.headers.get('content-type') || '').startsWith('image/') || Number(res.headers.get('content-length')) > LOGO_BYTES) {
      await res.body?.cancel(); return { status: 'fail' };
    }
    let size = 0; const chunks = [];
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > LOGO_BYTES) return { status: 'fail' };
      chunks.push(chunk);
    }
    if (!size) return { status: 'fail' };
    return { status: 'pass', template: createHash('sha256').update(Buffer.concat(chunks)).digest('hex') === TEMPLATE_LOGO };
  } catch { return { status: 'review' }; }
}
export async function logoProblem(value) {
  const result = await inspectLogo(value);
  return result.status === 'pass' ? '' : `logo: ${value} ${result.status === 'review' ? 'cannot be loaded' : 'must be an image of at most 100 KB'}`;
}

// Does the world have a portal? Its homecraft.json says "homecraft": true, or
// its page carries the portal plugin. '' when it does.
export async function portalProblem(value) {
  if ((await readSiteInfo(value, 15000))?.homecraft) return '';
  try {
    const res = await fetch(value, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: HEADERS });
    if (/<homecraft-door\b/i.test(await res.text())) return '';
  } catch {}
  return 'portal: none found. A Homecraft world publishes homecraft.json with "homecraft": true beside its page; any other site adds the portal plugin (plugin/README.md)';
}

export function validateSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return ['expected an object'];
  const errors = [];
  for (const field of Object.keys(settings)) if (!['join', 'all', 'pinned', 'blocked'].includes(field)) errors.push(`unknown field ${field}`);
  for (const field of ['join', 'all']) if (settings[field] != null && !httpsUrl(settings[field])) errors.push(`${field}: expected an HTTPS URL`);
  if (settings.pinned !== undefined && (!Array.isArray(settings.pinned) || !settings.pinned.every(s => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,40}$/.test(s)))) errors.push('pinned: expected entry filenames without .json');
  if (settings.blocked !== undefined && (!Array.isArray(settings.blocked) || !settings.blocked.every(u => httpsUrl(u)))) errors.push('blocked: expected HTTPS URLs');
  return errors;
}

export function load() {
  const settings = JSON.parse(readFileSync(DIR + '_settings.json', 'utf8'));
  const settingsProblems = validateSettings(settings);
  if (settingsProblems.length) throw Error(`directory/_settings.json: ${settingsProblems.join('; ')}`);
  const entries = readdirSync(DIR).filter(f => f.endsWith('.json') && !f.startsWith('_')).sort().map(file => {
    let data = null, issues = [];
    try { data = JSON.parse(readFileSync(DIR + file, 'utf8')); issues = problems(data); } catch (e) { issues = [`not valid JSON (${e.message})`]; }
    if (!/^[a-z0-9][a-z0-9-]{0,40}\.json$/.test(file)) issues.push('file name: lowercase letters, digits and dashes');
    return { file, slug: file.slice(0, -5), data, issues };
  });
  const seen = new Map();
  for (const e of entries) {
    if (e.issues.length) continue;
    const id = keyOf(e.data.url);
    if (seen.has(id)) e.issues.push(`same world as ${seen.get(id)}`); else seen.set(id, e.file);
  }
  return { settings, entries };
}

// Pinned worlds first, the rest in an order that changes once a week, so no
// one stays at the top by being first to join.
function weekly(list, date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1), week = Math.floor((date - start) / 6048e5);
  let seed = date.getUTCFullYear() * 100 + week;
  const random = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

async function main([command, ...args]) {
  const online = args.includes('--online');
  // Files named after `check`: only those are opened (a pull request's own).
  const only = command === 'check' ? args.filter(a => !a.startsWith('--')).map(a => a.split('/').pop()) : [];
  const { settings, entries } = load();
  const bad = entries.filter(e => e.issues.length);
  for (const e of bad) console.error(`directory/${e.file}: ${e.issues.join('; ')}`);
  const good = entries.filter(e => !e.issues.length);
  // down: cannot be reached (left out of a build). broken: reached, but its logo
  // or portal is missing (a check fails; a build still lists it and says so).
  const down = new Set(), broken = new Map();
  if (online) {
    const checks = await Promise.all(good.filter(e => !only.length || only.includes(e.file)).map(async e => {
      if (args.includes('--portal')) {
        const { inspectEntry } = await import('./check-listing.mjs');
        const report = await inspectEntry(e.data);
        return [e, true, [...report.issues, ...report.review]];
      }
      const [up, ...found] = await Promise.all([reachable(e.data.url), logoProblem(e.data.logo), portalProblem(e.data.url)]);
      return [e, up, found.filter(Boolean)];
    }));
    for (const [e, up, found] of checks) {
      if (!up) { down.add(e.slug); console.error(`directory/${e.file}: ${e.data.url} cannot be reached`); }
      else if (found.length) { broken.set(e.slug, found); console.error(`directory/${e.file}: ${found.join('; ')}`); }
    }
  }
  if (command === 'check') {
    console.log(`${good.length} worlds, ${bad.length} with problems${online ? `, ${down.size} unreachable, ${broken.size} with a broken logo or no portal` : ''}`);
    process.exit(bad.length || down.size || broken.size ? 1 : 0);
  }
  if (command === 'build' && args[0] && !args[0].startsWith('--')) {
    if (bad.length) throw Error('Directory data is invalid; publication stopped.');
    const pinned = (settings.pinned || []).map(slug => good.find(e => e.slug === slug)).filter(Boolean);
    const rest = weekly(good.filter(e => !pinned.includes(e)));
    const worlds = [...pinned, ...rest].filter(e => !down.has(e.slug) && !isBlocked(e.data.url, settings.blocked)).map(({ data }) => {
      const { added, ...shown } = data;
      return shown;
    });
    const published = { version: 1, updated: new Date().toISOString(), join: settings.join || null, all: settings.all || null, blocked: settings.blocked || [], worlds };
    writeFileSync(args[0], JSON.stringify(published, null, 1) + '\n');
    console.log(`wrote ${args[0]}: ${worlds.length} worlds${down.size ? `, ${down.size} left out until they answer again` : ''}${bad.length ? `, ${bad.length} skipped for problems` : ''}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      const lines = [`### Directory: ${worlds.length} worlds published`];
      for (const e of good.filter(e => down.has(e.slug))) lines.push(`- Left out, cannot be reached: ${e.data.url} (directory/${e.file})`);
      for (const e of good.filter(e => broken.has(e.slug))) lines.push(`- Listed, but ${broken.get(e.slug).join('; ')}: directory/${e.file}`);
      for (const e of bad) lines.push(`- Skipped, ${e.issues.join('; ')}: directory/${e.file}`);
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
    }
    return;
  }
  console.error('usage: node tools/directory.mjs check [--online] | build <out.json> [--online]');
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main(process.argv.slice(2));
