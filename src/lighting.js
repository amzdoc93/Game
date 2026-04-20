// Sun + hemisphere + sky + fog.  Shadow camera is re-framed around the player
// each frame so shadows stay crisp regardless of world size.

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Quality } from './quality.js';

export function createLighting(scene, renderer) {
  // Hemisphere: cool sky tint from above, warm ground bounce from below.
  const hemi = new THREE.HemisphereLight(0x87ceeb, 0x8b7355, 0.55);
  scene.add(hemi);

  // Directional "sun" — warm, low-ish angle.
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
  sun.position.set(80, 120, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(Quality.shadowMapSize, Quality.shadowMapSize);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 260;
  const d = 70;
  sun.shadow.camera.left = -d;
  sun.shadow.camera.right = d;
  sun.shadow.camera.top = d;
  sun.shadow.camera.bottom = -d;
  scene.add(sun);
  scene.add(sun.target);

  // Sky shader
  const sky = new Sky();
  sky.scale.setScalar(8000);
  scene.add(sky);
  const u = sky.material.uniforms;
  u.turbidity.value = 4.0;
  u.rayleigh.value = 1.6;
  u.mieCoefficient.value = 0.005;
  u.mieDirectionalG.value = 0.8;

  // Sun vector for sky shader (matches directional light angle).
  const sunVec = new THREE.Vector3();
  function updateSun() {
    // elevation ~40°, azimuth ~135° (afternoon)
    const phi = THREE.MathUtils.degToRad(90 - 42);
    const theta = THREE.MathUtils.degToRad(135);
    sunVec.setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(sunVec);
    sun.position.copy(sunVec).multiplyScalar(140);
  }
  updateSun();

  // Atmospheric fog matches sky tint — conceals far LOD pop-in.
  scene.fog = new THREE.FogExp2(0xbdd4e6, 0.0075);
  scene.background = scene.background || null; // sky mesh renders it

  // Build a PMREM from the sky for IBL (reflections on cars/windows).
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  // Render scene (sky only) to an env map
  const envRT = pmrem.fromScene(makeEnvScene(u.sunPosition.value), 0.04);
  scene.environment = envRT.texture;

  return {
    sun, hemi, sky, envMap: envRT.texture,
    // Keep shadow frustum centered on the player for sharp shadows.
    updateShadowTarget(pos) {
      sun.target.position.set(pos.x, 0, pos.z);
      sun.position.set(pos.x + 80, 120, pos.z + 60);
    },
  };
}

// Build a minimal scene containing just the sky so PMREM can sample it.
function makeEnvScene(sunPos) {
  const scene = new THREE.Scene();
  const sky = new Sky();
  sky.scale.setScalar(1000);
  const u = sky.material.uniforms;
  u.turbidity.value = 4.0;
  u.rayleigh.value = 1.6;
  u.mieCoefficient.value = 0.005;
  u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(sunPos);
  scene.add(sky);
  return scene;
}
