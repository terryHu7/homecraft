import * as THREE from 'three';
import { BoxBatch } from '@engine/world/blocks.js';

const paint = tint => ({ tex: 'paint', tint });
const gold = paint(0xeab246);
const white = paint(0xffe6a6);
const dark = paint(0x2d2231);
const eye = paint(0x251829);

export const DANCERS = [
  { id: 'rambha', name: 'Rambha', x: 44, z: .2, skin: 0xbc8057, cloth: 0x993847, silk: 0xe17e48, hair: 'braid', dress: 'pleats', scale: 1.04, tempo: .92, phase: .10 },
  { id: 'urvashi', name: 'Urvashi', x: 48, z: -1.1, skin: 0xc88b61, cloth: 0x4a62a8, silk: 0x8ab7d5, hair: 'high-bun', dress: 'sash', scale: 1, tempo: 1.04, phase: .33 },
  { id: 'menaka', name: 'Menaka', x: 52, z: -1.1, skin: 0x9e6346, cloth: 0x246f64, silk: 0xb6a24d, hair: 'side-bun', dress: 'fan', scale: .97, tempo: .96, phase: .58 },
  { id: 'tilottama', name: 'Tilottama', x: 56, z: .2, skin: 0xd6976a, cloth: 0x76457d, silk: 0xd58eaa, hair: 'long', dress: 'drape', scale: 1.02, tempo: 1.08, phase: .82 },
];

function pivot(parent, x, y, z) {
  const joint = new THREE.Object3D();
  joint.position.set(x, y, z);
  parent.add(joint);
  return joint;
}

