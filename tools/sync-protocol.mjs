// The engine owns the adapter. Distribute identical, locally hosted copies to
// the standalone plugin and the show home. (terryhu.cn copies the whole engine.)
// node tools/sync-protocol.mjs [--check]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2), check = args.includes('--check');
const copies = [
  ['engine/door-protocol.js', 'plugin/door-protocol.js'],
  ['engine/door-controls.js', 'plugin/door-controls.js'],
  ['engine/door-metadata.js', 'plugin/door-metadata.js'],
  ['engine/door-directory.js', 'plugin/door-directory.js'],
  ['engine/worlds-default.js', 'plugin/worlds-default.js'],
  ['engine/assets/terry-logo.png', 'plugin/assets/terry-logo.png'],
  ['engine/assets/terry-logo.png', 'examples/terry-home/assets/favicon.png'],
];
let failed = false;
for (const [from, to] of copies) {
  const source = readFileSync(resolve(root, from)), target = resolve(root, to);
  if (check) {
    let same = false;
    try { same = source.equals(readFileSync(target)); } catch {}
    if (!same) { console.error(`Out of sync: ${target}`); failed = true; }
  } else { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, source); }
}
if (failed) process.exitCode = 1;
else console.log(`${check ? 'Checked' : 'Synced'} ${copies.length} protocol copies`);
