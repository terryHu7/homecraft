// The site's settings: home.config.js (mapped as `@config` in index.html)
// over these defaults. Every field is optional.
import user from '@config';

const DEFAULTS = {
  // The owner's name, shown on the phone's account cards.
  name: '',
  // A 64×64 Minecraft skin PNG; empty wears the default player from world/skin.js.
  skin: '',
  // 'zh', 'en', or both (both shows the 中/EN switch and follows the browser).
  languages: ['zh', 'en'],
  // A city for the Live option: { city, cityEn, latitude, longitude, timezone }.
  // null skips the request; Live time then follows the visitor's clock.
  weather: null,
  // How the world first looks: a weather ('clear', 'rain', …) and a time of day
  // ('day', 'night', …), or 'auto' for Live. A clear day by default, since a
  // world without lamps is too dark to walk around at night.
  start: { weather: 'clear', time: 'day' },
  // The Dock, in order: ids of the pages in index.html (data-station), and 'phone'.
  dock: ['blog', 'about', 'mailbox', 'phone'],
  // Notes from the mailbox: `endpoint` is your deployed backend/mailbox Worker;
  // without one the note opens the visitor's mail app addressed to `email`.
  mailbox: { endpoint: '', email: '', turnstileSitekey: '' },
  // The portal's list: the shared Homecraft directory, using the first valid
  // answer from its mirrors. Every world reads the same directory, so these
  // addresses never change: see docs/protocol.md.
  portal: {
    directory: ['https://homecraft.terryhu.cn/worlds.json', 'https://terryhu7.github.io/homecraft/worlds.json'],
  },
  // The small "Made with homecraft" badge by the radar.
  badge: true,
};

const merged = { ...DEFAULTS, ...user };
for (const key of ['start', 'mailbox', 'portal']) merged[key] = { ...DEFAULTS[key], ...(user?.[key] || {}) };
export const config = merged;
