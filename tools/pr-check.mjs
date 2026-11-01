import { execFileSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export async function resolveCheckBase({ github, context }) {
  if (context.eventName === 'pull_request') return context.payload.pull_request.base.sha;
  if (context.eventName !== 'workflow_dispatch' || !context.ref.startsWith('refs/heads/join/')) return '';
  const head = context.ref.slice('refs/heads/'.length);
  const { data: prs } = await github.rest.pulls.list({ ...context.repo, head: `${context.repo.owner}:${head}`, state: 'open' });
  const pr = prs.find(pr => /^join\/\d+$/.test(head) && pr.head.ref === head && pr.head.sha === context.sha &&
    pr.user.login === 'github-actions[bot]' && pr.head.repo?.full_name === `${context.repo.owner}/${context.repo.repo}`);
  if (!pr) throw Error('No open listing PR matches this workflow commit.');
  return pr.base.sha;
}

export function classify(paths) {
  const entries = paths.filter(p => /^directory\/(?!_)[^/]+\.json$/.test(p));
  if (entries.length && (entries.length !== 1 || paths.length !== 1)) throw Error('A listing PR must change one directory JSON file. Submit other changes separately.');
  return { listing: entries[0] || null, browser: paths.some(p => /^(engine\/|plugin\/|world\/|examples\/|tools\/|\.github\/workflows\/|home\.config\.js$|index\.html$|package)/.test(p)) };
}
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });
async function main() {
  const base = process.env.PR_BASE;
  const paths = base ? execFileSync('git', ['diff', '--name-only', '-z', base, 'HEAD'], { encoding: 'utf8' }).split('\0').filter(Boolean) : ['engine/'];
  const mode = classify(paths);
  run('node', ['tools/directory.mjs', 'check']);
  run('node', ['tools/sync-protocol.mjs', '--check']);
  if (mode.listing) {
    const added = execFileSync('git', ['diff', '--name-only', '--diff-filter=AM', base, 'HEAD', '--', mode.listing], { encoding: 'utf8' }).trim();
    if (added) run('node', ['tools/directory.mjs', 'check', '--online', '--portal', mode.listing]);
    return;
  }
  run('node', ['--test', 'tools/listing-github.test.mjs', 'tools/listing-validation.test.mjs']);
  if (!mode.browser) return;
  run('node', ['tools/check-site.mjs']);
  run('node', ['tools/check-metadata.mjs']);
  run('node', ['--test', 'tools/check-listing.test.mjs']);
  const server = spawn('python3', ['-m', 'http.server', '4173', '--bind', '127.0.0.1'], { stdio: 'ignore' });
  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      if (await fetch('http://127.0.0.1:4173/').then(r => r.ok).catch(() => false)) { ready = true; break; }
      await new Promise(r => setTimeout(r, 200));
    }
    if (!ready) throw Error('Preview server did not start');
    run('node', ['tools/check-portal.mjs', 'http://127.0.0.1:4173']);
    run('node', ['tools/check-listing.mjs', '--url', 'http://127.0.0.1:4173/']);
  } finally { server.kill(); }
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
