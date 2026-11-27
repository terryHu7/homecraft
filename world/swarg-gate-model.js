import * as THREE from 'three';
import { mergeSwargGeometry } from './swarg-geometry.js';
const MATS = {
  marble: new THREE.MeshBasicMaterial({ color: 0xf4eee0 }),
  shade: new THREE.MeshBasicMaterial({ color: 0xd8c9af }),
  gold: new THREE.MeshBasicMaterial({ color: 0xd5a642, fog: false }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffe6a1,  fog: false }),
  halo: new THREE.MeshBasicMaterial({ color: 0xffdf9a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, fog: false }),
  cloud: new THREE.MeshBasicMaterial({ color: 0xf6f5f2, transparent: true, opacity: 0.86 }),
};

function box(geometry, x, y, z, w, h, d) {
  const part = new THREE.BoxGeometry(w, h, d);
  part.translate(x, y + h / 2, z);
  geometry.push(part);
}
function cylinder(geometry, x, y, z, radiusTop, radiusBottom, height, sides = 12) {
  const part = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, sides, 1);
  part.translate(x, y + height / 2, z);
  geometry.push(part);
}
function sphere(geometry, x, y, z, sx, sy, sz, detail = 1) {
  const part = new THREE.SphereGeometry(1, detail === 1 ? 8 : 12, detail === 1 ? 6 : 8);
  part.scale(sx, sy, sz); part.translate(x, y, z); geometry.push(part);
}
function addMerged(group, pieces, material, position = null, yaw = 0) {
  if (!pieces.length) return;
  const merged = mergeSwargGeometry(pieces);
  pieces.forEach(g => g.dispose());
  if(material===MATS.gold || material===MATS.marble){
    const normals=merged.attributes.normal, colors=[];
    for(let i=0;i<normals.count;i++){
      const value=.74+.22*normals.getY(i)+.12*normals.getZ(i);
      colors.push(value,value,value);
    }
    merged.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    material.vertexColors=true;
  }
  const mesh = new THREE.Mesh(merged, material);
  if (position) { mesh.position.set(position.x, position.y, position.z); mesh.rotation.y = yaw; }
  mesh.frustumCulled = true;
  group.add(mesh);
  return mesh;
}
export function buildGate(position, yaw, prefix, steps) {
  const root = new THREE.Group(); root.name = prefix; root.position.set(position.x, position.y, position.z); root.rotation.y = yaw;
  const parts = { marble: [], shade: [], gold: [], glow: [], halo: [], cloud: [] };
  // Cloud-stone platform, two fluted columns, and a torana lintel.
  for (let tier = 1; tier <= 2; tier++) box(parts.marble, 0, -0.7-tier*0.26, -0.2, 15.5+tier*.5, .26, 8.5+tier*.4);
  for (let i=0;i<25;i++) {
    const a=i*Math.PI/24;
    box(parts.gold, 5.3*Math.cos(a), 13.7+2.5*Math.sin(a), .8, .78,.55,.65);
  }
  for(let i=0;i<20;i++){
    const a=i*Math.PI/10, ray=new THREE.ConeGeometry(.12,.8,4);
    ray.rotateZ(a); ray.translate(-Math.sin(a)*1.2,17+Math.cos(a)*1.2,1);
    parts.gold.push(ray);
  }
  sphere(parts.gold,0,17,1,1,1,.18,2);
  box(parts.marble, 0, -0.7, -0.2, 15.5, 0.7, 8.5);
  for (const x of [-5.8, 5.8]) {
    cylinder(parts.marble, x, 0, 0, 0.78, 0.95, 13.7, 24);
    for (let i = 0; i < 8; i++) box(parts.shade, x + Math.cos(i * Math.PI / 4) * 0.68, 0.7, Math.sin(i * Math.PI / 4) * 0.68, 0.13, 12.1, 0.13);
    cylinder(parts.gold, x, 13.7, 0, 1.4, 0.8, 0.55, 12);
    // Lotus-petal capital and kalasha finial.
    for (let p = 0; p < 8; p++) {
      const a = p * Math.PI / 4;
      sphere(parts.gold, x + Math.cos(a) * 1.2, 14.4, Math.sin(a) * 1.2, 0.53, 0.25, 0.31);
    }
    cylinder(parts.gold, x, 14.75, 0, 0.2, 0.37, 0.7, 10);
    sphere(parts.gold, x, 15.55, 0, 0.36, 0.45, 0.36);
  }
  box(parts.marble, 0, 13.75, 0, 13.5, 1.15, 1.9);
  box(parts.gold, 0, 15.05, 0, 11.5, 0.22, 2.4);
  const relief=document.createElement('canvas'); relief.width=64; relief.height=128;
  const carving=relief.getContext('2d');
  carving.fillStyle='#b68138'; carving.fillRect(0,0,64,128);
  for(const y of [3,65]){
    carving.strokeStyle='#ffe3a0'; carving.lineWidth=2; carving.strokeRect(3,y,58,58);
    for(let i=0;i<8;i++){
      carving.save(); carving.translate(32,y+29); carving.rotate(i*Math.PI/4);
      carving.beginPath(); carving.ellipse(0,-9,4,10,0,0,2*Math.PI); carving.stroke(); carving.restore();
    }
  }
  const leafMaterial=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(relief),fog:false});
  const leaves=[];
  // Open gold leaves with raised symbolic panels, not figures.
  for(const side of [-1,1]){
    const hinge=new THREE.Group(), leaf=new THREE.Mesh(new THREE.BoxGeometry(4.4,12.6,.32),leafMaterial);
    hinge.position.set(side*4.6,0,.2); leaf.position.set(-side*2.2,6.3,0);
    hinge.rotation.y=side*.97; hinge.add(leaf); root.add(hinge); leaves.push(hinge);
  }
  root.userData.leaves=leaves;
  // Sun disc and hanging bells beneath the torana.
  const bellParts=[];
  for (const x of [-4.3, -2.5, 2.5, 4.3]) {
    box(bellParts, x, -.72, 0, 0.06, 0.72, 0.06);
    sphere(bellParts, x, -.87, 0, 0.2, 0.22, 0.2);
  }
  const bells=addMerged(root,bellParts,MATS.gold);
  bells.position.set(0,13.82,.82);root.userData.bells=bells;
  // Warm opening, a low-cost halo, and the faint beacon rising above clouds.
  
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d'), gradient=ctx.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'#fff9db'); gradient.addColorStop(.44,'#ffeabed9'); gradient.addColorStop(1,'#fff0');
  ctx.fillStyle=gradient; ctx.fillRect(0,0,64,64);
  const mist=new THREE.CanvasTexture(canvas);
  const slab=document.createElement('canvas');slab.width=slab.height=64;
  const stone=slab.getContext('2d');stone.fillStyle='#fffaf1';stone.fillRect(0,0,64,64);
  stone.strokeStyle='rgba(169,150,125,.24)';
  for(let i=0;i<5;i++){
    stone.beginPath();stone.moveTo(i*15-15,0);stone.bezierCurveTo(i*15+12,18,i*15-8,38,i*15+21,64);stone.stroke();
  }
  MATS.marble.map=new THREE.CanvasTexture(slab);
  MATS.halo.map=mist; MATS.halo.blending=THREE.AdditiveBlending;
  MATS.cloud.map=mist; MATS.cloud.depthWrite=false; MATS.cloud.side=THREE.DoubleSide;
  const portal=new THREE.Mesh(new THREE.PlaneGeometry(10,14),new THREE.MeshBasicMaterial({map:mist,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false}));
  portal.position.set(0,6.3,-.35);root.add(portal);
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(18, 22), MATS.halo);
  aura.position.set(0, 6.6, -1.65); root.add(aura); root.userData.aura=aura;
  const rays=[];
  for(const tilt of [-.24,.08,.3]){
    const ray=new THREE.PlaneGeometry(1.8,25);ray.rotateZ(tilt);
    ray.translate(-5*tilt,10,-.5);rays.push(ray);
  }
  const beacon=new THREE.PlaneGeometry(3,64);beacon.translate(0,35,0);rays.push(beacon);
  addMerged(root,rays,MATS.halo);
  // Wide white-marble approach stair. Treads descend 0.5 m at a time.
  for (let i = 0; i < steps; i++) {
    const h = 0.5, z = 4.55 + i * 0.9;
    box(parts.marble, 0, -i * h - h, z, 7.8, h, 1.08);
  }
  // Small separated cloud puffs beneath and alongside the landing.
  for (let i = 0; i < 15; i++) {
    const a = i * 2.399, r = 7 + (i % 4) * 1.7;
    const puff=new THREE.PlaneGeometry(10,4); puff.rotateY(Math.sin(i)*.6); puff.translate(Math.cos(a)*r,-1-i%3,Math.sin(a)*r); parts.cloud.push(puff);
  }
  // Combine the shaded fluting with the marble batch.
  parts.marble.push(...parts.shade);parts.shade.length=0;
  for (const [key, mat] of Object.entries(MATS)) if (parts[key]) {
    const mesh = addMerged(root, parts[key], mat);
    if (key === 'cloud') root.userData.clouds = mesh;
  }
  const specks=[];
  for(let i=0;i<48;i++) specks.push(3.7*Math.sin(i*2.4),.5+(i*1.31)%12,1.8*Math.cos(i*2.4));
  const dust=new THREE.BufferGeometry();
  dust.setAttribute('position',new THREE.Float32BufferAttribute(specks,3));
  const sparks=new THREE.Points(dust,new THREE.PointsMaterial({color:0xffdea1,size:.16,map:mist,transparent:true,depthWrite:false,fog:false}));
  root.add(sparks);root.userData.sparks=sparks;
  return root;
}

