// 10-strike UFC-style combat system. Each strike has windup, active window,
// damage, range, stamina cost, and an animation function acting on a humanoid.
//
// Arms: humanoid.parts.leftArm / rightArm (Three.Group pivots at shoulder).
// Legs: humanoid.parts.leftLeg / rightLeg.

export const STRIKES = {
  jab: {
    key: '1', label: 'Jab', arm: 'leftArm',
    windup: 0.06, active: 0.10, recovery: 0.14,
    damage: 6, range: 1.5, stamina: 4, block: 'head',
  },
  cross: {
    key: '2', label: 'Cross', arm: 'rightArm',
    windup: 0.10, active: 0.10, recovery: 0.20,
    damage: 10, range: 1.6, stamina: 7, block: 'head',
  },
  leftHook: {
    key: '3', label: 'L Hook', arm: 'leftArm', side: -1,
    windup: 0.14, active: 0.12, recovery: 0.22,
    damage: 13, range: 1.3, stamina: 9, block: 'head',
  },
  rightHook: {
    key: '4', label: 'R Hook', arm: 'rightArm', side: 1,
    windup: 0.14, active: 0.12, recovery: 0.22,
    damage: 13, range: 1.3, stamina: 9, block: 'head',
  },
  leftUpper: {
    key: '5', label: 'L Uppercut', arm: 'leftArm',
    windup: 0.18, active: 0.12, recovery: 0.26,
    damage: 16, range: 1.1, stamina: 11, block: 'head',
  },
  rightUpper: {
    key: '6', label: 'R Uppercut', arm: 'rightArm',
    windup: 0.18, active: 0.12, recovery: 0.26,
    damage: 16, range: 1.1, stamina: 11, block: 'head',
  },
  lowKick: {
    key: '7', label: 'Low Kick', leg: 'rightLeg',
    windup: 0.16, active: 0.12, recovery: 0.28,
    damage: 12, range: 1.7, stamina: 10, block: 'body',
  },
  highKick: {
    key: '8', label: 'High Kick', leg: 'rightLeg', high: true,
    windup: 0.24, active: 0.14, recovery: 0.34,
    damage: 20, range: 1.9, stamina: 16, block: 'head',
  },
  knee: {
    key: '9', label: 'Knee', leg: 'rightLeg', knee: true,
    windup: 0.10, active: 0.12, recovery: 0.20,
    damage: 14, range: 1.0, stamina: 9, block: 'body',
  },
  elbow: {
    key: '0', label: 'Elbow', arm: 'rightArm', elbow: true,
    windup: 0.08, active: 0.10, recovery: 0.18,
    damage: 15, range: 0.95, stamina: 8, block: 'head',
  },
};

export const STRIKE_LIST = Object.keys(STRIKES);

// Create a fresh combat state bag for a fighter (player or opponent)
export function createCombatState() {
  return {
    stamina: 100, maxStamina: 100,
    staminaRegen: 18,     // per second when not striking
    currentStrike: null,
    elapsed: 0,
    hitLanded: false,     // reset per strike
    blocking: false,
    lastStrikeTime: -1,
    stunUntil: 0,
  };
}

// Begin a strike if possible. Returns true if accepted.
export function beginStrike(fighter, strikeKey) {
  const strike = STRIKES[strikeKey];
  if (!strike) return false;
  const c = fighter.combat;
  if (c.currentStrike) return false;
  if (c.stunUntil > performance.now() / 1000) return false;
  if (c.stamina < strike.stamina) return false;
  c.currentStrike = strike;
  c.elapsed = 0;
  c.hitLanded = false;
  c.stamina -= strike.stamina;
  return true;
}

export function setBlocking(fighter, blocking) {
  fighter.combat.blocking = !!blocking && !fighter.combat.currentStrike;
}

