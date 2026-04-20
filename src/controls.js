// Input + arcade driving physics. Keeps the car on the ground and resolves
// AABB collisions with building obstacles.

import * as THREE from 'three';

export function createControls(car, world) {
  const keys = Object.create(null);
  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyL') car.toggleHeadlights();
  });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  const state = {
    speed: 0,     // m/s along forward
    lateral: 0,   // drift
    heading: 0,   // radians
    wheelSpin: 0,
    steer: 0,
  };

  const forward = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();

  return {
    state, keys,
    update(dt) {
      const accel =
        (keys['KeyW'] || keys['ArrowUp']   ?  1 : 0) -
        (keys['KeyS'] || keys['ArrowDown'] ?  1 : 0);
      const steerIn =
        (keys['KeyA'] || keys['ArrowLeft']  ? -1 : 0) +
        (keys['KeyD'] || keys['ArrowRight'] ?  1 : 0);
      const boost = keys['ShiftLeft'] || keys['ShiftRight'];
      const handbrake = keys['Space'];

      // Steer easing
      const targetSteer = steerIn * 0.55;
      state.steer += (targetSteer - state.steer) * Math.min(1, dt * 8);

      // Acceleration
      const maxSpeed = boost ? 26 : 18;
      if (accel > 0) state.speed += 9 * dt;
      else if (accel < 0) state.speed -= 10 * dt;
      else state.speed *= 1 - dt * 0.6;

      if (handbrake) {
        state.speed *= 1 - dt * 2.5;
        state.lateral *= 1 - dt * 0.5;
      }

      state.speed = THREE.MathUtils.clamp(state.speed, -maxSpeed * 0.4, maxSpeed);

      // Steering couples with speed
      const steerFactor = THREE.MathUtils.clamp(Math.abs(state.speed) / 8, 0, 1);
      state.heading -= state.steer * steerFactor * dt * 2.0 * Math.sign(state.speed || 1);

      // Forward vector
      forward.set(Math.sin(state.heading), 0, Math.cos(state.heading));

      // Move
      tmpPos.copy(car.root.position);
      tmpPos.x += forward.x * state.speed * dt;
      tmpPos.z += forward.z * state.speed * dt;

      // Resolve building collisions (axis-aligned, per-axis)
      const oldX = car.root.position.x, oldZ = car.root.position.z;
      if (!collides(world, tmpPos.x, oldZ, 1.0, 2.2))   car.root.position.x = tmpPos.x;
      else state.speed *= 0.4;
      if (!collides(world, car.root.position.x, tmpPos.z, 1.0, 2.2)) car.root.position.z = tmpPos.z;
      else state.speed *= 0.4;

      car.root.rotation.y = state.heading;

      // Wheel spin / steering visual
      state.wheelSpin += state.speed * dt * 2.5;
      for (let i = 0; i < car.wheels.length; i++) {
        const w = car.wheels[i];
        w.rotation.x = state.wheelSpin;
      }
      // Front wheels also steer
      const steerAngle = state.steer;
      car.wheels[0].rotation.y = steerAngle;
      car.wheels[1].rotation.y = steerAngle;

      // Brake light state
      car.setBraking(accel < 0 || handbrake);

      // Dust from rear wheels on hard turns / handbrake
      if (handbrake || Math.abs(state.steer) > 0.35) {
        car.dust.emit(car.root.position, forward, Math.abs(state.speed));
      } else {
        car.dust.mat.opacity *= 0.95;
      }
      car.dust.update(dt);

      return { forward: forward.clone(), speed: state.speed };
    },
  };
}

function collides(world, x, z, halfW, halfD) {
  for (const o of world.obstacles) {
    if (Math.abs(x - o.x) < o.w / 2 + halfW &&
        Math.abs(z - o.z) < o.d / 2 + halfD) return true;
  }
  return false;
}
