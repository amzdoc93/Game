// Soviet-era district builder. Roads in a grid, panel/brick/plaster houses,
// curbs and road markings as decals on the asphalt.

import * as THREE from 'three';
import {
  getAsphaltMaterial, getPanelMaterial, getPlasterMaterial, getBrickMaterial,
  getGrassGroundMaterial, getDirtMaterial, getWindowMaterial, getRoofMaterial,
  getCurbMaterial,
} from './materials.js';

const WORLD_SIZE = 320;            // half-extent
const BLOCK = 80;                  // distance between road centerlines
const ROAD_WIDTH = 10;

export function buildWorld(scene, envMap) {
  const group = new THREE.Group();
  group.name = 'World';
  scene.add(group);

  const out = {
    group,
    buildings: [],
    windows: [],  // {mesh} for later wall-mounted AC placement
    obstacles: [],
    roadMask: [], // list of rectangles (x,z, w,d) where no grass/buildings
    isOnRoad,
  };

  // --- ground (grass) ---------------------------------------------------
  {
    const g = new THREE.PlaneGeometry(WORLD_SIZE * 2.5, WORLD_SIZE * 2.5, 32, 32);
    // Minor bumps for bounce lighting feel
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, (Math.random() - 0.5) * 0.15);
    }
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    const mat = getGrassGroundMaterial(24);
    const ground = new THREE.Mesh(g, mat);
    ground.receiveShadow = true;
    ground.position.y = -0.02;
    group.add(ground);
  }

  // --- road grid --------------------------------------------------------
  const roads = new THREE.Group(); group.add(roads);
  const roadMat = getAsphaltMaterial(12);
  const roadPositions = [];
  for (let i = -2; i <= 2; i++) {
    const p = i * BLOCK;
    roadPositions.push(p);
    // Horizontal road
    const h = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE * 2, ROAD_WIDTH), roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0.005, p);
    h.receiveShadow = true; roads.add(h);
    out.roadMask.push({ x: 0, z: p, w: WORLD_SIZE * 2, d: ROAD_WIDTH });
    // Vertical road
    const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, WORLD_SIZE * 2), roadMat);
    v.rotation.x = -Math.PI / 2; v.position.set(p, 0.005, 0);
    v.receiveShadow = true; roads.add(v);
    out.roadMask.push({ x: p, z: 0, w: ROAD_WIDTH, d: WORLD_SIZE * 2 });
  }

  // Road markings — thin white dashes as decals on top of asphalt.
  const markMat = new THREE.MeshStandardMaterial({
    color: 0xe8e2c8, roughness: 0.7, metalness: 0, transparent: true, opacity: 0.85,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });
  function addDashes(axis, coord) {
    const len = 2.5, gap = 3.5;
    for (let t = -WORLD_SIZE; t < WORLD_SIZE; t += len + gap) {
      if (Math.abs(t) < ROAD_WIDTH) continue;  // break at intersections
      const g = new THREE.PlaneGeometry(axis === 'x' ? len : 0.18, axis === 'x' ? 0.18 : len);
      const m = new THREE.Mesh(g, markMat);
      m.rotation.x = -Math.PI / 2;
      if (axis === 'x') m.position.set(t + len / 2, 0.01, coord);
      else              m.position.set(coord, 0.01, t + len / 2);
      roads.add(m);
    }
  }
  for (const p of roadPositions) { addDashes('x', p); addDashes('z', p); }

  // --- curbs (edge geometry) --------------------------------------------
  const curbMat = getCurbMaterial();
  const curbGeo = new THREE.BoxGeometry(1, 0.22, 1);
  for (const p of roadPositions) {
    // two long curbs per road (both sides)
    for (const side of [-1, 1]) {
      // horizontal road curbs
      const ch = new THREE.Mesh(
        new THREE.BoxGeometry(WORLD_SIZE * 2, 0.22, 0.4), curbMat);
      ch.position.set(0, 0.11, p + side * (ROAD_WIDTH / 2 + 0.2));
      ch.castShadow = true; ch.receiveShadow = true;
      roads.add(ch);
      const cv = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.22, WORLD_SIZE * 2), curbMat);
      cv.position.set(p + side * (ROAD_WIDTH / 2 + 0.2), 0.11, 0);
      cv.castShadow = true; cv.receiveShadow = true;
      roads.add(cv);
    }
  }

  // --- buildings --------------------------------------------------------
  // One building per non-center plot; alternate between panel / plaster / brick.
  const plotMargin = ROAD_WIDTH / 2 + 4;
  const plotSize = BLOCK - ROAD_WIDTH - 8;
  let rng = mulberry32(42);
  for (let gx = -2; gx < 2; gx++) {
    for (let gz = -2; gz < 2; gz++) {
      const cx = gx * BLOCK + BLOCK / 2;
      const cz = gz * BLOCK + BLOCK / 2;
      // Sometimes leave a plot as a yard (less visual monotony)
      if (rng() < 0.25) {
        placeYard(group, cx, cz, plotSize, out);
        continue;
      }
      placeBuilding(group, cx, cz, plotSize, out, rng, envMap);
    }
  }

  // --- decorative decals (dirt patches, small puddles) -----------------
  const dirtMat = getDirtMaterial(3);
  for (let i = 0; i < 30; i++) {
    const x = (rng() - 0.5) * WORLD_SIZE * 1.6;
    const z = (rng() - 0.5) * WORLD_SIZE * 1.6;
    if (isOnRoad(x, z, 4)) continue;
    const r = 1.2 + rng() * 2.5;
    const d = new THREE.Mesh(new THREE.CircleGeometry(r, 16), dirtMat);
    d.rotation.x = -Math.PI / 2;
    d.position.set(x, 0.005, z);
    d.receiveShadow = true;
    group.add(d);
  }

  // Puddles near building entrances
  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0x1e2a38, roughness: 0.12, metalness: 0.6,
    envMap: envMap || null, envMapIntensity: 0.8,
    transparent: true, opacity: 0.85,
  });
  for (let i = 0; i < 15; i++) {
    const b = out.buildings[Math.floor(rng() * out.buildings.length)];
    if (!b) break;
    const a = rng() * Math.PI * 2;
    const r = 3 + rng() * 3;
    const x = b.position.x + Math.cos(a) * r;
    const z = b.position.z + Math.sin(a) * r;
    if (isOnRoad(x, z, 2)) continue;
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.8 + rng() * 0.9, 20), puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.012, z);
    p.receiveShadow = true;
    group.add(p);
  }

  return out;

  function isOnRoad(x, z, pad = 0) {
    for (const r of out.roadMask) {
      if (Math.abs(x - r.x) < r.w / 2 + pad && Math.abs(z - r.z) < r.d / 2 + pad) return true;
    }
    return false;
  }
}

