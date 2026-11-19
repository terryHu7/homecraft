// Homecraft portal for any website or blog: a small pixel portal that opens
// the shared Homecraft directory, and passes a Homecraft traveller's character
// on to the next world. No dependencies or tracking: it reads the directory
// and the listed sites' logos.
//
// Copy this file into your site (don't load it from someone else's server),
// then put these where the portal should appear, a footer or a sidebar:
//
//   <script type="module" src="/homecraft-door.js"></script>
//   <homecraft-door></homecraft-door>
//
// Attribute, optional:
//   lang        "zh" or "en"; by default the page's or the browser's language
//
// The link format is docs/protocol.md at https://github.com/terryHu7/homecraft.
import { createTravelSession, navigateDoor, worldURL as http, worldKey as key, sourceLabel } from './door-protocol.js';
import { readSiteInfo, siteText } from './door-metadata.js';
import { createDoorControls, drawDoor } from './door-controls.js';
import { DEFAULT_WORLDS } from './worlds-default.js';
import { createDirectory } from './door-directory.js';
const DIRECTORY = ['https://terryhu7.github.io/homecraft/worlds.json'];
const directory = createDirectory(DIRECTORY);
// A renderer can supply its owner's skin before importing this plugin.
const host = document.querySelector('homecraft-door[skin]');
const site = readSiteInfo(location.href);
const travel = createTravelSession(host?.getAttribute('skin') || '', host?.getAttribute('default-skin') || '', async () => siteText((await site)?.name));
const arrival = travel.arrive();
let controls = null, controlsOwner = null, activeDialog = null;
const defaultParent = () => document.getElementById('hud') || document.body;
export function placePortalControls(parent) { controls?.mount(activeDialog?.open ? activeDialog : parent); }
export const visitorSkin = () => travel.wornSkin();
const zhFor = el => (el.getAttribute('lang') || document.documentElement.lang || navigator.language || '').toLowerCase().startsWith('zh');
async function go(world) {
  const href = await travel.link(world);
  if (href) navigateDoor(href);
}

