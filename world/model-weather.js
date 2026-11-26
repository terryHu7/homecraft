import * as THREE from 'three';

// Separate picking surfaces keep the visible tiles and hull batched.
export function createModelSurfaces(houseRoof, shedRoof, boat) {
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 2.6), new THREE.MeshBasicMaterial());
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(0, 0.205, -0.35);
  deck.updateMatrix();
  deck.matrixWorld.multiplyMatrices(boat.matrixWorld, deck.matrix);
  const surfaces = [
    ...houseRoof.map(mesh => ({ mesh, site: 'house-roof' })),
    ...shedRoof.map(mesh => ({ mesh, site: 'shed-roof' })),
    { mesh: deck, site: 'boat' },
  ];
  const ray = new THREE.Raycaster(), hits = [];
  const bounds = new THREE.Box3().makeEmpty();
  for (const { mesh } of surfaces) {
    mesh.geometry.computeBoundingBox();
    bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  }
  function inspect(visibleOnly = false) {
    hits.length = 0;
    for (const { mesh } of surfaces) {
      if (!visibleOnly || mesh.layers.isEnabled(0)) mesh.raycast(ray, hits);
    }
  }
  function inspectAbove(x, z) {
    ray.ray.origin.set(x, 14, z);
    ray.ray.direction.set(0, -1, 0);
    inspect();
  }
  return {
    levels(x, z, out) {
      if (x < bounds.min.x || x > bounds.max.x || z < bounds.min.z || z > bounds.max.z) return;
      inspectAbove(x, z);
      for (const { object, point } of hits) {
        const site = surfaces.find(({ mesh }) => mesh === object).site;
        out.push({ y: point.y + (site === 'house-roof' ? 0.075 : 0), site });
      }
    },
    pick(source) {
      if (source.direction.y >= 0) return null;
      ray.ray.copy(source);
      inspect(true);
      let closest = null;
      for (const hit of hits) if (!closest || hit.distance < closest.distance) closest = hit;
      if (!closest) return null;
      const site = surfaces.find(({ mesh }) => mesh === closest.object).site;
      return { t: closest.distance, point: closest.point, site };
    },
  };
}

export function applyModelWeather(models, uniforms) {
  const applied = new Set();
  for (const model of models) model.traverse(({ material }) => {
    if (!material?.isMeshStandardMaterial || material.transparent || applied.has(material)) return;
    applied.add(material);
    const compile = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.customProgramCacheKey = () => key + '-model-weather-v1';
    material.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
      for (const name of ['uShelter', 'uShelterBox', 'uWet', 'uSnow']) shader.uniforms[name] = uniforms[name];
      shader.vertexShader = 'varying vec3 vWeatherPosition;\n' + shader.vertexShader.replace(
        '#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 weatherPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          weatherPosition = instanceMatrix * weatherPosition;
        #endif
        vWeatherPosition = (modelMatrix * weatherPosition).xyz;`);
      shader.fragmentShader = `varying vec3 vWeatherPosition;
        uniform sampler2D uShelter;
        uniform vec4 uShelterBox;
        uniform float uWet, uSnow;
        ` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float surfaceTop = texture2D(uShelter, (vWeatherPosition.xz - uShelterBox.xy) * uShelterBox.zw).r * 63.75 - 2.0;
        float exposed = smoothstep(-0.55, 0.05, vWeatherPosition.y - surfaceTop);
        float grain = fract(sin(dot(floor(vWeatherPosition.xz * 9.0), vec2(12.9898, 78.233))) * 43758.5453);
        float snow = exposed * smoothstep(grain * 0.7, grain * 0.7 + 0.25, uSnow);
        diffuseColor.rgb *= 1.0 - 0.32 * exposed * uWet;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.92, 0.96), snow);`);
    };
    material.needsUpdate = true;
  });
}
