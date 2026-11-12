import { pageURL, mountEmbed } from './ui/embed.js';
// Homecraft: boots the world (`@world/`), puts the player in it, and wires the
// Dock, the radar, the pages (index.html), the phone and the portal together.
// A world's build.js may also export setup(app) for its own moving parts.
import * as THREE from 'three';
import * as L from '@world/layout.js';
import * as W from '@world/build.js';
import { config } from './config.js';
import { createStage, detectQuality } from './world/stage.js';
import { createWorld } from './world/world.js';
import { createNav } from './world/nav.js';
import { createAvatar, readFace, createCat, createDog } from './world/avatar.js';
import { createPetLife } from './world/pets.js';
import { createAtmosphere } from './world/atmosphere.js';
import { createWeatherFx } from './world/weather-fx.js';
import { createMailbox } from './world/mailbox.js';
import { createDoorRings } from './world/doorring.js';
import { createWeather, timeOfDay, WEATHER_LABELS, TIME_LABELS, WEATHER_PRESETS } from './weather.js';
import { createPlayer } from './world/player.js';
import { createRig } from './world/rig.js';
import { createInput } from './input.js';
import { createMinimap } from './ui/minimap.js';
import { createSound } from './ui/sound.js';
import { icon, setFace } from './ui/icons.js';
import { createPhone } from './ui/phone.js';
import { createWorkbench } from './ui/workbench.js';
import { createMailboxForm } from './ui/mailbox.js';
import { createFlightPad } from './ui/flightpad.js';
import { createPortal, arrival, visitWorld, isTravelling, placePortalControls } from './portal.js';
import { wornSkin } from './traveller.js';
import { createWorldList } from './ui/worlds.js';
import { createWorldMap } from './ui/worldmap.js';
import { setLoadingProgress as progress, finishLoading, hideLoading } from './ui/loading.js';
import { mountHud } from './hud.js';
import { t, nameOf, applyLang, onLang, langSwitch } from './lang.js';

const STATIONS = L.STATIONS || [], POOL = L.POOL || null, HOUSE = L.HOUSE || null;
const inPool = POOL ? (x, z) => x >= POOL.x0 && x < POOL.x1 && z >= POOL.z0 && z < POOL.z1 : () => false;
const inHouse = HOUSE ? (x, z) => x >= HOUSE.x0 && x < HOUSE.x1 && z >= HOUSE.z0 && z < HOUSE.z1 : () => false;
// Nothing to swim in: the parts of the loop that ask about water get plain answers.
const NO_POOL = { submerged: false, fogColor: null, update() {}, warmup() {}, splash() {}, ripple() {}, exhale() {} };

// The interface first: everything below looks it up.
mountHud();

const $ = s => document.querySelector(s);
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

// Only an iPhone or iPad can install from an App Store link. On a computer or
// an Android phone the button opens the app's own site instead, which explains
// it and shows a QR code for the phone.
const canInstall = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
if (!canInstall) for (const a of document.querySelectorAll('#pages a[data-site]')) {
  a.href = a.dataset.site;
  for (const attr of ['aria-label', 'data-en-label', 'data-zh-label']) {
    const label = a.getAttribute(attr);
    if (label) a.setAttribute(attr, label.replace('在 App Store ', '').replace(' on the App Store', ''));
  }
}
applyLang();

// The radar's Homecraft badge follows home.config.js (the BetterMapIt credit
// beside it always shows, icon only); pixel icons named in the markup
// (data-icon) are drawn here.
if (!config.badge) $('#minimap .badge.made')?.remove();
for (const img of document.querySelectorAll('img[data-icon]')) img.src = icon(img.dataset.icon).url;
// A world-to-world visit uses the same loading screen as a fresh visit.
// 'door' (through a portal), 'history' (Back or Forward), or null for a fresh visit.
const arrivedBy = arrival();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let bootFailed = false, bootRenderer = null, bootPhase = 'renderer';
function plain(error = null) {
  hideLoading();
  document.body.classList.add('plain');
  $('#loading')?.remove();
  const notice = $('#startupNotice');
  if (notice) {
    notice.hidden = false;
    if (!error) {
      const title = $('#startupTitle'), retry = $('#retry3D');
      title.dataset.zh = '正在查看文字版'; title.dataset.en = 'Reading the text version';
      title.textContent = t(title.dataset.zh, title.dataset.en);
      $('#startupMessage').hidden = true;
      retry.dataset.zh = '回到 3D 世界'; retry.dataset.en = 'Back to the 3D world';
      retry.textContent = t(retry.dataset.zh, retry.dataset.en);
    }
    const flip = langSwitch(); flip.classList.add('mc-button');
    $('#retry3D').after(flip);
  }
  if (error) {
    window.__homeStartupError = { phase: bootPhase, message: error.message || String(error) };
    // One quiet line with the cause, so a screenshot is enough to diagnose it.
    const detail = document.createElement('p');
    detail.className = 'startup-detail';
    detail.textContent = `${bootPhase} · ${window.__homeStartupError.message}`;
    $('#startupMessage')?.after(detail);
  }
  for (const el of document.querySelectorAll('#pages [data-icon]')) el.style.setProperty('--icon', `url(${icon(el.dataset.icon).url})`);
  createMailboxForm().mount($('#pages'));
}

$('#retry3D')?.addEventListener('click', () => {
  const url = new URL(location.href); url.searchParams.delete('plain');
  location.replace(url.href);
});

// Let the actual renderer test graphics support. The previous preflight
// allocated a second, unused WebGL context on every page opening.
if (new URLSearchParams(location.search).has('plain')) plain();
else boot().catch(err => {
  bootFailed = true;
  console.error('3D startup failed:', bootPhase, err);
  if (bootRenderer) { bootRenderer.dispose(); bootRenderer.forceContextLoss(); }
  $('#world').replaceChildren();
  delete window.__home;
  plain(err);
});