// dt in seconds. Returns { event: 'impact', strike } on the frame where
// the attacker's hit should be checked, or null.
export function tickCombat(fighter, dt) {
  const c = fighter.combat;
  // Stamina regen
  if (!c.currentStrike && !c.blocking) {
    c.stamina = Math.min(c.maxStamina, c.stamina + c.staminaRegen * dt);
  } else if (c.blocking) {
    c.stamina = Math.min(c.maxStamina, c.stamina + c.staminaRegen * 0.25 * dt);
  }

  // Animate current strike
  if (c.currentStrike) {
    c.elapsed += dt;
    const s = c.currentStrike;
    const wEnd = s.windup, aEnd = s.windup + s.active;
    const totalEnd = aEnd + s.recovery;
    animateStrike(fighter, s, c.elapsed);
    // At the start of the active window — signal impact check once
    let event = null;
    if (!c.hitLanded && c.elapsed >= wEnd && c.elapsed < aEnd) {
      c.hitLanded = true;
      event = { type: 'impact', strike: s };
    }
    if (c.elapsed >= totalEnd) {
      c.currentStrike = null;
      resetPose(fighter);
    }
    return event;
  } else {
    // Block pose / idle bob
    idlePose(fighter, c.blocking, dt);
    return null;
  }
}

// --- pose helpers -------------------------------------------------------

function animateStrike(fighter, s, t) {
  const P = fighter.parts;
  const wEnd = s.windup;
  const aEnd = s.windup + s.active;
  const rEnd = aEnd + s.recovery;
  // Normalized arc: 0 = start, 1 = impact, 2 = fully returned
  const phase = t < wEnd ? t / wEnd
              : t < aEnd ? 1 + (t - wEnd) / (aEnd - wEnd) * 0.2
              : 1.2 + (t - aEnd) / (rEnd - aEnd) * (-1.2);
  // phase ranges roughly 0 -> 1.2 -> 0

  resetPose(fighter);
  if (s.arm) {
    const arm = P[s.arm];
    if (s.elbow) {
      // Horizontal elbow swing across the body
      arm.rotation.z = -0.6 + phase * 1.8;
      arm.rotation.x = -1.1;
    } else if (s.side) {
      // Hook: rotate around Y
      arm.rotation.y = s.side > 0 ? -phase * 1.2 : phase * 1.2;
      arm.rotation.x = -1.3;
    } else if (s.label && s.label.includes('Uppercut')) {
      arm.rotation.x = -1.8 + phase * 1.4;
    } else {
      // Jab / Cross: straight forward
      arm.rotation.x = -1.2 - phase * 0.6;
    }
  }
  if (s.leg) {
    const leg = P[s.leg];
    if (s.knee) {
      leg.rotation.x = -1.6 * phase;
    } else if (s.high) {
      leg.rotation.x = -0.4 - phase * 1.4;
      leg.rotation.z = 0.6 * phase;
    } else {
      leg.rotation.x = -0.2 - phase * 0.9;
    }
  }
}

function resetPose(f) {
  const P = f.parts;
  for (const name of ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']) {
    const part = P[name];
    if (part) { part.rotation.x = 0; part.rotation.y = 0; part.rotation.z = 0; }
  }
}

function idlePose(f, blocking, dt) {
  const P = f.parts;
  if (blocking) {
    // Raise both arms to face
    P.leftArm.rotation.x = -1.4;
    P.rightArm.rotation.x = -1.4;
    P.leftArm.rotation.z = -0.3;
    P.rightArm.rotation.z = 0.3;
  } else {
    // Leave to animate() in player/npc for walking cycle
  }
}

// Compute whether attacker's strike lands on defender this frame.
// Returns damage dealt (0 if missed/blocked).
export function checkImpact(attacker, defender, strike) {
  const a = attacker.root.position, d = defender.root.position;
  const dx = d.x - a.x, dz = d.z - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist > strike.range + 0.3) return 0;

  // Facing check: attacker must be mostly facing the defender
  const facing = Math.sin(attacker.root.rotation.y) * dx + Math.cos(attacker.root.rotation.y) * dz;
  if (facing < 0) return 0;

  let dmg = strike.damage;
  if (defender.combat.blocking) {
    dmg = Math.max(1, Math.floor(dmg * 0.25));
    defender.combat.stamina = Math.max(0, defender.combat.stamina - strike.damage * 0.4);
  }
  return dmg;
}
