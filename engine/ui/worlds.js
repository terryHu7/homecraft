// A compact destination listing, using the workbench's block frame and
// action button. A supplied introduction is shown, two lines at most; absent
// text stays absent. Rows read like an App Store list: logo, name and address,
// Visit on the right, the whole row clickable. No tags, author boilerplate or
// big footer buttons; the directory's own pages are small links under the list.
import { getWorlds, initialWorlds, isCurrentWorld } from '../portal.js';
import { t } from '../lang.js';

const span = (className, text) => Object.assign(document.createElement('span'), { className, textContent: text });
// The site's logo over its initial; a logo that fails to load leaves the initial.
function face(holder, world) {
  holder.replaceChildren(world.name.trim().slice(0, 1).toLocaleUpperCase());
  if (!world.logo) return;
  const img = Object.assign(new Image(48, 48), { src: world.logo, alt: '', decoding: 'async', loading: 'lazy', referrerPolicy: 'no-referrer' });
  img.addEventListener('load', () => img.classList.toggle('is-pixel', img.naturalWidth <= 32));
  img.addEventListener('error', () => img.remove());
  holder.append(img);
}
export function createWorldList({ onChoose }) {
  // Fetch while the visitor is entering the world, before they open the list.
  void getWorlds();
  let root = null, revision = 0;
  const go = world => { if (world && !isCurrentWorld(world.url)) onChoose(world); };
  function row(world) {
    const li = document.createElement('li'), button = document.createElement('button');
    button.type = 'button'; button.className = 'world-row'; button.dataset.world = world.url; button.world = world;
    const current = isCurrentWorld(world.url), url = new URL(world.url);
    const logo = span('world-icon', ''); logo.setAttribute('aria-hidden', 'true'); face(logo, world);
    const text = document.createElement('span'); text.className = 'world-text';
    // "Name - address": the no-break space keeps the dash with the name, and
    // the address (an inline block) wraps whole rather than after https://.
    text.append(Object.assign(document.createElement('strong'), { textContent: world.name }), ' - ');
    text.append(span('world-meta', url.origin + url.pathname.replace(/\/$/, '')));
    if (world.intro) text.append(span('world-intro', world.intro));
    button.append(logo, text);
    if (current) {
      button.disabled = true; button.setAttribute('aria-current', 'page');
      button.append(span('mc-button get world-visit world-current', t('当前', 'Here')));
    } else {
      const visit = span('mc-button get world-visit', t('访问', 'Visit'));
      visit.setAttribute('aria-hidden', 'true'); button.append(visit);
      button.addEventListener('click', () => go(world));
    }
    li.append(button); return li;
  }
  // Rows show the reviewed listing as published: opening the list asks
  // nothing of the sites in it beyond their logos.
  function group(label, worlds) {
    const list = document.createElement('ul'); list.className = 'world-list'; list.setAttribute('aria-label', label);
    for (const world of worlds) list.append(row(world));
    return list;
  }
  const status = text => Object.assign(document.createElement('p'), { className: 'world-list-status', textContent: text });
  function keys(event) {
    const rows = [...root.querySelectorAll('.world-row:not(:disabled)')];
    if (!rows.length) return;
    const at = rows.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation();
      const next = at < 0 ? 0 : (at + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      rows[next].focus(); rows[next].scrollIntoView({ block: 'nearest' });
    } else if ((event.key === 'Enter' || event.key === ' ') && at >= 0) {
      event.preventDefault(); event.stopPropagation(); go(rows[at].world);
    }
  }
  async function load(force = false) {
    const ticket = ++revision, host = root;
    if (!host) return;
    const { ready, ...initial } = initialWorlds();
    host.dataset.loaded = String(ready);
    paint(initial, !ready);
    const result = await getWorlds(force);
    if (ticket !== revision || root !== host) return;
    host.dataset.loaded = 'true';
    if (!ready || JSON.stringify(result) !== JSON.stringify(initial)) paint(result);
  }
  function paint({ worlds, join, all, missed }, loading = false) {
    const host = root, focused = document.activeElement?.dataset.world;
    const scroll = host.querySelector('.world-screen')?.scrollTop || 0;
    const screen = document.createElement('div'); screen.className = 'world-screen';
    host.setAttribute('aria-busy', String(loading));
    host.replaceChildren(screen);
    if (worlds.length) screen.append(group(t('世界', 'Worlds'), worlds));
    else if (loading) screen.append(status(t('正在获取列表…', 'Loading the list…')));
    else screen.append(status(t('暂时没有可访问的世界。', 'No worlds are available right now.')));
    screen.scrollTop = scroll;
    if (focused) [...screen.querySelectorAll('.world-row')].find(el => el.dataset.world === focused)?.focus();
    if (!loading && (missed || !worlds.length)) {
      const retry = Object.assign(document.createElement('button'), { className: 'world-refresh', type: 'button', textContent: t('重试', 'Try again') });
      retry.addEventListener('click', () => { void load(true); }); host.append(retry);
    }
    if (all || join) {
      const footer = document.createElement('div'); footer.className = 'world-footer';
      // The full directory is a destination like any row: same tab, and the
      // traveller's character goes along, so that page can send them on.
      if (all && !isCurrentWorld(all)) {
        const name = t('查看全部', 'View all'), link = Object.assign(document.createElement('a'), { href: all, textContent: name });
        link.addEventListener('click', event => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); go({ url: all, name, homecraft: true, preview: null });
        });
        footer.append(link);
      }
      if (join) footer.append(Object.assign(document.createElement('a'), { href: join, target: '_blank', rel: 'noopener', textContent: t('申请收录', 'Request listing') }));
      host.append(footer);
    }
  }
  return {
    mount(container) {
      root = document.createElement('div'); root.className = 'world-directory';
      root.addEventListener('keydown', keys); container.replaceChildren(root); void load();
    },
    destroy() { revision++; root = null; },
  };
}
