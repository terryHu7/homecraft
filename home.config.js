// 保留默认公共目录及跨站传送；不要用本地位置列表替换传送门。
// Keep the default shared directory and cross-site portal; local navigation is separate.
export default {
  name: '',
  // 64×64 PNG, 4px arms, ≤ 18000 bytes. docs/avatar.md
  skin: '',
  languages: ['zh', 'en'],
  // weather: { city: '上海', cityEn: 'Shanghai', latitude: 31.23, longitude: 121.47, timezone: 'Asia/Shanghai' },
  weather: null,
  dock: ['blog', 'about', 'mailbox', 'phone'],
  mailbox: { endpoint: '', email: '', turnstileSitekey: '' },
  badge: true,
};
