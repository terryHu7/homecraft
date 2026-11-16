// One-command multiplayer demo: starts a room server (with three strolling
// bots), serves the site, then opens TWO browser windows side by side. Walk
// around in one; the other window sees you move, chat (press T) and ride the
// same island. The site needs no multiplayer config — the demo passes the
// room in the URL as ?mp=ws://….
//
//   npm run demo:mp                 # two visible windows, Ctrl+C to quit
//   node tools/demo-multiplayer.mjs --duration 30   # quit after 30 s
//   node tools/demo-multiplayer.mjs --headless --duration 20   # smoke test
import { spawn } from 'node:child_process';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const value = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const HEADLESS = flag('headless');
const DURATION = Number(value('duration', 0)) * 1000 || 0; // 0 = until Ctrl+C

const root = fileURLToPath(new URL('..', import.meta.url));
const { chromium } = await import('playwright').catch(() => {
  console.log('The demo needs Playwright: run npm install once, then try again.');
  process.exit(1);
});

// ---------- pieces ----------
const ROOM_PORT = 8798, SITE_PORT = 8799;
const children = [];
const spawnChild = (cmd, cmdArgs, opts = {}) => {
  const child = spawn(cmd, cmdArgs, { cwd: root, stdio: 'ignore', ...opts });
  children.push(child);
  return child;
};
const shutting = { value: false };
function shutdown() {
  if (shutting.value) return;
  shutting.value = true;
  for (const child of children) try { child.kill(); } catch {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('exit', () => { for (const child of children) try { child.kill(); } catch {} });

// A tiny no-cache static server: serve.py would open a browser of its own.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const site = http.createServer(async (req, res) => {
  try {
    // Strip the query by hand: `new URL(req.url, 'x')` would throw — 'x' is
    // not an absolute base — and 404 every request, page included.
    const path = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, path === '/' ? 'index.html' : path);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});

try {
  site.listen(SITE_PORT);
  spawnChild('node', ['server.js', '--bots', '3'], { cwd: join(root, 'multiplayer', 'server'), env: { ...process.env, PORT: String(ROOM_PORT) } });
  await new Promise(resolve => setTimeout(resolve, 1200));
  const url = `http://127.0.0.1:${SITE_PORT}/?mp=ws://127.0.0.1:${ROOM_PORT}`;

  const gpu = process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const window = position => chromium.launch({
    headless: HEADLESS,
    args: [...gpu, HEADLESS ? '' : `--window-position=${position}`, '--window-size=760,600'].filter(Boolean),
  });
  const browserA = await window('60,60');
  const browserB = await window('840,60');
  children.push(browserA, browserB); // browsers have .close(), handled below
  const open = async letter => {
    const browser = letter === 'A' ? browserA : browserB;
    const page = await browser.newPage({ viewport: { width: 740, height: 560 } });
    page.on('console', m => { if (['error', 'warning'].includes(m.type())) console.log(`${letter} [${m.type()}] ${m.text().slice(0, 200)}`); });
    page.on('pageerror', e => console.log(`${letter} [pageerror] ${String(e).slice(0, 200)}`));
    page.on('response', r => { if (r.status() >= 400) console.log(`${letter} [${r.status()}] ${r.url().slice(0, 160)}`); });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return page;
  };
  console.log('opening two windows…');
  const A = await open('A'), B = await open('B');
  await A.waitForFunction(() => window.__home, null, { timeout: 30000 });
  await B.waitForFunction(() => window.__home, null, { timeout: 30000 });

  // Put the two visitors next to each other, and let one say hello.
  await A.evaluate(() => window.__home.player.teleport(-2, 2));
  await B.waitForTimeout(1000);
  await B.evaluate(() => window.__home.player.teleport(-1, 1));
  await A.waitForTimeout(1200);
  await B.keyboard.press('t');
  await B.waitForTimeout(300);
  await B.keyboard.type('大家好，我是另一扇窗口！按 T 也能聊天。');
  await B.keyboard.press('Enter');
  console.log(HEADLESS ? 'demo running (headless)' : 'two windows are live — walk with WASD, chat with T. Ctrl+C to quit.');

  // In headless smoke mode, prove the round trip, then leave.
  if (HEADLESS) {
    await A.waitForTimeout(4000);
    const seen = await A.evaluate(() => [...document.querySelectorAll('.mp-line')].map(l => l.textContent).join(' | '));
    const ok = seen.includes('另一扇窗口');
    console.log(`chat round trip: ${ok ? 'seen ✓' : 'MISSING ✗'} ("${seen.slice(0, 120)}")`);
    await shutdown();
    process.exit(ok ? 0 : 1);
  }
  if (DURATION) setTimeout(shutdown, DURATION);
  else await new Promise(() => {}); // Ctrl+C is the exit
} catch (e) {
  console.log('demo failed:', String(e).slice(0, 300));
  shutdown();
  process.exit(1);
}
