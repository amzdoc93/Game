// Fighting arenas scattered around the map. Each arena is a boxing-ring geometry
// at a fixed world position. Approach the entrance marker and press E to enter
// a 1v1 fight session.  During a session the player is locked to the ring and
// can use any of the 10 strikes from combat.js.

import * as THREE from 'three';
import { createNPC } from './npc.js';

const ARENA_SPEC = [
  { id: 'podval',  name: 'Подвал',     pos: [ 150,  -150], tier: 1, color: 0x5a3a2a },
  { id: 'stroyka', name: 'Стройка',    pos: [-150,   150], tier: 2, color: 0x6e5a2a },
  { id: 'garazh',  name: 'Гаражи',     pos: [ 150,   150], tier: 3, color: 0x3e3e4a },
  { id: 'arena',   name: 'Арена',      pos: [-150,  -150], tier: 4, color: 0x2a2a5a },
];

export function buildArenas(scene, envMap) {
  const arenas = [];
  for (const spec of ARENA_SPEC) {
    const a = buildOneArena(scene, spec, envMap);
    arenas.push(a);
  }
  return arenas;
}

function buildOneArena(scene, spec, envMap) {
  const group = new THREE.Group();
  group.name = 'Arena_' + spec.id;
  group.position.set(spec.pos[0], 0, spec.pos[1]);
  scene.add(group);

  // Ring canvas (floor)
  const canvasMat = new THREE.MeshStandardMaterial({
    color: 0xe8e0cc, roughness: 0.6, metalness: 0.05,
  });
  const canvas = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 10), canvasMat);
  canvas.position.y = 0.3; canvas.receiveShadow = true; canvas.castShadow = true;
  group.add(canvas);

  // Posts + ropes
  const postMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.6 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xaa1a1a, roughness: 0.8 });
  for (const [px, pz] of [[-4.8, -4.8], [4.8, -4.8], [-4.8, 4.8], [4.8, 4.8]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.9, 10), postMat);
    post.position.set(px, 1.25, pz); post.castShadow = true; group.add(post);
  }
  for (let h = 0; h < 3; h++) {
    const y = 0.9 + h * 0.45;
    for (const axis of ['x', 'z']) {
      for (const side of [-1, 1]) {
        const len = 9.6;
        const geo = new THREE.CylinderGeometry(0.035, 0.035, len, 8);
        geo.rotateZ(Math.PI / 2);
        const rope = new THREE.Mesh(geo, ropeMat);
        if (axis === 'x') rope.position.set(0, y, side * 4.8);
        else             { rope.rotation.y = Math.PI / 2; rope.position.set(side * 4.8, y, 0); }
        rope.castShadow = true;
        group.add(rope);
      }
    }
  }

  // Approach marker (glowing pillar) — tap/approach + E to enter
  const markerMat = new THREE.MeshStandardMaterial({
    color: spec.color, emissive: spec.color, emissiveIntensity: 1.4,
    roughness: 0.3, metalness: 0.2,
  });
  const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4, 16), markerMat);
  marker.position.set(0, 2, 7);
  group.add(marker);
  // Little "!" on top
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), markerMat);
  bulb.position.set(0, 4.3, 7); group.add(bulb);

  // Soft light to make the arena inviting at night too
  const pl = new THREE.PointLight(spec.color, 2.0, 14, 1.8);
  pl.position.set(0, 4, 0); group.add(pl);

  return {
    id: spec.id, name: spec.name, tier: spec.tier,
    group, marker,
    centerWorld: new THREE.Vector3(spec.pos[0], 0, spec.pos[1]),
    entryWorld: new THREE.Vector3(spec.pos[0], 0, spec.pos[1] + 7),
    cleared: false,
    // Build and return a fresh opponent
    spawnOpponent(scene) {
      const pos = new THREE.Vector3(spec.pos[0] + 2, 0, spec.pos[1]);
      const opp = createNPC(scene, 'fighter', pos);
      opp.spec = { ...opp.spec };
      opp.spec.hp = opp.spec.hp + (spec.tier - 1) * 40;
      opp.maxHp = opp.hp = opp.spec.hp;
      opp.spec.speed += (spec.tier - 1) * 0.4;
      opp.root.rotation.y = Math.PI;
      return opp;
    },
    playerStart: new THREE.Vector3(spec.pos[0] - 2, 0, spec.pos[1]),
  };
}

// Simple AABB check: is a position within a fight ring (so we clamp movement)?
export function inRingBounds(arena, pos) {
  const p = pos.clone().sub(arena.centerWorld);
  return Math.abs(p.x) < 4.5 && Math.abs(p.z) < 4.5;
}
export function clampToRing(arena, pos) {
  const p = pos.clone().sub(arena.centerWorld);
  p.x = Math.max(-4.5, Math.min(4.5, p.x));
  p.z = Math.max(-4.5, Math.min(4.5, p.z));
  return p.add(arena.centerWorld);
}
