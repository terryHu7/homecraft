export const ISLAND = { x0: -56, x1: 31, z0: -28, z1: 32 };
// The estate's local +z (front) points east on the geographic map.
export const MAP_ROTATION = -Math.PI / 2;
export const POOL = { x0: -49, x1: -33, z0: 13, z1: 24, water: -0.71, bed: -3 };
export const REAR_EXTENSION = 2.2;
const HOUSE = { x0: -11, x1: 11, z0: -8.4 - REAR_EXTENSION, z1: 8.4, height: 10 };
const UPPER_START = 2.8;
const NADUMUTTAM = { x0: -6.35, x1: 6.35, z0: -4.1, z1: UPPER_START, floor: 0.28 };
const UPPER = { x0: 6.05, x1: 11, z0: UPPER_START, z1: 8.4, y: 3.82 };
const FIRST_FLOOR = { ...UPPER, x0: -10.9 };
const BALCONY = { x0: -2.55, x1: 2.55, z0: 6.5, z1: 11.8 };
const VERANDA = { x0: -2.95, x1: 2.95, z0: HOUSE.z1, z1: 12.05 };
export const JETTY = { x0: -1.38, x1: 1.38, z0: 25, z1: 39, y: 0.17 };
const OONJAL = { x: -9.03, y: 0.99, z: -3.65, heading: 0, standX: -9.03, standZ: -2.55 };
const SOFA = { x: -9.48, y: 0.98, z: 0.75, heading: 0, standX: -9.48, standZ: 1.8 };
const OFFICE = { x: 0, y: UPPER.y + 0.50, z: 4.43, heading: Math.PI, standX: 0, standZ: 5.35, floor: UPPER.y };
const BALCONY_CHAIRS = [-1.52, 1.52].map(x => ({
  x, y: UPPER.y + 0.46, z: 10.42, heading: 0, standX: x, standZ: 9.28, floor: UPPER.y,
}));
const TV = { x: SOFA.x, z: 5.59, heading: Math.PI, standZ: 4.48 };
// Replace these placeholders with photo URLs in display order.
export const LIVING_ROOM_PHOTOS = [null, null, null];
export const LIGHT_VOLUME = { min: [-19, -1, -16], extent: [38, 11, 59], size: [46, 17, 70] };
const STAIRS = { x0: 7.55, x1: 9.75, z0: -2.8, z1: UPPER.z0, steps: 20 };
export const SPAWN = { x: 0, z: 19, heading: Math.PI };
export const HOUSE_SCALE = 1.25;
export const BILLIARDS = { x: 1.15, z: -7.23 };
export const scaleHouseBounds = ({ x0, x1, z0, z1, ...rest }) => ({
  ...rest, x0: x0 * HOUSE_SCALE, x1: x1 * HOUSE_SCALE, z0: z0 * HOUSE_SCALE, z1: z1 * HOUSE_SCALE,
});
const scaleSeat = seat => ({
  ...seat, x: seat.x * HOUSE_SCALE, z: seat.z * HOUSE_SCALE,
  standX: seat.standX * HOUSE_SCALE, standZ: seat.standZ * HOUSE_SCALE,
});

// The model uses local drawing coordinates. Gameplay uses world coordinates.
export const housePlan = { HOUSE, NADUMUTTAM, VERANDA, FIRST_FLOOR, BALCONY, BALCONY_CHAIRS, OONJAL, SOFA, OFFICE, STAIRS, TV };
const houseBounds = scaleHouseBounds(HOUSE);
const courtyard = scaleHouseBounds(NADUMUTTAM);
const firstFloor = scaleHouseBounds(FIRST_FLOOR);
const balcony = scaleHouseBounds(BALCONY);
export const BALCONY_SEATS = BALCONY_CHAIRS.map(scaleSeat);
const oonjal = scaleSeat(OONJAL), sofa = scaleSeat(SOFA), office = scaleSeat(OFFICE);
export { houseBounds as HOUSE, courtyard as NADUMUTTAM, firstFloor as FIRST_FLOOR,
  balcony as BALCONY, oonjal as OONJAL, sofa as SOFA, office as OFFICE };
