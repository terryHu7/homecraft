import * as THREE from 'three';
import { buildIsland } from '@engine/world/terrain.js';
import { buildPond } from './pond.js';
import { buildTharavadu } from './tharavadu-model.js';
import { BALCONY, BALCONY_SEATS, BILLIARDS, FIRST_FLOOR, HOUSE, HOUSE_SCALE, ISLAND, JETTY, NADUMUTTAM, OFFICE, OONJAL, REAR_EXTENSION, SOFA, STATIONS, UPPER, scaleHouseBounds } from './layout.js';
import { buildLanterns, controlLanterns } from './lanterns.js';
import { createModelSurfaces, applyModelWeather } from './model-weather.js';
import { setupBilliards } from '../assets/billiards.js';
import { getOffice } from '../assets/office-content.js';
import { createSwargGates } from './swarg-gate.js';
import { setupGateTravel } from './swarg-travel.js';


export function build({ grid }) {
  buildIsland(grid, ISLAND, {
    corner: 8, wobble: 0.6,
    surfaceAt: (_x, _z, edge) => edge < 2 ? 'sand' : 'grass',
  });
  const pond = buildPond(grid);
  const model = new THREE.Group();
  const { roof, house, grounds, cameraWalls, cameraBarriers, boat, doors, shelterSurfaces, shedRoof, obstacles, updateGrazing, tvDisplay, mirror, studyLamp, sampleRoof, lanternCeiling, photoFrames, libraryPaintingFrames } = buildTharavadu(model);
  const lanterns = buildLanterns(lanternCeiling, house, roof, grounds.getObjectByName('Wooden boat jetty'), boat);
  const modelSurfaces = createModelSurfaces(shelterSurfaces, shedRoof, boat);
  roof.userData.group = 'roof';
  const footprints = [
    { x0: -1.35, x1: 1.35, z0: -0.9, z1: 0.9, level: 0 },
    { x0: -2.23, x1: 2.23, z0: -8.22 - REAR_EXTENSION, z1: -7.82 - REAR_EXTENSION, level: 0 },
  ];
  const hotspots = STATIONS.filter(({ id }) => !['welcome', 'contact'].includes(id)).map(({ id, floor, look: [x, z] }) => ({
    id,
    box: new THREE.Box3(new THREE.Vector3(x - 0.65, floor + 0.2, z - 0.25),
      new THREE.Vector3(x + 0.65, floor + 2.2, z + 0.25)),
  }));
  const collisions = [...obstacles, ...footprints.map(scaleHouseBounds), ...doors.map(door => door.obstacle)];
  const upperObstacles = obstacles.filter(obstacle => obstacle.level === 1);
  const deck = { y: FIRST_FLOOR.y, site: 'first-floor' };
  const underDeck = { y: 0.46, site: 'ground-floor' };
  // Overlap the walk grid by one cell so the two surfaces join at rounded edges.
  const underDeckBounds = {
    x0: UPPER.x0 - 0.25, x1: UPPER.x1, z0: UPPER.z0 - 0.25, z1: UPPER.z1,
  };
  const contains = (area, x, z) => x >= area.x0 && x < area.x1 && z >= area.z0 && z < area.z1;
  const roofTopAt = (x, z) => {
    const top = sampleRoof(x, z);
    if (Number.isFinite(top)) return top;
    if (contains(NADUMUTTAM, x, z)) return NADUMUTTAM.floor;
    return contains(HOUSE, x, z) ? 3.55 : -Infinity;
  };
  const rainwater = createCourtyardWater();
  const onDeck = (x, z) => contains(FIRST_FLOOR, x, z) || contains(BALCONY, x, z);
  const upperFloor = {
    levels(x, z, out) {
      if (onDeck(x, z)) out.push(deck);
      // The stairs and office use the raised navigation grid. Supply the
      // ground floor below it so the grid does not wall off the almarah.
      if (contains(underDeckBounds, x, z)) out.push(underDeck);
    },
    obstructed(x, z, y) {
      if (Math.abs(y - deck.y) < 0.12) {
        return upperObstacles.some(obstacle => contains(obstacle, x, z)) ||
          doors.some(door => !door.open && door.obstacle.level === 1 && contains(door.obstacle, x, z));
      }
      return Math.abs(y - underDeck.y) < 0.12 &&
        collisions.some(obstacle => obstacle.level !== 1 && contains(obstacle, x, z));
    },
  };
  const cameraRay = new THREE.Ray(), cameraHit = new THREE.Vector3();
  const roofView = new THREE.Raycaster(), roofHits = [];
  function roofBlocksView(from, to) {
    const direction = roofView.ray.direction.subVectors(to, from);
    const length = direction.length();
    if (length < 0.05) return false;
    roofView.ray.origin.copy(from);
    direction.divideScalar(length);
    roofView.far = length - 0.04;
    roofHits.length = 0;
    // The backing panels give the roof outline without testing individual tiles.
    for (const panel of shelterSurfaces) {
      panel.raycast(roofView, roofHits);
      if (roofHits.length) return true;
    }
    return false;
  }
  const cameraCollision = {
    levels() {},
    viewBlock(from, direction, far) {
      cameraRay.set(from, direction);
      let closest = far;
      for (const barrier of cameraBarriers) {
        if (!barrier.containsPoint(from) && cameraRay.intersectBox(barrier, cameraHit)) {
          closest = Math.min(closest, from.distanceTo(cameraHit));
        }
      }
      return closest;
    },
  };
  const pierDeck = { y: JETTY.y, site: 'pier' };
  const pierPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -JETTY.y);
  const hit = new THREE.Vector3();
  const outer = {
    foot: { x: 0, z: JETTY.z0 + 0.7 },
    levels(x, z, out) {
      if (contains(JETTY, x, z)) out.push(pierDeck);
    },
    pick(ray) {
      if (ray.intersectPlane(pierPlane, hit) && contains(JETTY, hit.x, hit.z)) {
        return { t: hit.distanceTo(ray.origin), point: hit.clone(), site: pierDeck.site };
      }
      return null;
    },
    spots: () => [{ x: 0, z: JETTY.z1 - 1 }],
  };
  const swargGates = createSwargGates();

  return {
    planes: [house, grounds, roof, ...cameraWalls, boat, lanterns.group, rainwater.group, pond, ...swargGates.planes], obstacles: collisions,
    hotspots, sites: [upperFloor, outer, modelSurfaces, cameraCollision, swargGates.site], bakes: lanterns.bakes,
    named: { modelRoofPicking: true, weatherModels: [house, roof, ...cameraWalls, grounds.getObjectByName('Cattle shed'), boat], doors, outer, updateGrazing, roofTopAt, roofBlocksView, rainwater, tvDisplay, mirror, studyLamp, photoFrames, libraryPaintingFrames, setLanternBrightness: lanterns.setBrightness, swargGates },
  };
}

