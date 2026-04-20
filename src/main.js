// Entry point. Orchestrates modes (CAR / FOOT / FIGHT), NPCs, missions,
// camera follow, HUD updates, and touch controls.

import * as THREE from 'three';
import { Quality } from './quality.js';
import { createLighting } from './lighting.js';
import { buildWorld } from './world.js';
import { buildProps } from './props.js';
import { createCar } from './car.js';
import { createControls } from './controls.js';
import { createPostprocess } from './postprocess.js';
import { createPlayer } from './player.js';
import { createFootControls } from './footControls.js';
import { createNPC, updateNPC, tryHitNPC } from './npc.js';
import { buildArenas, clampToRing } from './fightArena.js';
import { createMissionSystem, defaultMissions } from './missions.js';
import { STRIKES, STRIKE_LIST } from './combat.js';

const el = id => document.getElementById(id);
const loadingEl = el('loading');
const fpsEl = el('fps'), modeEl = el('mode'), moneyEl = el('money');
const qualityBtn = el('quality'), qLabel = el('qlabel');
const missionEl = el('mission'), missionName = el('mission-name'),
      missionDesc = el('mission-desc'), missionProg = el('mission-progress');
const hpBar = el('hpBar').firstElementChild;
const stamBar = el('stamBar').firstElementChild;
const oppBarWrap = el('oppHpBar');
const oppBar = oppBarWrap.firstElementChild;
const toastEl = el('toast');
const strikesEl = el('strikes');
const hudCar = el('hud-car'), hudFoot = el('hud-foot'), hudFight = el('hud-fight');

// Renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({
  antialias: Quality.low, powerPreference: 'high-performance', stencil: false,
});
renderer.setPixelRatio(Quality.pixelRatioCap);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = Quality.shadowType === 'pcfsoft'
  ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
el('app').appendChild(renderer.domElement);

// Scene / camera ---------------------------------------------------------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  58, window.innerWidth / window.innerHeight, 0.5, Quality.drawDistance + 80);
camera.position.set(-70, 6, 10);

// World ------------------------------------------------------------------
const lighting = createLighting(scene, renderer);
const world = buildWorld(scene, lighting.envMap);
const props = buildProps(scene, world, lighting.envMap);
const car = createCar(scene, lighting.envMap);
const player = createPlayer(scene);
const arenas = buildArenas(scene, lighting.envMap);

// Mission system ---------------------------------------------------------
const missionSys = createMissionSystem(scene, world);
for (const m of defaultMissions(arenas)) missionSys.add(m);

// Controls ---------------------------------------------------------------
const driving = createControls(car, world);
const footing = createFootControls(player, world);

// Post ------------------------------------------------------------------
let post = Quality.postprocess ? createPostprocess(renderer, scene, camera) : null;

// --- State --------------------------------------------------------------
const State = {
  mode: 'CAR',           // 'CAR' | 'FOOT' | 'FIGHT'
  camMode: 0,            // 0 chase, 1 close, 2 top
  fight: null,           // { arena, opponent, start, reward }
  streetNPCs: [],        // bandits in brawl mission
  chase: null,           // { police: [npc,...], start, survive }
};

// --- Mode switching ----------------------------------------------------
function setMode(m) {
  State.mode = m;
  hudCar.style.display = m === 'CAR' ? '' : 'none';
  hudFoot.style.display = m === 'FOOT' ? '' : 'none';
  hudFight.style.display = m === 'FIGHT' ? '' : 'none';
  strikesEl.style.display = (m === 'FOOT' || m === 'FIGHT') ? 'grid' : 'none';
  el('foot-pad').style.display = (m === 'FOOT' || m === 'FIGHT') && hasTouch ? '' : 'none';
  el('interact').style.display = (m !== 'FIGHT' && hasTouch) ? '' : 'none';
  el('block-btn').style.display = (m === 'FOOT' || m === 'FIGHT') && hasTouch ? '' : 'none';
  oppBarWrap.style.display = m === 'FIGHT' ? '' : 'none';
  player.root.visible = (m === 'FOOT' || m === 'FIGHT');
  player.onFoot = (m === 'FOOT' || m === 'FIGHT');
  car.root.visible = true;
}

function enterFoot() {
  const rot = car.root.rotation.y;
  // Step out to the left side of the car
  const side = new THREE.Vector3(Math.cos(rot), 0, -Math.sin(rot)).multiplyScalar(1.8);
  player.root.position.copy(car.root.position).add(side);
  player.root.rotation.y = rot - Math.PI / 2;
  driving.state.speed = 0;
  setMode('FOOT');
}