async function boot() {
  const quality = detectQuality();
  progress(0.12);
  await nextFrame();
  const stage = createStage($('#world'), quality);
  bootRenderer = stage.renderer;
  bootPhase = 'world';
  progress(0.3);
  await nextFrame();
  const world = createWorld(stage, quality);
  progress(0.66);
  await nextFrame();
  // The mailbox and the portal add their footprints before the walkable grid is built.
  const mailbox = createMailbox({ stage, world });
  const portal = createPortal({ stage, world, onOpen: openPortal });
  // The one-way doors: step on a ground ring, leave for its single destination.
  const doorRings = createDoorRings({
    stage,
    onEnter(door) {
      let host = door.target;
      try { host = new URL(door.target).hostname; } catch { /* keep the raw target */ }
      void visitWorld({ url: door.target, name: door.name || host, homecraft: true, preview: null });
    },
  });
  const nav = createNav(world.grid, world.obstacles);
  bootPhase = 'furniture-and-pets';
  const sound = createSound();
  // The skin's own face becomes the About icon once the PNG has loaded. A
  // visitor who came through a portal keeps the character they set out as; the
  // About icon still shows this site's owner.
  let phoneReady = false;
  const ownFace = rows => {
    setFace(rows);
    for (const img of document.querySelectorAll('img[data-icon="about"]')) img.src = icon('about').url;
    for (const el of document.querySelectorAll('[data-icon-bg="about"]')) el.style.backgroundImage = `url(${icon('about').url})`;
    if (phoneReady) phone.setAccounts(accounts());
  };
  const worn = await wornSkin();
  const avatar = createAvatar(worn.url, worn.carried ? {} : { onFace: ownFace });
  if (worn.carried && config.skin) readFace(config.skin, ownFace);
  stage.scene.add(avatar.root, avatar.blob);
  // Pets live where the world says (its PETS: { cat, dog } with anchors to wander between).
  const pets = [], bodies = {};
  for (const [kind, make, seed] of [['cat', createCat, 1989], ['dog', createDog, 2525]]) {
    const plan = L.PETS?.[kind];
    if (!plan) continue;
    const body = bodies[kind] = make(); stage.scene.add(body.root);
    pets.push(createPetLife(body, nav, { kind, seed, ...plan }));
  }
  const cat = bodies.cat || null, dog = bodies.dog || null;
  const atmosphere = createAtmosphere(stage, world.surfaces);
  // Rain, snow and lightning around the camera, and wet or snowy ground.
  const weatherFx = createWeatherFx({ stage, world, quality, sound });
  // The pool's water, seen from above or from inside it, with its bubbles;
  // loaded only for a world that has one.
  const pool = POOL ? (await import('./world/pool.js')).createPool({ stage, world, shelter: weatherFx.shelter, quality }) : NO_POOL;
  // A TV (surfaces.tvScreen) shows a small 3D city at night, drawn into a render target.
  const screen = world.surfaces.tvScreen;
  const aerial = screen ? (await import('./world/aerial.js')).createAerial(stage.renderer, quality) : null;
  if (aerial) { screen.material.map = aerial.texture; screen.material.needsUpdate = true; }
  const marker = atmosphere.navigation;
  // home.config.js `start` until the visitor picks something else (a clear day
  // by default: live time is often night, and a world without lamps is dark).
  const { weather: startWeather, time: startTime } = config.start;
  let weatherMode = startWeather in WEATHER_LABELS ? startWeather : 'clear', timeMode = startTime in TIME_LABELS ? startTime : 'day', mood = null, timeMinute = -1;
  let weatherState = { data: null, status: config.weather ? 'loading' : 'off', condition: null };
  let weatherIconName = null;
  const weatherMenu = $('#weatherMenu');
  const weatherMenuOpen = () => !!weatherMenu && !weatherMenu.hidden;
  function applyWeather(date = new Date()) {
    const { data, status, condition } = weatherState;
    // Live weather is a mix of amounts; each preview is one fixed mix.
    const params = weatherMode === 'auto' ? condition?.params || WEATHER_PRESETS.clear : WEATHER_PRESETS[weatherMode];
    stage.setWeather(params); weatherFx.setWeather(params);
    const next = timeMode === 'auto' ? timeOfDay(date, data) : timeMode;
    if (mood !== next) {
      mood = next; world.setMood(mood);
      document.body.classList.toggle('night', mood === 'night');
    }
    // Use the same weather source as the scene, even when the hour is unchanged.
    const kind = weatherMode === 'auto' ? (status === 'off' ? 'clear' : condition?.kind) : weatherMode;
    const skyIcon = mood === 'night' ? 'moon' : 'sun';
    const nextIcon = kind === 'clear'
      ? weatherMode === 'auto' && params.cloud >= .4 ? `cloud-${skyIcon}` : skyIcon
      : kind || 'weather-unknown';
    if (weatherIconName !== nextIcon) {
      weatherIconName = nextIcon;
      $('#moodButton span').style.backgroundImage = `url(${icon(nextIcon).url})`;
    }
    const background = `#${stage.fogTarget.getHexString()}`;
    document.querySelector('meta[name="theme-color"]').content = background;
    if (!pool.submerged) document.body.style.background = background;
    // Weather symbol plus live temperature; clear skies also reflect day/night.
    const live = data ? `${t(...condition.description)} ${Math.round(data.temperature)}°C` : status === 'off' ? t(...WEATHER_LABELS.clear) : status === 'loading' ? t('获取天气中', 'Getting the weather') : t('天气暂不可用', 'Weather unavailable');
    const now = `${weatherMode === 'auto' ? live : t(...WEATHER_LABELS[weatherMode])} · ${t(...TIME_LABELS[mood])}`;
    $('#moodButton b').textContent = weatherMode === 'auto' && data ? `${Math.round(data.temperature)}°` : '';
    $('#moodButton').title = now;
    $('#moodButton').setAttribute('aria-label', t(`天气与时段：${now}`, `Weather and time: ${now}`));
    const line = weatherMenu?.querySelector('.now');
    if (line) line.textContent = now;
    for (const b of weatherMenu?.querySelectorAll('[data-weather], [data-time]') || []) {
      const checked = b.hasAttribute('data-weather') ? b.dataset.weather === weatherMode : b.dataset.time === timeMode;
      b.setAttribute('aria-checked', String(checked)); b.tabIndex = checked ? 0 : -1;
    }
  }
  const weather = createWeather({ onChange(state) { weatherState = state; applyWeather(); } });
  // Without a weather city there is no data source to credit.
  if (!config.weather) weatherMenu?.querySelector('a[href*="open-meteo"]')?.closest('p')?.remove();
  function toggleWeatherMenu(open = weatherMenu?.hidden, restoreFocus = false) {
    if (!weatherMenu) return;
    weatherMenu.hidden = !open;
    $('#moodButton').setAttribute('aria-expanded', String(open));
    if (open) weatherMenu.querySelector('[data-weather][aria-checked="true"]')?.focus({ preventScroll: true });
    else if (restoreFocus) $('#moodButton').focus({ preventScroll: true });
  }
  function setWeatherMode(mode) {
    if (!Object.hasOwn(WEATHER_LABELS, mode)) return;
    weatherMode = mode; applyWeather();
  }
  function setTimeMode(mode) {
    if (!Object.hasOwn(TIME_LABELS, mode)) return;
    timeMode = mode; applyWeather();
  }
  const setMood = next => setTimeMode(next);
  for (const b of weatherMenu?.querySelectorAll('[data-weather]') || []) b.addEventListener('click', () => setWeatherMode(b.dataset.weather));
  for (const b of weatherMenu?.querySelectorAll('[data-time]') || []) b.addEventListener('click', () => setTimeMode(b.dataset.time));
  $('#environmentReset')?.addEventListener('click', () => { weatherMode = timeMode = 'auto'; applyWeather(); });
  $('#environmentDone')?.addEventListener('click', () => toggleWeatherMenu(false, true));
  document.addEventListener('pointerdown', e => {
    if (!weatherMenu?.hidden && !e.target.closest('#weatherMenu, #moodButton')) toggleWeatherMenu(false);
  });
  weatherMenu?.addEventListener('keydown', e => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const group = e.target.closest('[role="radiogroup"]'); if (!group) return;
    e.preventDefault(); e.stopPropagation();
    const buttons = [...group.querySelectorAll('button')], at = buttons.indexOf(document.activeElement);
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }[e.key];
    const button = buttons[(at + step + buttons.length) % buttons.length]; button.focus(); button.click();
  });

  // Going into the water, climbing out and breathing out under it.
  function onWater(kind, x, y, z, power) {
    if (kind === 'splash') { pool.splash(x, z, power); sound.play('splash', power); }
    else if (kind === 'climb') { pool.ripple(x, z, power); sound.play('drip'); }
    else if (kind === 'exhale') { pool.exhale(x, y, z); if (pool.submerged) sound.play('bubbles'); }
  }
  const player = createPlayer({ avatar, nav, grid: world.grid, ground: world.ground, onWater });
  stage.scene.add(player.web);
  const rig = createRig(stage.camera, world);
  // The world's own moving parts (a sailboat, a Vertec, …): build.js setup(app).
  const extras = W.setup?.({ stage, world, nav, player, avatar, sound, rig, quality, config }) || {};
  progress(0.85);

  // Clock and weather start in automatic mode on every visit. The corner
  // weather symbol opens the weather and time menu.
  applyWeather();
  $('#moodButton').addEventListener('click', () => { toggleWeatherMenu(); sound.play('click'); });
  function syncSound() {
    $('#soundButton span').style.backgroundImage = `url(${icon(sound.on ? 'sound' : 'mute').url})`;
    $('#soundButton').setAttribute('aria-pressed', String(sound.on));
  }
  syncSound();
  $('#soundButton').addEventListener('click', () => {
    sound.setOn(!sound.on);
    syncSound();
    sound.play('click');
  });

  // ---------- Pages ----------
  // Two stacked project cards share one viewport-sized workbench.
  // The world keeps rendering while the dialog blocks movement.
  const panel = $('#panel');
  const workbench = createWorkbench(panel);
  // A note sent from the mailbox's page raises the flag on the mailbox itself.
  const mailboxForm = createMailboxForm({ onSent: () => mailbox.raiseFlag() });
  // The world map: the portal network as a graph, door rings as the edges.
  // Choosing a world there leaves the same way the list does. The panel is a
  // modal dialog in the top layer, so close it before the map shows.
  const worldMap = createWorldMap({
    root: $('#worldmap'),
    onChoose(world) { closePage(); depart(world); },
  });
  const worldList = createWorldList({ onChoose(world) { closePage(); depart(world); } });
  // Standing at the portal, on foot: walk into it, seen from behind. From
  // anywhere else (the Dock, first person, flying), straight to loading.
  function depart(world) {
    if (!portal?.canWalkIn(player) || rig.firstPerson || reducedMotion) { void visitWorld(world); return; }
    rig.set(portal.front.heading + 0.3, 0.2, 6.5);
    portal.leave(world, player, async () => { if (!await visitWorld(world)) portal.reset(); });
  }
  // Every <article class="page" data-station> in index.html is a page, except
  // the contact list (the phone reads that). A page whose id is also one of
  // the world's STATIONS opens with F there; any page can sit in the Dock.
  const pageEl = id => document.querySelector(`#pages .page[data-station="${id}"]`);
  const titleOf = page => { const h = page?.querySelector('h2'); return h ? { name: h.getAttribute('data-zh') ?? h.textContent, en: h.dataset.en || h.textContent } : {}; };
  const stationFor = id => {
    const page = pageEl(id), placed = STATIONS.find(s => s.id === id);
    return { id, ...titleOf(page), ...placed, icon: placed?.icon || page?.dataset.icon || id };
  };
  const publicStations = [...document.querySelectorAll('#pages .page[data-station]')]
    .map(p => p.dataset.station).filter(id => id !== 'contact').map(stationFor);
  // The portal is a place to press F at too, though it has no page.
  const portalStation = portal && STATIONS.find(s => s.id === 'portal');
  const popOut = document.createElement('a');
  popOut.className = 'pop-out'; popOut.target = '_blank'; popOut.rel = 'noopener'; popOut.textContent = '↗'; popOut.hidden = true;
  panel.querySelector('header .close').before(popOut);
  let openStation = null;
  function openPage(id) {
    if (id === 'portal') { openPortal(); return; }
    if (!publicStations.some(s => s.id === id)) return;
    const page = pageEl(id);
    if (!page) return;
    worldList.destroy();
    // A page that is only a link (data-link) opens in a new tab.
    if (page.dataset.link) { const url = pageURL(page.dataset.link); if (url) window.open(url.href, '_blank', 'noopener'); return; }
    togglePhone(false);
    openStation = id;
    panel.dataset.station = id;
    $('#panelTitle').textContent = page.querySelector('h2').textContent;
    panel.querySelector('header .icon').style.backgroundImage = `url(${icon(publicStations.find(s => s.id === id).icon || id).url})`;
    const body = panel.querySelector('.body');
    mailboxForm.unmount();
    // An existing website (data-embed) shows inside the card, with ↗ to open it in a tab.
    const embed = page.dataset.embed && pageURL(page.dataset.embed);
    popOut.hidden = !embed;
    panel.dataset.kind = embed ? 'embed' : '';
    if (embed) {
      popOut.href = embed.href;
      popOut.setAttribute('aria-label', t('在新标签页打开', 'Open in a new tab'));
      mountEmbed(body, embed, page.querySelector('h2').textContent);
    } else {
      body.className = 'body page';
      body.innerHTML = page.innerHTML;
    }
    for (const li of body.querySelectorAll('[data-icon]')) li.style.setProperty('--icon', `url(${icon(li.dataset.icon).url})`);
    workbench.mount(body);
    mailboxForm.mount(body);
    placePortalControls(panel);
    if (!panel.open) panel.showModal();
    // On a phone the radar and switches step aside while a page is open.
    document.body.classList.add('reading');
    input.clear();
    player.cancel();
    marker.hide();
    body.scrollTop = 0;
    workbench.focus();
    sound.play('click');
    markSlot(id);
  }
  function openPortal() {
    if (isTravelling() || portal?.busy) return;
    togglePhone(false); toggleWeatherMenu(false); minimap.toggleBig(false); worldMap.close(); rig.skipIntro();
    openStation = 'portal'; panel.dataset.station = 'portal'; panel.dataset.kind = '';
    $('#panelTitle').textContent = t('传送门', 'Portal');
    panel.querySelector('header .icon').style.backgroundImage = `url(${icon('portal').url})`;
    popOut.hidden = true;
    const body = panel.querySelector('.body'); body.className = 'body';
    mailboxForm.unmount();
    worldList.mount(body); workbench.mount(body); mailboxForm.mount(body);
    placePortalControls(panel);
    if (!panel.open) panel.showModal();
    document.body.classList.add('reading');
    input.clear(); player.cancel(); marker.hide(); markSlot('portal');
    body.focus({ preventScroll: true }); sound.play('click');
  }
  function closePage() { if (panel.open) panel.close(); }
  panel.querySelector('.close').addEventListener('click', closePage);
  // A click on empty space (or the backdrop) closes the page, like putting
  // a card down. Both ends of the press must miss the cards and controls,
  // so a drag that wanders off a card does not count and text on a card
  // stays selectable.
  const keepsOpen = target => target.closest('.work-deck > li, .about, .world-directory, button, a, form');
  let pressedOutside = false;
  panel.addEventListener('pointerdown', e => { pressedOutside = !keepsOpen(e.target); });
  panel.addEventListener('click', e => { if (pressedOutside && !keepsOpen(e.target)) closePage(); });
  panel.addEventListener('cancel', e => { e.preventDefault(); closePage(); });
  // Links inside a page that open another page, or the phone, in the world.
  panel.addEventListener('click', e => {
    const link = e.target.closest('[data-open]');
    if (!link) return;
    e.preventDefault();
    if (link.dataset.open === 'phone') togglePhone(true); else openPage(link.dataset.open);
  });
  panel.addEventListener('close', () => {
    if (panel.open) return;
    worldList.destroy();
    mailboxForm.unmount();
    placePortalControls($('#hud'));
    panel.querySelector('.body iframe')?.remove();
    openStation = null; markSlot(null);
    document.body.classList.remove('reading');
  });

  // ---------- The prompt in the corner ----------
  // Near something you can open, its name waits bottom-right; F (or a tap) opens it.
  const promptEl = $('#prompt');
  let promptFor = null;
  const proximityPoint = new THREE.Vector3();
  function targetDistance(s) {
    proximityPoint.set(player.pos.x, player.floorY + 0.7, player.pos.z);
    let d = Math.hypot(s.at[0] - player.pos.x, s.at[1] - player.pos.z);
    for (const h of world.hotspots) if (h.id === s.id) d = Math.min(d, h.box.distanceToPoint(proximityPoint));
    return d;
  }
  function nearestTarget() {
    let best = null, bestD = 2.6;
    for (const s of [...publicStations, ...(portalStation ? [portalStation] : [])]) {
      if (!s.at) continue;
      const d = targetDistance(s);
      if (d < bestD && Math.abs((s.floor || 0) - Math.max(0, player.floorY)) < 1.5) { best = s; bestD = d; }
    }
    return best;
  }
  function updatePrompt() {
    const s = rig.introActive || portal?.busy ? null : nearestTarget();
    const show = !!s && !(panel.open && openStation === s.id);
    if (show && promptFor !== s.id) {
      promptFor = s.id;
      promptEl.querySelector('.icon').style.backgroundImage = `url(${icon(s.icon || s.id).url})`;
      promptEl.querySelector('span').textContent = nameOf(s);
    }
    if (!show) promptFor = null;
    promptEl.hidden = !show;
  }
  function useTarget(id) {
    if (id === 'portal') { openPortal(); return; }
    if (panel.open && openStation === id) closePage();
    else openPage(id);
  }
  promptEl.addEventListener('click', () => { if (promptFor) useTarget(promptFor); });

  // ---------- Hotbar ----------
  const hotbar = $('#hotbar');
  const tooltip = $('#tooltip');
  function showTip(text, r) {
    tooltip.textContent = text;
    tooltip.hidden = false;
    const above = r.top;
    tooltip.style.left = Math.round(r.left + r.width / 2 - tooltip.offsetWidth / 2) + 'px';
    tooltip.style.top = Math.round(above - tooltip.offsetHeight - 12) + 'px';
  }
  // name() gives the button's name in the language showing.
  const docked = [];
  function dockButton(name, iconName, onClick) {
    const b = document.createElement('button');
    b.setAttribute('aria-label', name());
    docked.push([b, name]);
    b.innerHTML = `<img src="${icon(iconName).url}" alt="" data-icon="${iconName}">`;
    b.addEventListener('click', e => { tooltip.hidden = true; onClick(e); });
    b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') showTip(name(), b.getBoundingClientRect()); });
    b.addEventListener('pointerleave', () => { tooltip.hidden = true; });
    hotbar.append(b);
    return b;
  }
  function markSlot(id) { for (const b of hotbar.querySelectorAll('[data-station]')) b.classList.toggle('on', b.dataset.station === id); }

  // Dock content appears on this click; the background moves to its station
  // immediately, including the correct floor height and camera position.
  function go(id) {
    if (id === 'portal') { openPortal(); return; }
    const s = STATIONS.find(s => s.id === id);
    if (!s) { rig.skipIntro(); openPage(id); tooltip.hidden = true; return; }
    rig.skipIntro();
    if (s.page === false) closePage(); else openPage(id);
    player.teleport(...s.at, s);
    rig.recenter(player, true);
    if (s.show) rig.showcase(...(stage.camera.aspect < 0.8 && s.showPortrait ? s.showPortrait : s.show));
    marker.show(player.pos.x, player.floorY, player.pos.z, 0xf2ead7);
    tooltip.hidden = true;
  }

  // ---------- Picking ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hotspots = world.hotspots.filter(h => publicStations.some(s => s.id === h.id));

  function pick(clientX, clientY) {
    ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, stage.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    const block = world.grid.raycast(o, d, 160, (type, group) => type.kind !== 'glass' && !world.hidden.has(group));
    // Outside ground (the shore pier and mountain) is not in
    // the block grid; it answers the ray itself.
    const isle = world.ground.pick(ray.ray);
    const island = isle && (!block || isle.t < block.t) ? isle : null;
    let best = null;
    const hit = new THREE.Vector3();
    for (const h of hotspots) {
      if (!ray.ray.intersectBox(h.box, hit)) continue;
      const t = hit.distanceTo(o);
      if (block && t > block.t + 0.35) continue;
      if (!best || t < best.t) best = { t, h };
    }
    const portalHit = portal?.pick(ray.ray);
    if (portalHit != null && (!block || portalHit <= block.t + .35) && (!island || portalHit <= island.t) && (!best || portalHit < best.t)) {
      best = { t: portalHit, h: { id: 'portal' } };
    }
    // The pool's surface answers too, from above or below: water is not a block.
    let water = null;
    const toWater = POOL && Math.abs(d.y) > 1e-4 ? (POOL.water - o.y) / d.y : -1;
    if (toWater > 0 && (!block || toWater < block.t) && (!island || toWater < island.t) && inPool(o.x + d.x * toWater, o.z + d.z * toWater)) {
      water = { t: toWater, x: o.x + d.x * toWater, z: o.z + d.z * toWater };
    }
    return { block: island ? null : block, spot: best?.h || null, island, water };
  }

  // ---------- Web-zip ----------
  // Spider-Man's point launch, on demand: in web mode (toggled by the top-right
  // web button), somewhere within 55 m and in sight, with room to stand, shows
  // the spider marker, and a click shoots a web there and pulls the player straight
  // over (onto roofs and tree tops as well). Otherwise a click walks or flies as before.
  // Things in the house open only with F (or the Dock).
  const REACH = 55, aim = $('#aim'), eye = new THREE.Vector3(), way = new THREE.Vector3();
  // Where to land for an anchor: on top of what was hit (a top, or over a
  // ledge up to 4 m above, so the upper wall of the house reaches the roof),
  // or, for a low wall, the floor in front of it.
  function landingNear(a, n) {
    const ledge = !!n && Math.abs(n[1]) < 0.5, above = ledge ? 4 : 0.4;
    const top = (x, z) => {
      const g = world.ground.topAt(x, z, a.y + above);
      const s = g && g.y > a.y - 2.5 ? world.ground.nearestStand(x, z, g.y) : null;
      return s && { x: s.x, z: s.z, y: s.y, island: s.site };
    };
    const floor = (x, z) => {
      const s = nav.nearestStand(x, z), h = nav.heightAt(s.x, s.z);
      return nav.canStand(s.x, s.z) && h <= a.y + above && h > a.y - 2.5 ? { x: s.x, z: s.z, y: h, island: null } : null;
    };
    if (!ledge) return top(a.x, a.z) || floor(a.x, a.z);
    // Behind the face only outside ground counts (never through a wall into the house).
    return top(a.x - n[0] * 0.8, a.z - n[2] * 0.8) || floor(a.x + n[0] * 0.7, a.z + n[2] * 0.7);
  }
  function zipTarget(clientX, clientY) {
    if (player.zipping || rig.introActive) return null;
    const { block, island } = pick(clientX, clientY);
    if (!block && !island) return null;
    const anchor = island ? island.point : new THREE.Vector3(block.x, block.y, block.z), normal = island ? null : block.normal;
    eye.set(player.pos.x, player.y + 1.7, player.pos.z);
    const d = eye.distanceTo(anchor);
    if (d > REACH || d < 1.5) return null;
    // In sight: nothing solid, glass included, short of the anchor itself.
    way.subVectors(anchor, eye).normalize();
    const hit = world.grid.raycast(eye, way, d, () => true);
    if (hit && hit.t < d - 0.7) return null;
    const land = landingNear(anchor, normal);
    return land && { ...land, anchor, normal };
  }
  function webTo(target) {
    closePage(); minimap.toggleBig(false); input.clear();
    if (!player.zipTo(target)) return false;
    sound.play('web');
    return true;
  }

  let webMode = false;
  const webButton = $('#webButton');
  webButton.querySelector('span').style.backgroundImage = `url(${icon('web').url})`;
  function toggleWeb(on = !webMode) { webMode = on; webButton.setAttribute('aria-pressed', String(on)); refreshAim(); }
  webButton.addEventListener('click', () => { toggleWeb(); sound.play('click'); });

  // While in web mode, the spider marker follows the cursor wherever a zip is possible;
  // checked as the pointer moves (at most every 60 ms) and as the camera turns.
  const mouse = { x: -1, y: -1 };
  let aimCheck = 0, aimOk = false;
  function hover(x, y, fromPointer = false) {
    if (fromPointer) { mouse.x = x; mouse.y = y; }
    const now = performance.now();
    if (x < 0 || rig.introActive || !webMode) aimOk = false;
    else if (!fromPointer || now - aimCheck > 60) { aimCheck = now; aimOk = !!zipTarget(x, y); }
    aim.hidden = !aimOk;
    if (aimOk) aim.style.transform = `translate(${x}px, ${y}px)`;
    stage.renderer.domElement.style.cursor = aimOk ? 'none' : x >= 0 && pick(x, y).spot?.id === 'portal' ? 'pointer' : '';
  }
  function refreshAim() {
    if (rig.firstPerson) hover(innerWidth / 2, innerHeight / 2);
    else hover(mouse.x, mouse.y);
  }

  function tap(x, y) {
    const target = pick(x, y);
    if (target.spot?.id === 'portal') { openPortal(); return; }
    // A tap during the opening shot only cuts it short; it does not send
    // the player towards wherever the far-away view happened to be touched.
    if (rig.introActive) { rig.skipIntro(); return; }
    // Lying on the pool's floor looking up, a tap only brings them up again.
    if (player.gazing) { player.toggleDive(); return; }
    if (webMode) {
      const target = zipTarget(x, y);
      if (target) return webTo(target);
    }
    const { block, island, water } = target;
    if (water) return navigate(water.x, water.z, POOL.water);
    if (island?.site === 'roof-ladder') {
      const target = player.island === 'roof' ? world.roofAccess.foot : world.roofAccess.exit;
      return navigate(target.x, target.z, target.y);
    }
    if (island) return navigate(island.point.x, island.point.z, island.point.y);
    if (block && block.normal[1] === 1) navigate(block.x, block.z, block.y);
  }

  // Walk if the place is reachable on foot from here; otherwise fly there.
  function navigate(x, z, targetY = null) {
    closePage(); minimap.toggleBig(false); input.clear(); rig.skipIntro();
    // The pool: swim there; from the deck walk to its side and dive in, from
    // anywhere else fly over and drop in. Swimming, a place on land is
    // reached by climbing out on the nearest side first.
    const poolSpot = inPool(x, z) && (targetY === null || targetY < 0);
    if (player.swimming) {
      const accepted = poolSpot ? player.swimTo(x, z) : player.leavePool(x, z, () => navigate(x, z, targetY));
      marker.show(x, poolSpot ? POOL.water : targetY ?? nav.heightAt(x, z), z, accepted ? 0x85c9ff : 0xeab66a);
      return accepted;
    }
    if (poolSpot) {
      const accepted = player.flying || player.island ? player.flyIntoPool(x, z) : player.enterPool(x, z);
      marker.show(x, POOL.water, z, accepted ? 0x85c9ff : 0xeab66a);
      return accepted;
    }
    // Somewhere on the same island and about the same height is a walk;
    // any disconnected surface is a short flight.
    const ceiling = targetY === null ? (!player.island && nav.canStand(x, z) ? nav.heightAt(x, z) + .7 : Infinity) : targetY + .7;
    const surface = world.ground.topAt(x, z, ceiling);
    const isle = surface?.site ? surface : null;
    const roofSite = site => site === 'roof' || site === 'roof-ladder';
    if (world.roofAccess && !player.flying && (!player.island || roofSite(player.island)) && (roofSite(isle?.site) || (roofSite(player.island) && !isle))) {
      const access = world.roofAccess, toY = isle?.y ?? nav.heightAt(x, z);
      // Same-height roof clicks go straight across the flush glazing. All
      // other roof/ground travel uses the wall ladder.
      const points = roofSite(player.island) && player.y > 10.7 && isle?.site === 'roof'
        ? [{ x, z }] : access.route(player.pos.x, player.y, player.pos.z, x, toY, z);
      const accepted = player.follow(points, player.island ? null : access.foot, isle ? null : () => player.goTo(x, z));
      marker.show(x, toY, z, accepted ? 0x85c9ff : 0xeab66a);
      return accepted;
    }
    if (world.outer?.foot && !player.flying && (isle?.site === 'pier' || player.island === 'pier') && (!player.island || player.island === 'pier')) {
      const foot = world.outer.foot;
      const target = isle?.site === 'pier' ? world.ground.nearestStand(x, z, isle.y) : foot;
      const accepted = target && player.follow([target], player.island ? null : foot, isle ? null : () => player.goTo(x, z));
      marker.show(x, isle?.y ?? nav.heightAt(x, z), z, accepted ? 0x85c9ff : 0xeab66a);
      return !!accepted;
    }
    // Climb and descend on foot, handing back to the island at the trailhead.
    if (world.mountain && !player.flying && (!player.island || player.island === 'mountain') &&
      (isle?.site === 'mountain' || player.island === 'mountain' && !isle)) {
      const on = player.island === 'mountain', down = isle?.site !== 'mountain';
      const target = down ? { ...world.mountain.trailhead, y: .02 } : { x, y: isle.y, z };
      const road = world.mountain.route(player.pos.x, on ? player.y : null, player.pos.z, target.x, target.y, target.z);
      const accepted = player.follow(road, on ? null : world.mountain.trailhead, down ? () => player.goTo(x, z) : null);
      marker.show(x, isle?.y ?? nav.heightAt(x, z), z, accepted ? 0x85c9ff : 0xeab66a);
      if (accepted) return true;
    }
    const onFoot = !player.flying && (isle ? isle.site === player.island && Math.abs(isle.y - player.y) < 1.5 : !player.island);
    if (!onFoot) {
      const accepted = player.flyTo(x, z);
      marker.show(x, isle ? isle.y : nav.heightAt(x, z), z, accepted ? 0x85c9ff : 0xeab66a);
      return accepted;
    }
    if (isle) {
      const accepted = player.goTo(x, z);
      marker.show(x, isle.y, z, accepted ? 0x85c9ff : 0xeab66a);
      return accepted;
    }
    const stand = nav.nearestStand(x, z);
    const accepted = stand && nav.canStand(stand.x, stand.z) && player.goTo(stand.x, stand.z);
    const target = accepted ? player.path.at(-1) || stand : { x, z };
    marker.show(target.x, nav.heightAt(target.x, target.z), target.z, accepted ? 0x85c9ff : 0xeab66a);
    return !!accepted;
  }

  function activate(id) {
    if (!publicStations.some(s => s.id === id)) return;
    const s = STATIONS.find(s => s.id === id);
    if (!s) return;
    const d = targetDistance(s);
    if (d < 2.6 && Math.abs((s.floor || 0) - Math.max(0, player.floorY)) < 1.5) {
      useTarget(id); marker.show(player.pos.x, player.floorY, player.pos.z, 0xf2ead7);
    } else if (player.flying || player.island) {
      if (player.flyTo(...s.at)) marker.show(s.at[0], nav.heightAt(...s.at), s.at[1]);
    } else if (player.visit(id)) {
      const end = player.path.at(-1);
      marker.show(end.x, nav.heightAt(end.x, end.z), end.z);
    }
  }

  // ---------- Radar ----------
  const minimap = createMinimap({
    root: $('#minimap'), bigRoot: $('#bigmap'), grid: world.grid, obstacles: world.obstacles, decorate: world.drawMap,
    getPlayer: () => ({ x: player.pos.x, z: player.pos.z, heading: player.heading }),
    getYaw: () => rig.yaw,
    getRoute: () => player.path,
    onPick: navigate,
  });

  // ---------- First person ----------
  const viewButton = $('#viewButton'), crosshair = $('#crosshair');
  viewButton.querySelector('span').style.backgroundImage = `url(${icon('eye').url})`;
  function toggleView() {
    rig.skipIntro();
    rig.setFirstPerson(!rig.firstPerson, player.heading);
    sound.play('click');
  }
  viewButton.addEventListener('click', toggleView);

  // ---------- World map button ----------
  // The corner button beside the web one; M is the shortcut, Tab stays on the
  // island's own big map.
  const worldMapButton = $('#worldMapButton');
  worldMapButton.querySelector('span').style.backgroundImage = `url(${icon('map').url})`;
  worldMapButton.title = t('世界地图（M）', 'World map (M)');
  worldMapButton.addEventListener('click', () => {
    closePage();
    worldMap.toggle();
    worldMapButton.setAttribute('aria-pressed', String(worldMap.isOpen()));
    sound.play('click');
  });

  // ---------- Flight ----------
  // Keys: Space jumps, a double tap flies. The corner button does the same for
  // touch screens, where tapping a place then flies the player there. In the pool
  // the same button dives to the bottom, and brings them back up.
  const flyButton = $('#flyButton');
  let flyIcon = null;
  function syncFlyButton() {
    const name = player.swimming ? 'dive' : 'fly';
    if (flyIcon !== name) {
      flyIcon = name;
      flyButton.querySelector('span').style.backgroundImage = `url(${icon(name).url})`;
      flyButton.setAttribute('aria-label', player.swimming ? t('潜水', 'Dive') : t('飞行', 'Fly'));
    }
    flyButton.setAttribute('aria-pressed', String(player.swimming ? player.diving : player.flying));
  }
  syncFlyButton();
  function toggleFly() { rig.skipIntro(); player.toggleFly(); closePage(); syncFlyButton(); }
  flyButton.addEventListener('click', () => {
    rig.skipIntro(); closePage();
    if (player.swimming) player.toggleDive(); else player.toggleFly();
    syncFlyButton(); sound.play('click');
  });
  // A touch screen has no keys to fly with: while the player flies by hand, a
  // D-pad and a climb/descend rocker come up in the bottom corners.
  const flightPad = matchMedia('(pointer: coarse)').matches ? createFlightPad($('#flightPad')) : null;

  // ---------- Phone ----------
  // P or its Dock slot, like GTA's: it comes up bottom right and the player
  // holds one in hand. Its apps are the accounts in the page's contact
  // list, so the text page and the phone share one reviewed source.
  const accounts = () => [...document.querySelectorAll('#pages [data-station="contact"] li[data-app]')].map(li => {
    const link = li.querySelector('a');
    return { id: li.dataset.app, name: li.querySelector('span').textContent.trim(), href: link?.getAttribute('href')?.trim() ? link.href : '', handle: link?.textContent.trim() || '', note: li.querySelector('p')?.textContent.trim() || '' };
  });
  const phone = createPhone($('#phone'), accounts(), { write: pageEl('mailbox') ? () => openPage('mailbox') : null });
  phoneReady = true;
  // The Dock, in home.config.js order: pages by their data-station id, and 'phone'.
  let phoneButton = null;
  for (const id of config.dock) {
    if (id === 'phone') {
      phoneButton = dockButton(() => t('手机', 'Phone'), 'phone', () => togglePhone());
      phoneButton.setAttribute('aria-pressed', 'false');
      continue;
    }
    const s = publicStations.find(s => s.id === id);
    if (s) dockButton(() => nameOf(s), s.icon || s.id, () => go(s.id)).dataset.station = s.id;
  }
  function togglePhone(on = !phone.up) {
    if (on === phone.up) return;
    phone.toggle(on);
    if (on) { rig.skipIntro(); closePage(); }
    phoneButton?.setAttribute('aria-pressed', String(on));
    phoneButton?.classList.toggle('on', on);
    document.body.classList.toggle('phone-on', on);
    avatar.holdPhone(on);
    sound.play('phone', on);
  }

  // ---------- Language ----------
  // The 中/EN switch sits in every page's header, beside the close button.
  // Switching renames what the world built in the other language; the open
  // workbench is laid out again for its screenshots in that language.
  panel.querySelector('header .close').before(langSwitch());
  onLang(() => {
    for (const [b, name] of docked) b.setAttribute('aria-label', name());
    promptFor = null; flyIcon = null;
    syncFlyButton(); applyWeather();
    phone.setAccounts(accounts());
    if (openStation === 'portal') openPortal();
    else if (openStation === 'works') openPage('works');
    else if (openStation) $('#panelTitle').textContent = document.querySelector(`#pages .page[data-station="${openStation}"] h2`).textContent;
  });

  // ---------- Input ----------
  const input = createInput(stage.renderer.domElement, {
    blocked: () => minimap.isBigOpen() || panel.open || weatherMenuOpen() || isTravelling() || !!portal?.busy,
    shortcutsBlocked: () => minimap.isBigOpen() || weatherMenuOpen() || isTravelling() || !!portal?.busy,
    escape: () => { if (weatherMenuOpen()) toggleWeatherMenu(false, true); else if (minimap.isBigOpen()) minimap.toggleBig(false); else if (worldMap.isOpen()) worldMap.close(); else if (panel.open) closePage(); else if (phone.up) { if (!phone.back()) togglePhone(false); } else toggleWeb(false); },
    interact: () => {
      const s = nearestTarget();
      if (s) { useTarget(s.id); return; }
      // First person: whatever sits under the crosshair.
      if (rig.firstPerson) {
        const { spot } = pick(innerWidth / 2, innerHeight / 2);
        if (spot?.id === 'portal') openPortal();
        else if (spot) activate(spot.id);
      }
    },
    view: toggleView,
    jump: () => { rig.skipIntro(); player.jump(); },
    toggleFly,
    phone: () => togglePhone(),
    map: () => { if (panel.open) closePage(); worldMap.toggle(); },
    bigMap: () => minimap.toggleBig(),
    slot: n => hotbar.children[n - 1]?.click(),
    orbit: (dx, dy) => { rig.skipIntro(); rig.orbit(dx, dy); },
    zoom: f => rig.zoom(f),
    tap,
    hover: (x, y) => hover(x, y, true),
    anyKey: () => rig.skipIntro(),
    pad: () => flightPad?.state,
  });

  // ---------- Loop ----------
  // Compile all display materials and the initial shadow map while the loading
  // screen is still up. The first walk should not trigger cold shader work.
  progress(0.92);
  bootPhase = 'shader-warmup';
  // The same baked field lights furniture, printed artwork, the player and pets.
  // Bind it before warmup so night/day switches never compile another shader.
  world.lighting.apply(stage.scene);
  // The web is normally hidden, so include it in warmup explicitly; otherwise
  // its shader would compile on the first zip.
  player.web.position.set(0, -30, 0); player.web.visible = true;
  atmosphere.warmup(true);
  weatherFx.warmup(true);
  pool.warmup(true);
  extras.warmup?.(true);
  // Compiling a shader alone does not upload off-screen vertex buffers.
  // Draw every batch once under the loading screen, including culled panes
  // and particles, so the first weather preview/camera move stays warm.
  const warmObjects = [], cameraMask = stage.camera.layers.mask;
  stage.scene.traverse(o => {
    if (o.isMesh || o.isPoints || o.isLine) { warmObjects.push([o, o.frustumCulled]); o.frustumCulled = false; }
  });
  stage.camera.layers.enable(1);
  if (aerial) { await stage.renderer.compileAsync(aerial.scene, aerial.camera); aerial.render(); }
  // A full cloud deck turns the sun, and its shadow lookups, off. Compile
  // both cases, then draw once with the sun to bake its shadow map, so no
  // change of weather ever compiles a shader.
  stage.settle();
  const sunOn = stage.sun.visible;
  stage.sun.visible = false;
  await stage.renderer.compileAsync(stage.scene, stage.camera);
  stage.sun.visible = true;
  await stage.renderer.compileAsync(stage.scene, stage.camera);
  rig.update(1 / 60, player);
  stage.render();
  stage.sun.visible = sunOn;
  stage.camera.layers.mask = cameraMask;
  for (const [object, culled] of warmObjects) object.frustumCulled = culled;
  player.web.visible = false;
  atmosphere.warmup(false);
  weatherFx.warmup(false);
  pool.warmup(false);
  extras.warmup?.(false);
  progress(1);
  await nextFrame();
  // Outside the portal, facing away from it, the light at rest behind.
  function settlePortalArrival() {
    const f = portal?.front;
    if (f) {
      portal.reset();
      player.teleport(f.x, f.z, { look: [f.x + Math.sin(f.heading) * 6, f.z + Math.cos(f.heading) * 6] });
      // A side view keeps the portal out of the arrival camera's way.
      rig.set(f.heading + Math.PI * .52, .38, stage.camera.aspect < .8 ? 8.5 : 8);
    }
    rig.recenter(player);
  }
  // Every visit opens on the whole island; any key, click or drag cuts it
  // short. Reduced motion goes straight in. Through another world's portal,
  // the player stands in this portal's light and walks out once the world
  // shows; Back or Forward to here, or a world without one, settles outside it
  // (or at spawn).
  const walkOut = arrivedBy === 'door' && !reducedMotion ? portal?.arrive(player) : null;
  if (walkOut) {
    // Seen from the front, coming out of the light.
    rig.set(portal.front.heading + 0.45, 0.2, stage.camera.aspect < .8 ? 8 : 7);
    rig.recenter(player);
    stage.render();
  } else if (arrivedBy) {
    settlePortalArrival();
    stage.render();
  } else if (!reducedMotion) rig.startIntro(player);
  finishLoading();
  walkOut?.();

  addEventListener('pageshow', event => {
    if (!event.persisted) return;
    settlePortalArrival();
  });

  let last = performance.now();
  // ---------- Budget ----------
  // What the last frame cost, against the budget in AGENTS.md. ?debug shows
  // it in the corner (red when over); __home.stats() returns it.
  const BUDGET = { calls: 60, triangles: 200000, frameMs: 1000 / 30 };
  const frameTimes = new Float32Array(60);
  let frameIndex = 0;
  function stats() {
    const info = stage.renderer.info, frames = [...frameTimes].filter(Boolean);
    const frameMs = frames.length ? frames.reduce((a, b) => a + b, 0) / frames.length : 0;
    return { calls: info.render.calls, triangles: info.render.triangles, textures: info.memory.textures, geometries: info.memory.geometries,
      programs: info.programs?.length ?? 0, lights: world.lights.length, pixelRatio: +stage.renderer.getPixelRatio().toFixed(2), frameMs: +frameMs.toFixed(1), budget: BUDGET };
  }
  const debugEl = new URLSearchParams(location.search).has('debug') ? document.body.appendChild(Object.assign(document.createElement('pre'), { id: 'debugStats' })) : null;
  let debugClock = 0;
  const weatherFocus = new THREE.Vector3();
  const governor = { t: 0, frames: 0, sum: 0, sq: 0, level: 0 };
  let mapClock = 0, promptClock = 0, hoverClock = 0;
  let hudShown = false;
  let wasPaused = false;
  // Lying still on the pool's floor, looking up, the HUD fades away until the
  // next touch, key or mouse movement.
  let quiet = false, lastInput = performance.now(), underwater = false;
  const stir = () => { lastInput = performance.now(); if (quiet) { quiet = false; document.body.classList.remove('quiet'); } };
  for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel']) addEventListener(type, stir, { passive: true });

  function loop(now) {
    if (bootFailed) return;
    requestAnimationFrame(loop);
    if (document.hidden) { last = now; return; }
    const elapsed = (now - last) / 1000;
    const paused = minimap.isBigOpen() || worldMap.isOpen() || panel.open || weatherMenuOpen() || isTravelling();
    if (paused && !wasPaused) { player.cancel(); input.clear(); }
    wasPaused = paused;
    // Panels pause movement, but the visible world keeps rendering every frame.
    last = now;
    const minute = Math.floor(Date.now() / 60000);
    if (minute !== timeMinute) { timeMinute = minute; if (timeMode === 'auto') applyWeather(); if (phone.up) phone.tick(); }
    const dt = Math.min(elapsed, 0.05);

    const move = paused || rig.introActive || portal?.busy ? { x: 0, z: 0, run: false, up: false, down: false } : input.read();
    const fp = rig.firstPerson && !rig.introActive;
    player.update(dt, move, rig.yaw, fp);
    portal?.update(dt, player);
    doorRings?.update(dt, player);
    rig.update(dt, player);
    stage.setClearance(rig.introActive ? stage.camera.position.distanceTo(player.pos) : 0);
    for (const pet of pets) pet.update(dt, stage.camera, player);
    aerial?.update(elapsed, stage.camera, screen);
    extras.update?.(dt, elapsed, now);
    atmosphere.update(elapsed, now);
    weatherFx.update(elapsed, stage.camera, weatherFocus.set(player.pos.x, player.y + 1, player.pos.z));
    const weatherNow = weatherFx.state, cam = stage.camera.position;
    pool.update(elapsed, stage.camera, player, weatherNow);
    // Under water the view softens; behind its blurred edges is water, not sky.
    if (pool.submerged !== underwater) {
      underwater = pool.submerged;
      document.body.classList.toggle('underwater', underwater);
      document.body.style.background = `#${(underwater ? pool.fogColor : stage.fogTarget).getHexString()}`;
    }
    sound.ambience(weatherNow.rain, pool.submerged, inHouse(cam.x, cam.z) && cam.y < HOUSE.height);
    stage.update(elapsed);
    // Looking up through their own eyes from the pool's floor, as in first
    // person, their body is out of the way.
    avatar.root.visible = !fp && rig.gazeAmount < 0.7;
    avatar.blob.visible = !fp && !player.swimming;
    crosshair.hidden = !fp;
    viewButton.setAttribute('aria-pressed', String(fp));
    syncFlyButton();
    flightPad?.show(player.flying && !player.piloting && !paused && !rig.introActive && !phone.up);

    // A page closes itself once the player walks away from where it belongs.
    if (openStation && openStation !== 'portal') {
      const st = STATIONS.find(st => st.id === openStation);
      if (st && targetDistance(st) > 3.5) closePage();
    }
    promptClock += elapsed;
    if (promptClock >= 0.1) { promptClock = 0; updatePrompt(); }

    if (!rig.introActive && !hudShown) { hudShown = true; $('#hud').hidden = false; }
    const still = player.gazing && rig.gazeAmount >= 1 && !paused && !phone.up;
    if (still && !quiet && now - lastInput > 2500) { quiet = true; document.body.classList.add('quiet'); }
    else if (!still && quiet) { quiet = false; document.body.classList.remove('quiet'); }
    mapClock += elapsed;
    if (hudShown && mapClock >= 0.1) { mapClock = 0; minimap.draw(); }
    hoverClock += elapsed;
    if (hoverClock >= 0.1) {
      hoverClock = 0;
      if (fp) hover(innerWidth / 2, innerHeight / 2);
      else if (mouse.x >= 0) hover(mouse.x, mouse.y);
    }
    stage.render();
    frameTimes[frameIndex = (frameIndex + 1) % frameTimes.length] = elapsed * 1000;
    if (debugEl && (debugClock += elapsed) > 0.5) {
      debugClock = 0;
      const st = stats(), over = (v, max) => (v > max ? ' over' : '');
      debugEl.innerHTML = `<b class="${over(st.calls, BUDGET.calls)}">${st.calls} calls</b> · <b class="${over(st.triangles, BUDGET.triangles)}">${Math.round(st.triangles / 1000)}k tris</b> · <b class="${over(st.frameMs, BUDGET.frameMs)}">${st.frameMs} ms</b> · ${st.programs} programs · DPR ${st.pixelRatio}`;
    }

    // Re-check throughout the visit, including later camera angles. Use the
    // uncapped frame interval, so long GPU stalls cannot hide behind physics dt.
    if (!rig.introActive && governor.level < 2) {
      governor.t += elapsed; governor.frames++; governor.sum += elapsed; governor.sq += elapsed * elapsed;
      if (governor.t > 3) {
        const avg = governor.sum / governor.frames;
        const jitter = Math.sqrt(Math.max(0, governor.sq / governor.frames - avg * avg));
        if (avg > 1 / 25 || (avg > 1 / 50 && jitter > 0.004)) {
          governor.level++;
          stage.setPixelRatio(Math.max(quality.mobile ? 0.85 : 1, stage.renderer.getPixelRatio() * 0.8));
        }
        governor.t = governor.frames = governor.sum = governor.sq = 0;
      }
    }

  }
  requestAnimationFrame(loop);

  addEventListener('resize', () => stage.resize());
  // Handy when poking at it from the console.
  window.__home = {
    stage, world, player, avatar, rig, nav, pets, cat, dog, extras, portal, worn, atmosphere, weatherFx, pool, weather, config, stats, setWeatherMode, getWeatherMode: () => weatherMode, setTimeMode, getTimeMode: () => timeMode, navigate, openPage, openPortal, go, setMood,
    doors: doorRings ? L.DOORS : [],
    worldMap: { isOpen: () => worldMap.isOpen(), nodes: () => worldMap.nodeCount() },
    teleport(x, z) { player.teleport(x, z); rig.recenter(player); },
    project(x, y, z) {
      const v = new THREE.Vector3(x, y, z).project(stage.camera);
      return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
    },
    hotspot(id) { const h = world.hotspots.find(h => h.id === id); const c = h.box.getCenter(new THREE.Vector3()); return [c.x, c.y, c.z]; },
    activate,
  };
  weather.start();
  bootPhase = 'ready';
}