export function setup({ stage, world, nav, player, rig, weatherFx, sound, config }) {
  applyModelWeather(world.weatherModels, world.materials.uniforms);
  const updateLanterns = controlLanterns(stage, world);
  const updateMirror = createMirrorView(stage, world.mirror);
  const standButton = document.querySelector('[data-stand-oonjal]');
  const watchButton = document.querySelector('[data-seated-tv]');
  const officeMonitor = document.querySelector('#office-monitor');
  let previousView = null;
  const doors = new Map(world.doors.map(door => [door.id, door]));
  const billiards = setupBilliards();
  const travel = setupGateTravel({stage, world, player, rig, sound});
  const interactionTargets = world.doors.map(({ id, at, floor }) => ({
    id, at, floor, name: 'Door', en: 'Door', icon: 'portal', range: 1.45,
  }));
  interactionTargets.push({
    id: 'billiards', name: 'Play pool', en: 'Play pool', icon: 'works',
    at: [BILLIARDS.x * HOUSE_SCALE, BILLIARDS.z * HOUSE_SCALE],
    floor: 0.46, range: 1.8,
  });
  interactionTargets.push(...world.swargGates.targets);
  const seats = { oonjal: OONJAL, sofa: SOFA };
  BALCONY_SEATS.forEach((seat, index) => {
    const id = 'balcony-chair-' + index;
    seats[id] = seat;
    interactionTargets.push({ id, at: [seat.x, seat.z], floor: seat.floor,
      name: 'Sit on balcony chair', en: 'Sit on balcony chair', icon: 'about', range: 1.62 });
  });
  world.updateGrazing(0);
  void getOffice().then(({ photos, libraryPaintings = [] }) => {
    const loader = new THREE.TextureLoader();
    const images = [[world.photoFrames, photos], [world.libraryPaintingFrames, libraryPaintings]];
    for (const [frames, urls] of images) frames.forEach((frame, index) => {
      if (!urls[index]) return;
      loader.load(urls[index], texture => {
        texture.colorSpace = THREE.SRGBColorSpace;
        frame.map?.dispose();
        frame.map = texture;
        frame.needsUpdate = true;
      }, undefined, () => {});
    });
  });
  return {
    ...travel,
    interactionTargets,
    get officeOpen() { return !!officeMonitor?.open || !!billiards?.open; },
    handlesInteraction: id => id === 'skills' || Object.hasOwn(seats, id) || id.startsWith('swarg-'),
    interact(id) {
      if (travel.interact(id)) return true;
      if (id === 'billiards') { billiards?.showModal(); return true; }
      const door = doors.get(id);
      if (door) {
        const { x, z } = player.pos;
        const { obstacle } = door;
        if (door.open && x > obstacle.x0 - 0.3 && x < obstacle.x1 + 0.3 &&
            z > obstacle.z0 - 0.3 && z < obstacle.z1 + 0.3) return true;
        door.open = !door.open;
        if (door.open) world.obstacles.splice(world.obstacles.indexOf(obstacle), 1);
        else world.obstacles.push(obstacle);
        nav.rebuild();
        return true;
      }
      if (id === 'skills' && officeMonitor) {
        if (player.seated) this.standFromFurniture();
        if (!player.sitAt(OFFICE)) return true;
        previousView = rig.firstPerson;
        rig.setFirstPerson(true, OFFICE.heading);
        rig.recenter(player);
        document.dispatchEvent(new Event('office:open'));
        return true;
      }
      if (!Object.hasOwn(seats, id)) return false;
      if (player.seated) this.standFromFurniture();
      else this.sitOnFurniture(id);
      return true;
    },
    sitOnFurniture(id) {
      const seat = seats[id];
      if (!seat || !player.sitAt(seat)) return false;
      rig.recenter(player);
      return true;
    },
    standFromFurniture() {
      if (player.standUp()) rig.recenter(player);
    },
    leaveOffice() {
      if (previousView === null) return;
      player.standUp();
      rig.setFirstPerson(previousView, OFFICE.heading);
      previousView = null;
      rig.recenter(player);
    },
    showTVVideo(video) {
      const display = world.tvDisplay;
      display.material.map?.dispose();
      const map = video ? new THREE.VideoTexture(video) : null;
      if (map) map.colorSpace = THREE.SRGBColorSpace;
      display.material.map = map;
      display.material.needsUpdate = true;
      display.visible = !!map;
    },
    update(dt, elapsed, now) {
      travel.update(dt, elapsed);
      world.updateGrazing(elapsed);
      for (const door of doors.values()) for (const { hinge, openAngle } of door.leaves) {
        const target = door.open ? openAngle : 0;
        const angle = THREE.MathUtils.damp(hinge.rotation.y, target, 18, dt);
        hinge.rotation.y = Math.abs(angle - target) < 0.002 ? target : angle;
      }
      updateLanterns(dt);
      world.rainwater.update(dt, weatherFx?.rainIntensity ?? 0);
      world.studyLamp.emissiveIntensity = stage.getMood().night >= 0.3 ? 2 : 0;
      updateMirror(dt, player);
      if (previousView !== null && !player.seated && officeMonitor?.open) officeMonitor.close();
      const furniture = player.seated && previousView === null;
      if (standButton && standButton.hidden === furniture) standButton.hidden = !furniture;
      if (watchButton && watchButton.hidden === furniture) watchButton.hidden = !furniture;
    },
  };
}