function enterCar() {
  // Teleport player onto the car position (hidden)
  setMode('CAR');
}

function startFight(arena) {
  const opp = arena.spawnOpponent(scene);
  State.fight = { arena, opponent: opp, reward: 200 * arena.tier, started: performance.now() };
  player.root.position.copy(arena.playerStart);
  player.root.rotation.y = 0;
  player.hp = player.maxHp;
  player.combat.stamina = player.combat.maxStamina;
  setMode('FIGHT');
  toast(`Бой: ${arena.name}`, 1200);
}

function endFight(win) {
  if (!State.fight) return;
  const { arena, opponent, reward } = State.fight;
  if (opponent && opponent.root.parent) opponent.root.parent.remove(opponent.root);
  if (win) {
    player.money += reward;
    arena.cleared = true;
    toast(`Победа! +₽${reward}`, 1800);
    const mission = missionSys.missions.find(m => m.arenaRef === arena);
    if (mission) missionSys.markComplete(mission);
  } else {
    toast(`Поражение`, 1800);
    player.hp = Math.floor(player.maxHp * 0.4);
  }
  State.fight = null;
  // Leave the ring
  player.root.position.set(arena.entryWorld.x, 0, arena.entryWorld.z + 2);
  setMode('FOOT');
}

function toast(msg, duration = 1500) {
  toastEl.textContent = msg;
  toastEl.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toastEl.style.display = 'none'; }, duration);
}

// Player strike impact handler
footing.on('onStrike', () => {
  // The tickCombat loop will emit the impact event at the right frame;
  // we don't act here (visual only).
});

footing.on('onInteract', () => {
  if (State.mode === 'CAR') {
    enterFoot();
    return;
  }
  if (State.mode === 'FOOT') {
    // Entering car if close enough
    const d = player.root.position.distanceTo(car.root.position);
    if (d < 3.2) { enterCar(); return; }
    // Mission trigger (e.g. arena entry) is handled by missionSys.update()
    // via its onEnter callback; tap E again near marker to start.
    const active = missionSys.activeMission();
    if (active && active.kind === 'arena') {
      startFight(active.arenaRef);
    }
  }
});

// Mission-trigger callback (first time player enters marker radius)
function onMissionEnter(m) {
  missionEl.style.display = '';
  missionName.textContent = m.name;
  missionDesc.textContent = m.desc;
  missionProg.textContent = '';
  if (m.kind === 'arena') {
    toast(`${m.name} — нажми E`, 1500);
  } else if (m.kind === 'brawl') {
    spawnStreetBrawl(m);
  } else if (m.kind === 'deliver') {
    // Just needs player (in car) within delivery radius to complete
    m.needsArrival = true;
  } else if (m.kind === 'runaway') {
    spawnPoliceChase(m);
  }
}

function spawnStreetBrawl(m) {
  State.streetNPCs = [];
  for (let i = 0; i < m.enemyCount; i++) {
    const angle = (i / m.enemyCount) * Math.PI * 2;
    const pos = new THREE.Vector3(
      m.triggerPos.x + Math.cos(angle) * 5,
      0,
      m.triggerPos.z + Math.sin(angle) * 5,
    );
    State.streetNPCs.push(createNPC(scene, 'bandit', pos));
  }
  m.killed = 0;
}

function spawnPoliceChase(m) {
  State.chase = { police: [], start: performance.now(), survive: m.survive, mission: m };
  for (let i = 0; i < 2; i++) {
    const angle = Math.random() * Math.PI * 2;
    const pos = new THREE.Vector3(
      player.root.position.x + Math.cos(angle) * 12,
      0,
      player.root.position.z + Math.sin(angle) * 12,
    );
    State.chase.police.push(createNPC(scene, 'police', pos));
  }
}

// Spawn some ambient bandits/police even outside missions for flavor
function spawnAmbient() {
  const rng = Math.random;
  for (let i = 0; i < 5; i++) {
    const pos = new THREE.Vector3((rng() - 0.5) * 200, 0, (rng() - 0.5) * 200);
    if (world.isOnRoad(pos.x, pos.z, 3)) continue;
    State.streetNPCs.push(createNPC(scene, rng() < 0.5 ? 'bandit' : 'police', pos));
  }
}
spawnAmbient();

// --- Input glue --------------------------------------------------------
window.addEventListener('keydown', e => {
  if (e.code === 'KeyC') State.camMode = (State.camMode + 1) % 3;
  if (e.code === 'KeyQ') Quality.toggle();
});
qualityBtn.addEventListener('click', () => Quality.toggle());

