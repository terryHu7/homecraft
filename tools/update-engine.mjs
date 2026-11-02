#!/usr/bin/env node
// Also shipped as a standalone, dependency-free CLI in each official Release.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, rmSync, mkdtempSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPOSITORY = 'terryHu7/homecraft';
const ASSET = 'homecraft-engine.json';
const VERSION = /^\d+\.\d+\.\d+$/;
const START = '<!-- homecraft-updates:start -->', END = '<!-- homecraft-updates:end -->';
const safePath = file => typeof file === 'string' && file.length < 240 && file.split('/').every(part => /^[A-Za-z0-9_.-]+$/.test(part) && part !== '.' && part !== '..');
export const hash = (file, bytes) => createHash('sha256').update(/\.(js|css|json|md|html|txt)$/.test(file)
  ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')) : bytes).digest('hex');
const readJSON = file => JSON.parse(readFileSync(file, 'utf8'));
const say = text => console.log(text);
const fileHashes = files => Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([file, bytes]) => [file, hash(file, bytes)]));
const sameHashes = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

export function readEngine(root) {
  const files = {};
  function walk(dir, prefix = '') {
    for (const name of readdirSync(dir).sort()) {
      if (name === '.DS_Store') continue;
      const file = prefix + name, path = join(dir, name), stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw Error(`Engine symlinks are not supported: ${file}`);
      if (stat.isDirectory()) walk(path, `${file}/`);
      else if (stat.isFile()) files[file] = readFileSync(path);
      else throw Error(`Not a regular engine file: ${file}`);
    }
  }
  if (lstatSync(root).isSymbolicLink()) throw Error('engine/ must not be a symlink');
  walk(root);
  return files;
}

export function validateBundle(bundle) {
  if (bundle.format !== 1 || !VERSION.test(bundle.version) || !/^[a-f0-9]{40}$/.test(bundle.commit || '') || bundle.manifest?.version !== bundle.version) throw Error('Unsupported engine release. Use the latest official updater.');
  const entries = Object.entries(bundle.files || {}), hashes = bundle.manifest.files;
  if (!entries.length || !hashes || Object.keys(hashes).length !== entries.length || !bundle.files['main.js'] || !bundle.files['ui/mailbox.js']) throw Error('Incomplete engine release');
  if (typeof bundle.agentInstructions !== 'string' || !bundle.agentInstructions.startsWith(START) || !bundle.agentInstructions.endsWith(END) || bundle.agentInstructions.length > 10000) throw Error('Missing agent update instructions');
  let size = 0;
  for (const [file, data] of entries) {
    if (!safePath(file) || file === 'manifest.json' || typeof data !== 'string' || !/^[a-f0-9]{64}$/.test(hashes[file] || '')) throw Error(`Invalid engine file: ${file}`);
    const bytes = Buffer.from(data, 'base64');
    size += bytes.length;
    if (bytes.toString('base64') !== data || hash(file, bytes) !== hashes[file]) throw Error(`Release checksum failed: ${file}`);
    if (size > 20 * 1024 * 1024) throw Error('Engine release exceeds 20 MB');
  }
  // A file cannot also be the parent directory of another entry.
  const paths = new Set(entries.map(([file]) => file));
  for (const file of paths) {
    let parent = dirname(file);
    while (parent !== '.') {
      if (paths.has(parent)) throw Error(`Overlapping engine paths: ${file}`);
      parent = dirname(parent);
    }
  }
  return bundle;
}

function baselineFor(manifest, bundle) {
  return bundle.baselines?.find(base => base.manifest?.version === manifest?.version &&
    JSON.stringify(Object.entries(base.manifest.files || {}).sort()) === JSON.stringify(Object.entries(manifest?.files || {}).sort()));
}

