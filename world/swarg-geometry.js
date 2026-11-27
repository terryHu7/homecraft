import * as THREE from 'three';

// Merge small static meshes without importing Three.js addons into the site.
export function mergeSwargGeometry(pieces) {
  const result = new THREE.BufferGeometry();
  const names = ['position', 'normal', 'uv'];
  let vertexOffset = 0;
  const attributes = Object.fromEntries(names.map(name => [name, []]));
  const indices = [];
  for (const geometry of pieces) {
    const position = geometry.getAttribute('position');
    for (const name of names) {
      const attribute = geometry.getAttribute(name);
      if (attribute) attributes[name].push(attribute.array);
    }
    const index = geometry.getIndex();
    if (index) {
      for (const value of index.array) indices.push(value + vertexOffset);
    } else {
      for (let i = 0; i < position.count; i++) indices.push(vertexOffset + i);
    }
    vertexOffset += position.count;
  }
  for (const name of names) {
    const arrays = attributes[name];
    if (!arrays.length || arrays.length !== pieces.length) continue;
    const length = arrays.reduce((sum, array) => sum + array.length, 0);
    const merged = new Float32Array(length);
    let offset = 0;
    for (const array of arrays) { merged.set(array, offset); offset += array.length; }
    result.setAttribute(name, new THREE.BufferAttribute(merged, name === 'uv' ? 2 : 3));
  }
  result.setIndex(indices);
  result.computeBoundingSphere();
  return result;
}
