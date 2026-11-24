// Ambient traffic: cars that keep to the right-hand lane of the grid, choose turns at
// intersections, slow for cars and people ahead, and despawn far from the player. The same file
// exposes the pursuit driver that police and story cars reuse.

import { CELL, ROAD, GRID, CITY_SIZE, TRAFFIC } from './config.js';
import { Vehicle, randomTrafficType, spawnParkedVehicle } from './vehicles.js';
import { angleDiff, clamp, dist, rand, randInt } from './math.js';

const LANE = TRAFFIC.laneOffset;

const DIRS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

function dirAngle(dx, dy) {
  return Math.atan2(dy, dx);
}

function laneOffset(dx, dy) {
  return { x: -dy * LANE, y: dx * LANE };
}

function lanePoint(nodeX, nodeY, dx, dy) {
  const o = laneOffset(dx, dy);
  return { x: nodeX + o.x, y: nodeY + o.y };
}

function validNode(ix, iy) {
  return ix >= 0 && iy >= 0 && ix <= GRID - 1 && iy <= GRID - 1;
}

function chooseDirection(nodeIx, nodeIy, dx, dy) {
  const options = [];
  for (const d of DIRS) {
    if (d.x === -dx && d.y === -dy) continue;
    if (!validNode(nodeIx + d.x, nodeIy + d.y)) continue;
    let weight = 0.3;
    if (d.x === dx && d.y === dy) weight = 1.15;
    const straightFriendly = 0.35;
    if (d.x !== dx || d.y !== dy) weight = straightFriendly;
    options.push({ d, weight });
  }
  if (!options.length) {
    const back = DIRS.find((d) => d.x === -dx && d.y === -dy);
    if (back) options.push({ d: back, weight: 1 });
  }
  let total = 0;
  for (const o of options) total += o.weight;
  let roll = Math.random() * total;
  for (const o of options) {
    roll -= o.weight;
    if (roll <= 0) return o.d;
  }
  return options[options.length - 1].d;
}

function makeNav(dx, dy, nodeIx, nodeIy) {
  const next = chooseDirection(nodeIx, nodeIy, dx, dy);
  const nx = nodeIx + next.x;
  const ny = nodeIy + next.y;
  return {
    dx: next.x,
    dy: next.y,
    nodeIx: nx,
    nodeIy: ny,
    nodeX: nx * CELL,
    nodeY: ny * CELL,
    waypoint: lanePoint(nx * CELL, ny * CELL, next.x, next.y),
    turnCooldown: 0,
  };
}

function initialNav(x, y, dx, dy) {
  let nodeIx;
  let nodeIy;
  if (dx > 0) {
    nodeIx = Math.floor(x / CELL) + 1;
    nodeIy = Math.round(y / CELL);
  } else if (dx < 0) {
    nodeIx = Math.ceil(x / CELL) - 1;
    nodeIy = Math.round(y / CELL);
  } else if (dy > 0) {
    nodeIy = Math.floor(y / CELL) + 1;
    nodeIx = Math.round(x / CELL);
  } else {
    nodeIy = Math.ceil(y / CELL) - 1;
    nodeIx = Math.round(x / CELL);
  }
  nodeIx = clamp(nodeIx, 0, GRID - 1);
  nodeIy = clamp(nodeIy, 0, GRID - 1);
  const waypoint = lanePoint(nodeIx * CELL, nodeIy * CELL, dx, dy);
  return {
    dx, dy,
    nodeIx, nodeIy,
    nodeX: nodeIx * CELL,
    nodeY: nodeIy * CELL,
    waypoint,
    turnCooldown: 0,
  };
}

export function randomRoadSpawn(world, minDist = 700, maxDist = 1700) {
  const player = world.player;
  for (let attempt = 0; attempt < 28; attempt++) {
    const horizontal = Math.random() < 0.5;
    const dir = DIRS[Math.floor(Math.random() * 4)];
    if (horizontal && dir.y !== 0) continue;
    if (!horizontal && dir.x !== 0) continue;
    const roadIx = randInt(0, GRID - 1);
    const segment = randInt(0, GRID - 2);
    const t = 0.2 + Math.random() * 0.6;
    const along = (segment + t) * CELL;
    let x;
    let y;
    if (dir.y === 0) {
      x = along;
      y = roadIx * CELL + laneOffset(dir.x, dir.y).y;
    } else {
      x = roadIx * CELL + laneOffset(dir.x, dir.y).x;
      y = along;
    }
    const d = Math.hypot(x - player.x, y - player.y);
    if (d < minDist || d > maxDist) continue;
    let crowded = false;
    for (const v of world.vehicles) {
      if ((v.x - x) ** 2 + (v.y - y) ** 2 < 72 * 72) {
        crowded = true;
        break;
      }
    }
    if (crowded) continue;
    return { x, y, dx: dir.x, dy: dir.y, angle: dirAngle(dir.x, dir.y) };
  }
  return null;
}

