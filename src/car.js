// Player car: body, glass, wheels, headlights, brake lights, tire dust particles.
// Arcade physics (not rigid-body) — works reliably everywhere.

import * as THREE from 'three';
import { makeCarBodyMaterial, makeCarGlassMaterial } from './materials.js';

export function createCar(scene, envMap) {
  const root = new THREE.Group();
  root.name = 'Car';
  scene.add(root);

  const bodyMat = makeCarBodyMaterial(0xa02020, envMap);
  const glassMat = makeCarGlassMaterial(envMap);
  const metalTrim = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.7 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.9, envMap, envMapIntensity: 1 });
  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xffffe0, emissive: 0xfff3c8, emissiveIntensity: 1.0, roughness: 0.2,
  });
  const brakeMat = new THREE.MeshStandardMaterial({
    color: 0x441010, emissive: 0xff2020, emissiveIntensity: 0.2, roughness: 0.4,
  });

  // Lower body (hood + trunk)
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 4.3), bodyMat);
  body.position.y = 0.6;
  body.castShadow = true; body.receiveShadow = true;
  root.add(body);

  // Cabin (greenhouse) — slightly narrower/taller
  const cabShape = new THREE.BoxGeometry(1.85, 0.75, 2.2);
  const cab = new THREE.Mesh(cabShape, bodyMat);
  cab.position.set(0, 1.25, -0.15);
  cab.castShadow = true; cab.receiveShadow = true;
  root.add(cab);

  // Cabin window glass overlay
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.7, 2.22), glassMat);
  glass.position.copy(cab.position);
  glass.position.y += 0.02;
  root.add(glass);

  // Hood bevel (simple triangular prism via a second box lowered in front)
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.4), bodyMat);
  hood.position.set(0, 1.0, 1.3); root.add(hood);
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.2), bodyMat);
  trunk.position.set(0, 1.0, -1.5); root.add(trunk);

  // Bumpers
  const bumperGeo = new THREE.BoxGeometry(2.0, 0.25, 0.2);
  const bumperF = new THREE.Mesh(bumperGeo, metalTrim);
  bumperF.position.set(0, 0.45, 2.1); root.add(bumperF);
  const bumperR = new THREE.Mesh(bumperGeo, metalTrim);
  bumperR.position.set(0, 0.45, -2.1); root.add(bumperR);

  // Headlights
  const lightGeo = new THREE.BoxGeometry(0.45, 0.22, 0.12);
  const hlL = new THREE.Mesh(lightGeo, lightMat);
  hlL.position.set(-0.65, 0.75, 2.15); root.add(hlL);
  const hlR = hlL.clone(); hlR.position.x = 0.65; root.add(hlR);

  // Brake lights
  const blL = new THREE.Mesh(lightGeo, brakeMat);
  blL.position.set(-0.65, 0.85, -2.15); root.add(blL);
  const blR = blL.clone(); blR.position.x = 0.65; root.add(blR);

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 24);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.32, 12);
  rimGeo.rotateZ(Math.PI / 2);
  const wheelPos = [
    { x: -1.0, z: 1.45 }, { x: 1.0, z: 1.45 },
    { x: -1.0, z: -1.45 }, { x: 1.0, z: -1.45 },
  ];
  const wheels = wheelPos.map(p => {
    const w = new THREE.Mesh(wheelGeo, tireMat);
    w.position.set(p.x, 0.42, p.z);
    w.castShadow = true; w.receiveShadow = true;
    const r = new THREE.Mesh(rimGeo, rimMat);
    w.add(r);
    root.add(w);
    return w;
  });

  // Headlight spotlights (toggle with L)
  const spotL = new THREE.SpotLight(0xfff0c8, 0, 35, Math.PI / 7, 0.35, 1.2);
  spotL.position.set(-0.65, 0.75, 2.15);
  spotL.target.position.set(-0.7, 0.3, 8);
  root.add(spotL); root.add(spotL.target);
  const spotR = new THREE.SpotLight(0xfff0c8, 0, 35, Math.PI / 7, 0.35, 1.2);
  spotR.position.set(0.65, 0.75, 2.15);
  spotR.target.position.set(0.7, 0.3, 8);
  root.add(spotR); root.add(spotR.target);

  // Tire dust particles (simple point-based billboards)
  const dust = createDust(root);

  // Starting pose
  root.position.set(-60, 0, 0);
  root.rotation.y = 0;

  return {
    root, wheels,
    headlights: { on: false, L: spotL, R: spotR, emissives: [hlL.material, hlR.material] },
    brakeMat, dust,
    toggleHeadlights() {
      this.headlights.on = !this.headlights.on;
      const on = this.headlights.on;
      spotL.intensity = spotR.intensity = on ? 6 : 0;
      this.headlights.emissives.forEach(m => { m.emissiveIntensity = on ? 1.8 : 1.0; });
    },
    setBraking(isBraking) {
      brakeMat.emissiveIntensity = isBraking ? 2.0 : 0.2;
    },
  };
}

function createDust(parent) {
  const COUNT = 120;
  const pos = new Float32Array(COUNT * 3);
  const life = new Float32Array(COUNT);
  const vel = new Float32Array(COUNT * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xbfae91, size: 0.4, sizeAttenuation: true,
    transparent: true, opacity: 0.0, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  parent.parent.add(points); // put in world, not car, so particles stay behind
  let cursor = 0;
  return {
    points, pos, life, vel, geo, mat, COUNT,
    emit(worldPos, carForward, speed) {
      if (speed < 5) { mat.opacity = Math.max(0, mat.opacity - 0.03); return; }
      mat.opacity = Math.min(0.55, mat.opacity + 0.03);
      for (let k = 0; k < 3; k++) {
        const i = cursor; cursor = (cursor + 1) % COUNT;
        pos[i * 3]     = worldPos.x + (Math.random() - 0.5) * 1.2;
        pos[i * 3 + 1] = 0.1 + Math.random() * 0.2;
        pos[i * 3 + 2] = worldPos.z + (Math.random() - 0.5) * 1.2;
        life[i] = 1.0;
        vel[i * 3]     = -carForward.x * 2 + (Math.random() - 0.5) * 1.5;
        vel[i * 3 + 1] = 0.3 + Math.random() * 0.5;
        vel[i * 3 + 2] = -carForward.z * 2 + (Math.random() - 0.5) * 1.5;
      }
    },
    update(dt) {
      for (let i = 0; i < COUNT; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt * 1.2;
        pos[i * 3]     += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        vel[i * 3 + 1] -= dt * 1.5;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