export function planUpdate(current, bundle) {
  let manifest;
  try { manifest = JSON.parse(current['manifest.json']?.toString()); } catch {}
  const base = baselineFor(manifest, bundle), before = base?.manifest.files || {};
  if (!base) throw Error('Unknown engine baseline. Ask your agent to verify the original version from Git history before updating.');
  const files = {}, conflicts = [], preserved = [], changed = [];
  for (const file of new Set([...Object.keys(current), ...Object.keys(bundle.files), ...Object.keys(before)])) {
    if (file === 'manifest.json') continue;
    const local = current[file], incoming = bundle.files[file] === undefined ? undefined : Buffer.from(bundle.files[file], 'base64');
    const a = local && hash(file, local), b = bundle.manifest.files[file], original = before[file];
    if (a === b) { if (local) files[file] = local; continue; }
    // Official intermediate commits used the initial manifest too. Recognize
    // their actual file hashes instead of calling upstream fixes custom edits.
    const official = a && (bundle.known?.[file] || []).includes(a);
    if (b === original && local) {
      if (local) files[file] = local;
      preserved.push(file);
    } else if (a === original || official) {
      if (incoming) files[file] = incoming;
      changed.push(file);
    } else conflicts.push(file);
  }
  files['manifest.json'] = Buffer.from(JSON.stringify(bundle.manifest, null, 1) + '\n');
  // Updating only the manifest still matters for intermediate main checkouts.
  const metadataChanged = current['manifest.json']?.toString() !== files['manifest.json'].toString();
  return { files, conflicts, preserved, changed, metadataChanged, base, from: manifest?.version || 'unknown' };
}

function writeFiles(root, files) {
  mkdirSync(root, { recursive: true });
  for (const [file, bytes] of Object.entries(files)) {
    if (!safePath(file)) throw Error(`Unsafe file: ${file}`);
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), bytes);
  }
}

function projectStorage(root, storage) {
  return join(storage || join(homedir(), '.homecraft', 'updates'), createHash('sha256').update(root).digest('hex').slice(0, 16));
}

// Both renames are on the site's filesystem. If the second fails, restore the
// original engine before returning. No world/content/config file is written.
function replaceEngine(root, files) {
  const temporary = mkdtempSync(join(root, '.homecraft-update-'));
  let cleanup = true;
  try {
    writeFiles(join(temporary, 'next'), files);
    renameSync(join(root, 'engine'), join(temporary, 'previous'));
    try { renameSync(join(temporary, 'next'), join(root, 'engine')); }
    catch (error) {
      try { renameSync(join(temporary, 'previous'), join(root, 'engine')); }
      catch { cleanup = false; throw Error(`Cannot restore engine/. Original files remain at ${join(temporary, 'previous')}.`); }
      throw error;
    }
  } finally { if (cleanup) rmSync(temporary, { recursive: true, force: true }); }
}