// --- helpers ------------------------------------------------------------

function placeYard(group, cx, cz, size) {
  // A patch of bare ground; trees/benches are added later via props.
  const dirtMat = getDirtMaterial(2);
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.5, size * 0.5),
                               dirtMat);
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(cx, 0.003, cz);
  patch.receiveShadow = true;
  group.add(patch);
}

function placeBuilding(group, cx, cz, plotSize, out, rng, envMap) {
  const floors = 4 + Math.floor(rng() * 6);      // 4–9 floors (хрущевка to брежневка)
  const floorH = 3.0;
  const h = floors * floorH + 1.2;
  const w = 18 + rng() * 16;                     // along X
  const d = 11 + rng() * 4;                      // along Z
  const style = rng();
  const rotate = rng() < 0.5 ? 0 : Math.PI / 2;

  const group2 = new THREE.Group();
  group2.position.set(cx + (rng() - 0.5) * 6, 0, cz + (rng() - 0.5) * 6);
  group2.rotation.y = rotate;
  group.add(group2);

  // Wall material choice
  let wallMat;
  if (style < 0.45) wallMat = getPanelMaterial();
  else if (style < 0.8) {
    const tints = ['#c9b98d', '#b8a67a', '#d5c09a', '#a8957a', '#c0b89b'];
    wallMat = getPlasterMaterial(tints[Math.floor(rng() * tints.length)]);
  } else wallMat = getBrickMaterial();

  // Clone to give per-building UV repeats
  const mat = wallMat.clone();
  mat.map = wallMat.map.clone(); mat.map.needsUpdate = true;
  mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
  mat.map.repeat.set(w / 6, h / 6);
  if (wallMat.normalMap) {
    mat.normalMap = wallMat.normalMap.clone(); mat.normalMap.needsUpdate = true;
    mat.normalMap.wrapS = mat.normalMap.wrapT = THREE.RepeatWrapping;
    mat.normalMap.repeat.copy(mat.map.repeat);
  }

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group2.add(body);

  // Roof cap
  const roofMat = getRoofMaterial();
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.6, d + 0.6), roofMat);
  roof.position.y = h + 0.3;
  roof.castShadow = true;
  group2.add(roof);

  // Windows: instanced planes on front and back faces.
  addWindows(group2, w, h, d, floors, envMap, out, rng);

  // Balconies on front face every 2 floors
  addBalconies(group2, w, h, d, floors, rng);

  // Entrance with dim light
  addEntrance(group2, w, d);

  // Store world-space center for spawning puddles/props
  const center = new THREE.Vector3(); group2.getWorldPosition(center);
  out.buildings.push({ position: center, size: { w, h, d }, group: group2 });

  // Obstacle AABB in world space (axis-aligned after rotation)
  const bw = rotate === 0 ? w : d;
  const bd = rotate === 0 ? d : w;
  out.obstacles.push({ x: center.x, z: center.z, w: bw, d: bd, h });
}

