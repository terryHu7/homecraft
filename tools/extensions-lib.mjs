import { readFileSync, writeFileSync, readdirSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync, openSync, closeSync } from 'node:fs';
import { resolve, join, dirname, relative, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { API_VERSION, validId, validVersion, validateManifest, validateOptions, safeFile } from '../engine/extension-contract.js';

export const MAX_FILE = 2 * 1024 * 1024, MAX_PACKAGE = 8 * 1024 * 1024;
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const json = path => JSON.parse(readFileSync(path, 'utf8'));
const fail = errors => { if (errors.length) throw Error(errors.join('; ')); };
const versionOrder = (a, b) => { const x = a.version.split('.').map(Number), y = b.version.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };
export const writeJSON = (path, data) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(data, null, 2) + '\n'); };
export function localPath(path) {
  if (!path || /^[a-z][a-z0-9+.-]*:\/\//i.test(path)) throw Error('This local preview accepts filesystem paths only; no network sources');
  return resolve(path);
}
export function noLinks(path) {
  const full = resolve(path);
  let cursor = full;
  while (true) {
    try { if (lstatSync(cursor).isSymbolicLink()) throw Error(`Symbolic links are not supported: ${cursor}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = dirname(cursor); if (parent === cursor) break; cursor = parent;
  }
  return full;
}
function readLimited(path, limit = MAX_PACKAGE * 2) {
  noLinks(path);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > limit) throw Error(`File exceeds the size limit: ${path}`);
  return readFileSync(path);
}
function child(root, file) {
  if (!safeFile(file)) throw Error(`Unsafe package path: ${file}`);
  return noLinks(join(root, file));
}
export function validateBundle(bundle) {
  if (bundle?.format !== 1 || !bundle.files || typeof bundle.files !== 'object' || Array.isArray(bundle.files)) throw Error('Invalid extension bundle');
  fail(validateManifest(bundle.manifest));
  if (Buffer.byteLength(JSON.stringify(bundle.manifest)) > 64 * 1024) throw Error('Manifest exceeds 64 KiB');
  const expected = [...bundle.manifest.files].sort(), names = Object.keys(bundle.files).sort();
  if (JSON.stringify(expected) !== JSON.stringify(names)) throw Error('Bundle files differ from the manifest allowlist');
  let total = 0;
  for (const file of names) {
    const data = bundle.files[file];
    if (typeof data !== 'string') throw Error(`Invalid file encoding: ${file}`);
    const bytes = Buffer.from(data, 'base64');
    if (bytes.toString('base64') !== data || bytes.length > MAX_FILE) throw Error(`Invalid or oversized file: ${file}`);
    total += bytes.length;
  }
  if (total > MAX_PACKAGE) throw Error('Package exceeds 8 MiB; distribute large assets separately');
  return { bundle, bytes: total };
}
export function readBundle(path, expected) {
  const bytes = readLimited(localPath(path));
  if (expected && digest(bytes) !== expected) throw Error('Package checksum does not match the reviewed catalog entry');
  const result = validateBundle(JSON.parse(bytes));
  if (bytes.toString('utf8') !== JSON.stringify(result.bundle, null, 2) + '\n') throw Error('Use pack to create a canonical extension package');
  return { ...result, integrity: digest(bytes), path: resolve(path) };
}
export function pack(folder, output) {
  folder = noLinks(localPath(folder)); output = noLinks(localPath(output));
  const manifest = JSON.parse(readLimited(join(folder, 'manifest.json'), 64 * 1024));
  fail(validateManifest(manifest));
  const files = Object.fromEntries([...manifest.files].sort().map(file => [file, readLimited(child(folder, file), MAX_FILE).toString('base64')]));
  const bundle = { format: 1, manifest, files };
  const { bytes } = validateBundle(bundle);
  if (existsSync(output)) throw Error('Output already exists; use a new version or output path');
  writeJSON(output, bundle);
  return { id: manifest.id, version: manifest.version, path: output, bytes, integrity: digest(readFileSync(output)) };
}
export function review(path, previous) {
  const current = readBundle(path), m = current.bundle.manifest;
  const before = previous ? readBundle(previous).bundle : null;
  if (before && before.manifest.id !== m.id) throw Error('Review versions must have the same extension ID');
  const findings = [];
  for (const [file, encoded] of Object.entries(current.bundle.files)) {
    if (!/\.(js|css|json|md)$/.test(file)) continue;
    const source = Buffer.from(encoded, 'base64').toString('utf8');
    for (const [kind, pattern] of [
      ['engine-internal import', /@engine\/|\.\.\/engine\//],
      ['direct network access', /\bfetch\s*\(|\bWebSocket\s*\(|\bEventSource\s*\(/],
      ['dynamic code execution', /\beval\s*\(|\bFunction\s*\(/],
      ['global page or storage access', /\bdocument\.|\blocalStorage\.|\bsessionStorage\./],
      ['external URL', /https?:\/\//],
    ]) if (pattern.test(source)) findings.push({ file, kind });
  }
  const names = new Set([...Object.keys(before?.files || {}), ...Object.keys(current.bundle.files)]);
  return { id: m.id, version: m.version, apiVersion: m.apiVersion, integrity: current.integrity,
    bytes: current.bytes, author: m.author, license: m.license, capabilities: m.capabilities, config: m.config,
    changes: [...names].filter(f => before?.files[f] !== current.bundle.files[f]).map(file => ({ file, change: !before?.files[file] ? 'added' : !current.bundle.files[file] ? 'removed' : 'changed' })),
    findings, note: 'Static review only. Read the code and test behavior before accepting. Capability declarations are not a sandbox.' };
}
export function propose(bundlePath, output) {
  const checked = readBundle(bundlePath);
  output = noLinks(localPath(output));
  if (existsSync(output)) throw Error('Submission already exists');
  writeJSON(output, { format: 1, id: checked.bundle.manifest.id, version: checked.bundle.manifest.version,
    bundle: relative(dirname(output), checked.path).split('\\').join('/'), integrity: checked.integrity });
  return { submission: output, review: review(bundlePath) };
}
function loadSubmission(path) {
  path = noLinks(localPath(path));
  const entry = JSON.parse(readLimited(path, 64 * 1024));
  if (entry.format !== 1 || !validId(entry.id) || !/^[a-f0-9]{64}$/.test(entry.integrity || '') || typeof entry.bundle !== 'string' || isAbsolute(entry.bundle) || entry.bundle.includes('://')) throw Error('Invalid local submission');
  const checked = readBundle(resolve(dirname(path), entry.bundle), entry.integrity);
  if (entry.id !== checked.bundle.manifest.id || entry.version !== checked.bundle.manifest.version) throw Error('Submission identity differs from its package');
  return { entry, checked };
}
export function accept(submission, catalog) {
  catalog = noLinks(localPath(catalog));
  const { entry, checked } = loadSubmission(submission);
  const target = noLinks(join(catalog, `${entry.id}.json`));
  const data = existsSync(target) ? json(target) : { format: 1, id: entry.id, releases: [] };
  if (data.format !== 1 || data.id !== entry.id || !Array.isArray(data.releases)) throw Error('Invalid catalog entry');
  if (data.releases.some(r => r.version === entry.version)) throw Error('This version is already recorded; published versions cannot be replaced');
  data.releases.push({ version: entry.version, bundle: relative(catalog, checked.path).split('\\').join('/'), integrity: entry.integrity,
    status: 'active', manifest: checked.bundle.manifest });
  data.releases.sort(versionOrder);
  writeJSON(target, data);
  return { accepted: entry.id, version: entry.version, catalog: target };
}
export function catalogEntries(catalog) {
  catalog = noLinks(localPath(catalog));
  return readdirSync(catalog).filter(f => f.endsWith('.json')).sort().map(file => {
    const data = JSON.parse(readLimited(noLinks(join(catalog, file)), 1024 * 1024));
    if (data.format !== 1 || !validId(data.id) || file !== `${data.id}.json` || !Array.isArray(data.releases)) throw Error(`Invalid catalog entry: ${file}`);
    const versions = new Set();
    for (const release of data.releases) {
      if (!validVersion(release.version) || versions.has(release.version) || !['active', 'withdrawn'].includes(release.status)) throw Error(`Invalid catalog release: ${file}`);
      fail(validateManifest(release.manifest));
      if (release.manifest.id !== data.id || release.manifest.version !== release.version) throw Error(`Catalog identity differs: ${file}`);
      versions.add(release.version);
    }
    data.releases.sort(versionOrder);
    return data;
  });
}
function catalogPackage(id, catalog, version) {
  if (!validId(id)) throw Error('Invalid extension ID');
  const data = catalogEntries(catalog).find(e => e.id === id);
  const selected = data?.releases.findLast(r => r.status === 'active' && (!version || r.version === version));
  if (!selected) throw Error(`No active release for ${id}${version ? `@${version}` : ''}`);
  if (typeof selected.bundle !== 'string' || isAbsolute(selected.bundle) || selected.bundle.includes('://') || !/^[a-f0-9]{64}$/.test(selected.integrity || '')) throw Error('Invalid catalog package source');
  const checked = readBundle(resolve(catalog, selected.bundle), selected.integrity);
  if (checked.bundle.manifest.id !== id || checked.bundle.manifest.version !== selected.version || JSON.stringify(checked.bundle.manifest) !== JSON.stringify(selected.manifest)) throw Error('Catalog metadata differs from the reviewed package');
  return checked;
}
export function stateOf(site) {
  const path = noLinks(join(site, 'extensions.json'));
  const data = existsSync(path) ? JSON.parse(readLimited(path, 1024 * 1024)) : { format: 1, extensions: [] };
  if (data.format !== 1 || !Array.isArray(data.extensions) || data.extensions.some(e => !validId(e.id) || typeof e.enabled !== 'boolean') || new Set(data.extensions.map(e => e.id)).size !== data.extensions.length) throw Error('Invalid extensions.json');
  return data;
}
function checkSite(site) {
  site = noLinks(localPath(site));
  const contract = join(site, 'engine/extension-contract.js');
  if (!existsSync(contract) || !readFileSync(contract, 'utf8').includes(`API_VERSION = ${API_VERSION}`)) throw Error('This site needs an engine with extension API 1. Update the engine before installing.');
  if (!/extensions\s*:\s*['"]\.\/extensions\.json['"]/.test(readFileSync(join(site, 'home.config.js'), 'utf8'))) throw Error("Add extensions: './extensions.json' to home.config.js; preserve the existing settings");
  noLinks(join(site, 'extensions')); noLinks(join(site, '.homecraft/extensions'));
  return site;
}
function installedBundle(site, record) {
  if (!record) return null;
  const folder = noLinks(join(site, 'extensions', record.id));
  const manifest = JSON.parse(readLimited(join(folder, 'manifest.json'), 64 * 1024));
  fail(validateManifest(manifest));
  if (manifest.id !== record.id || manifest.version !== record.version) throw Error('Installed identity differs from extensions.json');
  const files = Object.fromEntries([...manifest.files].sort().map(file => [file, readLimited(child(folder, file), MAX_FILE).toString('base64')]));
  const bundle = { format: 1, manifest, files };
  validateBundle(bundle);
  if (digest(Buffer.from(JSON.stringify(bundle, null, 2) + '\n')) !== record.integrity) throw Error(`Installed files changed for ${record.id}; preserve those edits before replacing or removing it`);
  // Refuse to remove local files that the package did not install.
  const walk = dir => readdirSync(dir).flatMap(name => {
    const path = noLinks(join(dir, name));
    return lstatSync(path).isDirectory() ? walk(path) : [relative(folder, path).split('\\').join('/')];
  });
  if (walk(folder).some(file => file !== 'manifest.json' && !manifest.files.includes(file))) throw Error(`Unmanaged files in ${record.id}; move them before replacing or removing it`);
  return bundle;
}
function locked(site, fn) {
  const dir = noLinks(join(site, '.homecraft/extensions')); mkdirSync(dir, { recursive: true });
  const lock = join(dir, 'lock');
  let fd;
  try { fd = openSync(lock, 'wx'); } catch { throw Error(`Another extension operation is active; inspect ${lock} if a previous process stopped`); }
  try { return fn(); } finally { closeSync(fd); rmSync(lock); }
}
function apply(site, id, before, after, previousBundle, nextBundle, operation) {
  const state = stateOf(site), root = join(site, 'extensions'), target = noLinks(join(root, id));
  const storage = noLinks(join(site, '.homecraft/extensions')), token = `${Date.now()}-${process.hrtime.bigint().toString().padStart(24, '0')}-${randomUUID()}`;
  const staged = join(storage, `${token}-stage`), saved = join(storage, `${token}-old`);
  const statePath = join(site, 'extensions.json'), oldBytes = existsSync(statePath) ? readFileSync(statePath) : null;
  const backup = join(storage, 'history', id, `${token}.json`);
  let moved = false, swapped = false;
  try {
    if (nextBundle) {
      mkdirSync(staged, { recursive: true });
      writeJSON(join(staged, 'manifest.json'), nextBundle.manifest);
      for (const [file, base64] of Object.entries(nextBundle.files)) { const out = child(staged, file); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, Buffer.from(base64, 'base64')); }
    }
    writeJSON(backup, { format: 1, id, operation, before, after, bundle: previousBundle });
    mkdirSync(root, { recursive: true });
    if (existsSync(target)) { renameSync(target, saved); moved = true; }
    if (nextBundle) { renameSync(staged, target); swapped = true; }
    const next = { format: 1, extensions: state.extensions.filter(e => e.id !== id) };
    if (after) next.extensions.push(after);
    const temp = join(storage, `${token}-state`); writeJSON(temp, next); renameSync(temp, statePath);
  } catch (error) {
    if (swapped) rmSync(target, { recursive: true, force: true });
    if (moved) renameSync(saved, target);
    if (oldBytes) writeFileSync(statePath, oldBytes); else rmSync(statePath, { force: true });
    rmSync(backup, { force: true }); throw error;
  } finally { rmSync(staged, { recursive: true, force: true }); }
  rmSync(saved, { recursive: true, force: true });
  return { id, operation, version: after?.version || null, enabled: after?.enabled || false, backup, next: 'Preview and redeploy the site. Local changes do not update a published website.' };
}
export function settings(manifest, existing, assignments = []) {
  const options = { ...existing };
  for (const assignment of assignments) {
    const at = assignment.indexOf('='), key = assignment.slice(0, at), raw = assignment.slice(at + 1), field = manifest.config[key];
    if (at < 1 || !Object.hasOwn(manifest.config, key)) throw Error(`Unknown configuration assignment: ${assignment}`);
    if (field.type === 'boolean' && !['true', 'false'].includes(raw)) throw Error(`${key}: expected true or false`);
    options[key] = field.type === 'boolean' ? raw === 'true' : ['number', 'integer'].includes(field.type) ? (raw.trim() ? Number(raw) : NaN) : raw;
  }
  return options;
}
export function install({ site, id, catalog, bundle, version, assignments = [], disabled = false, update = false }) {
  site = checkSite(site);
  const checked = bundle ? readBundle(bundle) : catalogPackage(id, noLinks(localPath(catalog)), version);
  const m = checked.bundle.manifest;
  if (id && m.id !== id) throw Error('Requested extension ID differs from the package');
  return locked(site, () => {
    const before = stateOf(site).extensions.find(e => e.id === m.id) || null;
    if (update && !before) throw Error('Extension is not installed');
    if (!update && before) throw Error('Extension is already installed; use update');
    if (!before && existsSync(join(site, 'extensions', m.id))) throw Error('An unmanaged extension directory already exists');
    const previous = installedBundle(site, before);
    const retained = Object.fromEntries(Object.entries(before?.options || {}).filter(([key]) => Object.hasOwn(m.config, key)));
    const checkedOptions = validateOptions(m, settings(m, retained, assignments), { partial: true });
    fail(checkedOptions.errors);
    const after = { id: m.id, version: m.version, integrity: checked.integrity,
      enabled: !disabled && !checkedOptions.missing.length && (before ? before.enabled : true), options: checkedOptions.options };
    const result = apply(site, m.id, before, after, previous, checked.bundle, update ? 'update' : 'install');
    return { ...result, missing: checkedOptions.missing, capabilities: m.capabilities };
  });
}
export function change({ site, id, operation, assignments = [] }) {
  if (!validId(id)) throw Error('Invalid extension ID');
  site = checkSite(site);
  return locked(site, () => {
    const state = stateOf(site), before = state.extensions.find(e => e.id === id);
    if (!before) throw Error('Extension is not installed');
    const bundle = installedBundle(site, before);
    if (operation === 'remove') return apply(site, id, before, null, bundle, null, operation);
    if (!['enable', 'disable', 'configure'].includes(operation)) throw Error('Unknown extension operation');
    const enabled = operation === 'enable' ? true : operation === 'disable' ? false : before.enabled;
    const checked = validateOptions(bundle.manifest, settings(bundle.manifest, before.options, assignments), { partial: !enabled });
    fail(checked.errors);
    return apply(site, id, before, { ...before, enabled, options: checked.options }, bundle, bundle, operation);
  });
}
export function rollback(site, id) {
  site = checkSite(site);
  if (!validId(id)) throw Error('Invalid extension ID');
  return locked(site, () => {
    const dir = noLinks(join(site, '.homecraft/extensions/history', id));
    const file = existsSync(dir) && readdirSync(dir).filter(f => f.endsWith('.json')).sort().at(-1);
    if (!file) throw Error('No rollback snapshot exists');
    const path = noLinks(join(dir, file)), snapshot = json(path), current = stateOf(site).extensions.find(e => e.id === id) || null;
    if (JSON.stringify(current) !== JSON.stringify(snapshot.after)) throw Error('Configuration changed after this operation; preserve those changes before rollback');
    const currentBundle = installedBundle(site, current);
    if (snapshot.bundle) validateBundle(snapshot.bundle);
    const result = apply(site, id, current, snapshot.before, currentBundle, snapshot.bundle, 'rollback');
    renameSync(path, `${path}.used`);
    return result;
  });
}
export function doctor(site) {
  site = checkSite(site);
  const records = stateOf(site).extensions.map(record => {
    try {
      const { manifest } = installedBundle(site, record);
      const checked = validateOptions(manifest, record.options, { partial: !record.enabled }); fail(checked.errors);
      return { id: record.id, version: record.version, enabled: record.enabled, valid: true, missing: checked.missing };
    } catch (error) { return { id: record.id, valid: false, error: error.message }; }
  });
  return { valid: records.every(r => r.valid), extensions: records };
}
export function copyEnabled(site, output) {
  site = noLinks(localPath(site)); output = noLinks(localPath(output));
  if (output === site || !relative(site, output) || relative(output, site).startsWith(`..`) === false) throw Error('Build output must not replace the source site or its parent');
  const state = stateOf(site), selected = state.extensions.filter(e => e.enabled);
  if (existsSync(join(output, 'extensions'))) throw Error('Use an empty extensions build directory');
  for (const record of selected) {
    const bundle = installedBundle(site, record); fail(validateOptions(bundle.manifest, record.options).errors);
    const dir = noLinks(join(output, 'extensions', record.id));
    for (const [file, encoded] of Object.entries(bundle.files)) {
      const path = child(dir, file); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, Buffer.from(encoded, 'base64'));
    }
    writeJSON(join(dir, 'manifest.json'), bundle.manifest);
  }
  writeJSON(join(output, 'extensions.json'), { format: 1, extensions: selected });
  return { copied: selected.map(e => e.id) };
}