export function applyUpdate({ root, bundle, dryRun = false, storage, resolutions }) {
  root = realpathSync(root);
  if (!existsSync(join(root, 'index.html')) || !existsSync(join(root, 'home.config.js')) || !existsSync(join(root, 'package.json'))) throw Error('Run this command in your Homecraft source folder, not dist/.');
  validateBundle(bundle);
  const agentsFile = join(root, 'AGENTS.md');
  if (existsSync(agentsFile) && (!lstatSync(agentsFile).isFile() || lstatSync(agentsFile).isSymbolicLink())) throw Error('AGENTS.md must be a regular file');
  const oldAgents = existsSync(agentsFile) ? readFileSync(agentsFile) : null;
  const text = oldAgents?.toString('utf8') || '';
  if (text.includes(START) !== text.includes(END)) throw Error('Repair the incomplete Homecraft update block in AGENTS.md first.');
  // Existing project rules, including customized update instructions, stay as
  // written. Older forks receive only this small, clearly delimited pointer.
  const newAgents = text.includes(START) ? oldAgents : Buffer.from(`${text}${text.endsWith('\n') || !text ? '' : '\n'}\n${bundle.agentInstructions}\n`);
  const agentsChanged = !oldAgents || !oldAgents.equals(newAgents);
  const current = readEngine(join(root, 'engine'));
  let installedVersion;
  try { installedVersion = JSON.parse(current['manifest.json']?.toString()).version; } catch {}
  const parts = version => version.split('.').map(Number);
  if (VERSION.test(installedVersion) && parts(installedVersion).some((part, i) => part !== parts(bundle.version)[i] &&
    parts(installedVersion).slice(0, i).every((v, j) => v === parts(bundle.version)[j]) && part > parts(bundle.version)[i])) {
    throw Error('The installed engine is newer than this Release. Use a saved backup to roll back.');
  }
  const plan = planUpdate(current, bundle);
  if (resolutions) {
    if (!sameHashes(Object.fromEntries(Object.keys(resolutions).map(file => [file, true])), Object.fromEntries(plan.conflicts.map(file => [file, true])))) throw Error('Conflict report is out of date. Check the update again.');
    for (const file of plan.conflicts) {
      if (resolutions[file]) plan.files[file] = resolutions[file]; else delete plan.files[file];
      if ((current[file] && hash(file, current[file])) !== (resolutions[file] && hash(file, resolutions[file]))) plan.changed.push(file);
    }
    plan.conflicts = [];
  }
  if (plan.conflicts.length) {
    if (dryRun) return { ...plan, status: 'conflict' };
    const report = join(projectStorage(root, storage), `conflict-${randomUUID()}`);
    const local = {}, incoming = {}, original = {};
    for (const file of plan.conflicts) {
      if (current[file]) local[file] = current[file];
      if (bundle.files[file]) incoming[file] = Buffer.from(bundle.files[file], 'base64');
      if (plan.base.files?.[file]) original[file] = Buffer.from(plan.base.files[file], 'base64');
      else if (plan.base.manifest.files[file] === bundle.manifest.files[file] && bundle.files[file]) original[file] = Buffer.from(bundle.files[file], 'base64');
    }
    writeFiles(join(report, 'local'), local);
    writeFiles(join(report, 'incoming'), incoming);
    writeFiles(join(report, 'base'), original);
    const prepared = { ...plan.files };
    for (const file of plan.conflicts) if (current[file]) prepared[file] = current[file];
    writeFiles(join(report, 'prepared'), prepared);
    writeFileSync(join(report, 'bundle.json'), JSON.stringify(bundle) + '\n');
    writeFileSync(join(report, 'report.json'), JSON.stringify({ root, from: plan.from, to: bundle.version, conflicts: plan.conflicts,
      baseCommit: plan.base?.commit || null, incomingCommit: bundle.commit,
      sourceHashes: fileHashes(current), agentsHash: oldAgents && hash('AGENTS.md', oldAgents),
      instructions: 'No files were applied. Compare base/local/incoming and edit only the conflicting files in prepared/. Missing files mean additions or deletions. If the baseline is unknown, establish it from Git history first. After reviewing the complete engine, use --apply-resolution with this report folder. Do not copy files piecemeal into the source engine.' }, null, 2) + '\n');
    return { ...plan, status: 'conflict', report };
  }
  if (!plan.changed.length && !plan.metadataChanged && !agentsChanged) return { ...plan, status: 'current' };
  if (dryRun) return { ...plan, status: 'available', agentsChanged };
  const backup = join(projectStorage(root, storage), `backup-${randomUUID()}`);
  writeFiles(join(backup, 'engine'), current);
  if (oldAgents) writeFileSync(join(backup, 'AGENTS.md'), oldAgents);
  writeFileSync(join(backup, 'report.json'), JSON.stringify({ root, from: plan.from, to: bundle.version, commit: bundle.commit,
    agentsChanged, hadAgents: !!oldAgents, installedAgentsHash: hash('AGENTS.md', newAgents) }, null, 2) + '\n');
  replaceEngine(root, plan.files);
  try { if (agentsChanged) writeFileSync(agentsFile, newAgents); }
  catch (error) {
    replaceEngine(root, current);
    if (oldAgents) writeFileSync(agentsFile, oldAgents); else rmSync(agentsFile, { force: true });
    throw error;
  }
  return { ...plan, status: 'updated', backup, agentsChanged };
}

