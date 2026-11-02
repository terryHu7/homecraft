// Real historical forks and isolated local Releases; never touch a user's site.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { applyUpdate, applyResolution, downloadRelease, hash, planUpdate, readEngine, rollback, validateBundle } from './update-engine.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'homecraft-update-tests-'));
const assets = join(temporary, 'release'), storage = join(temporary, 'backups');
after(() => rmSync(temporary, { recursive: true, force: true }));
execFileSync(process.execPath, ['tools/prepare-release.mjs', '--allow-dirty', '--out', assets], { cwd: root, stdio: 'pipe' });
const bundle = JSON.parse(readFileSync(join(assets, 'homecraft-engine.json')));
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 20 * 1024 * 1024 });
let sequence = 0;
function write(file, bytes) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes); }
function historical(ref) {
  return Object.fromEntries(git('ls-tree', '-r', '--name-only', ref, '--', 'engine/').toString().trim().split('\n')
    .map(path => [path.slice(7), git('show', `${ref}:${path}`)]));
}
const initial = historical('8a8e101');
const beforeRelease = historical('a077af9');
function site(files = initial, agents = '# My project\nKeep my custom rules.\n') {
  const folder = join(temporary, `site-${++sequence}`);
  write(join(folder, 'index.html'), '<title>My own home</title>');
  write(join(folder, 'home.config.js'), 'export default { name: "My own home" };\n');
  write(join(folder, 'package.json'), '{"name":"my-personal-site","private":true}\n');
  write(join(folder, 'world/build.js'), '// Custom furniture belongs to me.\n');
  write(join(folder, 'assets/personal.txt'), 'my picture');
  write(join(folder, '.github/workflows/deploy.yml'), 'my custom hosting');
  if (agents !== null) write(join(folder, 'AGENTS.md'), agents);
  for (const [file, bytes] of Object.entries(files)) write(join(folder, 'engine', file), bytes);
  return folder;
}
const protectedPaths = ['index.html', 'home.config.js', 'package.json', 'world/build.js', 'assets/personal.txt', '.github/workflows/deploy.yml'];
const protectedFiles = folder => Object.fromEntries(protectedPaths.map(file => [file, readFileSync(join(folder, file)).toString('base64')]));
const bytes = folder => Object.fromEntries(Object.entries(readEngine(join(folder, 'engine'))).map(([file, data]) => [file, data.toString('base64')]));

test('initial fork upgrades all shared fixes, preserves personal files/rules, and is idempotent', () => {
  const folder = site(), personal = protectedFiles(folder);
  const result = applyUpdate({ root: folder, bundle, storage });
  assert.equal(result.status, 'updated');
  assert.equal(JSON.parse(readFileSync(join(folder, 'engine/manifest.json'))).version, bundle.version);
  assert(existsSync(join(folder, 'engine/door-directory.js')));
  assert.deepEqual(protectedFiles(folder), personal);
  const agents = readFileSync(join(folder, 'AGENTS.md'), 'utf8');
  assert(agents.startsWith('# My project\nKeep my custom rules.\n'));
  assert.equal(agents.match(/<!-- homecraft-updates:start -->/g).length, 1);
  assert.equal(applyUpdate({ root: folder, bundle, storage }).status, 'current');
  assert.equal(readFileSync(join(folder, 'AGENTS.md'), 'utf8'), agents);
  for (const [file, digest] of Object.entries(bundle.manifest.files)) assert.equal(hash(file, readFileSync(join(folder, 'engine', file))), digest);
});

test('official main with an old manifest is recognized, not treated as user edits', () => {
  const result = applyUpdate({ root: site(beforeRelease), bundle, storage });
  assert.equal(result.status, 'updated');
  assert.deepEqual(result.conflicts, []);
});

