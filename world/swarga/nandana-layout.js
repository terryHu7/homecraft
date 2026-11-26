export const GARDEN = { x0: -43, x1: 43, z0: 32, z1: 97 };
export const CAUSEWAYS = [-17, 17];
export const LAKE = { x: 20, z: 62, rx: 14, rz: 12 };
export const TREE = { x: -12, z: 56 };
export const LOOKOUT = { x0: 20, x1: 34, z0: 83, z1: 92, height: 1.7 };
export const LOOKOUT_STAIRS = { x0: 24, x1: 30, z0: 78, tread: .5, count: 10 };

export function gardenFloorAt(x, z) {
  const { x0, x1, z0, z1, height } = LOOKOUT;
  if (x >= x0 && x < x1 && z >= z0 && z < z1) return height;
  const stairs = LOOKOUT_STAIRS;
  if (x >= stairs.x0 && x < stairs.x1 && z >= stairs.z0 && z < z0) {
    return height * (1 + Math.floor((z - stairs.z0) / stairs.tread)) / stairs.count;
  }
  return 0;
}
