import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initialize } from './extensions.mjs';
import { pack, propose, accept, install, change, rollback, stateOf, doctor, copyEnabled, json, writeJSON, readBundle, validateBundle, localPath, MAX_FILE } from './extensions-lib.mjs';
import { validateManifest } from '../engine/extension-contract.js';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const root = mkdtempSync(join(realpathSync(tmpdir()), 'homecraft-extensions-'));
after(() => rmSync(root, { recursive: true, force: true }));
let sequence = 0;
function fixture() {
  const dir = join(root, String(++sequence)), source = join(dir, 'source'), site = join(dir, 'site'), catalog = join(dir, 'catalog');
  initialize(source, 'author.example'); mkdirSync(join(site, 'engine'), { recursive: true }); mkdirSync(catalog);
  writeFileSync(join(site, 'engine/extension-contract.js'), 'export const API_VERSION = 1;');
  writeFileSync(join(site, 'home.config.js'), "export default { extensions: './extensions.json' };\n");
  writeFileSync(join(site, 'index.html'), 'personal content');
  const publish = (version = '0.1.0') => {
    const m = json(join(source, 'manifest.json')); m.version = version; writeJSON(join(source, 'manifest.json'), m);
    const bundle = join(dir, `${version}.json`), submission = join(dir, `${version}.submission.json`);
    pack(source, bundle); propose(bundle, submission); accept(submission, catalog); return bundle;
  };
  return { dir, source, site, catalog, publish };
}
test('catalog install, configuration, update, rollback, removal and recovery preserve site files', () => {
  const f = fixture(); f.publish();
  const config = readFileSync(join(f.site, 'home.config.js'));
  install({ ...f, id: 'author.example' });
  change({ ...f, id: 'author.example', operation: 'configure', assignments: ['message=Personal'] });
  f.publish('0.2.0'); install({ ...f, id: 'author.example', update: true });
  assert.equal(stateOf(f.site).extensions[0].version, '0.2.0');
  assert.equal(stateOf(f.site).extensions[0].options.message, 'Personal');
  rollback(f.site, 'author.example'); assert.equal(stateOf(f.site).extensions[0].version, '0.1.0');
  change({ ...f, id: 'author.example', operation: 'disable' });
  assert.equal(stateOf(f.site).extensions[0].enabled, false);
  change({ ...f, id: 'author.example', operation: 'remove' });
  assert.deepEqual(stateOf(f.site).extensions, []); assert(!existsSync(join(f.site, 'extensions/author.example')));
  rollback(f.site, 'author.example'); assert.equal(doctor(f.site).valid, true);
  assert.deepEqual(readFileSync(join(f.site, 'home.config.js')), config);
  assert.equal(readFileSync(join(f.site, 'index.html'), 'utf8'), 'personal content');
});
test('required service configuration gates enabling and validates destination', () => {
  const f = fixture(), path = join(f.source, 'manifest.json'), m = json(path);
  m.config = { endpoint: { type: 'string', format: 'url', required: true, label: { en: 'Service', zh: '服务' } } }; writeJSON(path, m); f.publish();
  assert.equal(install({ ...f, id: m.id }).enabled, false);
  assert.throws(() => change({ ...f, id: m.id, operation: 'enable' }), /Required/);
  assert.throws(() => change({ ...f, id: m.id, operation: 'configure', assignments: ['endpoint=http://example.org/'] }), /HTTPS/);
  change({ ...f, id: m.id, operation: 'configure', assignments: ['endpoint=http://127.0.0.1:4318/presence/state'] });
  assert.equal(change({ ...f, id: m.id, operation: 'enable' }).enabled, true);
});
test('reviewed checksum, immutable versions, withdrawal and canonical encoding are enforced', () => {
  const f = fixture(), bundle = f.publish();
  assert.throws(() => accept(join(f.dir, '0.1.0.submission.json'), f.catalog), /cannot be replaced/);
  writeFileSync(bundle, readFileSync(bundle, 'utf8') + ' ');
  assert.throws(() => install({ ...f, id: 'author.example' }), /checksum/);
  assert.throws(() => readBundle(bundle), /canonical/);
  const path = join(f.catalog, 'author.example.json'), entry = json(path); entry.releases[0].status = 'withdrawn'; writeJSON(path, entry);
  assert.throws(() => install({ ...f, id: 'author.example' }), /No active/);
  assert.deepEqual(stateOf(f.site).extensions, []);
});
test('local edits, extra files and record changes block destructive operations', () => {
  const f = fixture(); f.publish(); install({ ...f, id: 'author.example' });
  const index = join(f.site, 'extensions/author.example/index.js'), original = readFileSync(index);
  writeFileSync(index, '// personal changes');
  assert.throws(() => change({ ...f, id: 'author.example', operation: 'remove' }), /files changed/);
  assert.equal(doctor(f.site).valid, false); writeFileSync(index, original);
  const extra = join(f.site, 'extensions/author.example/mine.txt'); writeFileSync(extra, 'mine');
  assert.throws(() => change({ ...f, id: 'author.example', operation: 'remove' }), /Unmanaged/); rmSync(extra);
  const state = stateOf(f.site); state.extensions[0].options.message = 'manual'; writeJSON(join(f.site, 'extensions.json'), state);
  assert.throws(() => rollback(f.site, 'author.example'), /Configuration changed/);
});
test('path traversal, duplicate paths, symlinks, API mismatches and oversized files are rejected', () => {
  const f = fixture(), manifest = json(join(f.source, 'manifest.json'));
  for (const files of [['../secret', ...manifest.files], ['Manifest.json', ...manifest.files], ['a', 'a/b', ...manifest.files], ['INDEX.js', ...manifest.files]]) assert(validateManifest({ ...manifest, files }).length);
  assert(validateManifest({ ...manifest, apiVersion: 999 }).length);
  const entry = join(f.source, 'index.js'); rmSync(entry); symlinkSync(join(f.site, 'index.html'), entry);
  assert.throws(() => f.publish(), /Symbolic links/);
  rmSync(entry); writeFileSync(entry, Buffer.alloc(MAX_FILE + 1)); assert.throws(() => f.publish(), /size limit/);
  assert.throws(() => localPath('https://example.org/package.json'), /no network/);
});
test('bundle allowlist and package identity cannot diverge from selected ID', () => {
  const f = fixture(), path = f.publish(), bundle = json(path);
  bundle.files['extra.js'] = Buffer.from('extra').toString('base64'); assert.throws(() => validateBundle(bundle), /allowlist/);
  assert.throws(() => install({ ...f, bundle: path, id: 'other.name' }), /ID differs/);
  assert.deepEqual(stateOf(f.site).extensions, []);
});
test('locking and unmanaged destination preserve existing files', () => {
  const f = fixture(); f.publish(); const dir = join(f.site, '.homecraft/extensions'); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'lock'), 'in progress'); assert.throws(() => install({ ...f, id: 'author.example' }), /operation is active/);
  rmSync(join(dir, 'lock')); mkdirSync(join(f.site, 'extensions/author.example'), { recursive: true });
  assert.throws(() => install({ ...f, id: 'author.example' }), /unmanaged/);
});
test('catalog selects the greatest version and schema changes preserve rollback settings', () => {
  const f = fixture(); f.publish('0.2.0'); f.publish('0.1.0');
  install({ ...f, id: 'author.example', assignments: ['message=Keep this'] });
  assert.equal(stateOf(f.site).extensions[0].version, '0.2.0');
  const path = join(f.source, 'manifest.json'), manifest = json(path); manifest.config = {}; writeJSON(path, manifest); f.publish('0.3.0');
  install({ ...f, id: 'author.example', update: true }); assert.deepEqual(stateOf(f.site).extensions[0].options, {});
  rollback(f.site, 'author.example'); assert.equal(stateOf(f.site).extensions[0].options.message, 'Keep this');
});
test('a failed configuration swap restores the previous package and settings', () => {
  const f = fixture(); f.publish(); install({ ...f, id: 'author.example' });
  const before = stateOf(f.site), index = readFileSync(join(f.site, 'extensions/author.example/index.js'));
  writeFileSync(join(f.source, 'index.js'), "export function activate(api) { api.ui.status('Updated'); }\n"); f.publish('0.2.0');
  const rename = fs.renameSync;
  fs.renameSync = (from, to) => { if (to === join(f.site, 'extensions.json')) throw Error('Simulated write failure'); return rename(from, to); };
  syncBuiltinESMExports();
  try { assert.throws(() => install({ ...f, id: 'author.example', update: true }), /Simulated write failure/); }
  finally { fs.renameSync = rename; syncBuiltinESMExports(); }
  assert.deepEqual(stateOf(f.site), before);
  assert.deepEqual(readFileSync(join(f.site, 'extensions/author.example/index.js')), index);
  assert.equal(doctor(f.site).valid, true);
});
test('build contains only enabled packages and rejects changed installed code', () => {
  const f = fixture(); f.publish(); install({ ...f, id: 'author.example' });
  const enabled = join(f.dir, 'enabled'); copyEnabled(f.site, enabled);
  assert(existsSync(join(enabled, 'extensions/author.example/index.js')));
  assert(existsSync(join(enabled, 'extensions/author.example/LICENSE')));
  assert.throws(() => copyEnabled(f.site, f.site), /must not replace/);
  change({ ...f, id: 'author.example', operation: 'disable' });
  const disabled = join(f.dir, 'disabled'); copyEnabled(f.site, disabled);
  assert.deepEqual(json(join(disabled, 'extensions.json')).extensions, []);
  assert(!existsSync(join(disabled, 'extensions')));
});