export function spawnTrafficCar(world, minDist = 700, maxDist = 1700) {
  const spot = randomRoadSpawn(world, minDist, maxDist);
  if (!spot) return null;
  const type = randomTrafficType();
  const car = new Vehicle(type, spot.x, spot.y, spot.angle, { role: 'traffic' });
  car.nav = initialNav(spot.x, spot.y, spot.dx, spot.dy);
  car.cruise = car.spec.maxSpeed * (0.36 + Math.random() * 0.16);
  car.aiSteerBias = (Math.random() - 0.5) * 0.12;
  world.vehicles.push(car);
  return car;
}

export function initTraffic(world) {
  world.traffic = {
    spawnTimer: 0,
    parkedSpawned: false,
    despawned: 0,
  };
  spawnParkedCars(world);
  for (let i = 0; i < TRAFFIC.target; i++) {
    spawnTrafficCar(world, 260, 2100);
  }
}

export function spawnParkedCars(world) {
  const spots = world.city.parkingSpots;
  const missionLots = /^(valet|garage|club|docks)$/;
  for (const spot of spots) {
    if (Math.random() < 0.35) continue;
    const block = world.city.blockAt(spot.x, spot.y);
    if (block && block.special && missionLots.test(block.special.type)) continue;
    if (world.vehicles.some((v) => (v.x - spot.x) ** 2 + (v.y - spot.y) ** 2 < 56 * 56)) continue;
    spawnParkedVehicle(world, spot.x, spot.y, spot.angle, null, { role: 'parked' });
  }
}

function vehicleAhead(world, car, range, lateralRange) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let best = null;
  let bestDist = range;
  for (const other of world.vehicles) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const forward = dx * fx + dy * fy;
    if (forward <= 4 || forward > range) continue;
    const lateral = -dx * fy + dy * fx;
    const width = (car.width + other.width) * 0.5 + 8;
    if (Math.abs(lateral) > Math.min(lateralRange, width)) continue;
    if (forward < bestDist) {
      bestDist = forward;
      best = { obj: other, forward, lateral };
    }
  }
  const p = world.player;
  if (!p.driving && !p.dead) {
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const forward = dx * fx + dy * fy;
    const lateral = -dx * fy + dy * fx;
    if (forward > 2 && forward < Math.min(range, TRAFFIC.playerSlowDistance) && Math.abs(lateral) < 22) {
      if (!best || forward < best.forward) best = { obj: p, forward, lateral, pedestrian: true };
    }
  }
  return best;
}

export function driveToward(world, car, targetX, targetY, dt, opts = {}) {
  if (car.dead) {
    car.setControls(0, 0, true, false);
    return;
  }
  const dx = targetX - car.x;
  const dy = targetY - car.y;
  const targetDist = Math.hypot(dx, dy);
  const desired = Math.atan2(dy, dx);
  let err = angleDiff(desired, car.angle);
  const speed = car.speed;
  let throttle = 1;
  let brake = false;
  let handbrake = false;
  const stopDistance = opts.stopDistance ?? 48;
  const desiredSpeed = opts.speed ?? car.spec.maxSpeed;

  if (targetDist < stopDistance) {
    throttle = 0;
    brake = true;
  } else if (speed > desiredSpeed * 1.04) {
    throttle = 0;
    brake = speed > desiredSpeed * 1.2;
  } else if (Math.abs(err) > 0.95 && speed > desiredSpeed * 0.62) {
    throttle = 0.2;
    brake = true;
    if (opts.aggressive && speed > 250) handbrake = true;
  }

  const ahead = vehicleAhead(world, car, 120 + speed * 0.28, 58);
  if (ahead) {
    const gap = ahead.forward;
    const minGap = 40 + speed * 0.12;
    if (gap < minGap) {
      throttle = 0;
      brake = true;
    } else if (gap < minGap + 70) {
      throttle = Math.min(throttle, 0.28);
    }
  }

  if (car.stuckTimer > 2.2) {
    car.reverseTimer = 1.15;
    car.stuckTimer = 0;
    car.nav && (car.nav.turnCooldown = 0.4);
  }
  if (car.reverseTimer > 0) {
    car.reverseTimer -= dt;
    car.setControls(-0.85, -err * 1.4, false, false);
    return;
  }
  if (speed < 10 && throttle > 0.4) car.stuckTimer += dt;
  else car.stuckTimer = Math.max(0, car.stuckTimer - dt * 2);

  const steer = clamp(err * 2.1 + (opts.steerBias ?? 0), -1, 1);
  car.setControls(throttle, steer, brake, handbrake);
}

