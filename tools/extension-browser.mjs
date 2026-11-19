// Shared local fixtures for core and catalog browser checks.
import { createServer } from 'node:http';
import { cpSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
export function copySite(target) {
  mkdirSync(target, { recursive: true });
  for (const name of ['index.html', 'home.config.js', 'homecraft.json', 'world', 'assets', 'engine', 'vendor']) cpSync(resolve(root, name), resolve(target, name), { recursive: true });
  const config = resolve(target, 'home.config.js');
  writeFileSync(config, readFileSync(config, 'utf8').replace(/export default\s*\{/, 'export default {\n  portal: { directory: [] },'));
  writeFileSync(resolve(target, 'extensions.json'), '{"format":1,"extensions":[]}\n');
}
export async function serve(site) {
  site = realpathSync(site);
  const server = createServer((req, res) => {
    try {
      let path = resolve(site, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if (statSync(path).isDirectory()) path = resolve(path, 'index.html');
      path = realpathSync(path); if (!path.startsWith(site + sep)) throw Error('Outside fixture');
      const types = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
      res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(readFileSync(path));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
export async function launchOffline() {
  const gpu = process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const options = { args: [...gpu, '--ignore-gpu-blocklist', '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] };
  try { return await chromium.launch({ ...options, channel: 'chrome' }); } catch { return chromium.launch(options); }
}
export async function offlineContext(browser, options = {}) {
  const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
  context.setDefaultTimeout(15000);
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.fulfill({ status: 200, body: '' }));
  return context;
}
export async function boot(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => window.__home?.extensions || window.__homeStartupError, null, { timeout: 60000 });
  const error = await page.evaluate(() => window.__homeStartupError);
  if (error) throw Error(JSON.stringify(error));
  await page.evaluate(() => __home.extensions.ready);
}
