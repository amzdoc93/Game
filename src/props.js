// Instanced props: trees (trunk + leaf canopy), grass billboards, lamp posts,
// trash bins, benches, AC units on facades, power wires.
//
// Foliage is wind-animated via a tiny vertex shader tweak (onBeforeCompile).

import * as THREE from 'three';
import {
  getBarkMaterial, getLeafMaterial, getGrassBladeMaterial, getMetalMaterial,
} from './materials.js';
import { Quality } from './quality.js';

export function buildProps(scene, world, envMap) {
  const group = new THREE.Group();
  group.name = 'Props';
  scene.add(group);

  const out = { group, uniforms: { uTime: { value: 0 }, uWind: { value: 0.5 } } };

  addTrees(group, world, out);
  addGrass(group, world, out);
  addLampPosts(group, world);
  addWires(group, world);
  addTrashBins(group, world);
  addACUnits(group, world);
  addParkedCars(group, world, envMap);

  return out;
}

// Injects wind shader into a leaf material without replacing the full material.
function attachWind(mat, uniforms) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.vertexShader =
      'uniform float uTime;\nuniform float uWind;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        vec3 transformed = vec3( position );
        #ifdef USE_INSTANCING
          mat4 iM = instanceMatrix;
          float phase = iM[3][0] * 0.13 + iM[3][2] * 0.17;
        #else
          float phase = position.x * 0.23 + position.z * 0.17;
        #endif
        float sway = sin(uTime * 1.7 + phase) * uWind;
        // Only sway upper part of canopy / grass tip (Y > 0.4)
        float mask = smoothstep(0.2, 1.2, position.y);
        transformed.x += sway * 0.25 * mask;
        transformed.z += cos(uTime * 1.4 + phase) * uWind * 0.18 * mask;
        `,
      );
  };
  mat.needsUpdate = true;
}

function addTrees(group, world, out) {
  const count = 180;
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 2.5, 8);
  trunkGeo.translate(0, 1.25, 0);
  const trunkMat = getBarkMaterial();

  // Canopy: a few crossed alpha-tested planes form a cheap volumetric bush
  const canopyGeo = new THREE.BufferGeometry();
  {
    // 3 crossed quads
    const quads = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      const c = Math.cos(a), s = Math.sin(a);
      const w = 1.8, h = 1.8;
      const p = [
        [-w,  0, -s * 0.01], [ w,  0,  s * 0.01],
        [ w, h,  s * 0.01], [-w, h, -s * 0.01],
      ];
      // rotate around Y
      const r = p.map(([x, y, z]) => [x * c - z * s, y, x * s + z * c]);
      const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
      const idx = quads.length / 3;
      quads.push(...r[0], ...r[1], ...r[2], ...r[3]);
    }
    const pos = new Float32Array(quads);
    canopyGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1,  0, 0, 1, 0, 1, 1, 0, 1,  0, 0, 1, 0, 1, 1, 0, 1]);
    canopyGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const index = [];
    for (let q = 0; q < 3; q++) {
      const o = q * 4; index.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    canopyGeo.setIndex(index);
    canopyGeo.computeVertexNormals();
  }

  const leafMat = getLeafMaterial().clone();
  attachWind(leafMat, out.uniforms);

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const canopies = new THREE.InstancedMesh(canopyGeo, leafMat, count);
  trunks.castShadow = true; trunks.receiveShadow = true;
  canopies.castShadow = Quality.treeShadows;
  canopies.receiveShadow = true;

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const tint = new THREE.Color();

  let placed = 0, tries = 0;
  const rng = seeded(1337);
  while (placed < count && tries < count * 6) {
    tries++;
    const x = (rng() - 0.5) * 500;
    const z = (rng() - 0.5) * 500;
    if (world.isOnRoad(x, z, 2)) continue;
    if (insideBuilding(world, x, z, 2.5)) continue;
    const scale = 1.4 + rng() * 1.3;
    const rotY = rng() * Math.PI * 2;
    q.setFromEuler(new THREE.Euler(0, rotY, 0));
    s.set(scale, scale, scale);
    m.compose(new THREE.Vector3(x, 0, z), q, s);
    trunks.setMatrixAt(placed, m);
    canopies.setMatrixAt(placed, m);
    tint.setHSL(0.26 + rng() * 0.06, 0.45 + rng() * 0.2, 0.42 + rng() * 0.1);
    canopies.setColorAt(placed, tint);
    placed++;
  }
  trunks.count = placed; canopies.count = placed;
  trunks.instanceMatrix.needsUpdate = true; canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  group.add(trunks); group.add(canopies);
}

function addGrass(group, world, out) {
  const count = Quality.grassCount;
  const geo = new THREE.PlaneGeometry(0.3, 0.45);
  geo.translate(0, 0.22, 0);
  const mat = getGrassBladeMaterial().clone();
  attachWind(mat, out.uniforms);

  const inst = new THREE.InstancedMesh(geo, mat, count);
  inst.frustumCulled = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const tint = new THREE.Color();
  const rng = seeded(77);
  let placed = 0, tries = 0;
  while (placed < count && tries < count * 4) {
    tries++;
    const x = (rng() - 0.5) * 500;
    const z = (rng() - 0.5) * 500;
    if (world.isOnRoad(x, z, 1.5)) continue;
    if (insideBuilding(world, x, z, 1.2)) continue;
    const scale = 0.7 + rng() * 0.7;
    q.setFromEuler(new THREE.Euler(0, rng() * Math.PI * 2, 0));
    s.set(scale, scale, scale);
    m.compose(new THREE.Vector3(x, 0, z), q, s);
    inst.setMatrixAt(placed, m);
    tint.setHSL(0.28, 0.5, 0.32 + rng() * 0.12);
    inst.setColorAt(placed, tint);
    placed++;
  }
  inst.count = placed;
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  group.add(inst);
}

function addLampPosts(group, world) {
  const postMat = getMetalMaterial(0x2a2a2a);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff3c8, emissive: 0xffe0a0, emissiveIntensity: 1.2,
    roughness: 0.3, metalness: 0.3,
  });
  const postGeo = new THREE.CylinderGeometry(0.08, 0.1, 4.2, 8);
  postGeo.translate(0, 2.1, 0);
  const headGeo = new THREE.SphereGeometry(0.22, 12, 10);
  headGeo.translate(0, 4.3, 0);
  const armGeo = new THREE.BoxGeometry(0.6, 0.06, 0.06);
  armGeo.translate(0.3, 4.15, 0);

  const posts = [];
  const rng = seeded(9);
  // Place along road edges every ~25m
  for (let i = -3; i <= 3; i++) {
    const p = i * 80;
    for (let t = -200; t <= 200; t += 24) {
      // horizontal road
      posts.push({ x: t, z: p + 6 * ((i + 10) % 2 ? 1 : -1), type: 'h' });
      // vertical road
      posts.push({ x: p + 6 * ((i + 10) % 2 ? 1 : -1), z: t, type: 'v' });
    }
  }
  const N = posts.length;
  const postM = new THREE.InstancedMesh(postGeo, postMat, N);
  const headM = new THREE.InstancedMesh(headGeo, headMat, N);
  const armM = new THREE.InstancedMesh(armGeo, postMat, N);
  postM.castShadow = true; armM.castShadow = true;
  const m = new THREE.Matrix4();
  posts.forEach((p, i) => {
    m.makeTranslation(p.x, 0, p.z);
    postM.setMatrixAt(i, m);
    headM.setMatrixAt(i, m);
    armM.setMatrixAt(i, m);
  });
  group.add(postM); group.add(headM); group.add(armM);
}

function addWires(group, world) {
  // Decorative hanging wires between utility posts along the outermost roads
  const mat = new THREE.LineBasicMaterial({ color: 0x1a1a1a });
  const geo = new THREE.BufferGeometry();
  const pts = [];
  for (let i = -3; i <= 3; i++) {
    const p = i * 80;
    for (let t = -200; t < 200; t += 24) {
      // catenary: two endpoints with sag
      const ax = t, az = p + 6;
      const bx = t + 24, bz = p + 6;
      const sag = 0.8;
      const segs = 10;
      for (let s = 0; s < segs; s++) {
        const u1 = s / segs, u2 = (s + 1) / segs;
        const y1 = 4.1 - Math.sin(u1 * Math.PI) * sag;
        const y2 = 4.1 - Math.sin(u2 * Math.PI) * sag;
        pts.push(ax + (bx - ax) * u1, y1, az + (bz - az) * u1);
        pts.push(ax + (bx - ax) * u2, y2, az + (bz - az) * u2);
      }
    }
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(geo, mat);
  group.add(lines);
}

function addTrashBins(group, world) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a3f2a, roughness: 0.8, metalness: 0.2 });
  const lidMat = new THREE.MeshStandardMaterial({ color: 0x1c2a1c, roughness: 0.8 });
  const bodyGeo = new THREE.CylinderGeometry(0.45, 0.4, 1.0, 12);
  bodyGeo.translate(0, 0.5, 0);
  const lidGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.08, 12);
  lidGeo.translate(0, 1.04, 0);

  const N = 30;
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, N);
  const lids = new THREE.InstancedMesh(lidGeo, lidMat, N);
  bodies.castShadow = lids.castShadow = true;
  bodies.receiveShadow = lids.receiveShadow = true;
  const rng = seeded(44);
  const m = new THREE.Matrix4();
  let placed = 0;
  for (const b of world.buildings) {
    if (placed >= N) break;
    const dir = rng() < 0.5 ? -1 : 1;
    const x = b.position.x + dir * (b.size.w / 2 + 2.5 + rng() * 1.5);
    const z = b.position.z + (rng() - 0.5) * b.size.d;
    if (world.isOnRoad(x, z, 1)) continue;
    m.makeTranslation(x, 0, z);
    bodies.setMatrixAt(placed, m);
    lids.setMatrixAt(placed, m);
    placed++;
  }
  bodies.count = lids.count = placed;
  bodies.instanceMatrix.needsUpdate = true;
  lids.instanceMatrix.needsUpdate = true;
  group.add(bodies); group.add(lids);
}

function addACUnits(group, world) {
  const matBody = new THREE.MeshStandardMaterial({ color: 0xd6d2c4, roughness: 0.5, metalness: 0.4 });
  const matVent = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.6, metalness: 0.5 });
  const box = new THREE.BoxGeometry(0.7, 0.45, 0.35);
  const vent = new THREE.BoxGeometry(0.55, 0.3, 0.02);
  const MAX = 240;
  const bodies = new THREE.InstancedMesh(box, matBody, MAX);
  const vents = new THREE.InstancedMesh(vent, matVent, MAX);
  bodies.castShadow = vents.castShadow = true;
  const rng = seeded(7);
  const m = new THREE.Matrix4();
  let placed = 0;
  for (const b of world.buildings) {
    if (placed >= MAX) break;
    const floors = Math.floor(b.size.h / 3.0);
    const cols = Math.max(3, Math.floor(b.size.w / 2.2));
    for (let f = 1; f < floors && placed < MAX; f++) {
      for (let c = 0; c < cols && placed < MAX; c++) {
        if (rng() > 0.25) continue;
        const side = rng() < 0.5 ? 1 : -1;
        const local = new THREE.Vector3(
          -b.size.w / 2 + (b.size.w / cols) * (c + 0.5) + (rng() - 0.5) * 0.5,
          1.5 + f * 3.0 + (rng() - 0.5) * 0.4,
          side * (b.size.d / 2 + 0.2),
        );
        local.applyQuaternion(b.group.quaternion);
        const wp = local.clone().add(b.position);
        m.makeTranslation(wp.x, wp.y, wp.z);
        bodies.setMatrixAt(placed, m);
        const m2 = new THREE.Matrix4().makeTranslation(wp.x, wp.y, wp.z + side * 0.18);
        vents.setMatrixAt(placed, m2);
        placed++;
      }
    }
  }
  bodies.count = vents.count = placed;
  bodies.instanceMatrix.needsUpdate = true;
  vents.instanceMatrix.needsUpdate = true;
  group.add(bodies); group.add(vents);
}

function addParkedCars(group, world, envMap) {
  // Reuse simple boxes as parked cars near buildings — 5 color variations.
  const colors = [0x6a6a6a, 0x2a3a2a, 0x7a2a2a, 0x2a3a55, 0xb4b4b4];
  const rng = seeded(2025);
  const bodyGeo = new THREE.BoxGeometry(4.2, 1.1, 1.8);
  bodyGeo.translate(0, 0.75, 0);
  const cabGeo = new THREE.BoxGeometry(2.4, 0.9, 1.7);
  cabGeo.translate(0, 1.6, 0);
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.8 });

  for (const b of world.buildings) {
    if (rng() < 0.25) continue;
    const slots = 2 + Math.floor(rng() * 3);
    for (let s = 0; s < slots; s++) {
      const dir = rng() < 0.5 ? -1 : 1;
      const local = new THREE.Vector3(
        -b.size.w / 2 + 2.2 + s * 2.4,
        0,
        dir * (b.size.d / 2 + 2.6),
      );
      local.applyQuaternion(b.group.quaternion);
      const p = local.clone().add(b.position);
      if (world.isOnRoad(p.x, p.z, 1)) continue;

      const c = new THREE.Group();
      c.position.copy(p);
      c.rotation.y = (b.group.rotation.y + (rng() < 0.5 ? 0 : Math.PI)) + (rng() - 0.5) * 0.2;
      const color = colors[Math.floor(rng() * colors.length)];
      const bodyMat = new THREE.MeshPhysicalMaterial({
        color, metalness: 0.7, roughness: 0.35,
        envMap: envMap || null, envMapIntensity: 0.8,
        clearcoat: 0.5, clearcoatRoughness: 0.3,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      const cab = new THREE.Mesh(cabGeo, bodyMat);
      body.castShadow = cab.castShadow = true;
      body.receiveShadow = cab.receiveShadow = true;
      c.add(body); c.add(cab);
      for (const [wx, wz] of [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9]]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.position.set(wx, 0.35, wz);
        w.castShadow = true;
        c.add(w);
      }
      group.add(c);
    }
  }
}

// --- utils --------------------------------------------------------------
function insideBuilding(world, x, z, pad = 0) {
  for (const o of world.obstacles) {
    if (Math.abs(x - o.x) < o.w / 2 + pad && Math.abs(z - o.z) < o.d / 2 + pad) return true;
  }
  return false;
}

function seeded(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
