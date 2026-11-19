// Public world metadata. Read the same filename and fields on every site;
// never infer a description from page content. Works in browsers and Node.
import { worldURL, worldKey } from './door-protocol.js';
const cache = new Map();
export const siteText = value => {
  const zh = (globalThis.document?.documentElement.lang || globalThis.navigator?.language || 'en').startsWith('zh');
  return typeof value === 'string' ? value : value && typeof value === 'object' ? (zh ? value.zh ?? value.en : value.en ?? value.zh) || '' : '';
};
export function metadataURL(address) {
  try {
    const url = new URL(address);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.search = ''; url.hash = '';
    if (/\.html?$/.test(url.pathname)) url.pathname = url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1);
    else if (!url.pathname.endsWith('/')) url.pathname += '/';
    return new URL('homecraft.json', url);
  } catch { return null; }
}
const words = (value, max) => {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim().slice(0, max);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return Object.fromEntries(['zh', 'en'].filter(k => typeof value[k] === 'string').map(k => [k, words(value[k], max)]));
};
// The optional `doors` field (v1 protocol addition): the destinations of the
// site's one-way door rings, published so other worlds can draw the
// relationship graph without visiting. A plain array of URLs, capped and
// de-duplicated by the same world identity the portal uses; the site itself is
// dropped. Malformed entries are ignored, not fatal.
export function normalizeDoors(raw, self) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(), out = [];
  const selfUrl = self ? worldURL(self, self) : null;
  const selfKey = selfUrl ? worldKey(selfUrl) : null;
  for (const item of raw) {
    const url = worldURL(item, self || undefined);
    if (!url) continue;
    const key = worldKey(url);
    if (!key || key === selfKey || seen.has(key)) continue;
    seen.add(key);
    out.push(url.href);
    if (out.length >= 16) break;
  }
  return out;
};
// `wait` is how long the site gets, in ms: a portal can't keep a visitor
// waiting, a directory check can.
export function readSiteInfo(address, wait = 1800) {
  const endpoint = metadataURL(address);
  if (!endpoint) return Promise.resolve(null);
  if (cache.has(endpoint.href)) return cache.get(endpoint.href);
  const pending = (async () => {
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), wait);
    let reader;
    try {
      const response = await fetch(endpoint, { credentials: 'omit', redirect: 'error', signal: abort.signal });
      if (!response.ok || Number(response.headers.get('content-length')) > 16000) return null;
      reader = response.body?.getReader(); if (!reader) return null;
      let size = 0; const chunks = [];
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.length; if (size > 16000) return null; chunks.push(value);
      }
      const bytes = new Uint8Array(size); let at = 0;
      for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
      const data = JSON.parse(new TextDecoder().decode(bytes));
      if (!data || data.version !== 1 || !siteText(words(data.name, 60))) return null;
      const base = new URL('./', endpoint);
      const webURL = value => {
        try { const u = new URL(value, base); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u : null; } catch { return null; }
      };
      const url = data.url ? webURL(data.url) : base;
      if (!url) return null;
      // The site's square logo (not the player's character); early drafts called it `avatar`.
      const logo = data.logo ?? data.avatar;
      return {
        version: 1, name: words(data.name, 60), url: url.href,
        intro: words(data.intro, 120), logo: logo ? webURL(logo)?.href || '' : '',
        lang: (Array.isArray(data.lang) ? data.lang : [data.lang]).filter(l => l === 'zh' || l === 'en'),
        homecraft: data.homecraft === true,
        doors: normalizeDoors(data.doors, url.href),
      };
    } catch { return null; }
    finally { clearTimeout(timer); if (reader) void reader.cancel().catch(() => {}); abort.abort(); }
  })();
  cache.set(endpoint.href, pending); return pending;
}
