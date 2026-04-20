// Entry point: renderer, scene, camera, main loop. Wires together lighting,
// world, props, car, controls, postprocess.  Handles resize and quality toggle.

import * as THREE from 'three';
import { Quality } from './quality.js';
import { createLighting } from './lighting.js';
import { buildWorld } from './world.js';
import { buildProps } from './props.js';
import { createCar } from './car.js';
import { createControls } from './controls.js';
import { createPostprocess } from './postprocess.js';

const loadingEl = document.getElementById('loading');
const fpsEl = document.getElementById('fps');
const modeEl = document.getElementById('mode');
const qualityBtn = document.getElementById('quality');
const qLabel = document.getElementById('qlabel');

// --- Renderer -----------------------------------------------------------
const renderer = new THREE.WebGLRenderer({
  antialias: Quality.low, // enable MSAA on low (we skip FXAA there)
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(Quality.pixelRatioCap);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = Quality.shadowType === 'pcfsoft'
  ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);

// --- Scene / camera -----------------------------------------------------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  58, window.innerWidth / window.innerHeight, 0.5, Quality.drawDistance + 80);
camera.position.set(-70, 6, 10);

// --- Lighting (also builds env map) -------------------------------------
const lighting = createLighting(scene, renderer);

// --- World + props + car ------------------------------------------------
const world = buildWorld(scene, lighting.envMap);
const props = buildProps(scene, world, lighting.envMap);
const car = createCar(scene, lighting.envMap);

const controls = createControls(car, world);

// --- Postprocess --------------------------------------------------------
let post = Quality.postprocess ? createPostprocess(renderer, scene, camera) : null;

// --- Camera follow ------------------------------------------------------
let camMode = 0; // 0 chase, 1 close, 2 top
window.addEventListener('keydown', e => {
  if (e.code === 'KeyC') camMode = (camMode + 1) % 3;
  if (e.code === 'KeyQ') Quality.toggle();
});
qualityBtn.addEventListener('click', () => Quality.toggle());

Quality.onChange(mode => {
  modeEl.textContent = mode.toUpperCase();
  qLabel.textContent = mode.toUpperCase();
  // Rebuild shadows / post on change
  renderer.setPixelRatio(Quality.pixelRatioCap);
  renderer.shadowMap.type = Quality.shadowType === 'pcfsoft'
    ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
  lighting.sun.shadow.mapSize.set(Quality.shadowMapSize, Quality.shadowMapSize);
  lighting.sun.shadow.map?.dispose();
  lighting.sun.shadow.map = null;
  if (Quality.postprocess) {
    if (!post) post = createPostprocess(renderer, scene, camera);
    post.setSize(window.innerWidth, window.innerHeight);
  } else {
    post = null;
  }
});
modeEl.textContent = Quality.mode.toUpperCase();
qLabel.textContent = Quality.mode.toUpperCase();

// --- Resize -------------------------------------------------------------
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (post) post.setSize(w, h);
});

// --- Main loop ----------------------------------------------------------
const clock = new THREE.Clock();
let fpsAcc = 0, fpsFrames = 0, fpsT = 0;
const chaseOffset = new THREE.Vector3(0, 3.5, -9);
const chaseLook = new THREE.Vector3(0, 1, 6);
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

function loop() {
  const dt = Math.min(0.05, clock.getDelta());
  props.uniforms.uTime.value += dt;

  const driveInfo = controls.update(dt);

  // Chase camera
  tmpQ.setFromEuler(new THREE.Euler(0, car.root.rotation.y, 0));
  let off, look;
  if (camMode === 0)      { off = chaseOffset;                 look = chaseLook; }
  else if (camMode === 1) { off = new THREE.Vector3(0, 1.3, -3.5); look = new THREE.Vector3(0, 1.4, 6); }
  else                    { off = new THREE.Vector3(0, 18, -0.01); look = new THREE.Vector3(0, 0, 0); }

  tmpV.copy(off).applyQuaternion(tmpQ).add(car.root.position);
  camera.position.lerp(tmpV, camMode === 2 ? 1 : 0.15);
  tmpV.copy(look).applyQuaternion(tmpQ).add(car.root.position);
  camera.lookAt(tmpV);

  // Keep shadow camera tight around the player
  lighting.updateShadowTarget(car.root.position);

  // Render
  if (post) post.render();
  else renderer.render(scene, camera);

  // FPS
  fpsAcc += dt; fpsFrames++; fpsT += dt;
  if (fpsT >= 0.5) {
    fpsEl.textContent = (fpsFrames / fpsAcc).toFixed(0);
    fpsAcc = 0; fpsFrames = 0; fpsT = 0;
  }

  requestAnimationFrame(loop);
}

// Warm-up: kick off after a tick so the sky/env has committed.
requestAnimationFrame(() => {
  loadingEl.style.display = 'none';
  loop();
});
