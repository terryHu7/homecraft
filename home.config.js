export default {
  name: '',
  // 64×64 PNG, 4px arms, ≤ 18000 bytes. docs/avatar.md
  skin: '',
  languages: ['zh', 'en'],
  // weather: { city: '上海', cityEn: 'Shanghai', latitude: 31.23, longitude: 121.47, timezone: 'Asia/Shanghai' },
  weather: null,
  dock: ['blog', 'about', 'mailbox', 'phone'],
  mailbox: { endpoint: '', email: '', turnstileSitekey: '' },
  // Multiplayer presence (multiplayer/): `endpoint` points at your room
  // server (multiplayer/server) — empty keeps the site single-player. Local
  // development can point at ws://127.0.0.1:8787 and production at your
  // deployed wss:// address, e.g.:
  //   endpoint: ['localhost', '127.0.0.1'].includes(location.hostname)
  //     ? 'ws://127.0.0.1:8787'
  //     : 'wss://mp.example.com',
  // See multiplayer/README.md and multiplayer/DEPLOY.md. Try it without any
  // config: `npm run demo:mp`.
  multiplayer: { endpoint: '', maxRemote: 24 },
  badge: true,
};
