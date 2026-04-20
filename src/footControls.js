// On-foot + in-fight controls. Keyboard keys 1–0 map to the 10 strikes from
// combat.js.  Space = block.  WASD = move (camera-relative).
// On mobile, touch buttons in the HUD call actions directly.

import * as THREE from 'three';
import { STRIKES, STRIKE_LIST, beginStrike, tickCombat, setBlocking } from './combat.js';

export function createFootControls(player, world, opts = {}) {
  const keys = Object.create(null);
  const listeners = {
    onStrike: [],        // (strikeKey) => void
    onInteract: [],      // () => void
  };

  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    // Map digits 1..0 to strikes
    const idx = '1234567890'.indexOf(e.key);
    if (idx >= 0) {
      tryStrike(STRIKE_LIST[idx]);
    }
    if (e.code === 'KeyE') listeners.onInteract.forEach(fn => fn());
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  function tryStrike(key) {
    if (!player.onFoot) return;
    const ok = beginStrike(player, key);
    if (ok) listeners.onStrike.forEach(fn => fn(STRIKES[key]));
  }

  return {
    keys, listeners,
    on(name, fn) { listeners[name].push(fn); },
    triggerStrike: tryStrike,

    update(dt, cameraYaw, confinement) {
      if (!player.onFoot) return null;
      const forward =
        (keys['KeyW'] || keys['ArrowUp']   ? 1 : 0) -
        (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
      const strafe =
        (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) -
        (keys['KeyA'] || keys['ArrowLeft']  ? 1 : 0);
      const running = keys['ShiftLeft'] || keys['ShiftRight'];
      const blockingKey = keys['Space'] || keys['KeyB'];

      setBlocking(player, blockingKey);

      // Normalize input, rotate into world space by camera yaw
      const len = Math.hypot(forward, strafe);
      let mvx = 0, mvz = 0;
      if (len > 0) {
        const fx = forward / len, sx = strafe / len;
        const sin = Math.sin(cameraYaw), cos = Math.cos(cameraYaw);
        mvx = fx * sin + sx * cos;
        mvz = fx * cos - sx * sin;
      }
      // Slower while blocking/striking
      let speed = running ? 4.8 : 2.8;
      if (player.combat.currentStrike) speed *= 0.3;
      if (player.combat.blocking)      speed *= 0.6;

      const dx = mvx * speed * dt;
      const dz = mvz * speed * dt;
      const prev = player.root.position.clone();
      player.root.position.x += dx;
      player.root.position.z += dz;

      // Face movement direction
      if (len > 0) {
        const targetRot = Math.atan2(mvx, mvz);
        player.root.rotation.y = lerpAngle(player.root.rotation.y, targetRot, dt * 8);
      }

      // Confinement: either ring bounds during a fight, or global collision
      if (confinement) {
        const c = confinement(player.root.position);
        player.root.position.copy(c);
      } else {
        if (world && world.obstacles) {
          for (const o of world.obstacles) {
            if (Math.abs(player.root.position.x - o.x) < o.w / 2 + 0.4 &&
                Math.abs(player.root.position.z - o.z) < o.d / 2 + 0.4) {
              player.root.position.copy(prev);
              break;
            }
          }
        }
      }

      // Animate walk + tick combat
      const moved = Math.hypot(player.root.position.x - prev.x, player.root.position.z - prev.z) / Math.max(1e-4, dt);
      const impact = tickCombat(player, dt);
      if (!player.combat.currentStrike) {
        const s = Math.sin(player.animTime);
        if (player.parts.leftLeg) {
          player.parts.leftLeg.rotation.x = s * 0.5;
          player.parts.rightLeg.rotation.x = -s * 0.5;
        }
      }
      player.animTime += dt * (moved > 0.1 ? 8 : 0);

      return impact; // { type: 'impact', strike } when active window opens
    },
  };
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}
