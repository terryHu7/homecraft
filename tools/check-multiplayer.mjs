// Two headless visitors meet on the island: each sees the other, chat goes
// both ways as a log line and a bubble, and killing the room server drops the
// pages back to single-player without a single page error. Needs the site
// served (python3 tools/serve.py) and Playwright installed. The site itself
// needs no multiplayer config: the check passes the room server in the URL as
// ?mp=ws://…
//   npm run check:mp [-- http://127.0.0.1:<port>/]
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { chromium } = await import('playwright').catch(() => {
  console.log('check:mp needs Playwright: run npm install once, then try again.');
  process.exit(1);
});
const remembered = () => { try { return readFileSync(new URL('./.serve-url', import.meta.url), 'utf8').trim(); } catch { return ''; } };
const site = process.argv[2] || remembered();
if (!site || !(await fetch(site).catch(() => null))) {
  console.log('Nothing is being served. Run python3 tools/serve.py first, or pass the address.');
  process.exit(1);
}

// A room server of our own on a quiet port, so the check never disturbs a
// real one. Bots keep the island lively and prove the roster path.
const PORT = 8797;
const serverDir = fileURLToPath(new URL('../multiplayer/server/', import.meta.url));
const room = spawn('node', ['server.js', '--bots', '4'], { cwd: serverDir, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const url = `${site}${site.includes('?') ? '&' : '?'}mp=ws://127.0.0.1:${PORT}`;
process.on('exit', () => room.kill());

let failed = false;
const note = (ok, what) => { console.log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) failed = true; };

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
try {
  // The room server needs a moment to bind its port after the spawn.
  let health = '';
  for (let i = 0; i < 20 && !health.startsWith('ok'); i++) {
    health = await fetch(`http://127.0.0.1:${PORT}/health`).then(r => r.text()).catch(() => '');
    if (!health.startsWith('ok')) await new Promise(r => setTimeout(r, 300));
  }
  note(health.startsWith('ok'), `room server up (${health.trim() || 'no answer'})`);

  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  const errors = [];
  for (const [name, page] of [['A', A], ['B', B]]) {
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('WebSocket connection')) errors.push(`${name}: ${m.text()}`); });
  }
  await A.goto(url, { waitUntil: 'domcontentloaded' });
  await B.goto(url, { waitUntil: 'domcontentloaded' });
  await A.waitForTimeout(6000);
  await B.waitForTimeout(2000);

  const booted = async page => page.evaluate(() => ({
    hint: document.querySelector('.mp-hint')?.textContent || '',
    booted: !!window.__home,
    tags: [...document.querySelectorAll('.mp-tag')].filter(t => t.style.visibility === 'visible').map(t => t.textContent),
  }));
  const sa = await booted(A), sb = await booted(B);
  note(sa.booted && sb.booted, 'both pages run the 3D world');
  note(sa.hint.startsWith('6') && sb.hint.startsWith('6'), `each counts 6 on the island — self, the other, 4 bots (A: "${sa.hint}", B: "${sb.hint}")`);
  note(sa.tags.some(t => t.startsWith('Token-')) && sb.tags.some(t => t.startsWith('Token-')), 'each renders the other (and bots)');

  // A walks off and speaks; B hears it.
  await A.evaluate(() => window.__home.player.teleport(-12, 14));
  await A.waitForTimeout(1500);
  await A.keyboard.press('t');
  await A.waitForTimeout(300);
  await A.keyboard.type('hello island');
  await A.keyboard.press('Enter');
  await B.waitForTimeout(1200);
  const heard = await B.evaluate(() => ({
    lines: [...document.querySelectorAll('.mp-line')].map(l => l.textContent),
    bubbles: [...document.querySelectorAll('.mp-bubble')].filter(b => b.style.visibility === 'visible').map(b => b.textContent),
  }));
  note(heard.lines.some(l => l.includes('hello island')), `chat reaches B's log ("${heard.lines.find(l => l.includes('hello island')) || ''}")`);
  note(heard.bubbles.some(b => b.includes('hello island')), "chat reaches B's bubble over A's head");

  // The room dies: the island keeps working, quietly solo.
  room.kill();
  await B.waitForTimeout(1500);
  const solo = await booted(B);
  note(solo.booted && (await B.evaluate(() => typeof window.__home.player.teleport === 'function')), 'B still runs the world with the server gone');
  note(solo.hint.includes('重连中') || solo.hint.toLowerCase().includes('reconnect'), `B shows the reconnect hint ("${solo.hint}")`);
  note(errors.length === 0, errors.length ? `page errors: ${errors.join(' | ').slice(0, 300)}` : 'no page errors anywhere');
} catch (e) {
  failed = true;
  console.log('✗ check crashed:', String(e).slice(0, 300));
} finally {
  await browser.close();
  room.kill();
}
console.log(failed ? 'check:mp FAILED' : 'check:mp passed');
process.exit(failed ? 1 : 0);