function updateTrafficCar(world, car, dt) {
  const nav = car.nav;
  if (!nav) {
    car.setControls(0, 0, true, false);
    return;
  }
  const ndx = nav.nodeX - car.x;
  const ndy = nav.nodeY - car.y;
  const nodeDist = Math.hypot(ndx, ndy);
  if (nodeDist < 42 && nav.turnCooldown <= 0) {
    const nodeIx = Math.round(nav.nodeX / CELL);
    const nodeIy = Math.round(nav.nodeY / CELL);
    car.nav = makeNav(nav.dx, nav.dy, nodeIx, nodeIy);
    car.nav.turnCooldown = 0.25;
  }
  if (car.nav.turnCooldown > 0) car.nav.turnCooldown -= dt;

  const wp = car.nav.waypoint;
  const desired = Math.atan2(wp.y - car.y, wp.x - car.x);
  let err = angleDiff(desired, car.angle);
  let throttle = 0.72;
  let brake = false;
  if (car.speed > car.cruise) throttle = car.speed > car.cruise * 1.18 ? 0 : 0.25;
  if (Math.abs(err) > 0.8) throttle = Math.min(throttle, 0.3);
  if (Math.abs(err) > 1.6 && car.speed > 90) {
    brake = true;
    throttle = 0;
  }

  const ahead = vehicleAhead(world, car, TRAFFIC.followDistance + car.speed * 0.22, 46);
  if (ahead) {
    const gap = ahead.forward;
    const minGap = ahead.pedestrian ? TRAFFIC.playerSlowDistance : 38 + car.speed * 0.16;
    if (gap < minGap) {
      throttle = 0;
      brake = true;
    } else if (gap < minGap + 80) {
      throttle = Math.min(throttle, 0.22);
    }
    car.hornTimer = Math.max(0, (car.hornTimer ?? 0) - dt);
    if (gap < minGap && car.hornTimer <= 0 && Math.random() < 0.01) {
      car.hornTimer = 4;
      world.audio?.play('horn', { quiet: true, x: car.x, y: car.y });
    }
  }

  if (car.stuckTimer > TRAFFIC.stuckTime) {
    car.reverseTimer = 1.1;
    car.stuckTimer = 0;
  }
  if (car.reverseTimer > 0) {
    car.reverseTimer -= dt;
    car.setControls(-0.8, -err * 1.2, false, false);
    return;
  }
  if (car.speed < 8 && throttle > 0.4) car.stuckTimer += dt;
  else car.stuckTimer = Math.max(0, car.stuckTimer - dt * 2);

  const steer = clamp(err * 2.3 + (car.aiSteerBias ?? 0), -1, 1);
  car.setControls(throttle, steer, brake, false);
}

export function updateTraffic(world, dt) {
  const player = world.player;
  for (const car of world.vehicles) {
    if (car.role === 'traffic') {
      updateTrafficCar(world, car, dt);
      if (car.dead && car.deadTimer > 18) {
        // wrecks are cleared by main's cleanup
      }
    } else if (car.role === 'parked' || car.role === 'stolen') {
      car.setControls(0, 0, true, false);
    }
  }

  if (!world.traffic) return;
  world.traffic.spawnTimer -= dt;
  let trafficCount = 0;
  for (const car of world.vehicles) {
    if (car.role !== 'traffic') continue;
    trafficCount++;
    const d = dist(car.x, car.y, player.x, player.y);
    if ((d > TRAFFIC.despawn && !car.dead) || (car.dead && car.deadTimer > 20)) {
      world.removeVehicle?.(car);
    }
  }
  if (trafficCount < TRAFFIC.target && world.traffic.spawnTimer <= 0) {
    const car = spawnTrafficCar(world, TRAFFIC.spawnMin, TRAFFIC.spawnMax);
    if (car) world.traffic.spawnTimer = 0.35 + Math.random() * 0.5;
    else world.traffic.spawnTimer = 0.7;
  }
}

export function clearTraffic(world) {
  for (const car of [...world.vehicles]) {
    if (car.role === 'traffic') world.removeVehicle?.(car);
  }
}

export { lanePoint, laneOffset, dirAngle };
