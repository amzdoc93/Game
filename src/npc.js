// Humanoid NPCs: bandits, police, and arena fighters. Same skeleton as the
// player (so combat.js animates them identically). Each NPC runs a tiny
// state machine: IDLE → ALERT → CHASE → ATTACK, with a DEAD terminal state.

import * as THREE from 'three';
import { STRIKE_LIST, STRIKES, createCombatState, beginStrike, tickCombat, checkImpact, setBlocking } from './combat.js';

const TYPES = {
  bandit: {
    hp: 70,
    shirt: 0x4a1a1a, pants: 0x1a1a1a, skin: 0xc89a7a, hair: 0x1a1008,
    sightRange: 18, attackRange: 1.8, speed: 3.2,
    aggression: 0.85, preferredStrikes: ['jab', 'cross', 'leftHook', 'rightHook', 'knee'],
    reward: 50,
  },
  police: {
    hp: 90,
    shirt: 0x254b8a, pants: 0x15243a, skin: 0xd8b595, hair: 0x2a1e10,
    sightRange: 24, attackRange: 1.9, speed: 3.6,
    aggression: 0.7, preferredStrikes: ['jab', 'cross', 'lowKick', 'knee'],
    reward: 100,
  },
  fighter: {
    hp: 120,
    shirt: 0x2a2a2a, pants: 0x1a1a1a, skin: 0xc89a7a, hair: 0x08060a,
    sightRange: 30, attackRange: 1.9, speed: 4.0,
    aggression: 1.0, preferredStrikes: STRIKE_LIST,
    reward: 300,
  },
};

export function createNPC(scene, type, position) {
  const spec = TYPES[type];
  if (!spec) throw new Error(`Unknown NPC type: ${type}`);

  const root = new THREE.Group();
  root.name = 'NPC_' + type;
  root.position.copy(position);
  scene.add(root);

  const skinMat = new THREE.MeshStandardMaterial({ color: spec.skin, roughness: 0.85 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: spec.shirt, roughness: 0.75 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: spec.pants, roughness: 0.85 });
  const hairMat  = new THREE.MeshStandardMaterial({ color: spec.hair,  roughness: 0.9 });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), skinMat);
  head.position.y = 1.72; head.castShadow = true; root.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
  hair.position.y = 1.72; hair.castShadow = true; root.add(hair);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.19, 0.7, 12), shirtMat);
  torso.position.y = 1.28; torso.castShadow = true; root.add(torso);
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.25), pantsMat);
  pelvis.position.y = 0.92; pelvis.castShadow = true; root.add(pelvis);

  function limb(color, r1, r2, length, px, py) {
    const pivot = new THREE.Group();
    pivot.position.set(px, py, 0);
    const geo = new THREE.CylinderGeometry(r1, r2, length, 10);
    geo.translate(0, -length / 2, 0);
    const mesh = new THREE.Mesh(geo, color);
    mesh.castShadow = true;
    pivot.add(mesh);
    return pivot;
  }

  const leftArm  = limb(shirtMat, 0.07, 0.06, 0.7, -0.28, 1.55);
  const rightArm = limb(shirtMat, 0.07, 0.06, 0.7,  0.28, 1.55);
  const leftLeg  = limb(pantsMat, 0.09, 0.08, 0.9, -0.11, 0.9);
  const rightLeg = limb(pantsMat, 0.09, 0.08, 0.9,  0.11, 0.9);
  root.add(leftArm); root.add(rightArm); root.add(leftLeg); root.add(rightLeg);

  // Police cap
  if (type === 'police') {
    const capMat = new THREE.MeshStandardMaterial({ color: 0x1a2a55, roughness: 0.8 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.07, 12), capMat);
    cap.position.y = 1.85; cap.castShadow = true; root.add(cap);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.12), capMat);
    visor.position.set(0, 1.83, 0.15); root.add(visor);
  }

  const npc = {
    root, type, spec,
    hp: spec.hp, maxHp: spec.hp,
    parts: { leftArm, rightArm, leftLeg, rightLeg, head, torso },
    combat: createCombatState(),
    state: 'IDLE',
    stateTime: 0,
    animTime: 0,
    target: null,
    homePos: position.clone(),
    wanderPhase: Math.random() * Math.PI * 2,
    nextStrikeAt: 0.5 + Math.random() * 1.5,
    alive: true,
    animate(dt, movingSpeed) {
      this.animTime += dt * (movingSpeed > 0.1 ? 8 : 0);
      if (this.combat.currentStrike) return;
      const s = Math.sin(this.animTime);
      leftLeg.rotation.x = s * 0.55;
      rightLeg.rotation.x = -s * 0.55;
      leftArm.rotation.x = -s * 0.45;
      rightArm.rotation.x = s * 0.45;
    },
  };

  return npc;
}