test('check mode changes no files and creates no backup directory', () => {
  const folder = site(), before = bytes(folder), rules = readFileSync(join(folder, 'AGENTS.md'), 'utf8');
  const isolatedStorage = join(temporary, 'check-only');
  assert.equal(applyUpdate({ root: folder, bundle, storage: isolatedStorage, dryRun: true }).status, 'available');
  assert.deepEqual(bytes(folder), before);
  assert.equal(readFileSync(join(folder, 'AGENTS.md'), 'utf8'), rules);
  assert.equal(existsSync(isolatedStorage), false);
});

test('conflicting core customization stops the whole update and provides base/local/incoming', () => {
  const folder = site();
  write(join(folder, 'engine/input.js'), Buffer.concat([initial['input.js'], Buffer.from('\n// My custom controls.\n')]));
  const before = bytes(folder), rules = readFileSync(join(folder, 'AGENTS.md'), 'utf8');
  const result = applyUpdate({ root: folder, bundle, storage });
  assert.equal(result.status, 'conflict');
  assert(result.conflicts.includes('input.js'));
  assert.deepEqual(bytes(folder), before);
  assert.equal(readFileSync(join(folder, 'AGENTS.md'), 'utf8'), rules);
  assert.equal(readFileSync(join(result.report, 'base/input.js'), 'utf8'), initial['input.js'].toString());
  assert.match(readFileSync(join(result.report, 'local/input.js'), 'utf8'), /My custom controls/);
  assert.equal(readFileSync(join(result.report, 'incoming/input.js')).toString('base64'), bundle.files['input.js']);
});

test('unchanged upstream files retain local edits and additional local engine files', () => {
  const folder = site(), file = 'weather.js';
  assert.equal(hash(file, initial[file]), bundle.manifest.files[file]);
  const custom = Buffer.concat([initial[file], Buffer.from('\n// Personal weather tuning.\n')]);
  write(join(folder, 'engine', file), custom);
  write(join(folder, 'engine/my-helper.js'), '// My own addition.\n');
  const result = applyUpdate({ root: folder, bundle, storage });
  assert.equal(result.status, 'updated');
  assert(result.preserved.includes(file));
  assert.deepEqual(readFileSync(join(folder, 'engine', file)), custom);
  assert.equal(readFileSync(join(folder, 'engine/my-helper.js'), 'utf8'), '// My own addition.\n');
});

test('agent resolution completes the whole upgrade and retains the merged customization', () => {
  const folder = site(), personal = protectedFiles(folder);
  write(join(folder, 'engine/input.js'), Buffer.concat([initial['input.js'], Buffer.from('\n// Custom controls.\n')]));
  const conflict = applyUpdate({ root: folder, bundle, storage });
  const merged = Buffer.concat([Buffer.from(bundle.files['input.js'], 'base64'), Buffer.from('\n// Custom controls, merged.\n')]);
  write(join(conflict.report, 'prepared/input.js'), merged);
  const updated = applyResolution({ root: folder, report: conflict.report, storage });
  assert.equal(updated.status, 'updated');
  assert.deepEqual(readFileSync(join(folder, 'engine/input.js')), merged);
  assert(existsSync(join(folder, 'engine/door-directory.js')));
  assert.deepEqual(protectedFiles(folder), personal);
  assert.equal(applyUpdate({ root: folder, bundle, storage }).status, 'current');
});

test('conflict continuation rejects stale sources and changes outside reported conflicts', () => {
  const folder = site();
  write(join(folder, 'engine/input.js'), '// My controls.\n');
  const conflict = applyUpdate({ root: folder, bundle, storage });
  write(join(conflict.report, 'prepared/weather.js'), '// Unreported change.\n');
  assert.throws(() => applyResolution({ root: folder, report: conflict.report, storage }), /Only reported conflict/);
  write(join(folder, 'engine/input.js'), '// More recent work.\n');
  assert.throws(() => applyResolution({ root: folder, report: conflict.report, storage }), /changed since/);
  assert.equal(readFileSync(join(folder, 'engine/input.js'), 'utf8'), '// More recent work.\n');
});