function createCourtyardWater() {
  const { x0, x1, z0, z1, floor } = NADUMUTTAM;
  const group = new THREE.Group();
  group.name = 'Nadumuttam rainwater';
  group.visible = false;
  const appearance = new THREE.MeshBasicMaterial({ color: 0x648c88, transparent: true, opacity: 0, depthWrite: false });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.12, z1 - z0 - 0.12), appearance);
  water.rotation.x = -Math.PI / 2;
  group.add(water);
  // A draining film remains on the paving for a while after the rain ends.
  let amount = 0;
  return {
    group,
    update(dt, rain) {
      amount = THREE.MathUtils.clamp(amount + dt * (rain > 0.025 ? rain * 0.135 : -0.033), 0, 1);
      group.visible = amount > 0.005;
      group.position.y = floor + 0.001 + 0.063 * amount;
      appearance.opacity = 0.56 * amount;
    },
  };
}

// The wardrobe mirror shows the avatar from its own position as they approach.
function createMirrorView({ renderer, scene }, mirror) {
  const target = new THREE.WebGLRenderTarget(128, 256);
  target.texture.repeat.x = -1;
  target.texture.offset.x = 1;
  const camera = new THREE.OrthographicCamera(-0.33, 0.33, 0.66, -0.66, 0.06, 12);
  const focus = new THREE.Vector3();
  const mirrorPosition = new THREE.Vector3();
  let clock = 0;
  return (dt, player) => {
    mirror.getWorldPosition(mirrorPosition);
    const dx = mirrorPosition.x - player.pos.x;
    const dz = Math.abs(mirrorPosition.z - player.pos.z);
    const close = dx > 0.45 && dx < 2.55 && dz < 1.05 && player.floorY < 1.2;
    if (!close) {
      if (mirror.material.map) {
        mirror.material.map = null;
        mirror.material.color.setHex(0xa1aaa5);
        mirror.material.needsUpdate = true;
      }
      return;
    }
    clock += dt;
    if (clock < 0.1) return;
    clock = 0;
    camera.position.copy(mirrorPosition);
    camera.position.x -= 0.035;
    camera.lookAt(focus.set(player.pos.x, player.floorY + 1.29, player.pos.z));
    const previous = renderer.getRenderTarget();
    const shadows = renderer.shadowMap.autoUpdate;
    mirror.visible = false;
    renderer.shadowMap.autoUpdate = false;
    try {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    } finally {
      renderer.setRenderTarget(previous);
      renderer.shadowMap.autoUpdate = shadows;
      mirror.visible = true;
    }
    if (!mirror.material.map) {
      mirror.material.map = target.texture;
      mirror.material.color.setHex(0xe2e8e5);
      mirror.material.needsUpdate = true;
    }
  };
}
