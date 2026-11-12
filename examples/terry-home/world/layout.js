// Where everything is. One block = one metre; x runs east, z runs south
// (towards the pool and the default camera), y is up. The ground is y = 0.

// The south shore ends at the pool; its last sea-facing cell is submerged.
export const ISLAND = { x0: -36, x1: 38, z0: -26, z1: 31 };

// House interior; the walls occupy the ring of cells just outside it.
export const HOUSE = { x0: -20, x1: 24, z0: -12, z1: 16, height: 10 };

// Half court with the hoop on the west wall, seen side-on from the pool.
export const COURT = { x0: -19, x1: -7, z0: -2.5, z1: 10.5 };
// The rim and ball are scaled up with the blocky bodies, as the players' heads are.
export const RIM = { x: -19.28, y: 3.05, z: (COURT.z0 + COURT.z1) / 2, r: 0.31 };
// A Vertec at the east edge of the gym, past the treadmill, against the south
// wall: its pole, and the vanes reaching north (yaw π/2) over open floor, so
// there is a clear run-up to jump from.
export const VERTEC = { x: -5.6, z: 15.05, yaw: Math.PI / 2 };

// A full-floor master suite, reached by a broad stair along its east edge.
export const LOFT = { x0: -20, x1: -3, z0: -12, z1: -4, y: 4 };
// A broad straight stair beside the court, rising north into the mezzanine.
// Eight metres of run for four metres of rise replaces the old 45-degree ladder.
export const STAIRS = { x0: -6.8, x1: -3, z0: -4, z1: 4 };
// Four large flush glass fields around a broad cross-shaped roof promenade.
export const ROOF_GLASS = [
  { x0: -18, x1: 0, z0: -11, z1: 1 },
  { x0: 3, x1: 23, z0: -11, z1: 1 },
  { x0: -18, x1: 0, z0: 4, z1: 15 },
  { x0: 3, x1: 23, z0: 4, z1: 15 },
];
// A compact vertical ladder against the east wall, opening through the roof rim.
export const ROOF_LADDER = { x: 25.65, z: 14.5, top: 11, gate0: 13, gate1: 16 };
// The room behind the bookshelves: interior x ∈ [-20, -17), z ∈ [-12, -9);
// its east wall (x = -17) holds a two-block door at z = -10.
export const SECRET = { x0: -20, x1: -17, z0: -12, z1: -9, door: -10 };

export const GARAGE = { x0: 11, x1: 20, z0: -12, z1: 3, door: { z0: -9, z1: -4 }, glassDoor: { z0: -3, z1: -1 } };
// The water stands just below the deck; the floor (`bed`) is deep enough to dive to.
export const POOL = { x0: -13, x1: 3, z0: 24, z1: 30, water: -0.22, bed: -3 };
// The pool ladder on the house side: its rails straddle x0..x1 and its rungs
// reach into the water to z.
export const POOL_LADDER = { x0: 0.35, x1: 1.1, z: POOL.z0 + 0.3 };
// Lamps low in the pool's house-side wall (x of each, at y below the surface).
export const POOL_LAMPS = { xs: [-10, -6, -2], y: -1.21 };
export const TERRACE = { x0: -21, x1: 25, z0: 17, z1: 21 };
export const DRIVEWAY = { x0: 25, x1: 38, z0: -10, z1: -3 };
export const ENTRANCE = { x0: -2, x1: 3 };
// The mailbox on the terrace, clear of the right front door's open leaf; its
// door faces the beach (yaw 0 = towards +z).
export const MAILBOX = { x: 5.0, z: 19.3, yaw: 0 };
// The portal to other worlds, on the lawn between the mailbox and the pool. It
// faces the house (yaw π; 0 would face the sea), so from the terrace you walk
// up to its face with the sea behind it, and visitors step out towards the house.
export const PORTAL = { x: 8.5, z: 25.5, yaw: Math.PI };

// A one-way door ring on the lawn east of the portal: step on it and the world
// switches to its single destination, like a hyperlink. Mirror the targets in
// homecraft.json's doors field so other worlds can draw the relationship.
export const DOORS = [
  { x: 14.5, z: 22, target: 'https://rsliyu.com/', name: 'rsliyu' },
];
// A two-block door in the garage's north wall, out to the back and the mountain.
export const BACKDOOR = { x0: 13, x1: 15 };

export const SPAWN = { x: 0.5, z: 5.8, heading: Math.PI };