test('unknown baselines stop before writing files, including missing or damaged manifests', () => {
  const folder = site();
  write(join(folder, 'engine/manifest.json'), '{"version":"0.1.0","files":{}}');
  write(join(folder, 'engine/input.js'), '// Mine, with an unknown baseline.\n');
  const isolated = join(temporary, 'unknown-backups');
  for (const metadata of ['{"version":"0.1.0","files":{}}', 'broken', null]) {
    if (metadata === null) rmSync(join(folder, 'engine/manifest.json')); else write(join(folder, 'engine/manifest.json'), metadata);
    const before = bytes(folder), rules = readFileSync(join(folder, 'AGENTS.md'));
    for (const dryRun of [false, true]) assert.throws(() => applyUpdate({ root: folder, bundle, storage: isolated, dryRun }), /Unknown engine baseline/);
    assert.deepEqual(bytes(folder), before);
    assert.deepEqual(readFileSync(join(folder, 'AGENTS.md')), rules);
  }
  assert.equal(existsSync(isolated), false);
});

test('deleted tracked engine files require explicit resolution and cannot produce an incomplete update', () => {
  const folder = site();
  rmSync(join(folder, 'engine/main.js'));
  const before = bytes(folder);
  const result = applyUpdate({ root: folder, bundle, storage });
  assert.equal(result.status, 'conflict');
  assert(result.conflicts.includes('main.js'));
  assert.deepEqual(bytes(folder), before);
  assert.deepEqual(readFileSync(join(result.report, 'base/main.js')), initial['main.js']);
  assert.throws(() => applyResolution({ root: folder, report: result.report, storage }), /missing a release file: main.js/);
  write(join(result.report, 'prepared/main.js'), Buffer.from(bundle.files['main.js'], 'base64'));
  assert.equal(applyResolution({ root: folder, report: result.report, storage }).status, 'updated');
  assert.deepEqual(readFileSync(join(folder, 'engine/main.js')), Buffer.from(bundle.files['main.js'], 'base64'));
});

test('intentional local reverts are preserved when that file is unchanged upstream', () => {
  const current = Object.fromEntries(Object.entries(bundle.files).map(([file, data]) => [file, Buffer.from(data, 'base64')]));
  current['manifest.json'] = Buffer.from(JSON.stringify(bundle.manifest));
  current['input.js'] = initial['input.js'];
  assert(bundle.known['input.js'].includes(hash('input.js', initial['input.js'])));
  const result = planUpdate(current, bundle);
  assert(result.preserved.includes('input.js'));
  assert.deepEqual(result.files['input.js'], initial['input.js']);
});

test('Windows CRLF engine files match the official baseline', () => {
  const crlf = Object.fromEntries(Object.entries(initial).map(([file, data]) => [file,
    /\.(js|css|json|md|html|txt)$/.test(file) ? Buffer.from(data.toString().replace(/\r?\n/g, '\r\n')) : data]));
  assert.equal(applyUpdate({ root: site(crlf), bundle, storage }).status, 'updated');
});

test('rollback restores original engine and rules, saving the state being replaced', () => {
  const folder = site(), before = bytes(folder), rules = readFileSync(join(folder, 'AGENTS.md'), 'utf8');
  const updated = applyUpdate({ root: folder, bundle, storage });
  const saved = rollback({ root: folder, backup: updated.backup, storage });
  assert.deepEqual(bytes(folder), before);
  assert.equal(readFileSync(join(folder, 'AGENTS.md'), 'utf8'), rules);
  assert.equal(JSON.parse(readFileSync(join(saved, 'engine/manifest.json'))).version, bundle.version);
});