function worlds(zh, dir, ready = true) {
  const pick = v => (typeof v === 'string' ? v : v && typeof v === 'object' ? (zh ? v.zh ?? v.en : v.en ?? v.zh) : '');
  const words = (v, n) => String(pick(v) || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const blocked = (Array.isArray(dir?.blocked) ? dir.blocked : []).map(item => key(item)).filter(Boolean);
  const seen = new Set();
  const keep = data => (Array.isArray(data) ? data : Array.isArray(data?.worlds) ? data.worlds : []).slice(0, 256).map(item => {
    const url = item && typeof item.url === 'string' && /^https?:\/\//.test(item.url) ? http(item.url) : null;
    const id = url && key(url.href);
    if (!id || seen.has(id) || blocked.some(b => id === b || id.startsWith(b + '/'))) return null;
    seen.add(id);
    const known = DEFAULT_WORLDS.find(w => key(w.url) === id);
    const given = item.logo ?? item.avatar; // early drafts called the logo `avatar`
    const logo = typeof given === 'string' ? http(given, url.href) : null;
    return { logo: known?.logo || logo?.href || null, url: url.href, name: words(item.name, 60) || url.hostname, owner: words(item.owner, 40), intro: words(item.intro, 120), homecraft: item.homecraft === true };
  }).filter(Boolean);
  const page = v => (typeof v === 'string' && /^https:\/\//.test(v) ? v : null);
  const all = page(dir?.all);
  const more = keep(dir);
  if (ready && !more.length) more.push(...keep(DEFAULT_WORLDS));
  return { more, all, missed: ready && !dir, loading: !ready };
}
// The site's logo over its initial; a logo that fails to load leaves the initial.
function face(holder, w) {
  holder.replaceChildren(w.name.trim().slice(0, 1).toLocaleUpperCase());
  if (!w.logo) return;
  const img = Object.assign(new Image(48, 48), { src: w.logo, alt: '', loading: 'lazy', decoding: 'async', referrerPolicy: 'no-referrer' });
  img.addEventListener('load', () => img.classList.toggle('is-pixel', img.naturalWidth <= 32));
  img.addEventListener('error', () => img.remove()); holder.append(img);
}

const STYLE = `
:host { display: inline-block; font: 400 14px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif; }
button { font: inherit; cursor: pointer; }
.stone, .x, .visit { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 4px 12px 4px 8px; border: 0; color: #fff; background: #7d7d7d; text-shadow: 2px 2px 0 rgba(0,0,0,.35); box-shadow: 0 0 0 2px #111, inset 2px 2px 0 rgba(255,255,255,.32), inset -2px -3px 0 rgba(0,0,0,.38); }
.stone:hover, .x:hover, .row:hover:enabled .visit { background: #8e8e94; }
button:focus-visible, a:focus-visible { outline: 3px solid #f2c94c; outline-offset: 3px; }
canvas { width: 24px; height: 24px; image-rendering: pixelated; }
dialog { box-sizing: border-box; width: min(620px, calc(100vw - 32px)); max-height: calc(100dvh - 64px); padding: 0; border: 0; color: var(--ink, #34322e); background: transparent; box-shadow: none; overflow: visible; color-scheme: light; }
dialog::backdrop { background: rgba(0,0,0,.38); }
header { display: flex; align-items: center; gap: 10px; height: 44px; margin-bottom: 14px; }
header canvas { width: 28px; height: 28px; flex: none; }
h2 { flex: 1; margin: 0; font-size: 22px; line-height: 1.25; font-weight: 600; color: #fff; text-shadow: 2px 2px 0 #3f3f3f; }
.x { width: 44px; height: 44px; padding: 0; font-size: 26px; }
.body { box-sizing: border-box; padding: 14px; max-height: min(470px, 62dvh); overflow-y: auto; overscroll-behavior: contain; scrollbar-color: #89877f transparent; background: var(--gui, #c6c3bb); box-shadow: 0 0 0 2px var(--line, #111), inset 3px 3px 0 var(--gui-light, #eeebe3), inset -3px -3px 0 var(--gui-shade, #77746d); }
ul { list-style: none; margin: 0; padding: 0; }
li + li { border-top: 1px solid rgba(49,48,42,.12); }
.row { box-sizing: border-box; display: grid; grid-template-columns: 52px minmax(0,1fr) auto; align-items: center; gap: 16px; width: 100%; padding: 16px 10px; border: 0; background: transparent; color: inherit; text-align: left; }
.row:disabled { cursor: default; }
.row:hover:enabled { background: rgba(255,255,255,.24); }
.logo { position: relative; display: grid; place-items: center; width: 52px; height: 52px; overflow: hidden; background: #b5b2a8; color: #4d4a42; font-size: 20px; box-shadow: 0 0 0 2px #111; }
.logo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.logo img.is-pixel { image-rendering: pixelated; }
.details { min-width: 0; font-size: 16px; line-height: 1.35; overflow-wrap: anywhere; }
strong { font-weight: 600; }
.meta { display: inline-block; max-width: 100%; }
.intro { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; margin-top: 4px; font-size: 14px; line-height: 1.5; color: var(--ink, #34322e); overflow-wrap: anywhere; }
.visit { background: #3c8527; text-shadow: 2px 2px 0 #1f3d14; box-sizing: border-box; min-width: 70px; min-height: 40px; padding: 0 14px; font-size: 14px; font-weight: 600; }
.row:hover:enabled .visit { background: #4b9c34; }
.here { background: #aaa79f; color: #eeece5; box-shadow: inset 2px 2px 0 rgba(0,0,0,.16), inset -2px -2px 0 rgba(255,255,255,.24); text-shadow: none; }
.status { margin: 20px 10px; color: var(--ink-soft, #656158); }
.links { display: flex; justify-content: flex-end; gap: 16px; margin: 12px 10px 0; font-size: 12px; }
.links a { color: var(--ink-soft, #656158); }
@media (max-width: 560px) { .body { padding: 10px; } .row { grid-template-columns: 44px minmax(0,1fr) auto; gap: 12px; padding: 12px 4px; } .logo { width: 44px; height: 44px; } .visit { min-width: 58px; padding-inline: 10px; } }
`;

class HomecraftDoor extends HTMLElement {
  #revision = 0;
  #observer;
  #lastLang;
  static get observedAttributes() { return ['lang']; }
  attributeChangedCallback() { if (this.isConnected) this.#render(); }
  connectedCallback() {
    void directory.read();
    this.#observer = new MutationObserver(() => this.#render());
    this.#observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    this.#render();
  }
  #render() {
    const zh = zhFor(this), say = (z, e) => (zh ? z : e);
    if (this.shadowRoot && this.#lastLang === zh) return;
    this.#lastLang = zh;
    this.#revision++;
    delete this.dataset.back;
    if (controlsOwner === this && this.shadowRoot?.contains(controls.root)) { controls.mount(defaultParent()); activeDialog = null; }
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <dialog aria-labelledby="t"><header><canvas width="16" height="16" aria-hidden="true"></canvas><h2 id="t"></h2><button class="x" type="button">×</button></header><div class="body"></div></dialog>`;
    const dialog = root.querySelector('dialog');
    drawDoor(root.querySelector('header canvas'));
    root.querySelector('h2').textContent = say('传送门', 'Portal');
    root.querySelector('.x').setAttribute('aria-label', say('关闭', 'Close'));
    root.querySelector('.x').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => { activeDialog = null; controls?.mount(defaultParent()); });
    if (!controls) {
      controlsOwner = this;
      const came = http(arrival.from);
      controls = createDoorControls({
        parent: defaultParent(), onOpen: () => this.#open(),
        onReturn: came ? () => go({ url: came.href, homecraft: true }) : null,
      });
    }
    if (controlsOwner === this) controls.label(say('传送门', 'Portal'), say(`返回 ${sourceLabel(arrival.fromName, arrival.from)}`, `Back to ${sourceLabel(arrival.fromName, arrival.from)}`), arrival.from || '');
  }

  async #load(body, say, zh) {
    const cached = directory.peek(), initial = worlds(zh, cached, !!cached);
    this.#paint(body, say, initial);
    const revision = ++this.#revision;
    let raw = await directory.read();
    if (!raw) raw = await directory.read(true);
    const result = worlds(zh, raw);
    if (revision !== this.#revision || !this.isConnected) return;
    if (JSON.stringify(result) !== JSON.stringify(initial)) this.#paint(body, say, result);
  }

  #paint(body, say, { more, all, missed, loading }) {
    body.setAttribute('aria-busy', String(!!loading));
    body.replaceChildren();
    const status = text => body.append(Object.assign(document.createElement('p'), { className: 'status', textContent: text }));
    if (loading) { status(say('正在获取列表…', 'Loading the list…')); return; }
    if (!more.length) {
      status(missed ? say('暂时无法获取世界列表，可以稍后重试。', 'Couldn’t load the worlds. Try again shortly.') : say('暂时还没有可访问的世界。', 'No worlds are available yet.'));
      return;
    }
    const ul = document.createElement('ul'); ul.setAttribute('aria-label', say('世界', 'Worlds'));
    for (const w of more) {
      const here = key(w.url) === key(location.href);
      const row = Object.assign(document.createElement('button'), { className: 'row', type: 'button', disabled: here });
      row.dataset.world = w.url;
      const text = document.createElement('span'); text.className = 'details';
      // "Name - address": the no-break space keeps the dash with the name, and
      // the address (an inline block) wraps whole rather than after https://.
      text.append(Object.assign(document.createElement('strong'), { textContent: w.name }), ' - ');
      const u = new URL(w.url);
      text.append(Object.assign(document.createElement('span'), { className: 'meta', textContent: u.origin + u.pathname.replace(/\/$/, '') }));
      if (w.intro) text.append(Object.assign(document.createElement('span'), { className: 'intro', textContent: w.intro }));
      const logo = Object.assign(document.createElement('span'), { className: 'logo' });
      logo.setAttribute('aria-hidden', 'true'); face(logo, w);
      row.append(logo, text);
      if (here) row.append(Object.assign(document.createElement('span'), { className: 'visit here', textContent: say('当前', 'Here') }));
      else {
        const visit = Object.assign(document.createElement('span'), { className: 'visit', textContent: say('访问', 'Visit') }); visit.setAttribute('aria-hidden', 'true'); row.append(visit);
      }
      if (!here) row.addEventListener('click', () => go(w));
      const li = document.createElement('li'); li.append(row); ul.append(li);
    }
    body.append(ul);
    // The full directory is a destination like any row: same tab, and the
    // traveller's character goes along, so that page can send them on.
    const links = document.createElement('div'); links.className = 'links';
    if (all && key(all) !== key(location.href)) {
      const a = Object.assign(document.createElement('a'), { href: all, textContent: say('查看全部', 'View all') });
      a.addEventListener('click', e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); go({ url: all, homecraft: true }); });
      links.append(a);
    }
    if (links.childElementCount) body.append(links);
  }

  disconnectedCallback() { this.#revision++; this.#observer?.disconnect(); }

  #open() {
    const dialog = this.shadowRoot.querySelector('dialog');
    const previous = controls.root.closest('dialog[open]');
    if (previous && previous !== dialog) previous.close();
    document.dispatchEvent(new CustomEvent('homecraft-portal-open'));
    activeDialog = dialog; controls.mount(dialog);
    if (!dialog.open) dialog.showModal();
    const zh = zhFor(this), say = (z, e) => zh ? z : e;
    void this.#load(this.shadowRoot.querySelector('.body'), say, zh);
  }

}
if (!customElements.get('homecraft-door')) customElements.define('homecraft-door', HomecraftDoor);