export function applyResolution({ root, report: folder, storage }) {
  root = realpathSync(root);
  folder = realpathSync(folder);
  const report = readJSON(join(folder, 'report.json'));
  if (report.root !== root || dirname(folder) !== realpathSync(projectStorage(root, storage)) || !Array.isArray(report.conflicts)) throw Error('This conflict report belongs to a different source folder.');
  const current = readEngine(join(root, 'engine')), agentsFile = join(root, 'AGENTS.md');
  const agentHash = existsSync(agentsFile) ? hash('AGENTS.md', readFileSync(agentsFile)) : null;
  if (!sameHashes(fileHashes(current), report.sourceHashes) || agentHash !== report.agentsHash) throw Error('Source files changed since this report. Check the update again before applying a resolution.');
  const bundle = validateBundle(readJSON(join(folder, 'bundle.json'))), plan = planUpdate(current, bundle);
  const prepared = readEngine(join(folder, 'prepared'));
  for (const file of Object.keys(bundle.manifest.files)) {
    if (!prepared[file]) throw Error(`Resolved engine is missing a release file: ${file}`);
  }
  const conflictSet = new Set(report.conflicts);
  for (const file of new Set([...Object.keys(prepared), ...Object.keys(plan.files)])) {
    if (conflictSet.has(file)) continue;
    const actual = prepared[file] && hash(file, prepared[file]), expected = plan.files[file] && hash(file, plan.files[file]);
    if (actual !== expected) throw Error(`Only reported conflict files may be edited in prepared/: ${file}`);
  }
  const resolutions = Object.fromEntries(report.conflicts.map(file => [file, prepared[file] || null]));
  return applyUpdate({ root, bundle, storage, resolutions });
}

export function rollback({ root, backup, storage }) {
  root = realpathSync(root);
  const path = realpathSync(backup), report = readJSON(join(path, 'report.json'));
  if (report.root !== root || dirname(path) !== realpathSync(projectStorage(root, storage))) throw Error('This backup belongs to a different source folder.');
  const old = readEngine(join(path, 'engine')), current = readEngine(join(root, 'engine'));
  const agentsFile = join(root, 'AGENTS.md');
  if (existsSync(agentsFile) && (!lstatSync(agentsFile).isFile() || lstatSync(agentsFile).isSymbolicLink())) throw Error('AGENTS.md must be a regular file');
  const currentAgents = existsSync(agentsFile) ? readFileSync(agentsFile) : null;
  if (report.agentsChanged && (currentAgents ? hash('AGENTS.md', currentAgents) : null) !== report.installedAgentsHash) throw Error('AGENTS.md changed after this update. Ask your agent to preserve those edits before rolling back.');
  const saved = join(projectStorage(root, storage), `backup-${randomUUID()}`);
  writeFiles(join(saved, 'engine'), current);
  if (currentAgents) writeFileSync(join(saved, 'AGENTS.md'), currentAgents);
  const restoredAgents = report.agentsChanged ? (report.hadAgents ? readFileSync(join(path, 'AGENTS.md')) : null) : currentAgents;
  writeFileSync(join(saved, 'report.json'), JSON.stringify({ root, from: report.to, to: report.from, agentsChanged: report.agentsChanged,
    hadAgents: !!currentAgents, installedAgentsHash: restoredAgents && hash('AGENTS.md', restoredAgents) }, null, 2) + '\n');
  replaceEngine(root, old);
  try {
    if (report.agentsChanged) {
      if (restoredAgents) writeFileSync(agentsFile, restoredAgents); else rmSync(agentsFile, { force: true });
    }
  } catch (error) {
    replaceEngine(root, current);
    if (currentAgents) writeFileSync(agentsFile, currentAgents); else rmSync(agentsFile, { force: true });
    throw error;
  }
  return saved;
}