test('a failed engine replacement restores the original engine and Agent rules', () => {
  const folder = site(), before = bytes(folder), rules = readFileSync(join(folder, 'AGENTS.md'));
  const canonical = fs.realpathSync(folder);
  const rename = fs.renameSync;
  let injected = false;
  fs.renameSync = (source, destination) => {
    if (!injected && basename(source) === 'next' && destination === join(canonical, 'engine')) {
      injected = true;
      throw Object.assign(Error('Injected rename failure'), { code: 'EACCES' });
    }
    return rename(source, destination);
  };
  syncBuiltinESMExports();
  try { assert.throws(() => applyUpdate({ root: folder, bundle, storage }), /Injected rename failure/); }
  finally { fs.renameSync = rename; syncBuiltinESMExports(); }
  assert(injected);
  assert.deepEqual(bytes(folder), before);
  assert.deepEqual(readFileSync(join(folder, 'AGENTS.md')), rules);
});

test('a failed Agent instruction write restores the original engine and rules', () => {
  const folder = site(), before = bytes(folder), rules = readFileSync(join(folder, 'AGENTS.md'));
  const canonical = fs.realpathSync(folder);
  const writeFile = fs.writeFileSync;
  let injected = false;
  fs.writeFileSync = (file, ...args) => {
    if (!injected && file === join(canonical, 'AGENTS.md')) {
      injected = true;
      throw Object.assign(Error('Injected instruction write failure'), { code: 'ENOSPC' });
    }
    return writeFile(file, ...args);
  };
  syncBuiltinESMExports();
  try { assert.throws(() => applyUpdate({ root: folder, bundle, storage }), /Injected instruction write failure/); }
  finally { fs.writeFileSync = writeFile; syncBuiltinESMExports(); }
  assert(injected);
  assert.deepEqual(bytes(folder), before);
  assert.deepEqual(readFileSync(join(folder, 'AGENTS.md')), rules);
});

test('rollback preserves Agent edits made after adoption instead of overwriting them', () => {
  const folder = site(), updated = applyUpdate({ root: folder, bundle, storage });
  const rules = readFileSync(join(folder, 'AGENTS.md'), 'utf8') + '\nMy new rule.\n';
  write(join(folder, 'AGENTS.md'), rules);
  const engine = bytes(folder);
  assert.throws(() => rollback({ root: folder, backup: updated.backup, storage }), /changed after/);
  assert.deepEqual(bytes(folder), engine);
  assert.equal(readFileSync(join(folder, 'AGENTS.md'), 'utf8'), rules);
});

test('adopts a project without AGENTS and rollback removes only the newly created instructions', () => {
  const folder = site(initial, null), updated = applyUpdate({ root: folder, bundle, storage });
  assert(existsSync(join(folder, 'AGENTS.md')));
  const redo = rollback({ root: folder, backup: updated.backup, storage });
  assert.equal(existsSync(join(folder, 'AGENTS.md')), false);
  rollback({ root: folder, backup: redo, storage });
  assert(existsSync(join(folder, 'AGENTS.md')));
});

test('corrupt downloads and unsafe paths stop before any source change', () => {
  const folder = site(), before = bytes(folder);
  const corrupt = structuredClone(bundle);
  corrupt.files['input.js'] = Buffer.from('corrupt').toString('base64');
  assert.throws(() => applyUpdate({ root: folder, bundle: corrupt, storage }), /checksum/);
  const unsafe = structuredClone(bundle), data = Buffer.from('unsafe');
  unsafe.files['../world/build.js'] = data.toString('base64');
  unsafe.manifest.files['../world/build.js'] = hash('../world/build.js', data);
  assert.throws(() => validateBundle(unsafe), /Invalid engine file/);
  assert.deepEqual(bytes(folder), before);
});

test('source checks reject dist folders, malformed instruction blocks, and symlinked engine files', () => {
  const folder = site();
  rmSync(join(folder, 'package.json'));
  assert.throws(() => applyUpdate({ root: folder, bundle, storage }), /source folder/);
  const broken = site(initial, '<!-- homecraft-updates:start -->');
  assert.throws(() => applyUpdate({ root: broken, bundle, storage }), /incomplete/);
  const linked = site();
  symlinkSync(join(linked, 'index.html'), join(linked, 'engine/linked.js'));
  assert.throws(() => applyUpdate({ root: linked, bundle, storage }), /symlinks/);
});

