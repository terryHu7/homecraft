// Public metadata must fail quietly without trusting HTML, redirects or size.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { metadataURL, readSiteInfo, normalizeDoors } from '../engine/door-metadata.js';
const server = createServer((req, res) => {
  const kind = req.url.split('/')[1];
  res.setHeader('Content-Type', 'application/json');
  if (kind === 'redirect') { res.writeHead(302, { Location: '/good/homecraft.json' }); res.end(); return; }
  if (kind === 'slow') { setTimeout(() => res.end('{}'), 200); return; }
  if (kind === 'large-header') { res.setHeader('Content-Length', '20000'); res.end(' '.repeat(20000)); return; }
  if (kind === 'large-stream') { res.write(' '.repeat(9000)); res.end(' '.repeat(9000)); return; }
  if (kind === 'html') { res.end('<html>Not metadata</html>'); return; }
  const data = { version: 1, name: { zh: '测试主页', en: 'Test Home' }, logo: 'logo.png', intro: '', homecraft: true };
  if (kind === 'bad-version') data.version = 2;
  if (kind === 'bad-name') data.name = [];
  if (kind === 'bad-url') data.url = 'javascript:alert(1)';
  if (kind === 'bad-logo') data.logo = 'https://user:password@example.com/logo.png';
  if (kind === 'long') { data.name = 'a'.repeat(100); data.intro = 'b'.repeat(200); }
  if (kind === 'legacy') { data.avatar = data.logo; delete data.logo; }
  if (kind === 'alias') data.url = 'https://canonical.example/home/';
  if (kind === 'doors') data.doors = ['https://b.example/', 'https://b.example/', 'javascript:alert(1)', 'https://a.example/home/index.html', 'https://c.example/?from=x'];
  if (kind === 'bad-doors') data.doors = 'https://b.example/';
  res.end(JSON.stringify(data));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  assert.equal(metadataURL('https://example.com/home/index.html?secret=x#skin=abc').href, 'https://example.com/home/homecraft.json');
  assert.equal(metadataURL('https://example.com/home').href, 'https://example.com/home/homecraft.json');
  for (const url of ['file:///tmp/home/', 'javascript:alert(1)', 'https://a:b@example.com/']) assert.equal(metadataURL(url), null);
  const good = await readSiteInfo(`${base}/good/`);
  assert.equal(good.name.en, 'Test Home'); assert.equal(good.logo, `${base}/good/logo.png`);
  assert.equal(good.intro, ''); assert.equal(good.url, `${base}/good/`);
  for (const kind of ['bad-version', 'bad-name', 'bad-url', 'html', 'redirect', 'large-header', 'large-stream']) assert.equal(await readSiteInfo(`${base}/${kind}/`), null, kind);
  assert.equal(await readSiteInfo(`${base}/slow/`, 30), null);
  assert.equal((await readSiteInfo(`${base}/bad-logo/`)).logo, '');
  const long = await readSiteInfo(`${base}/long/`); assert.equal(long.name.length, 60); assert.equal(long.intro.length, 120);
  assert.equal((await readSiteInfo(`${base}/legacy/`)).logo, `${base}/legacy/logo.png`);
  assert.equal((await readSiteInfo(`${base}/alias/`)).url, 'https://canonical.example/home/');
  // doors: URLs validated against the door protocol, de-duplicated by world
  // identity, the site itself dropped. The href keeps its path as published;
  // identity folding (…/index.html) only affects the key.
  const doors = (await readSiteInfo(`${base}/doors/`)).doors;
  assert.deepEqual(doors, ['https://b.example/', 'https://a.example/home/index.html', 'https://c.example/']);
  assert.deepEqual(normalizeDoors('x', 'https://self.example/'), [], 'doors must be an array');
  assert.deepEqual(normalizeDoors(['https://self.example/'], 'https://self.example/'), [], 'the site itself is dropped');
  // A subpath is a different world identity (origin + pathname), so it stays.
  assert.deepEqual(normalizeDoors(['https://self.example/sub/'], 'https://self.example/'), ['https://self.example/sub/']);
  assert.equal((await readSiteInfo(`${base}/bad-doors/`)).doors.length, 0);
  console.log('PASS metadata: subfolders, bilingual text, empty intro, bounded fields/body/time, bad data, unsafe URLs, redirects, legacy logo, public alias and door list');
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