// Simple AI update. `player` is the object with { root, combat, ... }.
// `damage` callback is called when this NPC lands a hit on the player.
export function updateNPC(npc, player, dt, opts = {}) {
  if (!npc.alive || npc.hp <= 0) {
    if (npc.alive) die(npc);
    return null;
  }

  const spec = npc.spec;
  const prev = npc.root.position.clone();
  const toP = player.root.position.clone().sub(npc.root.position);
  const dist = Math.hypot(toP.x, toP.z);

  npc.stateTime += dt;
  const canSee = dist < spec.sightRange;
  const playerAlive = player.hp > 0;

  switch (npc.state) {
    case 'IDLE':
      if (canSee && playerAlive && opts.hostile !== false) npc.state = 'ALERT', npc.stateTime = 0;
      wander(npc, dt);
      break;
    case 'ALERT':
      faceTarget(npc, toP, dt * 4);
      if (npc.stateTime > 0.3) { npc.state = 'CHASE'; npc.stateTime = 0; }
      break;
    case 'CHASE':
      if (!playerAlive) { npc.state = 'IDLE'; break; }
      faceTarget(npc, toP, dt * 5);
      if (dist > spec.attackRange * 0.9) {
        const dir = toP.clone().normalize();
        npc.root.position.x += dir.x * spec.speed * dt;
        npc.root.position.z += dir.z * spec.speed * dt;
      }
      if (dist < spec.attackRange) { npc.state = 'ATTACK'; npc.stateTime = 0; }
      if (dist > spec.sightRange * 1.4) { npc.state = 'IDLE'; }
      break;
    case 'ATTACK':
      faceTarget(npc, toP, dt * 8);
      if (dist > spec.attackRange * 1.2) { npc.state = 'CHASE'; break; }
      npc.nextStrikeAt -= dt;
      // Occasional block
      setBlocking(npc, !npc.combat.currentStrike && Math.random() < 0.02);
      if (npc.nextStrikeAt <= 0 && !npc.combat.currentStrike) {
        const pool = spec.preferredStrikes;
        const k = pool[Math.floor(Math.random() * pool.length)];
        beginStrike(npc, k);
        npc.nextStrikeAt = 0.7 + Math.random() * 1.2;
      }
      break;
  }

  // Advance strike animation / sense impacts
  const impact = tickCombat(npc, dt);
  let damaged = 0;
  if (impact && impact.type === 'impact') {
    damaged = checkImpact(npc, player, impact.strike);
  }

  // Walk cycle
  const speedMoved = Math.hypot(npc.root.position.x - prev.x, npc.root.position.z - prev.z) / Math.max(1e-4, dt);
  npc.animate(dt, speedMoved);

  return damaged > 0 ? { damage: damaged } : null;
}

function wander(npc, dt) {
  npc.wanderPhase += dt * 0.3;
  const tx = npc.homePos.x + Math.cos(npc.wanderPhase) * 4;
  const tz = npc.homePos.z + Math.sin(npc.wanderPhase) * 4;
  const dx = tx - npc.root.position.x, dz = tz - npc.root.position.z;
  const len = Math.hypot(dx, dz);
  if (len > 0.2) {
    npc.root.position.x += (dx / len) * 0.7 * dt;
    npc.root.position.z += (dz / len) * 0.7 * dt;
    const targetRot = Math.atan2(dx, dz);
    npc.root.rotation.y = lerpAngle(npc.root.rotation.y, targetRot, dt * 2);
  }
}

function faceTarget(npc, toP, t) {
  const target = Math.atan2(toP.x, toP.z);
  npc.root.rotation.y = lerpAngle(npc.root.rotation.y, target, t);
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

function die(npc) {
  npc.alive = false;
  // Flop onto the ground
  npc.root.rotation.x = -Math.PI / 2;
  npc.root.position.y = 0.3;
  for (const name of ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']) {
    const part = npc.parts[name];
    if (part) { part.rotation.x = 0; part.rotation.y = 0; part.rotation.z = 0; }
  }
}

// Called by the player's punch: did it hit this NPC?
export function tryHitNPC(npc, attacker, strike) {
  if (!npc.alive) return 0;
  const dmg = checkImpact(attacker, npc, strike);
  if (dmg > 0) {
    npc.hp = Math.max(0, npc.hp - dmg);
    if (npc.hp === 0) die(npc);
    // Small knock-back
    const dx = npc.root.position.x - attacker.root.position.x;
    const dz = npc.root.position.z - attacker.root.position.z;
    const len = Math.max(0.001, Math.hypot(dx, dz));
    npc.root.position.x += (dx / len) * 0.25;
    npc.root.position.z += (dz / len) * 0.25;
  }
  return dmg;
}
