import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultOffice } from '../assets/office-content.js';
import { createAuth } from './auth.js';
import { connectDatabase, databaseIssue } from './database.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicOrigin = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN).origin : '';
const production = process.env.NODE_ENV === 'production';
const secure = publicOrigin.startsWith('https:');
const auth = createAuth(process.env.JWT_SECRET, secure);
if (production && (!secure || !auth.configured)) {
  throw Error('Production requires an HTTPS PUBLIC_ORIGIN, a 64-digit hexadecimal JWT_SECRET, and MONGODB_URI.');
}

const attempts = new Map(), timeout = 15 * 60 * 1000;
const stateDir = process.env.OFFICE_DATA_DIRECTORY || join(root, '.office-data');
const localFile = join(stateDir, 'office.json');
let queue = Promise.resolve();
const officeCollection = async () => (await connectDatabase()).db.collection('office');
async function getContent() {
  if (process.env.MONGODB_URI) return (await (await officeCollection()).findOne({ _id: 'published' }))?.content || defaultOffice;
  try { return JSON.parse(await readFile(localFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return defaultOffice; }
}
async function saveContent(content) {
  if (process.env.MONGODB_URI) {
    await (await officeCollection()).replaceOne({ _id: 'published' }, { _id: 'published', content }, { upsert: true });
    return;
  }
  const write = queue.then(async () => {
    await mkdir(stateDir, { recursive: true });
    const tmp = localFile + '.tmp';
    await writeFile(tmp, JSON.stringify(content), 'utf8');
    await rename(tmp, localFile);
  });
  queue = write.catch(() => {});
  await write;
}
function text(value, maximum) {
  if (typeof value !== 'string' || value.length > maximum) throw Error('A text field is missing or too long.');
  return value.trim();
}
function assetURL(value, image = false) {
  value = text(value, image ? 1_010_000 : 2048);
  if (!value) return '';
  if (image && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return value;
  if (image && /^\/assets\/[a-z0-9_./-]+$/i.test(value) && !value.split('/').includes('..')) return value;
  let parsed;
  try { parsed = new URL(value); } catch {}
  if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password) throw Error('Use an HTTPS link or upload an image.');
  return parsed.href;
}
function validate(data) {
  if (!data || !data.resume || !Array.isArray(data.photos) || data.photos.length !== 3) throw Error('Invalid office content.');
  const paintings = data.libraryPaintings === undefined ? defaultOffice.libraryPaintings : data.libraryPaintings;
  if (!Array.isArray(paintings) || paintings.length !== 2) throw Error('Provide two library painting images.');
  const r = data.resume;
  const clean = { resume: { title: text(r.title, 150), subtitle: text(r.subtitle, 150),
    summary: text(r.summary, 2400), education: text(r.education, 800), image: assetURL(r.image, true) },
    photos: data.photos.map(item => assetURL(item, true)),
    libraryPaintings: paintings.map(item => assetURL(item, true)) };
  for (const key of ['experience','skills','projects']) {
    if (!Array.isArray(data[key]) || data[key].length > 30) throw Error('Each section supports up to 30 entries.');
    clean[key] = data[key].map(item => {
      const entry = { title: text(item?.title, 180), detail: text(item?.detail, 2400), link: assetURL(item?.link) };
      if (!entry.title) throw Error('Every entry needs a title.');
      return entry;
    });
  }
  return clean;
}

function json(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(body));
}
function fail(response, status, error) { json(response, status, { error }); }
async function readJSON(request, limit) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw Error('Send JSON.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) { request.resume(); throw Error('Request is too large.'); }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml',
  '.png':'image/png', '.jpeg':'image/jpeg', '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2', '.mp3':'audio/mpeg', '.ogg':'audio/ogg',
  '.wav':'audio/wav', '.mp4':'video/mp4', '.pdf':'application/pdf', '.ico':'image/x-icon' };
async function staticFile(request, response, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin' || pathname === '/admin/') pathname = '/admin/index.html';
  if (!/^\/(?:index\.html|home\.config\.js|homecraft\.json|(?:admin|assets|engine|world|vendor|plugin)\/[\w./-]+)$/.test(pathname) ||
      pathname.split('/').some(part => part.startsWith('.')) || !types[extname(pathname)]) return fail(response, 404, 'Page not found.');
  const filename = join(root, pathname);
  const info = await stat(filename).catch(() => null);
  if (!info?.isFile()) return fail(response, 404, 'Page not found.');
  let start = 0, end = info.size - 1, status = 200;
  const headers = { 'Content-Type': types[extname(pathname)], 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) { response.writeHead(416, { 'Content-Range': 'bytes */' + info.size }).end(); return; }
    if (match[1]) {
      start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2]));
    } else start = Math.max(0, info.size - Number(match[2]));
    if (start > end) { response.writeHead(416, { 'Content-Range': 'bytes */' + info.size }).end(); return; }
    status = 206;
    headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + info.size;
  }
  headers['Content-Length'] = Math.max(0, end - start + 1);
  response.writeHead(status, headers);
  if (request.method === 'HEAD' || info.size === 0) response.end();
  else createReadStream(filename, { start, end }).on('error', () => response.destroy()).pipe(response);
}

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Frame-Options', 'SAMEORIGIN');
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const method = request.method;
    if (pathname === '/api/office' && method === 'GET') return json(response, 200, await getContent());
    if (!pathname.startsWith('/api/')) return ['GET','HEAD'].includes(method)
      ? await staticFile(request, response, pathname) : fail(response, 405, 'Method not allowed.');
    const origin = publicOrigin || 'http://' + request.headers.host;
    if (method !== 'GET' && request.headers.origin !== origin) return fail(response, 403, 'Invalid request origin.');
    if (!auth.configured) return fail(response, 503, 'Configure MONGODB_URI and JWT_SECRET on the Node office server.');
    const now = Date.now();
    if (pathname === '/api/admin/login' && method === 'POST') {
      const ip = request.socket.remoteAddress;
      let attempt = attempts.get(ip);
      if (!attempt || attempt.until < now) {
        attempt = { count: 0, until: now + timeout }; attempts.set(ip, attempt);
      }
      if (++attempt.count > 8) return fail(response, 429, 'Too many attempts. Try again in 15 minutes.');
      let credentials;
      try { credentials = await readJSON(request, 4096); } catch { return fail(response, 400, 'Invalid credentials request.'); }
      const cookies = await auth.login(request, credentials);
      if (!cookies) return fail(response, 401, 'Incorrect email or password.');
      attempts.delete(ip);
      return json(response, 200, { ok: true }, { 'Set-Cookie': cookies });
    }
    if (pathname === '/api/admin/refresh' && method === 'POST') {
      const cookies = await auth.refresh(request);
      if (!cookies) return fail(response, 401, 'Sign in to continue.');
      return json(response, 200, { ok: true }, { 'Set-Cookie': cookies });
    }
    if (pathname === '/api/admin/logout' && method === 'POST') {
      return json(response, 200, { ok: true }, { 'Set-Cookie': await auth.logout(request) });
    }
    if (!await auth.authorized(request)) return fail(response, 401, 'Sign in to continue.');
    if (pathname === '/api/admin/office' && method === 'GET') return json(response, 200, await getContent());
    if (pathname === '/api/admin/office' && method === 'PUT') {
      let content;
      try { content = validate(await readJSON(request, 6_750_000)); }
      catch (error) { return fail(response, 400, error.message); }
      await saveContent(content);
      return json(response, 200, { ok: true });
    }
    return fail(response, 404, 'Endpoint not found.');
  } catch (error) {
    const issue = databaseIssue(error);
    if (issue) console.error(issue);
    const message = request.url?.startsWith('/api/admin/') && issue
      ? issue : 'Office storage is unavailable. Check the server configuration.';
    if (!response.headersSent) fail(response, 503, message);
    else response.destroy();
  }
});
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
}, 60_000).unref();
server.listen(Number(process.env.PORT || 8000), process.env.HOST || '127.0.0.1',
  () => console.log('http://127.0.0.1:' + server.address().port + '/'));
