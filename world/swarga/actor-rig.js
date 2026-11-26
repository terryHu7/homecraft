import { Group } from 'three';

export function createPivot(parent, x = 0, y = 0, z = 0) {
  const pivot = new Group();
  pivot.position.set(x, y, z);
  parent.add(pivot);
  return pivot;
}

export function attachBatch(pivot, batch, materials) {
  for (const mesh of batch.build(materials)) pivot.add(mesh);
}
