import * as T from 'three';
import { BILLIARDS, housePlan, HOUSE_SCALE, REAR_EXTENSION, JETTY, LIVING_ROOM_PHOTOS, scaleHouseBounds } from './layout.js';

const { HOUSE, NADUMUTTAM, VERANDA, BALCONY, BALCONY_CHAIRS, FIRST_FLOOR, OFFICE, OONJAL, SOFA, STAIRS, TV } = housePlan;

const random = (() => {
  let seed = 83;
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
})();
const material = (color, roughness = 0.8, extra = {}) => new T.MeshStandardMaterial({ color, roughness, ...extra });

function texture(paint) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  paint(canvas.getContext('2d'));
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

export function buildTharavadu(scene) {
  const house = new T.Group(), roof = new T.Group(), grounds = new T.Group();
  const obstacles = [], doors = [];
  scene.add(grounds, house, roof);
  function block(x, z, width, depth, level = 0) {
    obstacles.push({ x0: x - width / 2, x1: x + width / 2,
      z0: z - depth / 2, z1: z + depth / 2, level });
  }
  const plaster = material('#ffffff', 0.94);
  const teak = material('#74482c', 0.43, { map: texture(ctx => {
    ctx.fillStyle = '#ac805a'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 440; i++) {
      const x = random() * 256;
      ctx.strokeStyle = i % 3 ? '#49271338' : '#ffd39b36';
      ctx.beginPath(); ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 8, 70, x - 8, 160, x + 1, 256); ctx.stroke();
    }
  }) });
  const darkWood = material('#342017', 0.62);
  const stone = material('#675e50');
  const floor = material('#a47954');
  const soil = material('#60432b');
  const brass = material('#a27a32', 0.35, { metalness: 0.6 });
  const clay = material('#ffffff', 0.92);
  const leaf = material('#ffffff', 0.7, { side: T.DoubleSide });
  const unitBox = new T.BoxGeometry();
  function mesh(parent, geometry, mat, x, y, z) {
    const obj = new T.Mesh(geometry, mat);
    obj.position.set(x, y, z);
    obj.castShadow = obj.receiveShadow = true;
    parent.add(obj);
    return obj;
  }
  function box(parent, mat, x, y, z, w, h, d) {
    const obj = mesh(parent, unitBox, mat, x, y, z);
    obj.scale.set(w, h, d);
    return obj;
  }
  function beam(parent, mat, a, b, width, depth = width) {
    const delta = b.clone().sub(a);
    const centre = a.clone().lerp(b, 0.5);
    const obj = box(parent, mat, centre.x, centre.y, centre.z, width, delta.length(), depth);
    obj.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
  }
  function instance(parent, geometry, mat, items) {
    const batch = new T.InstancedMesh(geometry, mat, items.length);
    const object = new T.Object3D();
    items.forEach(([x, y, z, sx, sy, sz, rx, ry, rz, color], i) => {
      object.position.set(x, y, z);
      object.scale.set(sx, sy, sz);
      object.rotation.set(rx, ry, rz, 'YXZ');
      object.updateMatrix();
      batch.setMatrixAt(i, object.matrix);
      if (color) batch.setColorAt(i, new T.Color(color));
    });
    batch.castShadow = batch.receiveShadow = true;
    parent.add(batch);
  }

  const court = NADUMUTTAM;
  const courtWidth = court.x1 - court.x0, courtDepth = court.z1 - court.z0;
  const courtZ = (court.z0 + court.z1) / 2;
  const wings = [
    [HOUSE.x0, HOUSE.x1, court.z1, HOUSE.z1],
    [HOUSE.x0, HOUSE.x1, HOUSE.z0, court.z0],
    [HOUSE.x0, court.x0, court.z0, court.z1],
    [court.x1, HOUSE.x1, court.z0, court.z1],
    [VERANDA.x0, VERANDA.x1, VERANDA.z0, VERANDA.z1],
  ];
  for (const [x0, x1, z0, z1] of wings) {
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
    box(house, stone, x, 0.21, z, x1 - x0, 0.42, z1 - z0);
    box(house, floor, x, 0.435, z, x1 - x0, 0.05, z1 - z0);
  }
  box(house, stone, 0, 0.13, courtZ, courtWidth, 0.26, courtDepth);
  const slabs = [];
  for (let x = court.x0 + 0.295; x <= court.x1 - 0.287; x += 0.59) for (let z = court.z0 + 0.265; z <= court.z1 - 0.256; z += 0.53) {
    slabs.push([x, 0.263, z, 0.574, 0.029, 0.512, 0, 0, 0, ['#999080', '#81786a', '#a39784'][Math.floor(random() * 3)]]);
  }
  box(house, stone, 0, 0.29, 0, 2.7, 0.20, 1.8);
  box(house, soil, 0, 0.4, 0, 2.53, 0.04, 1.63);

  function addDoor(x, z, floor, width, height, inward, double = false, parent = house) {
    const leaves = [];
    const leafWidth = width / (double ? 2 : 1);
    for (const side of double ? [1, -1] : [1]) {
      const hinge = new T.Group();
      hinge.userData.doorHinge = true;
      hinge.position.set(x - side * width / 2, floor, z);
      parent.add(hinge);
      const centre = side * leafWidth / 2;
      box(hinge, darkWood, centre, height / 2, 0, leafWidth - 0.018, height, 0.11);
      for (const fraction of [0.22, 0.62, 0.87]) {
        box(hinge, teak, centre, height * fraction, 0, leafWidth - 0.15, height * 0.17, 0.14);
      }
      const handle = side * (leafWidth - 0.13);
      box(hinge, brass, handle, 1.05, 0, 0.08, 0.10, 0.19);
      leaves.push({ hinge, openAngle: -side * inward * Math.PI / 2 });
    }
    const level = floor > 2 ? 1 : 0;
    doors.push({
      id: 'house-door-' + doors.length, at: [x * HOUSE_SCALE, z * HOUSE_SCALE], floor, leaves,
      obstacle: scaleHouseBounds({ x0: x - width / 2, x1: x + width / 2, z0: z - 0.09, z1: z + 0.09, level }),
      open: false,
    });
  }

  const cameraWalls = Object.fromEntries(['wallS', 'wallN', 'wallW', 'wallE'].map(name => {
    const group = new T.Group();
    group.userData.group = name;
    return [name, group];
  }));
  const laterite = new Map();
  const cameraBarriers = [];
  function cameraBarrier(x, y, z, w, h, d) {
    cameraBarriers.push(new T.Box3(
      new T.Vector3((x - w / 2) * HOUSE_SCALE, y - h / 2, (z - d / 2) * HOUSE_SCALE),
      new T.Vector3((x + w / 2) * HOUSE_SCALE, y + h / 2, (z + d / 2) * HOUSE_SCALE),
    ));
  }
  function wall(x, z, length, turn, openings = [], inward = -1, thickness = 0.28, parent = house) {
    if (!laterite.has(parent)) laterite.set(parent, []);
    const stones = laterite.get(parent);
    const base = 0.46, top = 3.55;
    function section(start, end, low, high, mat = plaster, depth = thickness) {
      if (end <= start || high <= low) return;
      const offset = (start + end) / 2;
      const obj = box(parent, mat, x + Math.cos(turn) * offset, (high + low) / 2,
        z - Math.sin(turn) * offset, end - start, high - low, depth);
      obj.rotation.y = turn;
      const alongX = Math.abs(Math.cos(turn)) > 0.5;
      if (parent === house && mat === plaster) {
        cameraBarrier(obj.position.x, obj.position.y, obj.position.z,
          alongX ? end - start : depth, high - low, alongX ? depth : end - start);
      }
      if (low < 1.4 && mat === plaster) {
        block(obj.position.x, obj.position.z, alongX ? end - start : depth, alongX ? depth : end - start);
      }
    }
    function masonry(start, end, high = 1.07) {
      for (let row = 0; row < 3; row++) {
        let left = start;
        while (left < end - 0.02) {
          const right = Math.min(end, left + 0.32 + random() * 0.24);
          const mid = (left + right) / 2;
          stones.push([x + mid * Math.cos(turn), base + row * (high - base) / 3 + (high - base) / 6,
            z - mid * Math.sin(turn), right - left - 0.012, (high - base) / 3 - 0.012,
            thickness + 0.013, 0, turn, 0, '#ffffff']);
          left = right;
        }
      }
    }
    let cursor = -length / 2;
    for (const [offset, width, kind] of openings) {
      const left = offset - width / 2, right = offset + width / 2;
      section(cursor, left, base, top);
      masonry(cursor, left);
      const sill = kind === 'window' ? 1.26 : base;
      const lintel = kind === 'window' ? 2.7 : 2.85;
      section(left, right, lintel, top);
      section(left, right, base, sill);
      if (sill > base) masonry(left, right);
      if (kind === 'window') {
        section(left - 0.06, right + 0.06, sill - 0.09, sill + 0.03, teak, 0.42);
        section(left, right, lintel - 0.10, lintel, teak, 0.38);
        section(left, right, sill + 0.05, lintel - 0.10, darkWood, 0.065);
        for (let i = 0; i <= 7; i++) {
          const bar = left + i * width / 7;
          section(bar - 0.035, bar + 0.035, sill, lintel, teak, 0.34);
        }
        section(left, right, 1.91, 2.01, teak, 0.34);
        section(left, left + width * 0.22, sill, lintel, teak, 0.29);
        section(right - width * 0.22, right, sill, lintel, teak, 0.29);
      } else if (kind === 'door' || kind === 'double-door') {
        section(left, left + 0.11, sill, lintel, teak, 0.36);
        section(right - 0.11, right, sill, lintel, teak, 0.36);
        section(left, right, lintel - 0.12, lintel, teak, 0.36);
        addDoor(x + offset * Math.cos(turn), z - offset * Math.sin(turn), sill,
          width - 0.22, lintel - sill - 0.12, inward, kind === 'double-door', parent);
      }
      cursor = right;
    }
    section(cursor, length / 2, base, top);
    masonry(cursor, length / 2);
  }
  wall(0, 6.15, 22, 0, [[-7, 1.7, 'window'], [0, 1.95, 'double-door'], [8.4, 1.55, 'window']], -1, 0.28, cameraWalls.wallS);
  wall(0, -8.25 - REAR_EXTENSION, 22, 0, [[-7.5, 1.9, 'window'], [0, 1.75, 'window'], [6.3, 1.45, 'door'], [9.1, 1.45, 'window']], 1, 0.28, cameraWalls.wallN);
  for (const x of [-10.9, 10.9]) wall(x, -1.05 - REAR_EXTENSION / 2, 14.4 + REAR_EXTENSION, Math.PI / 2,
    [[-4.5 - REAR_EXTENSION / 2, 1.7, 'window'], [4.5 + REAR_EXTENSION / 2, 1.7, 'window']],
    -1, 0.28, x < 0 ? cameraWalls.wallW : cameraWalls.wallE);
  wall(0, -4.4, 22, 0, [[-7.25, 1.3, 'door'], [0, 7.1, 'opening'], [7.25, 1.95, 'door']]);
  buildKitchen();
  furnishLibrary();
  const libraryPaintingFrames = hangHousePaintings();
  const mirror = buildDiningTable();
  for (const x of [-3.7, 3.7]) wall(x, -6.32 - REAR_EXTENSION / 2, 3.85 + REAR_EXTENSION, Math.PI / 2);
  const photoFrames = [];
  const tvDisplay = furnishLivingRoom();
  const studyLamp = buildStudyNook();
  hangDiningArt();
  for (const x of [-2.2, -0.73, 0.73, 2.2]) box(house, teak, x, 1.73, -8.02 - REAR_EXTENSION, 0.055, 2.52, 0.4);
  for (const y of [0.53, 1.06, 1.59, 2.12, 2.96]) box(house, teak, 0, y, -8.02 - REAR_EXTENSION, 4.42, 0.07, 0.4);
  const masonryMaterial = material('#ffffff');
  for (const [parent, stones] of laterite) instance(parent, unitBox, masonryMaterial, stones);

  function pillar(x, z) {
    block(x, z, 0.48, 0.48);
    box(house, stone, x, 0.57, z, 0.48, 0.22, 0.48);
    const profile = [[0.22,0],[0.22,0.12],[0.16,0.17],[0.19,0.24],[0.13,0.32],[0.125,0.43],
      [0.143,1.25],[0.12,2.12],[0.17,2.23],[0.14,2.28],[0.21,2.38],[0.21,2.52]];
    mesh(house, new T.LatheGeometry(profile.map(([r,y]) => new T.Vector2(r,y)), 12), teak, x, 0.68, z);
    for (const y of [0.67, 0.76, 3.04, 3.15]) box(house, darkWood, x, y, z, 0.36, 0.065, 0.36);
    box(house, teak, x, 3.28, z, 0.66, 0.21, 0.36);
  }
  for (const x of [-10.25, -7.2, -4.1, -1.65, 1.65, 4.5, 10.3]) pillar(x, 8.15);
  for (const x of [court.x0, court.x1]) for (const z of [court.z0, court.z1]) pillar(x, z);
  pillar(0, court.z1);
  for (const x of [court.x0, court.x1]) pillar(x, 0);
  for (const [x,z,w,d] of [[0,8.15,21.3,0.23],[0,court.z0,courtWidth + 0.35,0.22],[0,court.z1,courtWidth + 0.35,0.22],[court.x0,courtZ,0.22,courtDepth],[court.x1,courtZ,0.22,courtDepth]]) {
    box(house, teak, x, 3.47, z, w, 0.23, d);
  }
  // Timber rails wrap the sit-out, with a central opening at the entrance steps.
  for (const side of [-1, 1]) {
    const edge = side * (VERANDA.x1 - 0.12);
    const front = VERANDA.z1 - 0.12;
    const opening = 1.78;
    const railWidth = Math.abs(edge) - opening;
    const railX = side * (opening + railWidth / 2);
    for (const height of [0.6, 1.27]) {
      box(house, darkWood, railX, height, front, railWidth, 0.12, 0.14);
      box(house, darkWood, edge, height, (VERANDA.z0 + front) / 2, 0.14, 0.12, front - VERANDA.z0);
    }
    for (let x = opening + 0.12; x < Math.abs(edge); x += 0.25) box(house, teak, side * x, 0.88, front, 0.085, 0.74, 0.085);
    for (let z = VERANDA.z0 + 0.16; z < front; z += 0.32) box(house, teak, edge, 0.88, z, 0.085, 0.74, 0.085);
    block(railX, front, railWidth, 0.14);
    block(edge, (VERANDA.z0 + front) / 2, 0.14, front - VERANDA.z0);
    pillar(edge, front);
  }
  for (let i = 0; i < 3; i++) box(house, stone, 0, (0.15 + i * 0.145) / 2, VERANDA.z1 + 0.91 - i * 0.32, 3.5, 0.15 + i * 0.145, 0.39);

  // Each side has an outer fall and an inner fall. The inner eaves stop short
  // of the centre, leaving the entire Nadumuttam opening clear.
  const roofTiles = [];
  const shelterSurfaces = [], shedRoof = [];
  const roofOpening = { x0: -12.3, x1: 12.3, z0: FIRST_FLOOR.z0, z1: 9.7 };
  const cuts = [['x', roofOpening.x0, 1], ['x', roofOpening.x1, -1],
    ['z', roofOpening.z0, 1], ['z', roofOpening.z1, -1]];
  const courtyardCuts = [['x', court.x0, 1], ['x', court.x1, -1], ['z', court.z0, 1], ['z', court.z1, -1]];
  const inOpening = (point, opening) => opening.every(([axis, edge, sign]) => (point[axis] - edge) * sign >= 0);
  function clip(points, [axis, edge, sign], keepInside) {
    const kept = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const da = (a[axis] - edge) * sign, db = (b[axis] - edge) * sign;
      const keepA = keepInside ? da >= 0 : da <= 0;
      const keepB = keepInside ? db >= 0 : db <= 0;
      if (keepA) kept.push(a);
      if (keepA !== keepB) kept.push(a.clone().lerp(b, da / (da - db)));
    }
    return kept;
  }
  function roofBeam(a, b, mat, width, depth, opening) {
    const breaks = [0, 1];
    if (opening) for (const [axis, edge] of opening) {
      const t = (edge - a[axis]) / (b[axis] - a[axis]);
      if (t > 0 && t < 1) breaks.push(t);
    }
    breaks.sort((left, right) => left - right);
    for (let i = 1; i < breaks.length; i++) {
      const t0 = breaks[i - 1], t1 = breaks[i];
      if (t1 - t0 < 0.0001 || (opening && inOpening(a.clone().lerp(b, (t0 + t1) / 2), opening))) continue;
      beam(roof, mat, a.clone().lerp(b, t0), a.clone().lerp(b, t1), width, depth);
    }
  }
  function slope(turn, lowerSpan, lowerRun, upperSpan, upperRun, low, high, centre = null, opening = centre ? courtyardCuts : cuts) {
    const extendRear = !centre;
    const rearStretch = 1 + REAR_EXTENSION / 5.4;
    const point = (u, y, r) => {
      const z = (centre?.z ?? 0) + r * Math.cos(turn) - u * Math.sin(turn);
      return new T.Vector3((centre?.x ?? 0) + u * Math.cos(turn) + r * Math.sin(turn), y,
        extendRear && z < court.z0 ? court.z0 + (z - court.z0) * rearStretch : z);
    };
    const a = point(-lowerSpan, low, lowerRun), b = point(lowerSpan, low, lowerRun);
    const c = point(upperSpan, high, upperRun), d = point(-upperSpan, high, upperRun);
    const backing = new T.BufferGeometry();
    const positions = [];
    let remainder = [a, b, c, d];
    function triangulate(polygon) {
      for (let i = 1; i + 1 < polygon.length; i++) positions.push(...polygon[0], ...polygon[i], ...polygon[i + 1]);
    }
    if (opening) {
      for (const edge of opening) {
        triangulate(clip(remainder, edge, false));
        remainder = clip(remainder, edge, true);
      }
    } else triangulate(remainder);
    backing.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    backing.computeVertexNormals();
    shelterSurfaces.push(mesh(roof, backing, material('#613d2e', 0.98, { side: T.DoubleSide }), 0, 0, 0));
    roofBeam(a, b, darkWood, 0.16, 0.22, opening);
    const incline = Math.atan2(high - low, lowerRun - upperRun);
    const pitch = lowerRun > upperRun ? incline : incline + Math.PI;
    const run = Math.hypot(high - low, lowerRun - upperRun);
    const rows = Math.ceil(run / 0.28);
    for (let row = 0; row < rows; row++) {
      const t = (row + 0.52) / rows;
      const span = T.MathUtils.lerp(lowerSpan, upperSpan, t);
      const columns = Math.ceil(span * 2 / 0.23);
      const width = span * 2 / columns;
      for (let col = 0; col < columns; col++) {
        const p = point(-span + (col + 0.5) * width,
          T.MathUtils.lerp(low, high, t) + 0.035, T.MathUtils.lerp(lowerRun, upperRun, t));
        if (opening && inOpening(p, opening)) continue;
        const stretch = extendRear && p.z < court.z0 ? rearStretch : 1;
        const side = Math.abs(Math.sin(turn)) > 0.5;
        const tilePitch = side ? pitch : Math.atan2(Math.sin(pitch), Math.cos(pitch) * stretch);
        const tileDepth = side ? 1 : Math.hypot(Math.sin(pitch), Math.cos(pitch) * stretch);
        roofTiles.push([p.x,p.y,p.z,width * (side ? stretch : 1),0.045,run / rows * 1.12 * tileDepth,tilePitch,turn,0,
          ['#80432d','#975036','#713e31','#a05738','#864632'][Math.floor(random()*5)]]);
      }
    }
    for (let i = -0.95; i <= 1; i += 0.095) {
      roofBeam(point(i * lowerSpan, low - 0.11, lowerRun), point(i * upperSpan, high - 0.13, upperRun), teak, 0.09, 0.09, opening);
    }
    roofBeam(point(-upperSpan, high + 0.08, upperRun), point(upperSpan, high + 0.08, upperRun), opening ? clay : darkWood, 0.18, 0.18, opening);
  }
  const porchRoof = { x: 0, z: (VERANDA.z0 + VERANDA.z1) / 2 };
  const porchRun = (VERANDA.z1 - VERANDA.z0) / 2 + 0.30;
  const porchSpan = VERANDA.x1 + 0.33;
  for (let side = 0; side < 4; side++) {
    const long = side % 2 === 0;
    slope(side * Math.PI / 2, long ? porchSpan : porchRun, long ? porchRun : porchSpan,
      long ? 2.0 : 0.18, long ? 0.18 : 2.0, 3.30, 3.62, porchRoof);
  }
  buildUpperGallery();
  furnishOffice();
  furnishBalcony();
  for (let side = 0; side < 4; side++) {
    const turn = side * Math.PI / 2, long = side % 2 === 0;
    slope(turn, long ? 12.2 : 9.55, long ? 9.55 : 12.2,
      long ? 8 : 6.1, long ? 6.1 : 8, 3.38, 5.96);
    slope(turn, long ? 6.25 : 4.0, long ? 4.0 : 6.25,
      long ? 8 : 6.1, long ? 6.1 : 8, 3.37, 5.96);
  }
  const tileShape = new T.Shape();
  tileShape.moveTo(-0.5, 0); tileShape.lineTo(-0.5, 0.13);
  tileShape.quadraticCurveTo(-0.29, 1.1, 0.02, 0.76);
  tileShape.quadraticCurveTo(0.31, 0.1, 0.5, 0.19);
  tileShape.lineTo(0.5, 0); tileShape.closePath();
  const tileGeometry = new T.ExtrudeGeometry(tileShape, { depth: 1, bevelEnabled: false, curveSegments: 3 });
  tileGeometry.translate(0, 0, -0.5);
  instance(roof, tileGeometry, clay, roofTiles);

  instance(house, unitBox, material('#ffffff'), slabs);
  buildGrounds();
  const houseObstacles = obstacles.splice(0).map(scaleHouseBounds);
  const updateGrazing = buildCattleShed();
  const boat = buildJetty();
  boat.updateMatrixWorld(true);
  for (const group of [grounds, house, roof, ...Object.values(cameraWalls)]) {
    group.updateMatrixWorld(true);
    const batches = new Map();
    group.traverse(object => {
      if (!object.isMesh || object.geometry !== unitBox || object.isInstancedMesh || object.parent.userData.doorHinge) return;
      const batch = batches.get(object.material) || [];
      batch.push(object);
      batches.set(object.material, batch);
    });
    for (const [mat, objects] of batches) {
      if (objects.length < 2) continue;
      const batch = new T.InstancedMesh(unitBox, mat, objects.length);
      objects.forEach((object, index) => {
        batch.setMatrixAt(index, object.matrixWorld);
        object.removeFromParent();
      });
      batch.castShadow = batch.receiveShadow = true;
      group.add(batch);
    }
  }
  house.scale.set(HOUSE_SCALE, 1, HOUSE_SCALE);
  for (const wall of Object.values(cameraWalls)) wall.scale.copy(house.scale);
  roof.scale.copy(house.scale);
  roof.updateMatrixWorld(true);
  const shelterRay = new T.Raycaster(new T.Vector3(), new T.Vector3(0, -1, 0), 0, 16);
  const shelterHits = [];
  function traceRoof(x, z) {
    shelterHits.length = 0;
    if (Math.abs(x) > 12.4 * HOUSE_SCALE || z < -12 * HOUSE_SCALE || z > 13 * HOUSE_SCALE) return;
    shelterRay.ray.origin.set(x, 14, z);
    shelterRay.intersectObjects(shelterSurfaces, false, shelterHits);
  }
  function sampleRoof(x, z) {
    traceRoof(x, z);
    return shelterHits.length ? shelterHits[0].point.y + 0.075 : -Infinity;
  }
  function lanternCeiling(x, z, y) {
    const deck = FIRST_FLOOR;
    const lz = z / HOUSE_SCALE, lx = x / HOUSE_SCALE;
    const overhang = lx >= BALCONY.x0 && lx <= BALCONY.x1 && lz >= deck.z1 && lz <= BALCONY.z1;
    if (y < deck.y - 0.5 && (overhang ||
        (lx >= deck.x0 && lx <= deck.x1 && lz >= deck.z0 && lz < deck.z1))) return deck.y - 0.485;
    traceRoof(x, z);
    for (let i = shelterHits.length - 1; i >= 0; i--) {
      const height = shelterHits[i].point.y;
      if (height > y + 0.24) return height;
    }
    return null;
  }
  return { roof, house, grounds, cameraWalls: Object.values(cameraWalls), cameraBarriers, doors, shelterSurfaces, shedRoof, obstacles: [...houseObstacles, ...obstacles], updateGrazing, boat, tvDisplay, mirror, studyLamp, sampleRoof, lanternCeiling, photoFrames, libraryPaintingFrames };

  function buildGrounds() {
    const path = [];
    for (let z = (VERANDA.z1 + 1.14) * HOUSE_SCALE; z < JETTY.z0; z += 0.57) {
      for (const x of [-0.93,-0.31,0.31,0.93]) {
        path.push([x,0.024,z,0.59,0.045,0.54,0,(random()-0.5)*0.035,0,random()<0.5?'#786f61':'#a09783']);
      }
    }
    instance(grounds, unitBox, material('#ffffff'), path);

    const stem = material('#736349');
    const foliage = [], flowers = [], coconuts = [];
    const green = ['#426520','#547d2a','#6e953a','#819b3d','#31531f'];
    const blade = new T.BufferGeometry();
    const vertices = [], indices = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, width = Math.sin(t*Math.PI)**0.82 * 0.5;
      vertices.push(-width, Math.sin(t*Math.PI)*0.20-t*t*0.23,t, 0,Math.sin(t*Math.PI)*0.23-t*t*0.23,t,
        width,Math.sin(t*Math.PI)*0.20-t*t*0.23,t);
      if (i) for (let j=0;j<2;j++) {
        const a=(i-1)*3+j, b=i*3+j;
        indices.push(a,b,b+1,a,b+1,a+1);
      }
    }
    blade.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    blade.setIndex(indices); blade.computeVertexNormals();
    function crown(x,y,z,count,length,width,colorOffset=0) {
      for (let i=0;i<count;i++) {
        const turn = i * 2.39996;
        foliage.push([x,y,z,width*(0.75+random()*0.5),length,length*(0.68+random()*0.45),
          -0.64+random()*0.86,turn,0,green[(i+colorOffset)%green.length]]);
      }
    }
    function palm(x,z,h,lean,areca=false) {
      const radius=areca?0.095:0.19;
      const trunk = new T.CylinderGeometry(radius*0.67,radius,h/14+0.024,9);
      let start = new T.Vector3(x,0,z);
      for(let i=1;i<=14;i++) {
        const t=i/14, end = new T.Vector3(x+lean*t*t,h*t,z+0.4*t*t);
        const centre = start.clone().lerp(end,0.5);
        const section=mesh(grounds,trunk,i%3===0?darkWood:stem,centre.x,centre.y,centre.z);
        section.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),end.clone().sub(start).normalize());
        start=end;
      }
      if (areca) crown(start.x,h,start.z,12,2.1,0.33,2);
      else {
        for (let i = 0; i < 16; i++) {
          const turn = i * 2.39996 + (random() - 0.5) * 0.36;
          const size = 2.8 + random() * 1.25, lift = 0.58 + random() * 0.97;
          const droop = 0.72 + random() * 1.08;
          const frond = t => new T.Vector3(start.x + Math.sin(turn) * size * t,
            h + Math.sin(t * Math.PI) * lift - t * t * droop, start.z + Math.cos(turn) * size * t);
          let previous = start;
          for (let p = 1; p <= 16; p++) {
            const t = p / 16, at = frond(t);
            if (p % 4 === 0) {
              beam(grounds, stem, previous, at, 0.034 - t * 0.019);
              previous = at;
            }
            const span = 0.17 + Math.sin(t * Math.PI) * (0.94 + random() * 0.36);
            for (const side of [-1, 1]) foliage.push([at.x, at.y, at.z, 0.18, span, span,
              0.23 + t * 0.35, turn + side * (0.72 + random() * 0.2), 0, green[(i+p)%5]]);
          }
        }
        for (let bunch = 0; bunch < 3; bunch++) {
          const turn = bunch * 2.1 + random() * 0.5;
          const cx = start.x + Math.sin(turn) * 0.35, cz = start.z + Math.cos(turn) * 0.35;
          const cy = h - 0.42 - random() * 0.22;
          beam(grounds, stem, start, new T.Vector3(cx, cy, cz), 0.045);
          const count = 3 + Math.floor(random() * 3);
          for (let nut = 0; nut < count; nut++) {
            const angle = nut / count * Math.PI * 2 + random() * 0.45;
            const radius = 0.11 + random() * 0.16;
            const scale = 0.83 + random() * 0.36;
            coconuts.push([cx + Math.sin(angle) * radius, cy - random() * 0.24, cz + Math.cos(angle) * radius,
              scale * 0.14, scale * 0.21, scale * 0.15, random() - 0.5, angle, Math.sin(angle) * 0.35,
              ['#7e8d44', '#9caa52', '#657737', '#a48845'][nut % 4]]);
          }
        }
      }
    }
    for (const [x,z,h,l] of [[-18,2,8.7,1.1],[-18,-7,10.3,1.6],[18,-6,9.4,-1.25],[17,4,8.1,-1.45],[-20,13,8.1,1.3],[18,-15,10.2,-1.8],[-12,-14,9.2,1.4]]) palm(x,z,h,l);
    for (const [x,z] of [[17.9,5.1],[15.45,3.75],[17.6,2.45],[-14.3,3.3],[-15.12,3.42],[-16.4,1.15],[-18.6,12.7],[-20.2,14.05],[13.8,-5.12]]) {
      const scale = 0.82 + random() * 0.41;
      coconuts.push([x, 0.144 * scale, z, 0.15 * scale, 0.22 * scale, 0.149 * scale,
        0.79 + random() * 0.75, random() * 6.28, random() * 0.44,
        ['#725137', '#927044', '#a88a50', '#7b884c'][Math.floor(random() * 4)]]);
    }
    instance(grounds, new T.SphereGeometry(1, 10, 7), material('#ffffff'), coconuts);
    for(let i=0;i<11;i++) palm(-18+i*3.7,-15-random()*5,6+random()*3,random()-0.5,true);
    for (const [x,z] of [[-17,10],[17,10],[-17,-14],[16,-14]]) {
      const stemHeight=1.65+random()*0.7;
      mesh(grounds,new T.CylinderGeometry(0.055,0.105,stemHeight,8),stem,x,stemHeight/2,z);
      crown(x,stemHeight,z,10,1.82,0.64);
    }
    for (let i=0;i<12;i++) {
      const x=-16.3+(i%3)*0.38, y=0.24+i*0.21, z=1+Math.sin(i*1.18)*0.15;
      if(i===0) box(grounds,teak,x,1.42,z,0.12,2.84,0.12);
      crown(x,y,z,5,0.31,0.23,i%3);
    }
    for (const [x,y,z,spread] of [[-4.6,0,16.2,1.4],[3.9,0,16.2,0.9],[-10,0,12.6,1.8],[15.5,0,12,1.1],[0,0.42,0,0.67],[-16.4,0,8,1]]) {
      for(let i=0;i<26;i++) {
        const px=x+(random()-0.5)*spread*2,pz=z+(random()-0.5)*0.95;
        const tall=0.16+random()*0.39;
        crown(px,y+tall*0.3,pz,5,tall,0.11,i%3);
        if(i%3===0) for(let j=0;j<5;j++) {
          const a=j*2*Math.PI/5;
          flowers.push([px+Math.sin(a)*0.043,y+tall*0.63,pz+Math.cos(a)*0.043,
            0.046,0.021,0.046,0,0,0,i%2?'#d46042':'#edbf74']);
        }
      }
    }
    instance(grounds, blade, leaf, foliage);
    instance(grounds, new T.SphereGeometry(1,6,4), material('#ffffff'), flowers);
  }

  function buildJetty() {
    const { x0, x1, z0, z1, y } = JETTY;
    const jetty = new T.Group();
    jetty.name = 'Wooden boat jetty';
    grounds.add(jetty);
    const pileWood = material('#5b4230', 0.87);
    const iron = material('#454241', 0.63, { metalness: 0.38 });
    const piles = new T.CylinderGeometry(0.115, 0.145, 3.94, 9);
    const span = x1 - x0, length = z1 - z0;
    const count = Math.ceil(length / 0.25), stride = length / count;
    const boards = [], pegs = [];
    for (let i = 0; i < count; i++) {
      const z = z0 + stride * (i + 0.5);
      const jitter = (random() - 0.5) * 0.036;
      boards.push([jitter, y - 0.065, z, span - Math.abs(jitter), 0.13, stride - 0.009,
        0, 0, 0, ['#a3815e', '#87694d', '#b18d65', '#93704f', '#9e7d57'][Math.floor(random() * 5)]]);
      for (const edge of [-0.98, 0.98]) pegs.push([edge, y + 0.003, z, 0.018, 0.006, 0.018, 0, 0, 0]);
    }
    instance(jetty, unitBox, material('#ffffff', 0.87, { map: teak.map }), boards);
    instance(jetty, unitBox, iron, pegs);
    for (const side of [-1, 1]) {
      const x = side * 1.03;
      box(jetty, pileWood, x, y - 0.22, (z0 + z1) / 2, 0.19, 0.26, length);
      for (const z of [z0 + 1.1, z0 + 4.4, z0 + 7.7, z0 + 10.9, z1 - 0.33]) {
        mesh(jetty, piles, pileWood, x, y - 1.56, z);
        box(jetty, darkWood, x, y + 0.41, z, 0.28, 0.11, 0.28);
      }
    }
    for (const z of [z0 + 4.4, z0 + 7.7, z0 + 10.9, z1 - 0.33]) {
      box(jetty, pileWood, 0, y - 0.26, z, 2.58, 0.18, 0.23);
      beam(jetty, pileWood, new T.Vector3(-1.03, -1.62, z), new T.Vector3(1.03, y - 0.32, z), 0.10);
    }
    // A short boarding ladder on the boat side.
    for (const side of [-1, 1]) box(jetty, teak, 1.42, y - 0.65, 35.9 + side * 0.24, 0.10, 1.35, 0.10);
    for (let rung = 0; rung < 5; rung++) box(jetty, teak, 1.42, y - 0.19 - rung * 0.24, 35.9, 0.095, 0.08, 0.48);

    const boat = new T.Group();
    boat.name = 'Black Kerala vallam';
    boat.position.set(2.66, -1.08, 36.5);
    boat.rotation.y = -0.035;
    const hull = material('#171917', 0.58, { side: T.DoubleSide });
    const inside = material('#48362a', 0.79, { side: T.DoubleSide });
    const seam = material('#272820', 0.64);
    const rope = material('#887451', 0.95);
    const sections = [
      [-2.65, 0.04, 0.63, 0.34], [-2.42, 0.24, 0.48, 0.06], [-1.84, 0.47, 0.36, -0.21],
      [-0.95, 0.60, 0.33, -0.29], [0, 0.65, 0.32, -0.32], [0.97, 0.58, 0.38, -0.27],
      [1.83, 0.41, 0.48, -0.11], [2.38, 0.19, 0.66, 0.12], [2.7, 0.032, 0.85, 0.46],
    ];
    function shell(inner) {
      const vertices = [], indices = [], count = 8;
      for (const [z, width, rail, keel] of sections) {
        // The engine's sea is a continuous plane. Keep the visible floorboards
        // above it while letting the outside keel extend below the waterline.
        const bottom = inner ? Math.max(0.08, keel + 0.046) : keel;
        for (let i = 0; i <= count; i++) {
          const theta = (i / count - 0.5) * Math.PI;
          const x = Math.sin(theta) * (width - (inner ? 0.025 : 0));
          const y = T.MathUtils.lerp(rail, bottom, Math.cos(theta) ** 0.65);
          vertices.push(x, y, z);
        }
      }
      for (let s = 1; s < sections.length; s++) for (let i = 0; i < count; i++) {
        const a = (s - 1) * (count + 1) + i, b = a + count + 1;
        if (inner) indices.push(a,b,a+1,a+1,b,b+1);
        else indices.push(a,a+1,b,a+1,b+1,b);
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      mesh(boat, geometry, inner ? inside : hull, 0, 0, 0);
    }
    shell(false);
    shell(true);
    for (const side of [-1, 1]) {
      const rim = new T.CatmullRomCurve3(sections.map(([z, width, y]) => new T.Vector3(side * width, y + 0.018, z)));
      mesh(boat, new T.TubeGeometry(rim, 28, 0.036, 7, false), seam, 0, 0, 0);
    }
    for (const [z, y, w] of [[-1.48, 0.19, 0.77], [-0.37, 0.16, 1.06], [0.81, 0.18, 1.0]]) {
      box(boat, teak, 0, y, z, w, 0.068, 0.24);
    }
    box(boat, seam, 0, 0.43, 2.45, 0.16, 0.23, 0.12);
    const handle = new T.Vector3(-0.28, 0.25, -1.09);
    const shoulder = new T.Vector3(0.26, 0.26, 0.78);
    beam(boat, teak, handle, shoulder, 0.032);
    const paddle = new T.Group();
    paddle.name = 'Pankayam';
    paddle.position.copy(shoulder);
    paddle.rotation.y = Math.atan2(shoulder.x - handle.x, shoulder.z - handle.z);
    boat.add(paddle);
    const blade = new T.Shape();
    blade.moveTo(-0.02, 0); blade.lineTo(-0.095, 0.19);
    blade.quadraticCurveTo(-0.13, 0.51, -0.065, 0.64);
    blade.quadraticCurveTo(0, 0.70, 0.065, 0.64);
    blade.quadraticCurveTo(0.13, 0.51, 0.095, 0.19);
    blade.lineTo(0.02, 0); blade.closePath();
    const oar = new T.ExtrudeGeometry(blade, { depth: 0.018, bevelEnabled: true,
      bevelSegments: 1, bevelSize: 0.009, bevelThickness: 0.006, curveSegments: 5 });
    oar.rotateX(Math.PI / 2);
    mesh(paddle, oar, teak, 0, 0, 0);
    const knot = mesh(jetty, new T.TorusGeometry(0.13, 0.023, 5, 12), rope, 1.03, y + 0.25, 38.67);
    knot.rotation.x = Math.PI / 2;
    const mooring = new T.CatmullRomCurve3([
      new T.Vector3(1.03, y + 0.27, 38.67), new T.Vector3(1.69, -0.43, 38.87),
      new T.Vector3(2.12, -0.62, 38.97), new T.Vector3(2.57, -0.59, 38.95),
    ]);
    mesh(jetty, new T.TubeGeometry(mooring, 15, 0.018, 6, false), rope, 0, 0, 0);
    return boat;
  }

  function buildCattleShed() {
    const x = 23.3, z = 16.5;
    const pen = new T.Group();
    pen.name = 'Cattle shed';
    pen.position.set(x, 0, z);
    pen.rotation.y = -Math.PI / 2;
    function blockPen(localX, localZ, width, depth) {
      block(x - localZ, z + localX, depth, width);
    }
    grounds.add(pen);
    const packedEarth = material('#8a6748');
    const hay = material('#ffffff', 0.95);
    const tile = material('#754530');
    box(pen, packedEarth, 0, 0.022, 0, 5.05, 0.04, 3.74);
    box(pen, stone, 0, 0.34, -1.76, 5.05, 0.67, 0.25);
    blockPen(0, -1.76, 5.05, 0.26);
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        box(pen, stone, side * 2.36, 0.13, end * 1.69, 0.39, 0.26, 0.39);
        box(pen, teak, side * 2.36, 1.34, end * 1.69, 0.23, 2.3, 0.23);
        blockPen(side * 2.36, end * 1.69, 0.39, 0.39);
      }
      for (const y of [0.67, 1.02]) box(pen, teak, side * 2.36, y, 0, 0.12, 0.14, 3.35);
      blockPen(side * 2.36, 0, 0.14, 3.35);
      box(pen, darkWood, 0, 2.44, side * 1.69, 5.04, 0.19, 0.22);
      const ridge = new T.Vector3(0, 3.52, 0);
      const eave = new T.Vector3(0, 2.25, side * 2.27);
      const roofLength = ridge.distanceTo(eave);
      const panel = box(pen, tile, 0, (ridge.y + eave.y) / 2, eave.z / 2, 5.65, 0.1, roofLength);
      panel.rotation.x = side * Math.atan2(ridge.y - eave.y, Math.abs(eave.z));
      panel.updateWorldMatrix(true, false);
      const roofSurface = panel.clone();
      roofSurface.matrixWorld.copy(panel.matrixWorld);
      shedRoof.push(roofSurface);
      const roofRows = [];
      for (let row = 0; row < 10; row++) {
        const t = (row + 0.5) / 10;
        for (let col = 0; col < 26; col++) {
          roofRows.push([-2.7 + col * 0.216, T.MathUtils.lerp(ridge.y, eave.y, t) + 0.073, eave.z * t,
            0.212, 0.039, roofLength / 9.7, panel.rotation.x, 0, 0, ['#814834','#99563a','#6c4233'][Math.floor(random() * 3)]]);
        }
      }
      instance(pen, tileGeometry, clay, roofRows);
      for (const at of [-2.45, 0, 2.45]) {
        beam(pen, teak, new T.Vector3(at, ridge.y - 0.14, 0), new T.Vector3(at, eave.y - 0.1, eave.z), 0.14);
      }
    }
    box(pen, darkWood, 0, 2.2, 1.68, 5.04, 0.11, 0.16);
    box(pen, tile, 0, 3.53, 0, 5.68, 0.13, 0.17);

    const troughZ = 1.4;
    for (const side of [-1, 1]) {
      box(pen, teak, side * 1.82, 0.26, troughZ, 0.13, 0.38, 0.72);
      box(pen, teak, 0, 0.31, troughZ + side * 0.32, 3.64, 0.30, 0.12);
    }
    box(pen, darkWood, 0, 0.21, troughZ, 3.64, 0.14, 0.64);
    blockPen(0, troughZ, 3.76, 0.75);
    const grassBlades = [];
    for (let i = 0; i < 185; i++) {
      grassBlades.push([(random() - 0.5) * 3.48, 0.30 + random() * 0.12, troughZ + (random() - 0.5) * 0.49,
        0.027, 0.13 + random() * 0.12, 0.026, random() - 0.5, random() * 6.28, (random() - 0.5) * 2.1,
        ['#57792c','#799a36','#9dab4c','#ac9b58'][i % 4]]);
    }
    instance(pen, unitBox, hay, grassBlades);

    const oval = new T.SphereGeometry(1, 18, 12);
    const ivory = material('#dfc9a2', 0.67);
    const hoof = material('#332924', 0.78);
    const eye = material('#141315', 0.21);
    const glint = material('#f4e4be', 0.42);
    const ear = material('#976c67');
    const white = material('#f2e9d6'), brown = material('#9f5d3b'), charcoal = material('#322d29');
    function ellipsoid(parent, mat, x, y, z, sx, sy, sz) {
      const part = mesh(parent, oval, mat, x, y, z);
      part.scale.set(sx, sy, sz);
      return part;
    }
    function coat(tricolor) {
      return material('#ffffff', 0.91, { map: texture(ctx => {
        ctx.fillStyle = tricolor ? '#f1dec1' : '#f1eadb';
        ctx.fillRect(0, 0, 256, 256);
        for (const [cx, cy, w, h, color] of [
          [31, 120, 20, 32, '#282725'], [100, 104, 26, 25, tricolor ? '#995332' : '#242422'],
          [177, 153, 26, 27, tricolor ? '#a8623b' : '#272624'], [224, 83, 18, 32, '#33302a'],
          [67, 186, 13, 18, tricolor ? '#633b2b' : '#33302b'], [144, 46, 15, 24, tricolor ? '#a6643d' : '#2b2a28'],
        ]) {
          ctx.fillStyle = color;
          ctx.beginPath();
          for (let i = 0; i < 24; i++) {
            const angle = 2 * Math.PI * i / 24, radius = 0.77 + random() * 0.31;
            const px = cx + Math.cos(angle) * w * radius, py = cy + Math.sin(angle) * h * radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
        }
      }) });
    }
    function cow(offset, turn, tricolor) {
      const animal = new T.Group();
      animal.name = tricolor ? 'Brown, white and black cow' : 'Black and white cow';
      animal.position.set(offset, 0.055, 0.015);
      animal.rotation.y = turn;
      pen.add(animal);
      const color = tricolor ? brown : white, fur = coat(tricolor);
      ellipsoid(animal, fur, 0, 1.01, 0, 0.40, 0.46, 0.91);
      ellipsoid(animal, color, 0, 1.02, 0.52, 0.37, 0.42, 0.36);
      ellipsoid(animal, fur, 0, 0.99, -0.58, 0.36, 0.38, 0.32);
      for (const side of [-1, 1]) for (const front of [-1, 1]) {
        const x = side * 0.25, z = front * 0.59 + side * 0.06;
        const upper = ellipsoid(animal, front > 0 ? color : fur, x, 0.65, z, 0.105, 0.29, front < 0 ? 0.14 : 0.102);
        upper.rotation.x = front < 0 ? -0.22 : 0.07;
        ellipsoid(animal, front > 0 && tricolor ? white : color, x, 0.28, z + 0.025, 0.063, 0.24, 0.073).rotation.x = 0.08;
        ellipsoid(animal, hoof, x, 0.067, z + 0.047, 0.082, 0.07, 0.107);
      }
      const tail = new T.Group();
      tail.position.set(0, 1.18, -0.79);
      animal.add(tail);
      ellipsoid(tail, color, 0, -0.25, -0.07, 0.041, 0.28, 0.045).rotation.x = 0.23;
      ellipsoid(tail, charcoal, 0, -0.52, -0.11, 0.064, 0.10, 0.06);

      const neck = new T.Group();
      neck.name = 'Grazing head';
      neck.position.set(0, 1.20, 0.62);
      animal.add(neck);
      ellipsoid(neck, color, 0, 0, 0.25, 0.23, 0.28, 0.36).rotation.x = -0.19;
      ellipsoid(neck, tricolor ? brown : charcoal, 0, 0.022, 0.53, 0.208, 0.218, 0.31);
      ellipsoid(neck, white, -0.031, 0.10, 0.68, 0.112, 0.122, 0.181);
      ellipsoid(neck, tricolor ? material('#8c6258', 0.56) : material('#a6837f', 0.56), 0, -0.024, 0.765, 0.173, 0.105, 0.14);
      const jaw = ellipsoid(neck, color, 0, -0.097, 0.665, 0.138, 0.074, 0.188);
      const ears = [];
      for (const side of [-1, 1]) {
        ellipsoid(neck, eye, side * 0.054, -0.015, 0.88, 0.026, 0.017, 0.008);
        ellipsoid(neck, eye, side * 0.176, 0.087, 0.611, 0.036, 0.032, 0.04);
        ellipsoid(neck, glint, side * 0.204, 0.101, 0.632, 0.008, 0.009, 0.008);
        const flap = new T.Group();
        flap.position.set(side * 0.142, 0.148, 0.48);
        neck.add(flap);
        ellipsoid(flap, tricolor ? brown : charcoal, side * 0.095, 0, 0, 0.139, 0.051, 0.074);
        ellipsoid(flap, ear, side * 0.108, 0.007, 0.045, 0.088, 0.030, 0.027);
        ears.push(flap);
        const horn = mesh(neck, new T.ConeGeometry(0.046, 0.21, 10), ivory, side * 0.153, 0.233, 0.453);
        horn.rotation.z = -side * 0.53;
      }
      blockPen(offset, 0.015, 0.97, 2.48);
      return { neck, jaw, tail, ears };
    }
    const cattle = [cow(-1.03, 0.08, false), cow(1.05, -0.11, true)];

    return time => {
      for (let i = 0; i < cattle.length; i++) {
        const { neck, jaw, tail, ears } = cattle[i];
        const phase = time + i * 3.21;
        const pause = Math.pow(Math.max(0, Math.sin(phase * 0.52)), 10);
        neck.rotation.x = 0.99 - pause * 0.51 + Math.sin(phase * 2.4) * 0.035;
        neck.rotation.y = Math.sin(phase * 1.22) * 0.079;
        jaw.position.y = -0.102 - Math.sin(phase * 10.5) * 0.016;
        jaw.position.x = Math.sin(phase * 5.25) * 0.018;
        tail.rotation.z = Math.sin(phase * 2.7) * 0.28 + Math.sin(phase * 5) * 0.075;
        const flick = Math.pow(Math.max(0, Math.sin(phase * 1.91)), 14) * 0.31;
        ears[0].rotation.z = -0.22 - flick;
        ears[1].rotation.z = 0.25 + flick * 0.63;
      }
    };
  }

  function furnishLivingRoom() {
    const cream = material('#e6dfce', 0.52);
    const caseTrim = material('#a3a092', 0.63);
    const screen = material('#333d3d', 0.22, { metalness: 0.12 });
    const red = material('#643e34', 0.94);
    const cloth = material('#a48361', 0.94);
    const cushion = material('#a18a6d', 0.92);
    const moss = material('#806d45', 0.96);
    const bulb = new T.SphereGeometry(1, 12, 8);
    function woodenLeg(parent, x, y, z, height) {
      mesh(parent, new T.CylinderGeometry(0.062, 0.045, height, 8), darkWood, x, y, z);
    }
    const television = new T.Group();
    television.position.set(TV.x, 0, TV.z);
    television.rotation.y = TV.heading;
    house.add(television);
    const tvX = 0, tvZ = 0;
    const blackCase = material('#222325', 0.57);
    box(television, teak, tvX, 0.83, tvZ, 1.52, 0.53, 0.75);
    box(television, darkWood, tvX, 1.11, tvZ, 1.62, 0.085, 0.80);
    for (const x of [-0.60, 0.60]) for (const z of [-0.25, 0.25]) woodenLeg(television, tvX + x, 0.52, tvZ + z, 0.16);
    for (const x of [-0.36, 0.36]) {
      box(television, darkWood, tvX + x, 0.84, tvZ + 0.38, 0.64, 0.36, 0.025);
      box(television, brass, tvX + x, 0.89, tvZ + 0.407, 0.14, 0.024, 0.036);
    }
    box(television, blackCase, tvX, 1.53, tvZ - 0.055, 1.15, 0.76, 0.64);
    box(television, blackCase, tvX, 1.53, tvZ + 0.285, 1.22, 0.79, 0.11);
    function roundedPanel(w, h, r) {
      const shape = new T.Shape(), x = w / 2, y = h / 2;
      shape.moveTo(-x+r,-y); shape.lineTo(x-r,-y); shape.quadraticCurveTo(x,-y,x,-y+r);
      shape.lineTo(x,y-r); shape.quadraticCurveTo(x,y,x-r,y);
      shape.lineTo(-x+r,y); shape.quadraticCurveTo(-x,y,-x,y-r);
      shape.lineTo(-x,-y+r); shape.quadraticCurveTo(-x,-y,-x+r,-y);
      return new T.ExtrudeGeometry(shape, { depth: 0.027, bevelEnabled: true,
        bevelThickness: 0.019, bevelSize: 0.014, bevelSegments: 2, curveSegments: 5 });
    }
    mesh(television, roundedPanel(0.86, 0.62, 0.12), caseTrim, tvX - 0.09, 1.54, tvZ + 0.338);
    mesh(television, roundedPanel(0.77, 0.53, 0.10), screen, tvX - 0.09, 1.54, tvZ + 0.375);
    for (const y of [1.67, 1.53]) {
      mesh(television, new T.CylinderGeometry(0.053, 0.053, 0.035, 12), darkWood, tvX + 0.444, y, tvZ + 0.363).rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 5; i++) box(television, caseTrim, tvX + 0.445, 1.31 + i * 0.024, tvZ + 0.348, 0.13, 0.009, 0.014);
    const display = new T.Mesh(new T.PlaneGeometry(0.73, 0.42), new T.MeshBasicMaterial({ color: 0xffffff }));
    display.position.set(-0.09, 1.54, 0.435);
    display.name = 'CRT video screen';
    display.visible = false;
    television.add(display);
    block(TV.x, TV.z, 1.64, 0.82);

    const matX = -9.01, matZ = 3.16;
    const weave = texture(ctx => {
      ctx.fillStyle = '#b89b69'; ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 256; i += 2) {
        ctx.fillStyle = i % 6 === 0 ? '#957851' : '#cdb184';
        ctx.fillRect(i, 0, 1, 256);
      }
      for (let j = 0; j < 256; j += 4) {
        ctx.fillStyle = '#6e542b38'; ctx.fillRect(0, j, 256, 1);
      }
      ctx.strokeStyle = '#673d30'; ctx.lineWidth = 8; ctx.strokeRect(10, 10, 236, 236);
      ctx.strokeStyle = '#9e683c'; ctx.lineWidth = 3; ctx.strokeRect(21, 21, 214, 214);
    });
    box(house, material('#e1c89a', 1, { map: weave }), matX, 0.47, matZ, 2.75, 0.018, 2.73);
    function sofa(x, z, width, angle) {
      const frame = new T.Group();
      frame.position.set(x, 0.46, z);
      frame.rotation.y = angle;
      house.add(frame);
      const pads = width > 2 ? 3 : 2;
      box(frame, teak, 0, 0.29, 0, width, 0.23, 0.84);
      box(frame, red, 0, 0.68, -0.32, width - 0.19, 0.69, 0.19).rotation.x = -0.09;
      box(frame, teak, 0, 1.02, -0.36, width + 0.04, 0.11, 0.14);
      for (let i = 0; i < pads; i++) {
        const w = (width - 0.31) / pads;
        const cx = (i - (pads - 1) / 2) * w;
        box(frame, cloth, cx, 0.445, 0.065, w - 0.038, 0.15, 0.63);
        box(frame, cushion, cx, 0.73, -0.23, w - 0.057, 0.46, 0.105).rotation.x = -0.10;
      }
      for (const side of [-1, 1]) {
        const edge = side * (width / 2 - 0.075);
        box(frame, teak, edge, 0.68, 0.02, 0.15, 0.09, 0.80);
        for (const at of [-0.33,0.31]) woodenLeg(frame, edge, 0.26, at, 0.52);
      }
      block(x, z, angle === Math.PI / 2 ? 0.86 : width, angle === Math.PI / 2 ? width : 0.86);
    }
    sofa(SOFA.x, SOFA.z, 2.61, SOFA.heading);
    sofa(-10.31, 3.28, 1.58, Math.PI / 2);
    hangLivingRoomPhotos();

    const swing = new T.Group();
    swing.name = 'Teak oonjal';
    swing.position.set(OONJAL.x, OONJAL.y, OONJAL.z);
    swing.rotation.y = OONJAL.heading;
    house.add(swing);
    const gold = material('#c89738', 0.32, { metalness: 0.72 });
    box(swing, teak, 0, -0.04, 0, 2.18, 0.08, 0.80);
    box(swing, darkWood, 0, -0.14, 0, 2.04, 0.15, 0.72);
    box(swing, teak, 0, -0.22, 0, 2.15, 0.045, 0.77);
    for (let i = -8; i <= 8; i++) {
      const centre = mesh(swing, bulb, teak, i * 0.112, -0.148, 0.365);
      centre.scale.set(0.05, 0.037, 0.019);
      for (const side of [-1, 1]) {
        const petal = mesh(swing, bulb, teak, i * 0.112 + side * 0.02, -0.148 + side * 0.032, 0.368);
        petal.scale.set(0.025, 0.016, 0.013);
        petal.rotation.z = 0.57;
      }
    }
    box(house, darkWood, -7.21, 3.48, OONJAL.z, 7.04, 0.18, 0.20);
    for (const z of [-0.32, 0.32]) {
      box(house, teak, OONJAL.x, 3.42, OONJAL.z + z, 2.37, 0.13, 0.14);
    }
    const chains = [];
    for (const x of [-0.93, 0.93]) for (const z of [-0.32, 0.32]) {
      const foot = mesh(swing, bulb, teak, x, -0.245, z);
      foot.scale.set(0.082, 0.105, 0.082);
      mesh(swing, new T.TorusGeometry(0.062, 0.012, 6, 14), gold, x, 0.053, z);
      mesh(swing, new T.CylinderGeometry(0.065, 0.065, 0.022, 12), gold, x, 2.36, z);
      for (let i = 0; i < 28; i++) chains.push([x, 0.141 + i * 0.0795, z, 0.8, 1.29, 1,
        0, i % 2 * Math.PI / 2, 0]);
    }
    instance(swing, new T.TorusGeometry(0.041, 0.009, 5, 9), gold, chains);
    block(OONJAL.x, OONJAL.z, 2.20, 0.88);

    const bedX = -9.28, bedZ = -6.49 - REAR_EXTENSION;
    for (const x of [-0.56,0.56]) for (const z of [-0.88,0.88]) woodenLeg(house, bedX + x, 0.73, bedZ + z, 0.54);
    box(house, teak, bedX, 0.76, bedZ, 1.25, 0.19, 2.01);
    box(house, darkWood, bedX, 1.03, bedZ - 0.94, 1.28, 0.64, 0.10);
    box(house, teak, bedX, 1.366, bedZ - 0.94, 1.29, 0.068, 0.14);
    box(house, cream, bedX, 0.95, bedZ, 1.17, 0.21, 1.87);
    box(house, moss, bedX, 1.065, bedZ + 0.34, 1.20, 0.045, 1.14);
    box(house, cream, bedX, 1.1, bedZ - 0.59, 0.77, 0.12, 0.36);
    block(bedX, bedZ, 1.29, 2.05);
    return display;
  }

  function hangLivingRoomPhotos() {
    const paper = material('#e9dcc0', 0.93);
    const anchors = [
      [-10.05, 2.33, -4.241, 0, 0.80, 0.69],
      [-8.69, 2.33, -4.241, 0, 0.97, 0.71],
      [-10.741, 2.27, 1.58, Math.PI / 2, 0.99, 0.74],
    ];
    anchors.forEach(([x, y, z, angle, w, h], index) => {
      const frame = new T.Group();
      frame.name = 'Living room photo ' + (index + 1);
      frame.position.set(x, y, z);
      frame.rotation.y = angle;
      house.add(frame);
      box(frame, darkWood, 0, 0, 0, w, h, 0.075);
      box(frame, teak, 0, 0, 0.021, w - 0.048, h - 0.048, 0.057);
      box(frame, paper, 0, 0, 0.052, w - 0.104, h - 0.104, 0.012);
      const placeholder = texture(ctx => {
        const palettes = [
          ['#c8b791', '#947e5b', '#655741'],
          ['#c5c3a1', '#899277', '#56664a'],
          ['#b5b7a4', '#7b8778', '#4c5b56'],
        ];
        const [sky, hills, foreground] = palettes[index];
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#e3d5af';
        ctx.beginPath(); ctx.arc(174 - index * 37, 68, 25, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = hills;
        ctx.beginPath(); ctx.moveTo(0, 148); ctx.lineTo(56, 102);
        ctx.lineTo(113, 145); ctx.lineTo(183, 100 + index * 10); ctx.lineTo(256, 143);
        ctx.lineTo(256, 256); ctx.lineTo(0, 256); ctx.closePath(); ctx.fill();
        ctx.fillStyle = foreground;
        ctx.beginPath(); ctx.moveTo(0, 190); ctx.quadraticCurveTo(99, 218, 155, 173);
        ctx.quadraticCurveTo(194, 148, 256, 178); ctx.lineTo(256, 256);
        ctx.lineTo(0, 256); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#eee3c9';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PHOTO 0' + (index + 1), 128, 231);
      });
      const print = material('#ffffff', 0.83, { map: placeholder });
      photoFrames.push(print);
      mesh(frame, new T.PlaneGeometry(w - 0.24, h - 0.22), print, 0, 0, 0.060);
      const url = LIVING_ROOM_PHOTOS[index];
      if (url) new T.TextureLoader().load(url, image => {
        image.colorSpace = T.SRGBColorSpace;
        print.map = image;
        placeholder.dispose();
      }, undefined, () => {});
    });
  }

  function furnishedChair(parent, x, z, angle) {
    const chair = new T.Group();
    chair.position.set(x, 0.46, z);
    chair.rotation.y = angle;
    parent.add(chair);
    box(chair, teak, 0, 0.45, 0, 0.42, 0.065, 0.43);
    for (const side of [-1, 1]) {
      box(chair, darkWood, side * 0.17, 0.45, -0.17, 0.057, 0.90, 0.057);
      box(chair, teak, side * 0.17, 0.21, 0.17, 0.057, 0.42, 0.057);
    }
    for (const y of [0.65, 0.84]) box(chair, teak, 0, y, -0.17, 0.37, 0.11, 0.056);
    block(x, z, 0.42, 0.43);
  }

  function buildStudyNook() {
    const desk = new T.Group();
    desk.name = 'Living room study desk';
    desk.position.set(-10.31, 0, -0.91);
    desk.rotation.y = Math.PI / 2;
    house.add(desk);
    const x = 0, z = 0;
    box(desk, teak, x, 1.22, z, 1.49, 0.09, 0.62);
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      box(desk, darkWood, x + side * 0.63, 0.82, z + end * 0.24, 0.09, 0.72, 0.09);
    }
    box(desk, darkWood, x, 1.09, z + 0.19, 1.36, 0.16, 0.27);
    box(desk, brass, x + 0.23, 1.09, z + 0.335, 0.19, 0.029, 0.04);
    block(desk.position.x, desk.position.z, 0.66, 1.49);
    furnishedChair(house, -9.43, -0.85, -Math.PI / 2);
    const covers = ['#58352d', '#5d6850', '#5d5240'].map(color => material(color));
    const pages = material('#d5c6a4');
    for (let i = 0; i < 4; i++) {
      box(desk, covers[i % covers.length], x - 0.5 + i * 0.13, 1.41, z - 0.07, 0.109, 0.29, 0.21);
      box(desk, pages, x - 0.5 + i * 0.13, 1.418, z + 0.036, 0.081, 0.241, 0.014);
    }
    mesh(desk, new T.CylinderGeometry(0.099, 0.129, 0.05, 18), brass, 0.49, 1.29, -0.14);
    const neck = new T.CatmullRomCurve3([
      new T.Vector3(0.49, 1.31, -0.14), new T.Vector3(0.49, 1.63, -0.14),
      new T.Vector3(0.49, 1.79, -0.01), new T.Vector3(0.49, 1.73, 0.13),
    ]);
    mesh(desk, new T.TubeGeometry(neck, 14, 0.017, 8, false), brass, 0, 0, 0);
    const shade = material('#27584c', 0.3, { side: T.DoubleSide });
    mesh(desk, new T.CylinderGeometry(0.065, 0.145, 0.13, 22, 1, true), shade, 0.49, 1.67, 0.13);
    const rim = mesh(desk, new T.TorusGeometry(0.144, 0.009, 6, 22), brass, 0.49, 1.605, 0.13);
    rim.rotation.x = Math.PI / 2;
    const bulb = material('#d9bd81', 0.75, { emissive: '#ffad46', emissiveIntensity: 0 });
    mesh(desk, new T.SphereGeometry(0.046, 10, 7), bulb, 0.49, 1.612, 0.13);
    return bulb;
  }

  function hangDiningArt() {
    const muralMap = texture(ctx => {
      ctx.fillStyle = '#b26d3f';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#693d31';
      ctx.lineWidth = 7;
      ctx.strokeRect(8, 8, 240, 240);
      ctx.fillStyle = '#dbaf66';
      ctx.beginPath(); ctx.arc(128, 128, 76, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6;
        ctx.save();
        ctx.translate(128, 128);
        ctx.rotate(angle);
        ctx.fillStyle = i % 2 ? '#a54f3c' : '#5e6742';
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.quadraticCurveTo(-36, -42, 0, -77);
        ctx.quadraticCurveTo(36, -42, 0, -9);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#ecd28c';
      ctx.beginPath(); ctx.arc(128, 128, 13, 0, Math.PI * 2); ctx.fill();
    });
    const mural = material('#ffffff', 0.91, { map: muralMap });
    const dining = mesh(house, new T.PlaneGeometry(1.2, 1.17), mural, 10.746, 2.15, 0.84);
    dining.name = 'Dining wall floral mural';
    dining.rotation.y = -Math.PI / 2;
    const stair = mesh(house, new T.PlaneGeometry(0.82, 0.84), mural, 10.746, 2.38, -2.47);
    stair.name = 'Stair wall floral mural';
    stair.rotation.y = -Math.PI / 2;
    const oval = new T.SphereGeometry(1, 10, 7);
    const plaque = new T.Group();
    plaque.name = 'Carved stair wall plaque';
    plaque.position.set(10.72, 2.77, -0.62);
    plaque.rotation.y = -Math.PI / 2;
    house.add(plaque);
    box(plaque, darkWood, 0, 0, 0, 0.66, 0.71, 0.065);
    box(plaque, teak, 0, 0, 0.039, 0.56, 0.61, 0.022);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const petal = mesh(plaque, oval, brass, 0, 0, 0);
      petal.position.set(Math.cos(angle) * 0.13, Math.sin(angle) * 0.13, 0.061);
      petal.scale.set(0.096, 0.033, 0.019);
      petal.rotation.z = angle;
    }
    const centre = mesh(plaque, oval, brass, 0, 0, 0.075);
    centre.scale.set(0.065, 0.065, 0.027);
    const diningCraft = plaque.clone();
    diningCraft.name = 'Carved dining wall plaque';
    diningCraft.position.set(10.72, 2.12, 1.93);
    house.add(diningCraft);
  }

  function furnishOffice() {
    const y = FIRST_FLOOR.y, deskZ = 3.39;
    const pc = new T.Group();
    pc.name = 'Balcony alcove workstation';
    house.add(pc);
    const alloy = material('#282f33', 0.46, { metalness: 0.42 });
    const glow = material('#62b79e', 0.43, { emissive: '#53b795', emissiveIntensity: 0.6 });
    const wallpaper = texture(ctx => {
      const sky = ctx.createLinearGradient(0, 0, 256, 256);
      sky.addColorStop(0, '#103678'); sky.addColorStop(1, '#418be1');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#83bef6'; ctx.lineWidth = 22;
      ctx.beginPath(); ctx.moveTo(85, 245); ctx.bezierCurveTo(75, 140, 252, 203, 238, 51); ctx.stroke();
      ctx.fillStyle = '#112846'; ctx.fillRect(0, 235, 256, 21);
      ctx.fillStyle = '#e0efff'; ctx.font = '10px sans-serif';
      for (const [i, label] of ['Resume', 'Projects', 'Contact'].entries()) {
        const y = 13 + i * 50;
        ctx.fillRect(12, y, 17, 19); ctx.fillText(label, 10, y + 32);
      }
      for (let i = 0; i < 4; i++) ctx.fillRect(122 + (i % 2) * 6, 241 + Math.floor(i / 2) * 6, 5, 5);
    });
    const screen = new T.MeshBasicMaterial({ map: wallpaper, toneMapped: false });
    box(pc, teak, 0, y + 0.77, deskZ, 3.72, 0.11, 0.83);
    for (const x of [-1.66, 1.66]) box(pc, darkWood, x, y + 0.36, deskZ, 0.12, 0.72, 0.69);
    for (const x of [-0.70, 0.60]) {
      box(pc, alloy, x, y + 1.48, 3.22, 1.20, 0.71, 0.105);
      const display = mesh(pc, new T.PlaneGeometry(1.12, 0.63), screen, x, y + 1.48, 3.276);
      display.name = x < 0 ? 'Left monitor' : 'Right monitor';
      box(pc, alloy, x, y + 1.02, 3.22, 0.12, 0.29, 0.10);
      box(pc, alloy, x, y + 0.855, 3.23, 0.44, 0.055, 0.31);
    }
    box(pc, alloy, -0.11, y + 0.842, 3.66, 0.55, 0.036, 0.20);
    for (let row = 0; row < 4; row++) box(pc, glow, -0.11, y + 0.863, 3.60 + row * 0.033, 0.49, 0.005, 0.012);
    box(pc, alloy, 0.39, y + 0.85, 3.66, 0.075, 0.045, 0.115);
    box(pc, alloy, -1.44, y + 0.34, deskZ, 0.35, 0.65, 0.56);
    const panels = material('#f5f5ef', 0.56);
    const console = new T.Group();
    console.name = 'PS5 console';
    console.position.set(1.51, y + 0.83, 3.32);
    pc.add(console);
    box(console, alloy, 0, 0.245, 0, 0.135, 0.48, 0.30);
    for (const side of [-1, 1]) {
      const plate = box(console, panels, side * 0.085, 0.257, 0, 0.037, 0.50, 0.32);
      plate.rotation.z = -side * 0.072;
    }
    box(console, material('#658cdb', 0.6, { emissive: '#4d7ae0', emissiveIntensity: 0.6 }), 0, 0.472, 0.153, 0.09, 0.012, 0.01);

    for (const [x, lines, topColor, bottomColor] of [
      [-1.05, ['GRAND THEFT', 'AUTO VI'], '#fb997c', '#463566'],
      [1.05, ['RED DEAD', 'REDEMPTION II'], '#dc683e', '#5f171a'],
    ]) {
      const art = texture(ctx => {
        const gradient = ctx.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0, topColor);
        gradient.addColorStop(1, bottomColor);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#ffca88';
        ctx.beginPath(); ctx.arc(181, 173, 44, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#24202b';
        ctx.beginPath(); ctx.moveTo(0, 256); ctx.lineTo(0, 209);
        ctx.lineTo(52, 177); ctx.lineTo(111, 215); ctx.lineTo(179, 193);
        ctx.lineTo(256, 229); ctx.lineTo(256, 256); ctx.closePath(); ctx.fill();
        ctx.textAlign = 'center';
        ctx.font = '900 29px sans-serif';
        ctx.fillStyle = '#fff1d2';
        lines.forEach((line, i) => ctx.fillText(line, 128, 62 + 37 * i, 236));
      });
      box(pc, darkWood, x, y + 2.27, 2.99, 0.93, 0.72, 0.045);
      const poster = mesh(pc, new T.PlaneGeometry(0.86, 0.65), material('#ffffff', 0.83, { map: art }), x, y + 2.27, 3.016);
      poster.name = lines.join(' ');
    }

    const chair = new T.Group();
    chair.name = 'Office chair';
    chair.position.set(OFFICE.x, y, OFFICE.z);
    house.add(chair);
    box(chair, alloy, 0, 0.46, 0, 0.59, 0.13, 0.57);
    box(chair, darkWood, 0, 0.81, 0.26, 0.52, 0.67, 0.11);
    box(chair, alloy, 0, 0.24, 0, 0.13, 0.43, 0.13);
    for (const side of [-1, 1]) {
      box(chair, alloy, side * 0.31, 0.60, 0, 0.045, 0.24, 0.39);
      box(chair, alloy, 0, 0.08, 0, 0.64, 0.08, 0.10).rotation.y = side * Math.PI / 4;
    }
    block(0, deskZ, 3.72, 0.83, 1);
    block(OFFICE.x, OFFICE.z, 0.64, 0.63, 1);
  }

  function furnishBalcony() {
    const cane = material('#b98d52', 0.92);
    for (const { x, z, floor } of BALCONY_CHAIRS) {
      const chair = new T.Group();
      chair.name = 'Teak and cane balcony chair';
      chair.position.set(x, floor, z);
      house.add(chair);
      box(chair, teak, 0, 0.42, 0, 0.70, 0.13, 0.66);
      box(chair, cane, 0, 0.495, 0, 0.54, 0.025, 0.51);
      for (const side of [-1, 1]) {
        box(chair, darkWood, side * 0.29, 0.22, 0.25, 0.085, 0.44, 0.085);
        box(chair, teak, side * 0.29, 0.56, -0.27, 0.085, 1.12, 0.085);
        box(chair, teak, side * 0.34, 0.68, 0.02, 0.11, 0.07, 0.64);
      }
      box(chair, cane, 0, 0.81, -0.27, 0.53, 0.45, 0.047);
      for (let row = 0; row < 5; row++) box(chair, teak, 0, 0.65 + row * 0.08, -0.24, 0.53, 0.012, 0.014);
      box(chair, teak, 0, 1.10, -0.27, 0.69, 0.075, 0.095);
      block(x, z, 0.72, 0.69, 1);
    }
  }

  function buildDiningTable() {
    const x = (STAIRS.x0 + STAIRS.x1) / 2, z = 1.85;
    const table = new T.Group();
    table.name = 'Teak dining table';
    table.position.set(x, 0.46, z);
    house.add(table);
    box(table, teak, 0, 0.79, 0, 1.43, 0.10, 1.08);
    box(table, darkWood, 0, 0.69, 0, 1.28, 0.14, 0.92);
    const turnedLeg = new T.LatheGeometry([[0.063,0],[0.063,0.066],[0.046,0.12],[0.058,0.19],
      [0.043,0.48],[0.073,0.55],[0.054,0.61],[0.079,0.69]].map(([r,y]) => new T.Vector2(r,y)), 12);
    for (const sideX of [-1, 1]) for (const sideZ of [-1, 1]) mesh(table, turnedLeg, teak, sideX * 0.57, 0, sideZ * 0.39);
    for (const side of [-1, 1]) {
      box(table, teak, 0, 0.21, side * 0.39, 1.20, 0.075, 0.08);
      box(table, teak, side * 0.57, 0.22, 0, 0.082, 0.075, 0.83);
    }
    const glass = material('#c3e2d8', 0.16, { transparent: true, opacity: 0.48, depthWrite: false, side: T.DoubleSide });
    const cup = new T.CylinderGeometry(0.062, 0.049, 0.129, 16, 1, true);
    const rim = new T.TorusGeometry(0.061, 0.005, 5, 16);
    const rack = mesh(table, new T.CylinderGeometry(0.23, 0.25, 0.045, 24), brass, 0, 0.865, 0);
    rack.name = 'Brass tumbler stand';
    mesh(table, new T.CylinderGeometry(0.026, 0.049, 0.225, 12), brass, 0, 0.985, 0);
    mesh(table, new T.TorusGeometry(0.051, 0.009, 7, 14), brass, 0, 1.12, 0);
    for (const gx of [-0.105, 0.105]) for (const gz of [-0.095, 0.095]) {
      mesh(table, cup, glass, gx, 0.951, gz);
      mesh(table, rim, glass, gx, 1.015, gz).rotation.x = Math.PI / 2;
      mesh(table, new T.CylinderGeometry(0.049, 0.049, 0.012, 16), glass, gx, 0.888, gz);
    }
    block(x, z, 1.43, 1.08);
    const jug = mesh(table, new T.LatheGeometry([[0,0],[0.092,0],[0.113,0.09],[0.106,0.20],
      [0.072,0.255],[0.065,0.3],[0.078,0.31]].map(([r,h]) => new T.Vector2(r,h)), 20),
      material('#a15534', 0.51, { side: T.DoubleSide }), 0.46, 0.84, 0.06);
    jug.name = 'Clay water jug';
    mesh(table, new T.TorusGeometry(0.078, 0.014, 7, 14), jug.material, 0.55, 1.01, 0.06);
    furnishedChair(house, x - 1.18, z, Math.PI / 2);
    furnishedChair(house, x + 1.06, z, -Math.PI / 2);
    furnishedChair(house, x - 0.03, z + 0.91, Math.PI);
    furnishedChair(house, x - 0.03, z - 0.89, 0);

    const ax = 10.46, az = 5.10;
    const cupboard = box(house, darkWood, ax, 1.59, az, 0.75, 2.24, 1.53);
    cupboard.name = 'Teak almarah';
    box(house, teak, ax, 2.75, az, 0.84, 0.16, 1.66);
    box(house, teak, ax, 0.53, az, 0.81, 0.19, 1.61);
    for (const side of [-1, 1]) {
      box(house, teak, ax - 0.39, 1.63, az + side * 0.378, 0.065, 1.94, 0.72);
      box(house, brass, ax - 0.44, 1.35, az + side * 0.085, 0.039, 0.15, 0.031);
    }
    box(house, brass, ax - 0.434, 1.77, az - 0.38, 0.054, 1.08, 0.56);
    const mirror = mesh(house, new T.PlaneGeometry(0.49, 1.01),
      new T.MeshBasicMaterial({ color: '#a1aaa5' }), ax - 0.466, 1.77, az - 0.38);
    mirror.name = 'Almarah mirror';
    mirror.rotation.y = -Math.PI / 2;
    block(ax, az, 0.81, 1.61);
    return mirror;
  }

  function furnishLibrary() {
    const books = [], pageBlocks = [], spineDetails = [];
    const palette = ['#854238', '#3d655e', '#33485f', '#946b3c', '#645071', '#68704a'];
    const shelfZ = -8.02 - REAR_EXTENSION;
    for (const [left, right] of [[-2.12,-0.80],[-0.65,0.65],[0.80,2.12]]) {
      for (const [base, top] of [[0.565,1.025],[1.095,1.555],[1.625,2.085],[2.155,2.955]]) {
        for (let x = left; x + 0.10 < right;) {
          const width = Math.min(0.09 + random() * 0.10, right - x);
          const height = Math.min(top - base - 0.035, 0.24 + random() * 0.32);
          books.push([x + width / 2, base + height / 2, shelfZ + 0.025, width, height, 0.28,
            0, 0, 0, palette[Math.floor(random() * palette.length)]]);
          const centre = x + width / 2;
          pageBlocks.push([centre, base + height + 0.006, shelfZ + 0.005, width - 0.025, 0.018, 0.203, 0, 0, 0]);
          const trim = books.length % 3 === 0 ? '#d5b77b' : '#a99475';
          for (const fraction of [0.19, 0.79, 0.86]) {
            spineDetails.push([centre, base + height * fraction, shelfZ + 0.166, width * 0.72, 0.010,
              0.007, 0, 0, 0, trim]);
          }
          x += width + 0.017;
        }
      }
    }
    instance(house, unitBox, material('#ffffff'), books);
    instance(house, unitBox, material('#e9dfc5'), pageBlocks);
    instance(house, unitBox, material('#ffffff'), spineDetails);

    const cabinet = new T.Group();
    cabinet.name = 'Library hall cabinet';
    cabinet.position.set(-3.18, 0.46, -5.56);
    cabinet.rotation.y = Math.PI / 2;
    house.add(cabinet);
    box(cabinet, darkWood, 0, 0.47, 0, 1.55, 0.94, 0.54);
    box(cabinet, teak, 0, 0.95, 0, 1.67, 0.09, 0.63);
    for (const side of [-1, 1]) {
      box(cabinet, teak, side * 0.37, 0.49, 0.285, 0.67, 0.71, 0.05);
      box(cabinet, brass, side * 0.13, 0.52, 0.325, 0.045, 0.12, 0.035);
    }
    block(-3.18, -5.56, 0.68, 1.72);

    const { x, z } = BILLIARDS;
    const felt = material('#206649');
    box(house, darkWood, x, 1.19, z, 1.42, 0.24, 2.52);
    box(house, felt, x, 1.32, z, 1.23, 0.028, 2.29);
    for (const side of [-1, 1]) {
      box(house, teak, x + side * 0.665, 1.34, z, 0.09, 0.10, 2.48);
      box(house, teak, x, 1.34, z + side * 1.20, 1.30, 0.10, 0.09);
      for (const end of [-1, 1]) box(house, darkWood, x + side * 0.51, 0.79, z + end * 0.95, 0.18, 0.66, 0.18);
    }
    const pockets = [];
    for (const side of [-1, 1]) for (const end of [-1, 0, 1]) {
      pockets.push([x + side * 0.59, 1.337, z + end * 1.10, 1, 1, 1, 0, 0, 0]);
    }
    instance(house, new T.CylinderGeometry(0.075, 0.075, 0.012, 12), darkWood, pockets);
    block(x, z, 1.42, 2.52);
  }

  function hangHousePaintings() {
    const libraryFrames = [];
    const subjects = [
      { x: -9.7, y: 2.2, z: -8.085 - REAR_EXTENSION, angle: 0, title: 'Western Ghats landscape',
        sky: '#d8aa79', far: '#879887', near: '#3d6258', river: '#a2beb0' },
      { x: -3.54, y: 2.25, z: -8.05, angle: Math.PI / 2, title: 'Library west painting', library: true,
        sky: '#deb383', far: '#778e75', near: '#395748', river: '#91b6ae' },
      { x: 3.54, y: 2.25, z: -8.05, angle: -Math.PI / 2, title: 'Library east painting', library: true,
        sky: '#b9c4bd', far: '#708b81', near: '#48634d', river: '#9ebdb2' },
      { x: -4.15, y: 5.49, z: 5.40, angle: Math.PI, title: 'Monsoon hills landscape',
        sky: '#b7c7c1', far: '#708883', near: '#435857', river: '#c6ccae' },
    ];
    for (const { x, y, z, angle, title, sky, far, near, river, library } of subjects) {
      const frame = new T.Group();
      frame.name = title;
      frame.position.set(x, y, z);
      frame.rotation.y = angle;
      house.add(frame);
      box(frame, darkWood, 0, 0, 0, 1.34, 0.97, 0.075);
      box(frame, brass, 0, 0, 0.038, 1.22, 0.85, 0.028);
      const canvas = texture(ctx => {
        const wash = ctx.createLinearGradient(0, 0, 0, 256);
        wash.addColorStop(0, sky);
        wash.addColorStop(1, river);
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, 256, 256);
        const silhouette = (color, points) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(0, 256);
          for (const [x, y] of points) ctx.lineTo(x, y);
          ctx.lineTo(256, 256);
          ctx.closePath();
          ctx.fill();
        };
        silhouette(far, [[0, 127], [35, 107], [75, 133], [145, 76], [190, 121], [256, 85]]);
        silhouette(near, [[0, 160], [42, 126], [87, 158], [154, 162], [216, 133], [256, 145]]);
        silhouette(river, [[0, 235], [56, 207], [165, 191], [196, 167], [179, 159], [204, 166], [198, 192], [131, 216], [112, 256], [256, 256]]);
      });
      const painting = material('#ffffff', 0.9, { map: canvas });
      mesh(frame, new T.PlaneGeometry(1.16, 0.79), painting, 0, 0, 0.055);
      if (library) libraryFrames.push(painting);
    }
    return libraryFrames;
  }

  function buildKitchen() {
    const counter = material('#42413c', 0.68);
    const metal = material('#a8a39a', 0.38, { metalness: 0.65 });
    for (const x of [8.5, 9.7]) {
      box(house, teak, x, 0.875, -7.73 - REAR_EXTENSION, 1.19, 0.82, 0.64);
      box(house, darkWood, x, 0.92, -7.396 - REAR_EXTENSION, 1.08, 0.61, 0.028);
      box(house, brass, x, 1.08, -7.36 - REAR_EXTENSION, 0.27, 0.025, 0.035);
    }
    box(house, counter, 9.1, 1.32, -7.73 - REAR_EXTENSION, 2.45, 0.10, 0.70);
    box(house, metal, 8.53, 1.382, -7.7 - REAR_EXTENSION, 0.61, 0.025, 0.43);
    box(house, counter, 8.53, 1.397, -7.7 - REAR_EXTENSION, 0.47, 0.012, 0.32);
    box(house, metal, 8.53, 1.54, -7.94 - REAR_EXTENSION, 0.045, 0.29, 0.05);
    box(house, metal, 8.53, 1.67, -7.85 - REAR_EXTENSION, 0.045, 0.045, 0.23);
    const burner = new T.CylinderGeometry(0.14, 0.14, 0.026, 16);
    for (const x of [9.39, 9.78]) mesh(house, burner, darkWood, x, 1.383, -7.73 - REAR_EXTENSION);
    block(9.1, -7.73 - REAR_EXTENSION, 2.45, 0.70);
    for (let i = 0; i < 3; i++) {
      const rise = 0.13 + i * 0.14;
      box(house, stone, 6.3, rise / 2, -9.14 - REAR_EXTENSION + i * 0.27, 1.51, rise, 0.34);
    }
  }

  function buildUpperGallery() {
    const {x0, x1, z0, z1, y} = FIRST_FLOOR;
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
    const width = x1 - x0, depth = z1 - z0;
    box(house, darkWood, x, y - 0.29, z, width + 0.2, 0.39, depth + 0.16);
    cameraBarrier(x, y - 0.29, z, width + 0.2, 0.39, depth + 0.16);
    box(house, teak, x, y - 0.047, z, width, 0.094, depth);
    const deckDepth = BALCONY.z1 - z1;
    const deckZ = z1 + deckDepth / 2;
    box(house, darkWood, 0, y - 0.25, deckZ, 5.36, 0.42, deckDepth);
    box(house, teak, 0, y - 0.047, deckZ, 5.1, 0.094, deckDepth);
    for (const side of [-1, 1]) {
      const bracket = side * 2.3;
      beam(house, teak, new T.Vector3(bracket, 2.87, 8.08), new T.Vector3(bracket, 3.58, BALCONY.z1 - 0.16), 0.19);
    }

    // Keep the stair and its landing aligned with the movement surface.
    const treadWidth = STAIRS.x1 - STAIRS.x0;
    const stepDepth = (STAIRS.z1 - STAIRS.z0) / STAIRS.steps;
    const rise = (y - 0.46) / STAIRS.steps;
    const stairX = (STAIRS.x0 + STAIRS.x1) / 2;
    for (let step = 0; step < STAIRS.steps; step++) {
      const top = 0.46 + (step + 1) * rise;
      const at = STAIRS.z0 + (step + 0.5) * stepDepth;
      box(house, darkWood, stairX, top - rise / 2, at, treadWidth, rise, stepDepth - 0.012);
      box(house, teak, stairX, top - 0.033, at - 0.025, treadWidth + 0.08, 0.066, stepDepth + 0.038);
    }
    for (const side of [STAIRS.x0 - 0.03, STAIRS.x1 + 0.03]) {
      const start = new T.Vector3(side, 0.46, STAIRS.z0);
      const end = new T.Vector3(side, y - 0.12, STAIRS.z1);
      beam(house, darkWood, start, end, 0.17);
      for (let step = 0; step <= STAIRS.steps; step += 2) {
        const t = step / STAIRS.steps;
        const point = start.clone().lerp(end, t);
        box(house, teak, point.x, point.y + 0.48, point.z, step % 10 === 0 ? 0.13 : 0.065, 0.96, 0.095);
      }
      start.y += 1;
      end.y += 1;
      beam(house, teak, start, end, 0.13);
    }

    const postProfile = [[0.13,0],[0.13,0.16],[0.095,0.23],[0.083,0.38],[0.103,1.03],
      [0.076,1.95],[0.116,2.1],[0.104,2.21],[0.165,2.30],[0.165,2.48]];
    const post = new T.LatheGeometry(postProfile.map(([r,h]) => new T.Vector2(r,h)), 12);
    const eave = y + 2.84, ridge = y + 4.52;
    for (const atX of [x0 + 0.13, BALCONY.x0 + 0.13, 0, BALCONY.x1 - 0.13, x1 - 0.13]) {
      for (const atZ of [BALCONY.z1 - 0.15, z0 + 0.1]) {
        if (Math.abs(atX) > 3 && atZ > z) continue;
        if (atX === 0 && atZ < z) continue;
        mesh(house, post, teak, atX, y, atZ);
        box(house, darkWood, atX, y + 2.51, atZ, 0.36, 0.19, 0.36);
        box(house, teak, atX, y + 2.65, atZ, 0.52, 0.16, 0.39);
      }
    }
    for (const edge of [x0 + 0.13, x1 - 0.13]) {
      const side = edge < 0 ? cameraWalls.wallW : cameraWalls.wallE;
      box(side, darkWood, edge, y + 2.72, z, 0.20, 0.24, depth + 0.24);
      box(side, plaster, edge, y + 1.39, z, 0.19, 2.76, depth);
      block(edge, z, 0.22, depth, 1);
    }
    const upperWall = (left, right, depthAt, bottom, top, parent = house) => {
      box(parent, plaster, (left + right) / 2, y + (bottom + top) / 2, depthAt, right - left, top - bottom, 0.21);
      if (parent === house) cameraBarrier((left + right) / 2, y + (bottom + top) / 2, depthAt, right - left, top - bottom, 0.21);
      if (bottom < 0.9) block((left + right) / 2, depthAt, right - left, 0.23, 1);
    };
    for (const [left, right] of [[x0, BALCONY.x0], [BALCONY.x1, x1]]) {
      const middle = (left + right) / 2, halfWindow = 1.0, front = z1 - 0.14;
      const facade = cameraWalls.wallS;
      upperWall(left, middle - halfWindow, front, 0, 2.77, facade);
      upperWall(middle + halfWindow, right, front, 0, 2.77, facade);
      upperWall(middle - halfWindow, middle + halfWindow, front, 0, 0.82, facade);
      upperWall(middle - halfWindow, middle + halfWindow, front, 2.18, 2.77, facade);
      box(facade, darkWood, middle, y + 1.50, front, 2.07, 1.38, 0.1);
      for (let i = 0; i <= 8; i++) box(facade, teak, middle - 1 + i * 0.25, y + 1.5, front + 0.075, 0.065, 1.39, 0.16);
      for (const height of [0.82, 1.50, 2.18]) box(facade, teak, middle, y + height, front + 0.09, 2.12, 0.09, 0.19);
    }
    // Two rooms open onto a shared passage that connects the stairs and balcony.
    for (const divider of [-2.55, 2.55]) {
      box(house, plaster, divider, y + 1.39, 4.13, 0.19, 2.76, 2.66);
      cameraBarrier(divider, y + 1.39, 4.13, 0.19, 2.76, 2.66);
      block(divider, 4.13, 0.22, 2.66, 1);
    }
    for (const [left, right, doorway] of [[x0, -2.55, -6], [2.55, x1, 8.5]]) {
      const partition = 5.55, halfDoor = 0.9;
      upperWall(left, doorway - halfDoor, partition, 0, 2.76);
      upperWall(doorway + halfDoor, right, partition, 0, 2.76);
      upperWall(doorway - halfDoor, doorway + halfDoor, partition, 2.45, 2.76);
      for (const side of [-1, 1]) {
        box(house, teak, doorway + side * halfDoor, y + 1.22, partition, 0.10, 2.44, 0.29);
      }
      box(house, teak, doorway, y + 2.44, partition, 1.93, 0.12, 0.29);
      addDoor(doorway, partition, y, halfDoor * 2 - 0.1, 2.38, 1);
    }
    box(house, teak, 0, y + 2.72, BALCONY.z1 - 0.15, 5.44, 0.24, 0.25);
    for (const [left, right] of [[x0, STAIRS.x0], [STAIRS.x1, x1]]) {
      box(cameraWalls.wallN, plaster, (left + right) / 2, y + 1.39, z0 + 0.05, right - left, 2.76, 0.19);
      block((left + right) / 2, z0 + 0.05, right - left, 0.19, 1);
    }
    box(house, teak, stairX, y + 2.72, z0, treadWidth, 0.3, 0.2);

    const baluster = new T.LatheGeometry([[0.065,0],[0.065,0.07],[0.036,0.15],[0.073,0.33],
      [0.039,0.5],[0.057,0.58],[0.057,0.65]].map(([r,h]) => new T.Vector2(r,h)), 9);
    const rails = [];
    function railing(a, b) {
      const count = Math.ceil(a.distanceTo(b) / 0.21);
      for (let i = 0; i < count; i++) {
        const point = a.clone().lerp(b, (i + 0.5) / count);
        rails.push([point.x, point.y + 0.12, point.z, 1, 1, 1, 0, 0, 0]);
      }
      for (const h of [0.1, 0.81]) {
        const lift = new T.Vector3(0,h,0);
        beam(house, teak, a.clone().add(lift), b.clone().add(lift), 0.125);
      }
      block((a.x+b.x)/2, (a.z+b.z)/2, Math.abs(b.x-a.x) + 0.13, Math.abs(b.z-a.z) + 0.13, 1);
    }
    const front = BALCONY.z1 - 0.15;
    const leftRail = BALCONY.x0 + 0.13, rightRail = BALCONY.x1 - 0.13;
    railing(new T.Vector3(leftRail,y,front), new T.Vector3(rightRail,y,front));
    for (const side of [leftRail, rightRail]) railing(new T.Vector3(side,y,z1 - 0.15), new T.Vector3(side,y,front));
    instance(house, baluster, teak, rails);

    // Keep the main front eave close to the facade and cover the balcony separately.
    const backEave = z0 - 1.35;
    const frontEave = z1 + 2.29;
    const span = 12.13;
    const run = (frontEave - backEave) / 2;
    const centre = { x, z: (frontEave + backEave) / 2 };
    for (let side = 0; side < 4; side++) {
      const long = side % 2 === 0;
      slope(side * Math.PI / 2, long ? span : run, long ? run : span,
        long ? 6.8 : 0.30, long ? 0.30 : 6.8, eave, ridge, centre, null);
    }
    // Continue the courtyard-facing slope in the middle only.
    const projection = 0.95;
    const pitch = (ridge - eave) / (run - 0.30);
    slope(Math.PI, 5.95, run + projection, 6.45, run - 0.025,
      eave - projection * pitch, eave + 0.025 * pitch, centre, null);
    box(roof, material('#754530'), x, ridge + 0.035, centre.z, 13.92, 0.22, 0.91);
    const canopyRun = 2.60;
    const canopy = { x: 0, z: BALCONY.z1 + 0.47 - canopyRun };
    const canopyRidge = ridge + 0.18;
    for (let side = 0; side < 4; side++) {
      const long = side % 2 === 0;
      slope(side * Math.PI / 2, long ? 3.21 : canopyRun, long ? canopyRun : 3.21,
        long ? 0.30 : 0.42, long ? 0.42 : 0.30, eave + 0.08, canopyRidge, canopy, null);
    }
    box(roof, material('#754530'), 0, canopyRidge + 0.035, canopy.z, 0.81, 0.22, 1.04);
    const finial = [[0.23,0],[0.23,0.07],[0.135,0.12],[0.12,0.19],[0.196,0.28],
      [0.17,0.40],[0.095,0.50],[0.078,0.57],[0.15,0.62],[0.12,0.70],[0.0,0.86]];
    const thazhikakkudam = mesh(roof, new T.LatheGeometry(finial.map(([r,h]) => new T.Vector2(r,h)), 24),
      material('#b0853f', 0.33, { metalness: 0.7 }), 0, canopyRidge + 0.08, canopy.z);
    thazhikakkudam.name = 'Thazhikakkudam';
  }
}
