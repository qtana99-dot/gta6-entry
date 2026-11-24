// Getting in and out of cars, and the player's driving controls: throttle, brake, reverse,
// speed-sensitive steering and the handbrake. It also reports vehicle theft as a crime.

import { dist, clamp, TAU } from './math.js';
import { damagePlayer } from './player.js';

export function nearestVehicle(world, range = 64) {
  const p = world.player;
  let best = null;
  let bestD = range * range;
  for (const v of world.vehicles) {
    if (v.dead) continue;
    if (v.driver === p) continue;
    const d = (v.x - p.x) ** 2 + (v.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

export function vehiclePrompt(vehicle) {
  if (!vehicle) return null;
  if (vehicle.role === 'police' && vehicle.driver) return 'Locked — occupied cruiser';
  if (vehicle.driver) return `E — Carjack ${vehicle.spec.name}`;
  return `E — Steal ${vehicle.spec.name}`;
}

export function enterVehicle(world, vehicle) {
  const p = world.player;
  if (!vehicle || vehicle.dead || p.driving) return false;
  if (vehicle.role === 'police' && vehicle.driver) {
    world.notify?.('The cruiser is occupied.', 'warn');
    return false;
  }
  const wasPolice = vehicle.role === 'police' || vehicle.police;
  if (vehicle.driver) {
    const driver = vehicle.driver;
    if (driver.kind === 'ped') {
      driver.x = vehicle.x + Math.cos(vehicle.angle + Math.PI / 2) * 34;
      driver.y = vehicle.y + Math.sin(vehicle.angle + Math.PI / 2) * 34;
      driver.state = 'flee';
      driver.fleeTimer = 7;
      driver.inVehicle = null;
      driver.angle = vehicle.angle;
    }
    vehicle.driver = null;
  }
  p.driving = vehicle;
  p.vx = 0;
  p.vy = 0;
  vehicle.role = 'stolen';
  vehicle.driver = p;
  vehicle.parkBrake = false;
  vehicle.nav = null;
  vehicle.steerTarget = 0;
  vehicle.steer = 0;
  p.aimAngle = vehicle.angle;
  world.audio?.play('door');
  world.notify?.(`${vehicle.spec.name} — yours`, 'info');

  const witnessed = hasWitness(world, vehicle.x, vehicle.y, 380);
  if (witnessed) {
    world.reportCrime?.({
      level: wasPolice ? 2 : 1,
      reason: wasPolice ? 'Cruiser theft' : 'Vehicle theft',
      x: vehicle.x,
      y: vehicle.y,
    });
  }
  return true;
}

function hasWitness(world, x, y, radius) {
  const r2 = radius * radius;
  for (const ped of world.peds) {
    if (ped.dead || ped.state === 'down') continue;
    if ((ped.x - x) ** 2 + (ped.y - y) ** 2 < r2) return true;
  }
  for (const ped of world.peds) {
    if (ped.kind === 'cop' && (ped.x - x) ** 2 + (ped.y - y) ** 2 < r2) return true;
  }
  return false;
}

export function exitVehicle(world) {
  const p = world.player;
  const car = p.driving;
  if (!car) return;
  car.driver = null;
  car.stop();
  car.steerTarget = 0;
  p.driving = null;
  p.exitCooldown = 0.45;
  p.vx = 0;
  p.vy = 0;
  const leftX = Math.sin(car.angle);
  const leftY = -Math.cos(car.angle);
  const candidates = [
    { x: car.x + leftX * (car.width / 2 + 22), y: car.y + leftY * (car.width / 2 + 22) },
    { x: car.x - leftX * (car.width / 2 + 22), y: car.y - leftY * (car.width / 2 + 22) },
    { x: car.x - Math.cos(car.angle) * (car.length / 2 + 24), y: car.y - Math.sin(car.angle) * (car.length / 2 + 24) },
  ];
  let spot = candidates[0];
  for (const c of candidates) {
    const blocked = world.city.nearbyBuildings(c.x, c.y, 14).some((b) => {
      return c.x > b.x - 13 && c.x < b.x + b.w + 13 && c.y > b.y - 13 && c.y < b.y + b.h + 13;
    });
    if (!blocked) {
      spot = c;
      break;
    }
  }
  p.x = clamp(spot.x, 20, 4180);
  p.y = clamp(spot.y, 20, 4178);
  p.angle = car.angle;
  world.audio?.play('door');
}

export function updateDriving(world, dt, input) {
  const p = world.player;
  const car = p.driving;

  if (!car) {
    if (world.dialogue?.active) {
      world.nearVehicle = null;
      world.prompt = null;
      return;
    }
    if (p.exitCooldown <= 0) {
      const near = nearestVehicle(world);
      world.nearVehicle = near;
      world.prompt = vehiclePrompt(near);
      if (near && input.wasPressed('KeyE')) enterVehicle(world, near);
    } else {
      world.nearVehicle = null;
      world.prompt = world.dialogue?.active ? null : world.prompt;
    }
    return;
  }

  if (p.dead) {
    car.setControls(0, 0, true, false);
    return;
  }

  if (input.wasPressed('KeyE') && !world.dialogue?.active && p.exitCooldown <= 0) {
    exitVehicle(world);
    return;
  }

  let throttle = 0;
  if (input.isDown('KeyW') || input.isDown('ArrowUp')) throttle += 1;
  if (input.isDown('KeyS') || input.isDown('ArrowDown')) throttle -= 1;
  const up = input.isDown('KeyW') || input.isDown('ArrowUp');
  const down = input.isDown('KeyS') || input.isDown('ArrowDown');
  if (up && down) throttle = 0;
  let steer = 0;
  if (input.isDown('KeyA') || input.isDown('ArrowLeft')) steer -= 1;
  if (input.isDown('KeyD') || input.isDown('ArrowRight')) steer += 1;
  const handbrake = input.isDown('Space') || input.isDown('ShiftLeft') || input.isDown('ShiftRight');
  const braking = down && !up && car.forwardSpeed > 10;
  car.setControls(throttle, steer, braking, handbrake);
  if (input.wasPressed('KeyH')) {
    world.audio?.play('horn');
    car.hornTimer = 0.6;
  }
  car.hornTimer = Math.max(0, car.hornTimer - dt);

  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.aimAngle = car.angle;
  p.vx = car.vx;
  p.vy = car.vy;

  if (car.siren) world.audio?.setSiren(true);
}

export function checkPlayerVehicleHits(world) {
  const p = world.player;
  if (p.driving || p.dead) return;
  for (const v of world.vehicles) {
    if (v.dead) continue;
    const sp = v.speed;
    if (sp < 55) continue;
    const dx = p.x - v.x;
    const dy = p.y - v.y;
    const reach = v.length * 0.5 + 10;
    if (dx * dx + dy * dy > reach * reach) continue;
    const c = Math.cos(v.angle);
    const s = Math.sin(v.angle);
    const lx = dx * c + dy * s;
    const ly = -dx * s + dy * c;
    if (Math.abs(lx) < v.length * 0.5 + 8 && Math.abs(ly) < v.width * 0.5 + 8) {
      const hurt = clamp(sp * 0.07, 6, 42);
      damagePlayer(world, hurt, 'car');
      const nx = dx / (Math.hypot(dx, dy) || 1);
      const ny = dy / (Math.hypot(dx, dy) || 1);
      p.vx += nx * 220;
      p.vy += ny * 220;
      if (v.driver && v.driver.kind === 'player') {
        world.reportCrime?.({ level: 2, reason: 'Hit and run', x: p.x, y: p.y });
      }
      break;
    }
  }
}

export function angleFromVector(vx, vy) {
  return Math.atan2(vy, vx);
}

export function vehicleLookAhead(car, distance = 60) {
  return {
    x: car.x + Math.cos(car.angle) * distance,
    y: car.y + Math.sin(car.angle) * distance,
  };
}

export { dist, TAU };