// Each station is something in the house you can walk up to. `at` is where the
// player stands, `look` the point they turn to face; `name` is Chinese, `en` English.
export const STATIONS = [
  { id: 'works', name: '工作台', en: 'Workbench', at: [1.2, -8.3], look: [2.3, -10.95] },
  { id: 'writing', name: '主卧', en: 'Bedroom', at: [-8.2, -6.2], look: [-12, -9.65], floor: LOFT.y },
  // From the south end of the lounge rug: sofa, TV and fireplace stay in view.
  // Standing between the sofa and the table put the sofa back across the frame.
  { id: 'about', name: '关于我', en: 'About me', at: [1.0, -0.3], look: [1.0, -6] },
  { id: 'court', name: '球场', en: 'Court', at: [-12, RIM.z], look: [RIM.x, RIM.z] },
  { id: 'lab', name: '车库', en: 'Garage', at: [13.4, -1.2], look: [15.5, -6.5] },
  { id: 'coffee', name: '咖啡吧', en: 'Coffee bar', at: [8, 13.3], look: [8, 14.8] },
  { id: 'pool', name: '泳池', en: 'Pool', at: [-5, 22.6], look: [-5, 27] },
  // The foot of the mountain path at the north point. No page of its own: the
  // camera rises over the roof to show the whole mountain until a key is pressed.
  { id: 'mountain', name: '后山', en: 'Mountain', at: [5, -21.7], look: [5, -54], page: false,
    show: [[5, 40, 12], [5, 14, -47]], showPortrait: [[5, 68, 36], [5, 15, -49]] },
  // On the terrace; the phone's mail card opens it too.
  { id: 'mailbox', name: '留言', en: 'Mailbox', icon: 'mail', at: [MAILBOX.x, MAILBOX.z + 1.2], look: [MAILBOX.x, MAILBOX.z] },
  // In front of the portal: walk in, click it, or press F here, to visit other worlds.
  { id: 'portal', name: '传送门', en: 'Portal', icon: 'portal', at: [PORTAL.x + Math.sin(PORTAL.yaw) * 2.4, PORTAL.z + Math.cos(PORTAL.yaw) * 2.4], look: [PORTAL.x, PORTAL.z] },
];

const inside = (r, x, z) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;

export const inPool = (x, z) => inside(POOL, x, z);
export const inHouse = (x, z) => inside(HOUSE, x, z);
export const onLoft = (x, z) => inside(LOFT, x, z);
export const onStairs = (x, z) => inside(STAIRS, x, z);

// Floor height under (x, z): ground, the mezzanine, or the stair between them.
export function floorAt(x, z) {
  if (onLoft(x, z)) return LOFT.y;
  if (onStairs(x, z)) return Math.max(0, Math.min(LOFT.y, (STAIRS.z1 - z) * (LOFT.y / (STAIRS.z1 - STAIRS.z0))));
  return 0;
}

// The coastal woodland's trees, [x, z]: layered behind and beside the house,
// leaving an open beach and sea view in front.
export const FOREST = [
  // The rear trees beside the garage sit back far enough to clear the wall.
  [-30,-20],[-23,-18],[-16,-21],[-9,-18],[-2,-21],[9,-20],[12,-21],[19,-18],[26,-21],[32,-17],
  [-31,-12],[-26,-7],[-32,-8],[-26,7],[-31,14],[-26,20],[-31,27],[-25,31],
  [-29,-23],[35,14],[33,13],[28,20],[33,26],[27,31],
  // Three trees stand aside, clearing the way from the back door to the mountain path.
  // The tree behind the master suite stands back too, clear of its north glass.
  [-33,-4],[-34,20],[-13,-17],[22,-21],[-22,-23],[-18,-17],
];

// The baked lamp light covers the house (min corner, size in metres, texels).
export const LIGHT_VOLUME = { min: [-22, -1, -14], extent: [48, 12, 40], size: [48, 16, 40] };
// The weather's shelter map covers the island, the mountain and the pier.
export const SHELTER = { x0: -64, z0: -80, w: 128, d: 128 };
// Flying out of the house goes through the front doors.
export const DOORWAY = [{ x: 0.5, y: 1, z: 15 }, { x: 0.5, y: 1.2, z: 18 }];
export const EXIT = { x: 0.5, z: 18.6 };
// The opening shot starts high over the whole island (a portrait screen stands
// further back so the house and the mountain still fit) and looks at `look`.
export const INTRO = { pos: [52, 40, 66], portrait: [83, 64, 106], look: [0, 0, 2] };

// The cat stays indoors and naps on the sofa; the dog roams the terrace and
// comes in by the front door. Routes round the sofa and through the doorway
// are spelled out where string-pulling would cut a corner.
export const PETS = {
  cat: {
    anchors: [[5.8, 5.2], [1.85, -3.2], [1.2, -8.3], [8, 13.3], [12, 6.3]], home: [1.85, -3.2], within: inHouse,
    detour: (points, hub, x, z, valid) => !valid(points) && z < 0 ? [hub, { x: 1.85, z: hub.z }, { x: 1.85, z: z < -5 ? -6.8 : z }, { x, z }] : null,
  },
  dog: {
    anchors: [[7, 19.8], [12, 20], [18, 19.5], [-5, 20.3], [0.5, 13.5], [5.8, 5.2]],
    // Keep the wider dog clear of the terrace mailbox before entering the hall.
    detour: (points, hub, x, z, valid) => valid(points) ? null
      : [hub, { x: hub.x, z: 20.8 }, { x: inHouse(x, z) ? 0.5 : x, z: 20.8 }, ...(inHouse(x, z) ? [{ x: 0.5, z: 14 }] : []), { x, z }],
  },
};
