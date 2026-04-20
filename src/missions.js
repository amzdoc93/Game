// Mission system: floating markers on the map, approach triggers, progress
// tracking, rewards. Arenas are integrated as a special mission type.

import * as THREE from 'three';

export function createMissionSystem(scene, world) {
  const missions = [];
  const markersGroup = new THREE.Group();
  markersGroup.name = 'Missions';
  scene.add(markersGroup);

  function addMarker(pos, colorHex, label) {
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex, emissive: colorHex, emissiveIntensity: 1.2,
      roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.9,
    });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 3.5, 16), mat);
    m.position.copy(pos); m.position.y = 1.75;
    markersGroup.add(m);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.1, 28),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    halo.rotation.x = -Math.PI / 2;
    halo.position.copy(pos); halo.position.y = 0.02;
    markersGroup.add(halo);
    return { pillar: m, halo };
  }

  function add(mission) {
    missions.push(mission);
    if (mission.markerPos && !mission.markerVisual) {
      mission.markerVisual = addMarker(mission.markerPos, mission.color || 0xffcc33);
    }
    return mission;
  }

  return {
    missions, markersGroup, add, addMarker,
    // Per-frame update: animate markers, check triggers
    update(dt, playerPos, onEnter) {
      for (const m of missions) {
        if (m.done || m.hidden) continue;
        if (m.markerVisual) {
          m.markerVisual.pillar.rotation.y += dt * 1.5;
          m.markerVisual.halo.scale.setScalar(1 + Math.sin(performance.now() * 0.003) * 0.15);
        }
        if (m.state === 'WAITING' && m.triggerPos) {
          const d = playerPos.distanceTo(m.triggerPos);
          if (d < (m.triggerRadius || 3)) {
            m.state = 'ACTIVE';
            if (onEnter) onEnter(m);
          }
        }
      }
    },
    markComplete(m) {
      m.done = true; m.state = 'DONE';
      if (m.markerVisual) {
        m.markerVisual.pillar.visible = false;
        m.markerVisual.halo.visible = false;
      }
    },
    activeMission() {
      return missions.find(m => m.state === 'ACTIVE') || null;
    },
  };
}

// Define default mission set for the open world.
export function defaultMissions(arenas) {
  const list = [];

  // Arena fights (one mission per arena)
  for (const a of arenas) {
    list.push({
      id: 'arena_' + a.id,
      kind: 'arena',
      arenaRef: a,
      name: `Бой: ${a.name}`,
      desc: 'Подойди к маркеру и нажми E — начнётся бой 1×1',
      markerPos: a.entryWorld.clone(),
      triggerPos: a.entryWorld.clone(),
      triggerRadius: 3,
      color: 0xffaa22,
      state: 'WAITING',
      reward: 200 * a.tier,
    });
  }

  // Street scuffle: beat up 3 bandits at a dvor
  list.push({
    id: 'street_brawl',
    kind: 'brawl',
    name: 'Разобраться во дворе',
    desc: 'Трое бандитов у панельки. Прижми их, пока не разбежались.',
    markerPos: new THREE.Vector3(60, 0, 60),
    triggerPos: new THREE.Vector3(60, 0, 60),
    triggerRadius: 8,
    color: 0xd03030,
    state: 'WAITING',
    reward: 250,
    enemyCount: 3, killed: 0,
  });

  // Delivery: drive to point X
  list.push({
    id: 'delivery',
    kind: 'deliver',
    name: 'Подгон до магазина',
    desc: 'Подвези посылку — доедь на машине до маркера.',
    markerPos: new THREE.Vector3(-60, 0, -60),
    triggerPos: new THREE.Vector3(-60, 0, -60),
    triggerRadius: 4,
    color: 0x33cc88,
    state: 'WAITING',
    reward: 150,
    requiresCar: true,
  });

  // Police chase survival
  list.push({
    id: 'police_run',
    kind: 'runaway',
    name: 'Оторваться от милиции',
    desc: 'Продержись 40 секунд — не дай милиции тебя поймать.',
    markerPos: new THREE.Vector3(60, 0, -60),
    triggerPos: new THREE.Vector3(60, 0, -60),
    triggerRadius: 4,
    color: 0x3366ff,
    state: 'WAITING',
    reward: 400,
    survive: 40,
  });

  return list;
}
