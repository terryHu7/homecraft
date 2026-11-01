import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { launchBrowser, inspectPortal, PUBLIC_DIRECTORY } from './inspect-portal.mjs';
import { requestEntry } from './check-listing.mjs';

let server, browser, base;
const localView = [{ name: 'test', locale: 'en-US', viewport: { width: 800, height: 600 } }];
before(async () => {
  browser = await launchBrowser();
  server = createServer((req, res) => {
    const url = new URL(req.url, 'http://fixture');
    if (url.pathname.startsWith('/plugin/')) {
      let body = readFileSync(new URL(`..${url.pathname}`, import.meta.url));
      if (url.pathname.endsWith('/homecraft-door.js') && url.searchParams.has('broken')) {
        body = Buffer.from(body.toString().replace('navigateDoor(href);', 'navigateDoor(href.split("#")[0]);'));
      }
      if (url.pathname.endsWith('/homecraft-door.js') && url.searchParams.has('reset')) {
        body = Buffer.from(body.toString().replace('navigateDoor(href);', '{ const u=new URL(href), h=new URLSearchParams(u.hash.slice(1)); h.set("skin","default"); u.hash=h.toString(); navigateDoor(u.href); }'));
      }
      res.writeHead(200, { 'content-type': 'text/javascript' }).end(body); return;
    }
    if (url.pathname.endsWith('homecraft.json')) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ version: 1, name: 'Fixture', homecraft: true })); return;
    }
    res.setHeader('content-type', 'text/html');
    if (url.pathname === '/local/' || url.pathname === '/empty/' || url.pathname === '/replaced-ui/') {
      const directory = url.pathname === '/local/' ? ['assets/worlds.json'] : url.pathname === '/empty/' ? [] : PUBLIC_DIRECTORY;
      res.end(`<!doctype html><title>Fixture</title><button id="portalButton" aria-label="Portal">Portal</button><div id="list"></div><script>
        window.__home = { config: { portal: { directory: ${JSON.stringify(directory)} } } };
        document.querySelector('button').onclick = () => document.querySelector('#list').textContent = 'Only this website';
      </script>`); return;
    }
    res.end(`<!doctype html><html lang="en"><title>Fixture</title>${url.pathname === '/decoy/' ? '<button aria-label="Portal">About the portal</button>' : ''}<script type="module" src="/plugin/homecraft-door.js${url.pathname === '/broken/' ? '?broken' : url.pathname === '/reset/' ? '?reset' : ''}"></script><homecraft-door></homecraft-door></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

test('the shipped plugin discovers a fresh public entry, travels, returns and keeps its character in Chinese and English at desktop and mobile sizes', async () => {
  const report = await inspectPortal(`${base}/ok/`, { browser, timeout: 5000 });
  assert.equal(report.status, 'pass', JSON.stringify(report));
  assert.equal(report.views.length, 4);
  assert(report.views.every(v => v.publicRequests > 0));
});
test('a similarly named content card does not hide the actual portal control', async () => {
  const report = await inspectPortal(`${base}/decoy/`, { browser, timeout: 2000, views: localView });
  assert.equal(report.status, 'pass', JSON.stringify(report));
});
for (const name of ['local', 'empty']) {
  test(`homecraft:true cannot hide a ${name} directory`, async () => {
    const report = await inspectPortal(`${base}/${name}/`, { browser, timeout: 600, views: localView });
    assert.equal(report.status, 'fail');
    assert.equal(report.views[0].code, 'private_directory');
  });
}
test('correct configuration cannot hide a UI that no longer shows the public directory', async () => {
  const report = await inspectPortal(`${base}/replaced-ui/`, { browser, timeout: 600, views: localView });
  assert.equal(report.status, 'review');
  assert.notEqual(report.status, 'pass');
});
test('a directory row without working protocol navigation does not pass', async () => {
  const report = await inspectPortal(`${base}/broken/`, { browser, timeout: 2000, views: localView });
  assert.equal(report.status, 'fail', JSON.stringify(report));
  assert.equal(report.views[0].code, 'departure');
});
test('a receiver that resets the visitor character does not pass', async () => {
  const report = await inspectPortal(`${base}/reset/`, { browser, timeout: 2000, views: localView });
  assert.equal(report.status, 'fail', JSON.stringify(report));
  assert.equal(report.views[0].code, 'carry');
});
test('a network failure needs review rather than a request to change configuration', async () => {
  const report = await inspectPortal('http://127.0.0.1:1/', { browser, timeout: 600, views: localView });
  assert.equal(report.status, 'review');
  assert.equal(report.views[0].code, 'page');
});

test('existing and older issue headings keep working without new fields', () => {
  const current = requestEntry('### 网址 / Address\n\nhttps://example.com/\n\n### 网站名称 / Website name\n\nExample\n\n### 作者名称 / Author name\n\nAlex\n\n### 网站语言 / Languages\n\n中文和英文 / Chinese and English\n\n### 简介 / Introduction\n\nHello\n\n### Logo\n\n_No response_');
  const legacy = requestEntry('### 网址 / Address\n\nhttps://example.com/\n\n### 名字 / Name\n\nExample\n\n### 主人 / Owner\n\nAlex\n\n### 网站语言 / Languages\n\n中文和英文 / Chinese and English\n\n### 一句话介绍 / Intro\n\nHello');
  assert.deepEqual(current, legacy);
  assert.equal(current.logo, undefined);
  assert.deepEqual(current.lang, ['zh', 'en']);
});
test('missing language is reported instead of silently inventing English', () => {
  assert.deepEqual(requestEntry('### 网址 / Address\n\nhttps://example.com/').lang, []);
});