test('download uses official stable Release and verifies the GitHub asset digest', async () => {
  const published = { ...bundle, preview: false }, content = Buffer.from(JSON.stringify(published));
  const url = `https://github.com/terryHu7/homecraft/releases/download/v${bundle.version}/homecraft-engine.json`;
  const release = { tag_name: `v${bundle.version}`, assets: [{ name: 'homecraft-engine.json', browser_download_url: url,
    size: content.length, digest: `sha256:${createHash('sha256').update(content).digest('hex')}` }] };
  const seen = [];
  const request = async address => {
    seen.push(address);
    return address === url ? new Response(content) : Response.json(release);
  };
  assert.equal((await downloadRelease(undefined, request)).version, bundle.version);
  assert.deepEqual(seen, ['https://api.github.com/repos/terryHu7/homecraft/releases/latest', url]);
  release.assets[0].digest = 'sha256:wrong';
  await assert.rejects(() => downloadRelease(undefined, request), /checksum/);
  release.assets[0].browser_download_url = 'https://example.com/something-else';
  await assert.rejects(() => downloadRelease(undefined, request), /Unexpected/);
});

test('no Release and API failures are actionable and non-mutating', async () => {
  await assert.rejects(() => downloadRelease(undefined, async () => new Response('', { status: 404 })), /No official engine Release/);
  await assert.rejects(() => downloadRelease(undefined, async () => new Response('', { status: 403 })), /HTTP 403/);
  await assert.rejects(() => downloadRelease('main'), /stable release tag/);
});

test('standalone tarball URL bootstraps a real old fork without any local update script', async () => {
  const folder = site(), before = protectedFiles(folder);
  const tarball = readFileSync(join(assets, 'homecraft-updater.tgz'));
  const server = createServer((req, res) => {
    if (req.url !== '/homecraft-updater.tgz') { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', 'application/octet-stream'); res.end(tarball);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/homecraft-updater.tgz`;
    const { stdout } = await promisify(execFile)('npx', ['--yes', '--cache', join(temporary, 'npm-cache'),
      url, '--dir', folder, '--bundle', join(assets, 'homecraft-engine.json'), '--check'], {
      encoding: 'utf8', cwd: folder, env: { ...process.env, npm_config_update_notifier: 'false', npm_config_audit: 'false' }, timeout: 30000,
    });
    assert(stdout.includes(`Available: Homecraft 0.1.0 → ${bundle.version}`));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  assert.deepEqual(protectedFiles(folder), before);
  assert.equal(readFileSync(join(folder, 'engine/manifest.json'), 'utf8'), initial['manifest.json'].toString());
});

test('releases cannot silently downgrade a newer installed engine', () => {
  const folder = site();
  write(join(folder, 'engine/manifest.json'), JSON.stringify({ version: '999.0.0', files: {} }));
  assert.throws(() => applyUpdate({ root: folder, bundle, storage }), /newer/);
});

test('three-way planning removes untouched files deleted upstream and stops on edited deletions', () => {
  const fixture = structuredClone(bundle);
  const old = Buffer.from('old'), file = 'retired.js';
  const baseline = { version: '0.1.0', files: { ...bundle.manifest.files, [file]: hash(file, old) } };
  fixture.baselines.push({ commit: '0'.repeat(40), manifest: baseline, files: { [file]: old.toString('base64') } });
  const current = Object.fromEntries(Object.entries(bundle.files).map(([key, data]) => [key, Buffer.from(data, 'base64')]));
  current[file] = old;
  current['manifest.json'] = Buffer.from(JSON.stringify(baseline));
  const plan = planUpdate(current, fixture);
  assert(plan.changed.includes(file));
  assert(!plan.files[file]);
  current[file] = Buffer.from('my modification');
  assert(planUpdate(current, fixture).conflicts.includes(file));
});
