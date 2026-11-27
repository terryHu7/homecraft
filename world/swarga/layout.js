import { gardenFloorAt } from './nandana-layout.js';

export const CORE_ISLAND = { x0: -30, x1: 30, z0: -25, z1: 25 };
export const ISLAND = { x0: -62, x1: 71, z0: -25, z1: 102 };
export const DANCE_HALL = { x: 50, x0: 34, x1: 66, z0: -14, z1: 14, floor: 1 };
export const DANCE_BRIDGE = { x0: 29, x1: 34, z0: 15, z1: 22 };
export const DANCE_FLOOR = { x0: 40, x1: 60, z0: -6, z1: 6, y: 1.34 };
export const MUSIC_PLATFORM = { x0: 42, x1: 58, z0: -13, z1: -8, y: 1.34 };
export const DANCE_STAIRS = { x0: 44, x1: 56, z0: 14, count: 6, tread: 0.5 };
export const SPAWN = { x: 0, z: 19, heading: Math.PI };
export const INTRO = { pos: [31, 18, 41], portrait: [30, 24, 51], look: [0, 3, -3] };
export const HOUSE = { x0: -12, x1: 12, z0: -21, z1: -3, height: 11 };
export const EXIT = { x: 0, z: -1 };
export const DOORWAY = [{ ...EXIT, y: 2 }];
export const LIGHT_VOLUME = { min: [-44, 0, -23], extent: [114, 13, 117], size: [182, 22, 187] };

export const STAIRS = { x0: -3, x1: 3, z0: -1, count: 6, tread: 0.5 };
export const DAIS = { x0: -3, x1: 3, z0: -20, z1: -14 };
export const DAIS_STEP = 0.17;

export function floorAt(x, z) {
  if (x >= DANCE_FLOOR.x0 && x < DANCE_FLOOR.x1 && z >= DANCE_FLOOR.z0 && z < DANCE_FLOOR.z1) return DANCE_FLOOR.y;
  if (x >= MUSIC_PLATFORM.x0 && x < MUSIC_PLATFORM.x1 && z >= MUSIC_PLATFORM.z0 && z < MUSIC_PLATFORM.z1) return MUSIC_PLATFORM.y;
  if (x >= DANCE_HALL.x0 && x < DANCE_HALL.x1 && z >= DANCE_HALL.z0 && z < DANCE_HALL.z1) return DANCE_HALL.floor;
  if (x >= DANCE_STAIRS.x0 && x < DANCE_STAIRS.x1 && z >= DANCE_STAIRS.z0 &&
      z < DANCE_STAIRS.z0 + DANCE_STAIRS.count * DANCE_STAIRS.tread) {
    return 1 - Math.floor((z - DANCE_STAIRS.z0) / DANCE_STAIRS.tread) / DANCE_STAIRS.count;
  }
  if (x >= DAIS.x0 && x < DAIS.x1 && z >= DAIS.z0 && z < DAIS.z1) {
    const step = Math.min(3, Math.ceil((DAIS.z1 - z) / 0.5));
    return 1 + step * DAIS_STEP;
  }
  if (x >= -14 && x < 14 && z >= -23 && z < STAIRS.z0) return 1;
  if (x >= STAIRS.x0 && x < STAIRS.x1 && z >= STAIRS.z0 && z < STAIRS.z0 + STAIRS.count * STAIRS.tread) {
    return (STAIRS.count - Math.floor((z - STAIRS.z0) / STAIRS.tread)) / STAIRS.count;
  }
  return gardenFloorAt(x, z);
}

const station = (id, name, icon, at, look, floor, description) =>
  ({ id, name, en: name, icon, at, look, floor, description });

export const STATIONS = [
  station('gateway', 'Gateway', 'portal', [0, 15], [0, 13], 0, 'The stepped gateway opens onto the palace approach.'),
  station('sudharma', 'Sudharma Sabha', 'about', [0, -7], [0, -10], 1, "Sudharma Sabha is Indra's assembly hall in Swarga."),
  station('throne-dais', 'Throne dais', 'about', [0, -15.75], [0, -18.1], 1 + 3 * DAIS_STEP, 'Indra receives an attendant at the golden throne on the raised dais.'),
  station('lotus-courtyard', 'Lotus courtyard', 'blog', [0, 9.9], [0, 7], 0, 'A lotus pool sits in the open courtyard between the gateway and the hall.'),
  station('airavata', 'Airavata', 'eye', [5.5, 8], [5.5, 5.8], 0, "Airavata is Indra's white elephant mount."),
  station('apsara-hall', 'Apsara Nritya Mandapam', 'portal', [50, 10.5], [50, 1], DANCE_HALL.floor, 'A pavilion for celestial music and dance in this Swarga scene.'),
  station('rambha', 'Rambha', 'about', [44, 2.2], [44, .2], DANCE_FLOOR.y, 'Rambha is an apsara in Hindu tradition.'),
  station('urvashi', 'Urvashi', 'about', [48, 1], [48, -1.1], DANCE_FLOOR.y, 'Urvashi is an apsara in Hindu tradition.'),
  station('menaka', 'Menaka', 'about', [52, 1], [52, -1.1], DANCE_FLOOR.y, 'Menaka is an apsara in Hindu tradition.'),
  station('tilottama', 'Tilottama', 'about', [56, 2.2], [56, .2], DANCE_FLOOR.y, 'Tilottama is an apsara in Hindu tradition.'),
  station('gandharva-musicians', 'Gandharva musicians', 'blog', [50, -7], [50, -10.65], DANCE_HALL.floor, 'Gandharvas are associated with celestial music in Hindu tradition. This ensemble features veena, flute, and mridangam.'),
  station('nandana-entrance', 'Nandana Vana', 'portal', [-16.5, 34], [-16.5, 37], 0, 'Nandana Vana is a celestial garden associated with Indra in Hindu tradition.'),
  station('kalpavriksha', 'Kalpavriksha', 'about', [-12, 49], [-12, 55], 0, 'Kalpavriksha is traditionally described in Hindu mythology as a wish-fulfilling celestial tree.'),
  station('lotus-lake', 'Lotus Lake', 'eye', [20, 61], [24.5, 63], 0, 'A marble crossing overlooks flowering lotuses and swans.'),
  station('celestial-waterfalls', 'Celestial Waterfalls', 'eye', [-3.5, 79], [-6, 87], 0, 'Two cascades descend from marble terraces into the garden pools.'),
  station('lotus-pavilion', 'Lotus Pavilion', 'blog', [20, 47.5], [20, 50], 0, 'The lotus-roofed pavilion looks across the lake.'),
  station('garden-mandapam', 'Golden Garden Mandapam', 'portal', [-31, 50], [-31, 53], 0, 'An open pavilion with gilded columns, arches, and marble seating.'),
  station('viewing-pavilion', 'Celestial Viewing Pavilion', 'eye', [27, 85.2], [27, 87.7], 1.7, 'An elevated terrace offers a view of the garden and the palace beyond.'),
  {...station('return-gate','Return to Earth','portal',[0,25.8],[0,29],3,'Return to the house.'), page:false},
];

export const AIRAVATA_TUSKS = 4; // TODO(aswin): Confirm whether to keep four tusks.
export const AIRAVATA_PATH = [
  [0, 24, 9], [14, 26, 6], [29, 25, -4], [27, 29, -22],
  [7, 33, -31], [-17, 28, -25], [-31, 24, -10], [-23, 25, 11], [-9, 25, 13],
];