// Like the engine's pet rigs, upload each articulated character in one draw.
export function buildPerformer(layer, materials, design, instrument) {
  const skeleton = new THREE.Object3D();
  const seated = !!instrument;
  const hips = pivot(skeleton, 0, seated ? .51 : .89, 0);
  const torso = pivot(hips, 0, 0, 0);
  const head = pivot(torso, 0, .56, .015);
  const skin = paint(design.skin), cloth = paint(design.cloth), silk = paint(design.silk);
  const hair = paint(design.hair === 'side-bun' ? 0x39212a : 0x251d27);
  const batch = new BoxBatch(layer);
  const box = (joint, x, y, z, w, h, d, look, options) =>
    batch.box(x, y, z, w, h, d, look, { ...options, tag: joint, shadow: false });

  box(torso, 0, -.09, 0, .34, .18, .245, cloth);
  box(torso, 0, .08, 0, .29, .36, .22, cloth);
  box(torso, 0, .32, 0, seated ? .48 : .41, .19, .245, silk);
  box(torso, 0, .50, .01, .131, .105, .15, skin);
  box(torso, 0, .074, .025, .35, .052, .252, gold);
  box(torso, 0, .363, .14, .16, .038, .035, gold);
  box(torso, 0, .314, .152, .045, .047, .039, white, { rz: Math.PI / 4 });

  box(head, 0, -.04, .017, .252, .271, .229, skin);
  box(head, 0, -.022, .145, .15, .07, .029, skin);
  box(head, 0, .071, .143, .042, .047, .04, skin);
  box(head, 0, .195, -.006, .269, .099, .25, hair);
  box(head, 0, .005, -.108, .258, .24, .075, hair);
  for (const side of [-1, 1]) {
    box(head, side * .067, .101, .135, .046, .025, .012, eye);
    box(head, side * .067, .136, .135, .051, .014, .013, hair);
    box(head, side * .13, .036, .016, .035, .084, .069, skin);
    box(head, side * .153, .014, .033, .034, .061, .036, gold);
    box(head, side * .117, .108, .071, .044, .078, .118, hair);
  }
  if (!seated) {
    box(head, 0, .156, .138, .037, .053, .024, gold);
    box(head, 0, .017, .141, .062, .012, .012, paint(0x89483f));
  }
  if (design.hair === 'braid') {
    box(torso, 0.04, -.02, -.163, .107, .53, .102, hair, { rz: -.08 });
    for (const y of [.03, .19, .36]) box(torso, .043, y, -.17, .126, .035, .11, gold);
  } else if (design.hair === 'high-bun') {
    box(head, 0, .273, -.058, .18, .163, .177, hair);
    box(head, 0, .297, -.061, .186, .049, .185, white);
  } else if (design.hair === 'side-bun') {
    box(head, -.092, .155, -.122, .194, .175, .14, hair);
    box(head, -.157, .21, -.071, .074, .067, .09, white);
  } else if (design.hair === 'long') {
    box(torso, 0, .105, -.141, .247, .459, .098, hair);
    box(head, 0, .165, -.121, .245, .058, .053, gold);
  } else {
    box(head, 0, .242, -.037, .225, .124, .213, silk);
  }

  if (design.dress === 'pleats' || design.dress === 'fan') {
    const broad = design.dress === 'fan';
    for (let i = -2; i <= 2; i++) {
      box(hips, i * .063, broad ? -.24 : -.17, .141, .056, broad ? .28 : .21, .079, i % 2 ? cloth : silk, { rz: i * .21 });
    }
  } else if (design.dress === 'sash') {
    box(torso, 0, .065, .142, .115, .46, .046, silk, { rz: -.48 });
    box(hips, -.12, -.28, .1, .135, .4, .096, silk, { rz: -.14 });
  } else if (design.dress === 'drape') {
    box(torso, -.11, .08, .137, .175, .44, .065, silk, { rz: .32 });
    box(hips, .19, -.41, -.043, .123, .51, .19, cloth, { rz: .13 });
    box(hips, .22, -.4, -.043, .13, .042, .20, gold);
  }

  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    const shoulder = pivot(torso, side * (seated ? .234 : .201), .398, 0);
    const elbow = pivot(shoulder, 0, -.26, 0);
    const wrist = pivot(elbow, 0, -.235, 0);
    box(shoulder, 0, -.15, 0, .13, .21, .144, silk);
    box(shoulder, 0, -.27, 0, .1, .134, .1, skin);
    box(shoulder, 0, -.168, 0, .139, .026, .152, gold);
    box(elbow, 0, -.235, 0, .084, .261, .083, skin);
    box(elbow, 0, -.213, 0, .102, .044, .1, gold);
    box(wrist, 0, -.123, 0, .089, .127, .05, skin);
    box(wrist, -side * .049, -.087, .014, .035, .081, .037, skin, { rz: -side * .26 });
    arms.push({ shoulder, elbow, wrist, side });

    const thigh = pivot(hips, side * .117, -.035, 0);
    const shin = pivot(thigh, 0, -.412, 0);
    const foot = pivot(shin, 0, -.37, 0);
    box(thigh, 0, -.431, 0, seated ? .22 : .163, .455, .19, cloth);
    box(thigh, 0, -.16, .023, .169, .18, .157, silk);
    box(shin, 0, -.265, 0, .137, .299, .149, cloth);
    box(shin, 0, -.268, 0, .145, .041, .157, silk);
    box(shin, 0, -.368, 0, .095, .13, .103, skin);
    box(shin, 0, -.334, 0, .115, .045, .122, gold);
    box(foot, 0, -.075, .051, .112, .082, .223, skin);
    legs.push({ thigh, shin, foot });
  }
  if (seated) buildInstrument(box, skeleton, instrument);

  const [mesh] = batch.build(materials);
  mesh.name = design.name;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.boundingSphere.set(new THREE.Vector3(0, 1, 0), 1.8);
  const joints = mesh.userData.tags;
  const rest = joints.map((_, i) => {
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(i, matrix);
    return matrix;
  });
  delete mesh.userData.tags;
  const matrix = new THREE.Matrix4();
  function upload() {
    skeleton.updateMatrixWorld(true);
    for (let i = 0; i < joints.length; i++) {
      matrix.multiplyMatrices(joints[i].matrixWorld, rest[i]);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  const root = new THREE.Group();
  root.name = design.id;
  root.scale.setScalar(design.scale);
  root.add(mesh);
  return { root, hips, torso, head, arms, legs, upload };
}

function buildInstrument(box, base, instrument) {
  const wood = paint(0x7c412e), hide = paint(0xd8ad75);
  const cushion = paint(0x644075);
  box(base, 0, .02, 0, .92, .14, .72, cushion);
  box(base, 0, .13, 0, .94, .027, .74, gold);
  if (instrument === 'veena') {
    box(base, -.43, .3, .37, .44, .29, .38, wood, { rz: -.14 });
    box(base, -.43, .57, .37, .32, .05, .29, hide);
    box(base, .11, .5, .37, .89, .104, .15, wood, { rz: .14 });
    box(base, .54, .58, .37, .23, .14, .19, gold, { rz: .14 });
    for (let i = 0; i < 9; i++) box(base, -.34 + i * .094, .55 + i * .013, .37, .017, .023, .154, gold);
    for (const z of [.335, .374, .413]) box(base, .045, .597, z, 1.04, .011, .011, white, { rz: .14 });
  } else if (instrument === 'flute') {
    box(base, .21, 1.081, .263, .84, .058, .058, hide);
    for (const x of [-.17, .07, .21, .35, .61]) box(base, x, 1.075, .263, .025, .069, .068, gold);
    for (const x of [.017, .14, .276, .414]) box(base, x, 1.132, .259, .025, .009, .024, eye);
  } else {
    box(base, 0, .31, .38, .65, .39, .38, wood);
    box(base, 0, .27, .38, .5, .47, .45, wood);
    for (const x of [-.333, .333]) {
      box(base, x, .31, .38, .063, .4, .42, hide);
      box(base, x * 1.11, .39, .38, .023, .23, .23, eye);
    }
    for (const z of [.18, .26, .5, .58]) box(base, 0, .58, z, .66, .028, .027, gold);
  }
}
