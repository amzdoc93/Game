// Humanoid player character: head/body/arms/legs with simple walk animation.
// Health, punching, and enter/exit car mechanics live here.

import * as THREE from 'three';
import { createCombatState } from './combat.js';

export function createPlayer(scene) {
  const root = new THREE.Group();
  root.name = 'Player';
  root.visible = false;  // start in car
  scene.add(root);

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd8b08c, roughness: 0.85 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0x324a6b, roughness: 0.7 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e1e24, roughness: 0.85 });
  const hairMat  = new THREE.MeshStandardMaterial({ color: 0x2a1e12, roughness: 0.9 });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 14), skinMat);
  head.position.y = 1.72;
  head.castShadow = true;
  root.add(head);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
  hair.position.y = 1.72;
  hair.castShadow = true;
  root.add(hair);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.19, 0.7, 12), shirtMat);
  torso.position.y = 1.28;
  torso.castShadow = true;
  root.add(torso);

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.25), pantsMat);
  pelvis.position.y = 0.92;
  pelvis.castShadow = true;
  root.add(pelvis);

  // Arms are pivot-first so we can rotate at shoulder
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

  // Fist marker (used as the punch hit origin)
  const fist = new THREE.Group();
  fist.position.set(0, -0.7, 0);
  rightArm.add(fist);

  return {
    root,
    hp: 100, maxHp: 100,
    money: 0,
    combat: createCombatState(),
    attackCooldown: 0,
    animTime: 0,
    onFoot: false,
    punching: 0, // > 0 while in punch animation
    parts: { leftArm, rightArm, leftLeg, rightLeg, head, torso, fist },

    animate(dt, movingSpeed) {
      this.animTime += dt * (movingSpeed > 0.1 ? 8 : 0);
      const s = Math.sin(this.animTime);
      leftLeg.rotation.x = s * 0.6;
      rightLeg.rotation.x = -s * 0.6;
      leftArm.rotation.x = -s * 0.5;
      if (this.punching > 0) {
        this.punching -= dt;
        rightArm.rotation.x = -Math.PI / 2 + (1 - this.punching / 0.25) * 0.5;
      } else {
        rightArm.rotation.x = s * 0.5;
      }
    },

    damage(amount) {
      this.hp = Math.max(0, this.hp - amount);
    },
    heal(amount) {
      this.hp = Math.min(this.maxHp, this.hp + amount);
    },
    reset(pos) {
      this.hp = this.maxHp;
      root.position.copy(pos);
    },
  };
}
