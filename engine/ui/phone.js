// The owner's phone, GTA style: P or the corner button brings it up from the
// bottom right, and the same again puts it away. The screen shows the time and
// one app per public account. An app opens a card inside the phone that says
// where the link goes before anyone leaves the world; the accounts themselves
// are the contact list in index.html, read by main.js.
import { icon } from './icons.js';
import { t } from '../lang.js';
import { config } from '../config.js';

// How each kind of account looks on the home screen: the app's real App Store
// icon where the account is an app, otherwise a tile colour with a pixel glyph
// or a word mark. The tile colour also tints the app's card.
// Pick one with data-app on the contact list's <li>; anything else gets a grey
// tile with the first two letters of its name.
const app = name => new URL(`../assets/apps/${name}.webp`, import.meta.url).href;
const LOOKS = {
  jike: { tile: '#ffe411', ink: '#1d1d1f', img: app('jike') },
  x: { tile: '#0f0f10', img: app('x') },
  github: { tile: '#24292f', img: app('github') },
  blog: { tile: '#e08a3c', glyph: 'scroll' },
  mail: { tile: '#3b72d6', glyph: 'mail' },
  camera: { tile: '#2c2c2e', glyph: 'camera' },
  bilibili: { tile: '#fb7299', word: 'B站' },
  xiaohongshu: { tile: '#ff2442', word: '小红书' },
  weibo: { tile: '#e6162d', word: '微博' },
  zhihu: { tile: '#0066ff', word: '知乎' },
  douyin: { tile: '#161823', word: '抖音' },
  wechat: { tile: '#07c160', word: '公众号' },
  youtube: { tile: '#ff0000', word: 'YouTube' },
  instagram: { tile: '#c13584', word: 'IG' },
  linkedin: { tile: '#0a66c2', word: 'in' },
  site: { tile: '#4b5563', glyph: 'map' },
};
// The phone keeps the weather city's time, or the visitor's own.
const zone = config.weather?.timezone ? { timeZone: config.weather.timezone } : {};
const clock = new Intl.DateTimeFormat('en-GB', { ...zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const today = new Intl.DateTimeFormat('zh-CN', { ...zone, month: 'long', day: 'numeric', weekday: 'long' });
const todayEn = new Intl.DateTimeFormat('en-US', { ...zone, month: 'long', day: 'numeric', weekday: 'long' });
const escape = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function tile(app) {
  const look = LOOKS[app.id] || { tile: '#6b7280', word: app.name.slice(0, 2) };
  if (look.img) return `<i class="tile real" style="--tile:${look.tile};background-image:url(${look.img})"></i>`;
  const mark = look.glyph
    ? `<span style="background-image:url(${icon(look.glyph).url})"></span>`
    : `<b>${escape(look.word)}</b>`;
  return `<i class="tile" style="--tile:${look.tile};--ink:${look.ink || '#fff'}">${mark}</i>`;
}

// accounts: [{ id, name, href, handle, note }]. write opens the site's own
// mailbox page, offered on the mail card beside the plain mailto link;
// photo opens the camera studio GTA/Watch-Dogs style.
// setAccounts takes them again, named in the other language.
export function createPhone(root, accounts = [], { write, photo } = {}) {
  root.setAttribute('role', 'region');
  root.innerHTML = `<div class="screen">
    <i class="island"></i>
    <div class="status"><time></time><span class="signal"><i></i><i></i><i></i><i></i></span><span class="battery"></span></div>
    <div class="home">
      <div class="today"><span></span><b></b></div>
      <div class="apps"></div>
    </div>
    <div class="card" hidden>
      <button type="button" class="back">‹</button>
      <span class="mark"></span>
      <h3></h3>
      <p class="who"><img alt="" width="22" height="22"><span></span></p>
      <p class="handle"></p>
      <p class="note"></p>
      <p class="where"></p>
      <a class="go" target="_blank" rel="noopener"></a>
      <button type="button" class="write" hidden></button>
    </div>
    <button type="button" class="bar"></button>
  </div>`;
  const screen = root.querySelector('.screen'), home = root.querySelector('.home'), card = root.querySelector('.card');
  const small = root.querySelector('.status time'), date = root.querySelector('.today span'), big = root.querySelector('.today b');
  let up = false;

  function label() {
    // The owner's face and name on every app's card.
    root.querySelector('.who img').src = icon('about').url;
    root.querySelector('.who span').textContent = config.name || '';
    root.setAttribute('aria-label', t('手机', 'Phone'));
    card.querySelector('.back').setAttribute('aria-label', t('返回主屏幕', 'Back to Home Screen'));
    root.querySelector('.bar').setAttribute('aria-label', t('回到主屏幕', 'Home Screen'));
    card.querySelector('.write').textContent = t('留言', 'Mailbox');
    const items = accounts.map((a, i) => `<button type="button" class="app" data-i="${i}">${tile(a)}<span>${escape(a.name)}</span></button>`);
    if (photo) {
      items.push(`<button type="button" class="app" data-app="camera">${tile({ id: 'camera', name: t('相机', 'Camera') })}<span>${t('相机', 'Camera')}</span></button>`);
    }
    root.querySelector('.apps').innerHTML = items.join('');
    if (up) tick();
  }

  function open(i) {
    const a = accounts[i];
    const look = LOOKS[a.id] || { tile: '#6b7280' };
    const mail = a.href.startsWith('mailto:');
    screen.style.setProperty('--tile', look.tile);
    screen.style.setProperty('--ink', look.ink || '#fff');
    card.querySelector('.mark').innerHTML = tile(a);
    card.querySelector('h3').textContent = a.name;
    // An account shown only by the owner's name needs no second name line.
    card.querySelector('.handle').textContent = a.handle.toLowerCase() === (config.name || '').toLowerCase() ? '' : a.handle;
    card.querySelector('.note').textContent = a.note;
    // Where the button goes, spelled out: the address, or the site and path;
    // a path that is only a long account ID leaves just the site.
    // Said once: for the blog and the mail the handle already is that address.
    const url = a.href.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/$/, '');
    const where = mail ? a.href.slice(7) : url.length > 28 ? url.split('/')[0] : url;
    card.querySelector('.where').textContent = where.toLowerCase() === a.handle.toLowerCase() ? '' : where;
    const go = card.querySelector('.go');
    go.hidden = !a.href;
    if (a.href) go.href = a.href; else { go.removeAttribute('href'); card.querySelector('.where').textContent = t('尚未设置链接', 'Link not set'); }
    go.textContent = mail ? t('写邮件 ↗', 'Send an email ↗') : t(`打开${/^[A-Za-z]/.test(a.name) ? ' ' : ''}${a.name} ↗`, `Open ${a.name} ↗`);
    card.querySelector('.write').hidden = !(mail && write);
    home.hidden = true; card.hidden = false;
    screen.classList.add('in-app');
    card.querySelector('.back').focus({ preventScroll: true });
  }
  // Back to the home screen; false when it was already there.
  function back() {
    if (card.hidden) return false;
    card.hidden = true; home.hidden = false;
    screen.classList.remove('in-app');
    return true;
  }
  root.querySelector('.apps').addEventListener('click', e => {
    const b = e.target.closest('.app');
    if (!b) return;
    if (b.dataset.app === 'camera') {
      toggle(false);
      photo?.();
      return;
    }
    open(Number(b.dataset.i));
  });
  card.querySelector('.back').addEventListener('click', back);
  card.querySelector('.write').addEventListener('click', () => write?.());
  root.querySelector('.bar').addEventListener('click', back);

  function tick() {
    const now = new Date(), time = clock.format(now);
    small.textContent = time; big.textContent = time;
    date.textContent = t(today.format(now).replace('星期', ' 星期'), todayEn.format(now));
  }
  function toggle(on = !up) {
    if (on === up) return up;
    up = on;
    if (up) tick();
    else back();
    root.classList.toggle('up', up);
    return up;
  }

  label();
  function setAccounts(next) { accounts = next; back(); label(); }

  return { toggle, tick, back, setAccounts, get up() { return up; } };
}
