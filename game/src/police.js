// The heat: a five-star wanted ladder, patrol cruisers that spawn out of sight and chase with
// the shared driving physics, officers who deploy and shoot on foot, arrest pressure, and a
// clearance that turns the survivors back into ordinary traffic and pedestrians.

import { POLICE, CELL, GRID, CITY_SIZE, COLORS } from './config.js';
import { Vehicle } from './vehicles.js';
import { randomRoadSpawn, driveToward } from './traffic.js';
import { spawnOfficer } from './peds.js';
import { fireBullet } from './combat.js';
import { clamp, dist, rand } from './math.js';

export function createPoliceState() {
  return {
    stars: 0,
    lastCrime: -999,
    decayTimer: 0,
    spawnTimer: 0,
    officerTimer: 0,
    bustTimer: 0,
    lockDecay: false,
    sirenActive: false,
    lastStars: 0,
    reason: '',
    spawnedCars: 0,
    spawnedOfficers: 0,
  };
}

export function reportCrime(world, opts) {
  const state = world.police;
  if (!state) return;
  const level = clamp(Math.round(opts.level ?? 1), 0, 5);
  const before = state.stars;
  if (level > state.stars) {
    state.stars = level;
    state.reason = opts.reason ?? 'Crime reported';
    world.camera.wantedFlash = 1;
    world.notify?.(`WANTED ${'★'.repeat(state.stars)} — ${state.reason}`, 'warn');
    world.audio?.play('wanted');
  }
  state.lastCrime = world.time;
  state.decayTimer = 0;
  state.bustTimer = 0;
  if (state.stars > 0) {
    state.spawnTimer = Math.min(state.spawnTimer, 0.15);
  }
  if (state.stars > before) {
    world.panicAt?.(opts.x ?? world.player.x, opts.y ?? world.player.y, 320);
  }
  return state.stars;
}

export function setWanted(world, stars, reason = '') {
  const state = world.police;
  state.stars = clamp(stars, 0, 5);
  state.reason = reason || state.reason;
  state.lastCrime = world.time;
  state.decayTimer = 0;
  state.spawnTimer = 0;
  if (state.stars === 0) clearWanted(world, true);
}

export function clearWanted(world, quiet = false) {
  const state = world.police;
  const had = state.stars;
  state.stars = 0;
  state.lockDecay = false;
  state.bustTimer = 0;
  state.decayTimer = 0;
  state.sirenActive = false;
  state.spawnTimer = 1.5;
  for (const ped of world.peds) {
    if (ped.kind === 'cop' && !ped.dead) {
      ped.kind = 'civ';
      ped.armed = false;
      ped.arresting = false;
      ped.state = 'flee';
      ped.fleeTimer = 2.5 + Math.random() * 3;
      ped.fleeAngle = Math.atan2(ped.y - world.player.y, ped.x - world.player.x);
    }
  }
  for (const car of world.vehicles) {
    if (car.role === 'police') {
      car.role = 'parked';
      car.siren = false;
      car.stop();
      car.nav = null;
    }
  }
  if (had > 0 && !quiet) {
    world.notify?.('You lost the heat.', 'good');
    world.audio?.play('lost');
  }
  if (world.mission?.onWantedCleared) world.mission.onWantedCleared = false;
}

function policeCars(world) {
  const out = [];
  for (const v of world.vehicles) if (v.role === 'police' && !v.dead) out.push(v);
  return out;
}

function footCops(world) {
  const out = [];
  for (const p of world.peds) if (p.kind === 'cop' && !p.dead) out.push(p);
  return out;
}

function spawnPoliceCar(world) {
  const spot = randomRoadSpawn(world, POLICE.spawnMin, POLICE.spawnMax);
  if (!spot) return null;
  const car = new Vehicle('police', spot.x, spot.y, spot.angle, { role: 'police', police: true });
  car.siren = true;
  car.nav = null;
  car.cruise = car.spec.maxSpeed;
  world.vehicles.push(car);
  return car;
}

function deployOfficer(world, car) {
  const spots = [
    { x: car.x + Math.sin(car.angle) * 34, y: car.y - Math.cos(car.angle) * 34 },
    { x: car.x - Math.sin(car.angle) * 34, y: car.y + Math.cos(car.angle) * 34 },
  ];
  for (const s of spots) {
    const blocked = world.city.nearbyBuildings(s.x, s.y, 14).some((b) => {
      return s.x > b.x && s.x < b.x + b.w && s.y > b.y && s.y < b.y + b.h;
    });
    if (!blocked) {
      const cop = spawnOfficer(world, s.x, s.y, { missionTag: 'police' });
      cop.tag = 'police';
      cop.angle = car.angle;
      car.stop();
      world.audio?.play('door', { x: s.x, y: s.y });
      return cop;
    }
  }
  return null;
}