function addWindows(parent, w, h, d, floors, envMap, out, rng) {
  const winMat = getWindowMaterial(envMap).clone();
  winMat.color = new THREE.Color().setHSL(0.58, 0.25, 0.18 + rng() * 0.12);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xded5c3, roughness: 0.7 });
  const winW = 1.0, winH = 1.4, winD = 0.08;
  const cols = Math.max(3, Math.floor(w / 2.2));
  const winGeo = new THREE.BoxGeometry(winW, winH, winD);
  const frameGeo = new THREE.BoxGeometry(winW + 0.18, winH + 0.18, winD * 0.6);

  // Random occupancy per apartment for "some lights on" variation
  const lit = new THREE.Color(0xfff0c8);
  const dark = winMat.color;

  for (const sign of [1, -1]) {
    const zPos = sign * (d / 2 + 0.02);
    // InstancedMesh per face for low draw calls
    const instCount = floors * cols;
    const frames = new THREE.InstancedMesh(frameGeo, frameMat, instCount);
    const panes  = new THREE.InstancedMesh(winGeo, winMat, instCount);
    frames.receiveShadow = true;
    panes.receiveShadow = true;
    const m = new THREE.Matrix4();
    const tmpColor = new THREE.Color();
    let i = 0;
    for (let fl = 0; fl < floors; fl++) {
      const y = 1.5 + fl * 3.0;
      for (let c = 0; c < cols; c++) {
        const x = -w / 2 + (w / cols) * (c + 0.5);
        m.makeTranslation(x, y, zPos);
        frames.setMatrixAt(i, m);
        m.makeTranslation(x, y, zPos + sign * 0.05);
        panes.setMatrixAt(i, m);
        tmpColor.copy(rng() < 0.12 ? lit : dark)
                .multiplyScalar(0.8 + rng() * 0.4);
        panes.setColorAt(i, tmpColor);
        i++;
      }
    }
    frames.instanceMatrix.needsUpdate = true;
    panes.instanceMatrix.needsUpdate = true;
    if (panes.instanceColor) panes.instanceColor.needsUpdate = true;
    parent.add(frames); parent.add(panes);
    out.windows.push({ mesh: panes, floors, cols, face: sign, w, d });
  }
}

function addBalconies(parent, w, h, d, floors, rng) {
  const railMat = new THREE.MeshStandardMaterial({ color: 0x7a7468, roughness: 0.7, metalness: 0.2 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x9c9585, roughness: 0.9 });
  const cols = Math.max(2, Math.floor(w / 3.5));
  for (let fl = 1; fl < floors; fl++) {
    if (rng() < 0.35) continue;
    const y = 0.5 + fl * 3.0;
    for (let c = 0; c < cols; c++) {
      if (rng() < 0.35) continue;
      const x = -w / 2 + (w / cols) * (c + 0.5);
      const bFloor = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.9), floorMat);
      bFloor.position.set(x, y, d / 2 + 0.45);
      bFloor.castShadow = true; bFloor.receiveShadow = true;
      parent.add(bFloor);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.05), railMat);
      rail.position.set(x, y + 0.45, d / 2 + 0.88);
      rail.castShadow = true;
      parent.add(rail);
      const railL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.85), railMat);
      railL.position.set(x - 0.8, y + 0.45, d / 2 + 0.45);
      parent.add(railL);
      const railR = railL.clone();
      railR.position.x = x + 0.8;
      parent.add(railR);
    }
  }
}

function addEntrance(parent, w, d) {
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x5b4a36, roughness: 0.9 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x2f1e10, roughness: 0.8 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.5, 0.1), frameMat);
  frame.position.set(0, 1.25, d / 2 + 0.06);
  frame.castShadow = true; frame.receiveShadow = true;
  parent.add(frame);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 0.05), doorMat);
  door.position.set(0, 1.1, d / 2 + 0.13);
  parent.add(door);
  // Dim porch light
  const porch = new THREE.PointLight(0xffc88a, 0.6, 6, 2);
  porch.position.set(0, 2.6, d / 2 + 0.6);
  parent.add(porch);
}

// Small deterministic PRNG
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
