// Maintainer-only: produce the two assets used by the official update command.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { hash, readEngine, validateBundle } from './update-engine.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 20 * 1024 * 1024 });
const args = process.argv.slice(2);
let preview = false, folder = '.release';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--allow-dirty') preview = true;
  else if (args[i] === '--out' && args[i + 1] && !args[i + 1].startsWith('--')) folder = args[++i];
  else throw Error('Usage: node tools/prepare-release.mjs [--out folder] [--allow-dirty]');
}
const out = resolve(root, folder);
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Expected a stable package version');
if (!preview && git('status', '--porcelain', '--untracked-files=normal').toString().trim()) throw Error('Commit the reviewed release files first. Use --allow-dirty only for a local preview.');
const current = readEngine(join(root, 'engine'));
const manifest = JSON.parse(current['manifest.json']);
const files = Object.fromEntries(Object.entries(current).filter(([file]) => file !== 'manifest.json').map(([file, bytes]) => [file, bytes.toString('base64')]));
if (manifest.version !== version) throw Error('Generate the release engine manifest with the package version first.');
const bundle = { format: 1, version, commit: git('rev-parse', 'HEAD').toString().trim(), preview, manifest, files, known: {}, baselines: [] };
const instructions = readFileSync(join(root, 'AGENTS.md'), 'utf8').match(/<!-- homecraft-updates:start -->[\s\S]*?<!-- homecraft-updates:end -->/);
if (!instructions) throw Error('AGENTS.md must contain the Homecraft update instructions.');
bundle.agentInstructions = instructions[0];
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
// Recognize actual official source snapshots, including commits whose manifest
// still described 0.1.0. Never classify those official fixes as local edits.
for (const commit of git('log', '--format=%H', '--', 'engine/').toString().trim().split('\n').filter(Boolean)) {
  const names = git('ls-tree', '-r', '--name-only', commit, '--', 'engine/').toString().trim().split('\n').filter(Boolean);
  const snapshot = {};
  for (const name of names) snapshot[name.slice('engine/'.length)] = git('show', `${commit}:${name}`);
  let previous;
  try { previous = JSON.parse(snapshot['manifest.json']); } catch { continue; }
  const hashes = {};
  for (const [file, bytes] of Object.entries(snapshot)) {
    if (file === 'manifest.json') continue;
    const digest = hash(file, bytes);
    hashes[file] = digest;
    (bundle.known[file] ||= []).push(digest);
  }
  if (same(hashes, previous.files) && !bundle.baselines.some(base => same(base.manifest.files, previous.files))) {
    bundle.baselines.push({ commit, manifest: previous,
      // For unchanged upstream files, the target itself supplies the base.
      // Store historical bytes only where the target differs.
      files: Object.fromEntries(Object.entries(snapshot).filter(([file]) => file !== 'manifest.json' && hashes[file] !== manifest.files[file])
        .map(([file, bytes]) => [file, bytes.toString('base64')])) });
  }
}
for (const file of Object.keys(bundle.known)) bundle.known[file] = [...new Set(bundle.known[file])];
bundle.baselines.unshift({ commit: bundle.commit, manifest, files: {} });
validateBundle(bundle);
mkdirSync(out, { recursive: true });
const engine = Buffer.from(JSON.stringify(bundle) + '\n');
writeFileSync(join(out, 'homecraft-engine.json'), engine);
const temporary = mkdtempSync(join(tmpdir(), 'homecraft-updater-'));
try {
  copyFileSync(join(root, 'tools/update-engine.mjs'), join(temporary, 'update-engine.mjs'));
  writeFileSync(join(temporary, 'package.json'), JSON.stringify({ name: 'homecraft-updater', version, type: 'module', private: true,
    description: 'Update the shared Homecraft engine while preserving site customizations.', license: 'MIT', engines: { node: '>=22' },
    bin: { 'homecraft-update': 'update-engine.mjs' }, files: ['update-engine.mjs'] }, null, 2));
  copyFileSync(join(root, 'LICENSE'), join(temporary, 'LICENSE'));
  const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts'], { cwd: temporary, encoding: 'utf8' }));
  copyFileSync(join(temporary, packed[0].filename), join(out, 'homecraft-updater.tgz'));
} finally { rmSync(temporary, { recursive: true, force: true }); }
const digests = ['homecraft-engine.json', 'homecraft-updater.tgz'].map(file => `${createHash('sha256').update(readFileSync(join(out, file))).digest('hex')}  ${file}`).join('\n');
writeFileSync(join(out, 'SHA256SUMS'), digests + '\n');
console.log(`${preview ? 'LOCAL PREVIEW ONLY' : 'Release ready'}: Homecraft ${version}; ${Object.keys(files).length} engine files; ${out}`);
