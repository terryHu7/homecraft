#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validId } from '../engine/extension-contract.js';
import { pack, review, propose, accept, catalogEntries, install, change, rollback, doctor, stateOf, copyEnabled, writeJSON, localPath } from './extensions-lib.mjs';

const HELP = `Homecraft extensions — local preview (no network access)

Author:
  init <folder> --id <author.name>
  check <folder>
  pack <folder> --out <package.json>
  propose <package.json> --out <submission.json>

Maintainer:
  review <package.json> [--previous <package.json>]
  accept <submission.json> --catalog <folder>
  catalog --catalog <folder>

Site owner:
  install <author.name> --catalog <folder> [--version <version>]
  install --bundle <package.json> [--disabled]
  update <author.name> --catalog <folder> [--version <version>]
  enable|disable|configure|remove <author.name>
  rollback <author.name>
  list|doctor

Use --site <folder> for another site, --set key=value for configuration,
and --json for machine-readable results. Install enables configured packages.
Missing required settings leave the package disabled. Preview and redeploy
after site changes. All configuration is public; never store credentials.
`;
function parse(args) {
  const positional = [], flags = { set: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const name = arg.slice(2);
    if (['json', 'disabled', 'help'].includes(name)) { flags[name] = true; continue; }
    if (!['site', 'catalog', 'id', 'out', 'previous', 'bundle', 'version', 'set'].includes(name) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error(`Unknown option or missing value: ${arg}`);
    const value = args[++i];
    if (name === 'set') flags.set.push(value); else flags[name] = value;
  }
  return { positional, flags };
}
export function initialize(folder, id) {
  if (!validId(id)) throw Error('Use --id author.name');
  folder = localPath(folder);
  if (existsSync(folder)) throw Error('Choose a new extension directory');
  mkdirSync(folder, { recursive: true });
  writeJSON(join(folder, 'manifest.json'), { id, version: '0.1.0', apiVersion: 1,
    name: { en: 'Welcome message', zh: '欢迎消息' }, description: { en: 'A configurable welcome message.', zh: '可配置的欢迎消息。' },
    author: id.split('.')[0], license: 'MIT', entry: 'index.js', files: ['index.js', 'README.md', 'LICENSE'], capabilities: ['ui'],
    config: { message: { type: 'string', label: { en: 'Message', zh: '消息' }, default: 'Welcome / 欢迎', maxLength: 100 } } });
  writeFileSync(join(folder, 'index.js'), `export function activate(api) {\n  api.ui.status(api.options.message);\n}\n`);
  writeFileSync(join(folder, 'README.md'), '# Welcome message\n\nShows a configured message. No server, external requests or persistent visitor data.\n');
  writeFileSync(join(folder, 'AGENTS.md'), '# Extension development\n\nRead the target Homecraft docs/extensions.md. Use API 1, keep files self-contained, and declare capabilities and configuration in manifest.json. Run check, pack and the browser rehearsal before proposing a version. Do not modify engine internals.\n');
  writeFileSync(join(folder, 'LICENSE'), readFileSync(new URL('../LICENSE', import.meta.url)));
  return { folder, id, next: 'Edit manifest.json and index.js, then run check and pack.' };
}
export async function main(args = process.argv.slice(2)) {
  const { positional: [command, target, ...extra], flags: f } = parse(args);
  if (extra.length) throw Error('Unexpected positional arguments');
  if (!command || command === 'help' || f.help) { console.log(HELP); return; }
  const site = resolve(f.site || fileURLToPath(new URL('../', import.meta.url)));
  let result;
  switch (command) {
    case 'init': result = initialize(target, f.id); break;
    case 'check': {
      const dir = mkdtempSync(join(realpathSync(tmpdir()), 'homecraft-extension-check-'));
      try {
        const output = join(dir, 'package.json'); pack(target, output);
        const manifest = JSON.parse(readFileSync(join(target, 'manifest.json')));
        for (const file of manifest.files.filter(p => p.endsWith('.js'))) execFileSync(process.execPath, ['--input-type=module', '--check'], { input: readFileSync(join(target, file)), stdio: ['pipe', 'pipe', 'pipe'] });
        result = { valid: true, ...review(output) };
      } finally { rmSync(dir, { recursive: true, force: true }); }
      break;
    }
    case 'pack': result = pack(target, f.out); break;
    case 'review': result = review(target, f.previous); break;
    case 'propose': result = propose(target, f.out); break;
    case 'accept': result = accept(target, f.catalog); break;
    case 'catalog': result = catalogEntries(f.catalog).map(e => ({ id: e.id, releases: e.releases.map(r => ({ version: r.version, status: r.status, name: r.manifest.name, description: r.manifest.description, config: r.manifest.config, capabilities: r.manifest.capabilities })) })); break;
    case 'install': case 'update': result = install({ site, id: target, catalog: f.catalog, bundle: f.bundle, version: f.version, assignments: f.set, disabled: f.disabled, update: command === 'update' }); break;
    case 'enable': case 'disable': case 'configure': case 'remove': result = change({ site, id: target, operation: command, assignments: f.set }); break;
    case 'rollback': result = rollback(site, target); break;
    case 'list': result = stateOf(site); break;
    case 'doctor': result = doctor(site); if (!result.valid) process.exitCode = 1; break;
    case 'build': result = copyEnabled(site, f.out); break;
    default: throw Error(`Unknown command: ${command}. Run help for available commands.`);
  }
  console.log(JSON.stringify(f.json ? { ok: !process.exitCode, result } : result, null, 2));
  return result;
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch(error => {
  console.error(process.argv.includes('--json') ? JSON.stringify({ ok: false, error: error.message }) : `Error: ${error.message}`);
  process.exitCode = 1;
});