export async function downloadRelease(tag, request = fetch) {
  if (tag && !/^v\d+\.\d+\.\d+$/.test(tag)) throw Error('Use a stable release tag, e.g. v0.1.1');
  const response = await request(`https://api.github.com/repos/${REPOSITORY}/releases/${tag ? `tags/${tag}` : 'latest'}`, {
    headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30000),
  });
  if (response.status === 404) throw Error('No official engine Release is available yet. Your files have not changed.');
  if (!response.ok) throw Error(`Cannot read official Releases (HTTP ${response.status}). Retry later; your files have not changed.`);
  const release = await response.json();
  if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name || '')) throw Error('Not a stable official Release');
  const asset = release.assets?.find(asset => asset.name === ASSET);
  if (!asset || asset.size > 30 * 1024 * 1024) throw Error('This Release has no supported engine bundle.');
  const expectedURL = `https://github.com/${REPOSITORY}/releases/download/${release.tag_name}/${ASSET}`;
  if (asset.browser_download_url !== expectedURL) throw Error('Unexpected engine download URL');
  const downloaded = await request(expectedURL, { signal: AbortSignal.timeout(60000) });
  if (!downloaded.ok) throw Error(`Engine download failed (HTTP ${downloaded.status}). Your files have not changed.`);
  const bytes = Buffer.from(await downloaded.arrayBuffer());
  if (bytes.length > 30 * 1024 * 1024 || asset.digest !== `sha256:${createHash('sha256').update(bytes).digest('hex')}`) throw Error('Release download checksum failed');
  const bundle = validateBundle(JSON.parse(bytes.toString('utf8')));
  if (`v${bundle.version}` !== release.tag_name || bundle.preview) throw Error('Release version does not match the engine bundle');
  return bundle;
}

async function main(args) {
  let root = process.cwd(), tag, bundleFile, dryRun = false, backup, resolution;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--dir', '--to', '--bundle', '--rollback', '--apply-resolution'].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw Error(`Missing value for ${arg}`);
      if (arg === '--dir') root = resolve(value);
      if (arg === '--to') tag = value;
      if (arg === '--bundle') bundleFile = value;
      if (arg === '--rollback') backup = value;
      if (arg === '--apply-resolution') resolution = value;
    } else if (arg === '--check') dryRun = true;
    else if (arg === '--help') {
      say('homecraft-update [--check] [--to v0.1.1] [--dir source-folder]\nhomecraft-update --rollback backup-folder\nhomecraft-update --apply-resolution report-folder\n--bundle file.json: use a downloaded bundle without GitHub access.');
      return;
    } else throw Error(`Unknown option: ${arg}`);
  }
  if (backup) {
    if (bundleFile || tag || dryRun || resolution) throw Error('--rollback cannot be combined with update options');
    const saved = rollback({ root, backup });
    say(`Engine restored. Previous state saved at ${saved}. Test the site, then redeploy.`);
    return;
  }
  if (bundleFile && tag) throw Error('Choose either --bundle or --to');
  if (resolution && (bundleFile || tag || dryRun)) throw Error('--apply-resolution cannot be combined with other update options');
  const bundle = resolution ? null : bundleFile ? validateBundle(readJSON(bundleFile)) : await downloadRelease(tag);
  const result = resolution ? applyResolution({ root, report: resolution }) : applyUpdate({ root, bundle, dryRun });
  const version = bundle?.version || readJSON(join(root, 'engine/manifest.json')).version;
  if (result.status === 'conflict') {
    say(`No changes applied. Resolve engine conflicts: ${result.conflicts.join(', ')}.`);
    if (result.report) say(`Conflict report: ${result.report}\nMerge the reported files in prepared/, then use --apply-resolution "${result.report}".`);
    process.exitCode = 2;
  } else if (result.status === 'current') {
    say(`Homecraft ${version} baseline is current.`);
    if (result.preserved.length) say(`Local engine changes preserved: ${result.preserved.join(', ')}`);
  }
  else {
    say(`${dryRun ? 'Available' : 'Updated'}: Homecraft ${result.from} → ${version}; ${result.changed.length} engine files.`);
    say('Site layouts, content, configuration, assets, and deployment files are unchanged.');
    if (result.agentsChanged) say(`${dryRun ? 'Will append' : 'Appended'} update instructions to AGENTS.md; existing rules are unchanged.`);
    if (result.preserved.length) say(`Local engine changes preserved: ${result.preserved.join(', ')}`);
    if (result.backup) say(`Backup: ${result.backup}\nRollback: homecraft-update --rollback "${result.backup}"`);
    say('Test the site, then commit and redeploy through your existing hosting. Mailbox Workers and Portal plugins require separate deployment.');
  }
}

// npm's bin is a symlink on Unix; compare its resolved path so npx runs main.
if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    say(`Update stopped: ${error.message}`);
    process.exitCode = 1;
  });
}