function updateChaseCar(world, car, dt) {
  const p = world.player;
  const targetX = p.driving ? p.driving.x + p.driving.vx * 0.28 : p.x;
  const targetY = p.driving ? p.driving.y + p.driving.vy * 0.28 : p.y;
  const d = dist(car.x, car.y, targetX, targetY);
  const desiredSpeed = car.spec.maxSpeed * (0.72 + world.police.stars * 0.055);
  const stopDistance = p.driving ? 0 : 95;
  driveToward(world, car, targetX, targetY, dt, {
    aggressive: true,
    speed: desiredSpeed,
    stopDistance,
  });
  car.siren = true;
  if (world.police.stars >= 3 && d < 560 && car.shootCooldown <= 0 && !world.city.lineBlocked(car.x, car.y, targetX, targetY)) {
    const a = Math.atan2(targetY - car.y, targetX - car.x) + (Math.random() - 0.5) * 0.08;
    fireBullet(world, car.x + Math.cos(a) * (car.length * 0.5 + 4), car.y + Math.sin(a) * (car.length * 0.5 + 4), a, {
      owner: 'police',
      damage: 8,
      speed: 1250,
      range: 720,
    });
    car.shootCooldown = 1.9 + Math.random() * 1.2;
  }
  car.shootCooldown = Math.max(0, (car.shootCooldown ?? 0) - dt);
  if (d > POLICE.chaseDistance && !p.driving) {
    world.removeVehicle?.(car);
  }
}

export function updatePolice(world, dt) {
  const state = world.police;
  if (!state) return;
  const p = world.player;
  state.sirenActive = false;
  let nearestCop = Infinity;

  if (state.stars > 0) {
    // Spawn cruisers up to the star's allowance.
    const cars = policeCars(world);
    const allowed = POLICE.maxCarsByStar[state.stars] ?? 5;
    state.spawnTimer -= dt;
    if (cars.length < allowed && state.spawnTimer <= 0 && !p.dead) {
      const car = spawnPoliceCar(world);
      state.spawnTimer = POLICE.spawnEvery * (0.75 + Math.random() * 0.5);
      if (!car) state.spawnTimer = 1.1;
    }
    for (const car of cars) {
      updateChaseCar(world, car, dt);
      const d = dist(car.x, car.y, p.driving ? p.driving.x : p.x, p.driving ? p.driving.y : p.y);
      nearestCop = Math.min(nearestCop, d);
      if (d < 1500) state.sirenActive = true;
    }

    // Deploy foot officers from stopped cars near the player.
    const cops = footCops(world);
    const allowedFoot = POLICE.maxFootByStar[state.stars] ?? 6;
    state.officerTimer -= dt;
    if (cops.length < allowedFoot && state.officerTimer <= 0) {
      let nearCar = null;
      let best = 320;
      for (const car of cars) {
        const d = dist(car.x, car.y, p.x, p.y);
        if (d < best && car.speed < 130) {
          best = d;
          nearCar = car;
        }
      }
      if (nearCar && deployOfficer(world, nearCar)) {
        state.officerTimer = 1.4;
      } else {
        state.officerTimer = 0.5;
      }
    }
    for (const cop of footCops(world)) {
      const d = dist(cop.x, cop.y, p.x, p.y);
      nearestCop = Math.min(nearestCop, d);
      if (d < 1400) state.sirenActive = true;
      cop.arresting = !p.driving && d < 96 && cop.state !== 'down';
    }

    // Arrest pressure.
    if (!p.driving && !p.dead) {
      let close = false;
      for (const cop of footCops(world)) {
        if (dist(cop.x, cop.y, p.x, p.y) < POLICE.bustRange) {
          close = true;
          break;
        }
      }
      if (close) {
        state.bustTimer += dt;
        if (state.bustTimer > POLICE.bustTime) {
          world.onBusted?.();
        }
      } else {
        state.bustTimer = Math.max(0, state.bustTimer - dt * 2);
      }
    } else {
      state.bustTimer = 0;
    }

    // Decay after escaping sight.
    const hidden = nearestCop > 640 || nearestCop === Infinity;
    if (!state.lockDecay && world.time - state.lastCrime > POLICE.starDecayAfter && hidden) {
      state.decayTimer += dt;
      if (state.decayTimer > POLICE.starDecayInterval) {
        state.decayTimer = 0;
        state.stars = Math.max(0, state.stars - 1);
        if (state.stars > 0) {
          world.notify?.(`Heat cooling — ${state.stars} star${state.stars === 1 ? '' : 's'}`, 'info');
        } else {
          clearWanted(world);
        }
      }
    } else if (!hidden) {
      state.decayTimer = Math.max(0, state.decayTimer - dt * 0.7);
    }
  } else {
    // No heat: clear lingering chases.
    for (const car of policeCars(world)) {
      car.stop();
      car.siren = false;
      car.role = 'parked';
    }
  }

  // Remove burned-out cruisers that nobody needs any more.
  for (let i = world.vehicles.length - 1; i >= 0; i--) {
    const v = world.vehicles[i];
    if (v.role === 'police' && v.dead && v.deadTimer > 22) {
      world.vehicles.splice(i, 1);
    }
  }
  for (let i = world.peds.length - 1; i >= 0; i--) {
    const ped = world.peds[i];
    if (ped.kind === 'cop' && ped.dead && ped.deadTimer > 24) world.peds.splice(i, 1);
  }

  if (state.stars > 0 && nearestCop !== Infinity) {
    world.heatNear = nearestCop;
  } else {
    world.heatNear = null;
  }
}

export function policeSirenStrength(world) {
  const state = world.police;
  if (!state || !state.sirenActive) return 0;
  const d = world.heatNear ?? 900;
  return clamp(1 - d / 1400, 0, 1);
}

export function wantedStars(world) {
  return world.police?.stars ?? 0;
}

export function spawnRoadblock(world) {
  const p = world.player;
  const spawn = randomRoadSpawn(world, 420, 760);
  if (!spawn) return null;
  const car = new Vehicle('police', spawn.x, spawn.y, spawn.angle, { role: 'police', police: true });
  car.siren = true;
  world.vehicles.push(car);
  return car;
}

export { CELL, GRID, CITY_SIZE, COLORS, rand };