const upper = scaleHouseBounds(UPPER), stairs = scaleHouseBounds(STAIRS);
const tv = { ...TV, x: TV.x * HOUSE_SCALE, z: TV.z * HOUSE_SCALE, standZ: TV.standZ * HOUSE_SCALE };
export { upper as UPPER, stairs as STAIRS, tv as TV };
export const EXIT = { x: 0, z: (VERANDA.z1 + 1.1) * HOUSE_SCALE };
export const DOORWAY = [{ x: 0, y: 1, z: 5 * HOUSE_SCALE }, { ...EXIT, y: 1 }];
export const INTRO = { pos: [28, 19, 38], portrait: [25, 33, 52], look: [0, 2.3, 1] };

export function houseCutaway(player, camera, world) {
  const { x, z } = player.pos;
  const upper = player.y >= FIRST_FLOOR.y - 0.15;
  const front = (upper ? HOUSE.z1 - 0.14 : 6.15) * HOUSE_SCALE;
  const contains = bounds => x >= bounds.x0 && x < bounds.x1 && z >= bounds.z0 && z < bounds.z1;
  const inside = (z <= front && contains(houseBounds)) || (upper && contains(balcony));
  if (player.flying || player.island === 'house-roof' || !inside) return;
  if (player.y > FIRST_FLOOR.y + 1 && player.y >= world.roofTopAt(x, z) - 0.05) return;
  const back = (upper ? FIRST_FLOOR.z0 + 0.05 : -8.25 - REAR_EXTENSION) * HOUSE_SCALE;
  const side = 10.9 * HOUSE_SCALE;
  world.setHidden('roof', true);
  world.setHidden('wallS', camera.z > Math.max(z, front));
  world.setHidden('wallN', camera.z < Math.min(z, back));
  world.setHidden('wallE', camera.x > Math.max(x, side));
  world.setHidden('wallW', camera.x < Math.min(x, -side));
  return true;
}

const station = (id, en, icon, at, look, floor = 0.46) => ({ id, name: en, en, icon, at, look, floor });

export const STATIONS = [
  station('welcome', 'Welcome', 'blog', [0, 18], [0, 12 * HOUSE_SCALE], 0),
  station('hall', 'Nadumuttam', 'blog', [0, 4.4], [0, 0]),
  station('about', 'Living room', 'about', [-7.15, 4.3], [-7.15, 2.49]),
  station('oonjal', 'Teak oonjal', 'about', [OONJAL.standX, OONJAL.standZ], [OONJAL.x, OONJAL.z]),
  station('sofa', 'Teak sofa', 'about', [SOFA.standX, SOFA.standZ], [SOFA.x, SOFA.z]),
  station('tv', 'Television', 'blog', [TV.x, TV.standZ], [TV.x, TV.z]),
  station('skills', 'Office computer', 'monitor', [OFFICE.standX, OFFICE.standZ], [0, 3.32], UPPER.y),
  station('works', 'First-floor gallery', 'works', [8.55, 6.9], [8.55, 8.05], UPPER.y),
  station('library', 'Library', 'writing', [-0.95, -6.3 - REAR_EXTENSION], [0, -8.02 - REAR_EXTENSION]),
  station('personal', 'Bedroom', 'about', [-7.2, -6.3 - REAR_EXTENSION], [-7.5, -8.1 - REAR_EXTENSION]),
  station('contact', 'Backyard', 'mail', [0, -15], [0, -17], 0),
].map(station => station.floor === 0 ? station : {
  ...station, at: station.at.map(value => value * HOUSE_SCALE), look: station.look.map(value => value * HOUSE_SCALE),
});

export function floorAt(x, z) {
  x /= HOUSE_SCALE;
  z /= HOUSE_SCALE;
  if (x >= UPPER.x0 && x < 9.1 && z >= UPPER.z0 && z < UPPER.z1) return UPPER.y;
  if (x >= STAIRS.x0 && x < STAIRS.x1 && z >= STAIRS.z0 && z < STAIRS.z1) {
    const tread = Math.floor((z - STAIRS.z0) / (STAIRS.z1 - STAIRS.z0) * STAIRS.steps) + 1;
    return 0.46 + (UPPER.y - 0.46) * tread / STAIRS.steps;
  }
  if (x > NADUMUTTAM.x0 && x < NADUMUTTAM.x1 && z > NADUMUTTAM.z0 && z < NADUMUTTAM.z1) return NADUMUTTAM.floor;
  if (x >= HOUSE.x0 && x < HOUSE.x1 && z >= HOUSE.z0 && z < HOUSE.z1) return 0.46;
  if (x >= VERANDA.x0 && x < VERANDA.x1 && z >= VERANDA.z0 && z < VERANDA.z1) return 0.46;
  return 0;
}