Quality.onChange(mode => {
  modeEl.textContent = mode.toUpperCase();
  qLabel.textContent = mode.toUpperCase();
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

// Touch strike buttons
for (const btn of strikesEl.querySelectorAll('button')) {
  btn.addEventListener('touchstart', e => {
    e.preventDefault();
    footing.triggerStrike(btn.dataset.strike);
  }, { passive: false });
  btn.addEventListener('mousedown', () => footing.triggerStrike(btn.dataset.strike));
}

// Virtual joystick + interact + block for touch users
const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
setupTouchControls();

function setupTouchControls() {
  const pad = el('foot-pad');
  const nub = el('foot-nub');
  const radius = 55;
  let active = false, cx = 0, cy = 0;
  pad.addEventListener('touchstart', e => {
    e.preventDefault();
    const r = pad.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    active = true;
  }, { passive: false });
  pad.addEventListener('touchmove', e => {
    if (!active) return;
    e.preventDefault();
    const t = e.touches[0];
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > radius) { dx = dx / len * radius; dy = dy / len * radius; }
    nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    // Map nub to virtual WASD
    footing.keys['KeyW'] = dy < -18; footing.keys['KeyS'] = dy > 18;
    footing.keys['KeyA'] = dx < -18; footing.keys['KeyD'] = dx > 18;
  }, { passive: false });
  function endTouch() {
    active = false;
    nub.style.transform = 'translate(-50%,-50%)';
    footing.keys['KeyW'] = footing.keys['KeyS'] = footing.keys['KeyA'] = footing.keys['KeyD'] = false;
  }
  pad.addEventListener('touchend', endTouch); pad.addEventListener('touchcancel', endTouch);

  el('interact').addEventListener('touchstart', e => { e.preventDefault(); footing.listeners.onInteract.forEach(fn => fn()); }, { passive: false });
  el('interact').addEventListener('click', () => footing.listeners.onInteract.forEach(fn => fn()));
  const bb = el('block-btn');
  bb.addEventListener('touchstart', e => { e.preventDefault(); footing.keys['Space'] = true; }, { passive: false });
  bb.addEventListener('touchend',   e => { footing.keys['Space'] = false; });
  bb.addEventListener('touchcancel',e => { footing.keys['Space'] = false; });
}
setMode('CAR');

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
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

let lastCameraYaw = 0;

function loop() {
  const dt = Math.min(0.05, clock.getDelta());
  props.uniforms.uTime.value += dt;

  // Update driving / foot / fight
  if (State.mode === 'CAR') {
    driving.update(dt);
  } else {
    const confinement = State.mode === 'FIGHT'
      ? (p) => clampToRing(State.fight.arena, p)
      : null;
    const impact = footing.update(dt, lastCameraYaw, confinement);
    if (impact) onPlayerImpact(impact.strike);
  }

  // Update NPCs
  const enemiesToUpdate = [];
  if (State.mode === 'FIGHT' && State.fight) enemiesToUpdate.push(State.fight.opponent);
  for (const n of State.streetNPCs) enemiesToUpdate.push(n);
  if (State.chase) for (const n of State.chase.police) enemiesToUpdate.push(n);

  for (const npc of enemiesToUpdate) {
    const res = updateNPC(npc, player, dt);
    if (res && res.damage) {
      player.damage(res.damage);
      if (player.hp === 0) onPlayerDeath();
    }
  }

  // Fight win/lose check
  if (State.mode === 'FIGHT' && State.fight) {
    if (!State.fight.opponent.alive) { endFight(true); }
    else if (player.hp <= 0) { endFight(false); }
  }

  // Missions
  missionSys.update(dt, player.root.position, onMissionEnter);
  checkMissionProgress(dt);

  // Camera
  updateCamera(dt);
  lighting.updateShadowTarget(State.mode === 'CAR' ? car.root.position : player.root.position);

  // HUD
  hpBar.style.width = `${(player.hp / player.maxHp) * 100}%`;
  stamBar.style.width = `${(player.combat.stamina / player.combat.maxStamina) * 100}%`;
  moneyEl.textContent = `₽${player.money}`;
  if (State.fight && State.fight.opponent) {
    const o = State.fight.opponent;
    oppBar.style.width = `${Math.max(0, o.hp / o.maxHp) * 100}%`;
  }

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

// Player's strike reaches the "active" window — test against enemies
function onPlayerImpact(strike) {
  const pool = [];
  if (State.mode === 'FIGHT' && State.fight) pool.push(State.fight.opponent);
  for (const n of State.streetNPCs) if (n.alive) pool.push(n);
  if (State.chase) for (const n of State.chase.police) if (n.alive) pool.push(n);
  for (const n of pool) {
    const dmg = tryHitNPC(n, player, strike);
    if (dmg > 0) {
      // mission kill tracking
      if (!n.alive) trackKill(n);
    }
  }
}

function trackKill(npc) {
  // Street brawl mission
  for (const m of missionSys.missions) {
    if (m.kind === 'brawl' && m.state === 'ACTIVE' && !m.done) {
      if (State.streetNPCs.includes(npc)) {
        m.killed++;
        if (m.killed >= m.enemyCount) {
          player.money += m.reward;
          toast(`Миссия выполнена! +₽${m.reward}`, 1800);
          missionSys.markComplete(m);
          missionEl.style.display = 'none';
        }
      }
    }
  }
}

function onPlayerDeath() {
  toast('Ты в отключке…', 2000);
  player.hp = Math.floor(player.maxHp * 0.5);
  // Respawn near car
  player.root.position.copy(car.root.position).add(new THREE.Vector3(2, 0, 0));
  setMode('FOOT');
}

function checkMissionProgress(dt) {
  for (const m of missionSys.missions) {
    if (m.state !== 'ACTIVE' || m.done) continue;
    if (m.kind === 'deliver' && m.needsArrival) {
      if (State.mode === 'CAR') {
        const d = car.root.position.distanceTo(m.triggerPos);
        if (d < 4) {
          player.money += m.reward;
          toast(`Доставка! +₽${m.reward}`, 1800);
          missionSys.markComplete(m);
          missionEl.style.display = 'none';
        }
      }
    }
    if (m.kind === 'brawl') {
      missionProg.textContent = `Побито: ${m.killed}/${m.enemyCount}`;
    }
    if (m.kind === 'runaway' && State.chase) {
      const elapsed = (performance.now() - State.chase.start) / 1000;
      const left = Math.max(0, m.survive - elapsed);
      missionProg.textContent = `Осталось: ${left.toFixed(1)} с`;
      // Player death handled elsewhere
      if (left === 0) {
        player.money += m.reward;
        toast(`Ушёл от погони! +₽${m.reward}`, 1800);
        missionSys.markComplete(m);
        for (const p of State.chase.police) {
          if (p.root.parent) p.root.parent.remove(p.root);
        }
        State.chase = null;
        missionEl.style.display = 'none';
      }
    }
  }
}

function updateCamera(dt) {
  if (State.mode === 'FIGHT') {
    // Ringside isometric
    const arena = State.fight.arena;
    const c = arena.centerWorld;
    camera.position.lerp(new THREE.Vector3(c.x + 10, 6, c.z + 10), 0.1);
    camera.lookAt(c.x, 1.2, c.z);
    lastCameraYaw = Math.atan2(c.x - camera.position.x, c.z - camera.position.z);
    return;
  }
  if (State.mode === 'FOOT') {
    // Third-person over shoulder
    const target = player.root.position;
    const yaw = player.root.rotation.y;
    const offset = new THREE.Vector3(Math.sin(yaw) * -4.5, 2.4, Math.cos(yaw) * -4.5);
    camera.position.lerp(target.clone().add(offset), 0.15);
    camera.lookAt(target.x, target.y + 1.3, target.z);
    lastCameraYaw = yaw;
    return;
  }
  // CAR
  tmpQ.setFromEuler(new THREE.Euler(0, car.root.rotation.y, 0));
  let off, look;
  if (State.camMode === 0)      { off = chaseOffset;                       look = chaseLook; }
  else if (State.camMode === 1) { off = new THREE.Vector3(0, 1.3, -3.5);   look = new THREE.Vector3(0, 1.4, 6); }
  else                          { off = new THREE.Vector3(0, 18, -0.01);   look = new THREE.Vector3(0, 0, 0); }
  tmpV.copy(off).applyQuaternion(tmpQ).add(car.root.position);
  camera.position.lerp(tmpV, State.camMode === 2 ? 1 : 0.15);
  tmpV.copy(look).applyQuaternion(tmpQ).add(car.root.position);
  camera.lookAt(tmpV);
  lastCameraYaw = car.root.rotation.y;
}

requestAnimationFrame(() => {
  loadingEl.style.display = 'none';
  loop();
});
