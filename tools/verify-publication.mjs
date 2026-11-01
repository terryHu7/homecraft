import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fingerprint } from './listing-github.mjs';

export function sameDirectory(expected, actual) {
  return actual?.version === expected.version && actual?.updated === expected.updated &&
    actual.join === expected.join && actual.all === expected.all &&
    JSON.stringify(actual.blocked) === JSON.stringify(expected.blocked) &&
    Array.isArray(actual.worlds) && actual.worlds.length === expected.worlds.length &&
    actual.worlds.every((entry, i) => fingerprint(entry) === fingerprint(expected.worlds[i]));
}
export async function verifyPublication(expected, address, { fetcher = fetch, attempts = 20, pause = 3000 } = {}) {
  const url = new URL(address); url.searchParams.set('publication', expected.updated);
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
      if (response.ok && sameDirectory(expected, await response.json())) return true;
    } catch {}
    if (i + 1 < attempts) await new Promise(resolve => setTimeout(resolve, pause));
  }
  return false;
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const expected = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const ok = await verifyPublication(expected, process.argv[3]);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `verified=${ok}\n`);
  if (!ok) throw Error('Published directory does not match this deployment.');
}
