// 1 block = 1 m. x east, z south, y up.
export const ISLAND = { x0: -36, x1: 38, z0: -26, z1: 31 };
export const SPAWN = { x: 0.5, z: 18, heading: Math.PI };
export const STATIONS = [
  { id: 'mailbox', name: '留言', en: 'Mailbox', icon: 'mail', at: [0.5, 23.9], look: [0.5, 25.5] },
  { id: 'portal', name: '传送门', en: 'Portal', icon: 'portal', at: [8, 23.1], look: [8, 25.5] },
];
export const MAILBOX = { x: 0.5, z: 25.5, yaw: Math.PI };
export const PORTAL = { x: 8, z: 25.5, yaw: Math.PI };
export const TREES = [[30, -12]];

// 单项传送门：地面光圈，走进即前往 target（类似超链接，一个光圈只指向一个世界）。
// target 建议同时抄进 homecraft.json 的 doors 字段，别的世界才能在地图上连出关系线。
export const DOORS = [
  { x: 14.5, z: 21, target: 'https://terryhu.cn/', name: "Terry's Home" },
];
