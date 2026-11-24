// Vehicle state and arcade physics: forward thrust, braking, speed-sensitive steering, lateral
// grip that handbrake turns into drift, building collisions and car-to-car impacts. Traffic,
// police, missions and the player all drive through this one step.

import { VEHICLE_TYPES, SHORE_Y, CITY_SIZE } from './config.js';
import { clamp, damp, resolveCircleRect, dist2, rand } from './math.js';

let nextVehicleId = 1;

export function resetVehicleIds() {
  nextVehicleId = 1;
}

export class Vehicle {
  constructor(typeId, x, y, angle = 0, opts = {}) {
    const spec = VEHICLE_TYPES[typeId] ?? VEHICLE_TYPES.sedan;
    this.id = nextVehicleId++;
    this.type = spec.id;
    this.spec = spec;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.vx = 0;
    this.vy = 0;
    this.steer = 0;
    this.steerTarget = 0;
    this.throttle = 0;
    this.braking = false;
    this.handbrake = false;
    this.color = opts.color ?? spec.colors[Math.floor(Math.random() * spec.colors.length)];
    this.role = opts.role ?? 'parked';
    this.driver = opts.driver ?? null;
    this.health = opts.health ?? 100;
    this.maxHealth = opts.maxHealth ?? 100;
    this.dead = false;
    this.deadTimer = 0;
    this.stolen = false;
    this.missionTag = opts.missionTag ?? null;
    this.siren = false;
    this.sirenPhase = Math.random() * Math.PI * 2;
    this.police = opts.police ?? false;
    this.wheelAngle = 0;
    this.drift = 0;
    this.slip = 0;
    this.impact = null;
    this.lastImpactTimer = 0;
    this.stuckTimer = 0;
    this.reverseTimer = 0;
    this.shootCooldown = 0;
    this.label = opts.label ?? null;
    this.hornTimer = 0;
    this.parkBrake = opts.parkBrake ?? false;
    this.headlights = opts.headlights ?? false;
  }

  get length() { return this.spec.length; }
  get width() { return this.spec.width; }
  get mass() { return this.spec.mass; }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  get forwardSpeed() {
    return this.vx * Math.cos(this.angle) + this.vy * Math.sin(this.angle);
  }

  get heading() {
    return this.angle;
  }

  setControls(throttle, steer, braking = false, handbrake = false) {
    this.throttle = clamp(throttle, -1, 1);
    this.steerTarget = clamp(steer, -1, 1);
    this.braking = braking;
    this.handbrake = handbrake;
  }

  damage(amount, world, source = 'crash') {
    if (this.dead || amount <= 0) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.siren = false;
      this.throttle = 0;
      world?.onVehicleDestroyed?.(this, source);
    }
  }

  update(dt, world) {
    const spec = this.spec;
    const city = world?.city;
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    let vLong = this.vx * fx + this.vy * fy;
    let vLat = -this.vx * fy + this.vy * fx;

    if (this.dead) {
      this.throttle = 0;
      this.braking = true;
      this.handbrake = false;
    }

    this.lastImpactTimer = Math.max(0, this.lastImpactTimer - dt);
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);

    const handbrake = this.handbrake && !this.dead;
    const throttle = this.dead ? 0 : this.throttle;
    const offroad = this.y > SHORE_Y - 70 || this.y < 12 || this.x < 12 || this.x > CITY_SIZE - 12;

    if (throttle > 0.01) {
      const headroom = clamp(1 - Math.max(0, vLong) / spec.maxSpeed, 0, 1);
      vLong += spec.accel * throttle * (0.35 + headroom * 0.65) * dt;
    } else if (throttle < -0.01) {
      if (vLong > 18) {
        vLong += spec.brake * throttle * dt;
      } else {
        vLong += spec.accel * 0.55 * throttle * dt;
      }
    }

    if (this.braking || handbrake) {
      const decel = (handbrake ? spec.brake * 0.48 : spec.brake) * dt;
      if (vLong > 0) vLong = Math.max(0, vLong - decel);
      else if (vLong < 0) vLong = Math.min(0, vLong + decel);
    }

    if (offroad) {
      vLong *= Math.exp(-0.55 * dt);
    }

    if (Math.abs(throttle) < 0.01 && !this.braking) {
      const rolling = (28 + Math.abs(vLong) * 0.12) * dt;
      if (vLong > 0) vLong = Math.max(0, vLong - rolling);
      else vLong = Math.min(0, vLong + rolling);
    }
    vLong *= Math.exp(-0.035 * dt);

    const maxForward = spec.maxSpeed * (offroad ? 0.68 : 1);
    const maxReverse = spec.maxSpeed * 0.32;
    vLong = clamp(vLong, -maxReverse, maxForward);

    this.steer = damp(this.steer, this.dead ? 0 : this.steerTarget, 12, dt);
    const speedAbs = Math.abs(vLong);
    const speedFactor = clamp(speedAbs / 115, 0, 1) * (1.14 - 0.44 * clamp(speedAbs / spec.maxSpeed, 0, 1));
    if (speedAbs > 4) {
      const direction = vLong >= 0 ? 1 : -1;
      this.angle += this.steer * spec.turn * speedFactor * dt * direction;
      if (handbrake && speedAbs > 130) {
        this.angle += this.steer * 1.3 * dt * direction;
      }
    }

    const grip = handbrake ? spec.handbrakeGrip : spec.grip * (offroad ? 0.6 : 1);
    vLat *= Math.exp(-grip * dt);

    this.slip = Math.abs(vLat);
    this.drift = clamp(this.slip / 110, 0, 1) * clamp(speedAbs / 170, 0, 1);

    const nfx = Math.cos(this.angle);
    const nfy = Math.sin(this.angle);
    this.vx = nfx * vLong - nfy * vLat;
    this.vy = nfy * vLong + nfx * vLat;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.wheelAngle += vLong * dt * 0.055;

    this.collideBuildings(dt, city, world);
    this.collideBounds(world);

    if (this.siren) this.sirenPhase += dt * 8.5;
    this.impact = null;
  }

  collideBuildings(dt, city, world) {
    if (!city) return;
    const circles = this.collisionCircles();
    let totalCorrection = 0;
    for (const c of circles) {
      const nearby = city.nearbyBuildings(c.x, c.y, c.r + 44);
      for (const b of nearby) {
        const hit = resolveCircleRect(c.x, c.y, c.r, b);
        if (!hit) continue;
        this.x += hit.x - c.x;
        this.y += hit.y - c.y;
        const vn = this.vx * hit.nx + this.vy * hit.ny;
        if (vn < 0) {
          this.vx -= vn * hit.nx * 1.28;
          this.vy -= vn * hit.ny * 1.28;
          totalCorrection = Math.max(totalCorrection, -vn);
        }
      }
    }
    if (totalCorrection > 128 && this.lastImpactTimer <= 0) {
      this.lastImpactTimer = 0.22;
      const force = totalCorrection;
      const dmg = clamp((force - 110) * 0.045, 1, 26);
      this.damage(dmg, world, 'wall');
      world?.onVehicleImpact?.(this, force, 'wall');
    }
  }

  collideBounds(world) {
    const lim = 22;
    let hit = null;
    if (this.x < lim) hit = { nx: 1, ny: 0 };
    else if (this.x > CITY_SIZE - lim) hit = { nx: -1, ny: 0 };
    else if (this.y < lim) hit = { nx: 0, ny: 1 };
    else if (this.y > SHORE_Y - lim) hit = { nx: 0, ny: -1 };
    if (!hit) return;
    this.x = clamp(this.x, lim, CITY_SIZE - lim);
    this.y = clamp(this.y, lim, SHORE_Y - lim);
    const vn = this.vx * hit.nx + this.vy * hit.ny;
    if (vn < 0) {
      this.vx -= vn * hit.nx * 1.3;
      this.vy -= vn * hit.ny * 1.3;
      if (-vn > 130) world?.onVehicleImpact?.(this, -vn, 'wall');
    }
  }

  collisionCircles() {
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    const offset = Math.max(0, this.length * 0.5 - this.width * 0.55);
    const r = this.width * 0.56;
    return [
      { x: this.x + fx * offset, y: this.y + fy * offset, r },
      { x: this.x - fx * offset, y: this.y - fy * offset, r },
    ];
  }

  stop() {
    this.vx = 0;
    this.vy = 0;
    this.throttle = 0;
    this.steer = 0;
  }
}

export function collideVehicles(vehicles, world) {
  for (let i = 0; i < vehicles.length; i++) {
    const a = vehicles[i];
    for (let j = i + 1; j < vehicles.length; j++) {
      const b = vehicles[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const reach = (a.length + b.length) * 0.5 + 8;
      if (dx * dx + dy * dy > reach * reach) continue;
      const ca = a.collisionCircles();
      const cb = b.collisionCircles();
      for (const pa of ca) {
        for (const pb of cb) {
          const ddx = pb.x - pa.x;
          const ddy = pb.y - pa.y;
          const rr = pa.r + pb.r;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 >= rr * rr || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          const nx = ddx / d;
          const ny = ddy / d;
          const overlap = rr - d;
          const totalMass = a.mass + b.mass;
          a.x -= nx * overlap * (b.mass / totalMass) * 0.85;
          a.y -= ny * overlap * (b.mass / totalMass) * 0.85;
          b.x += nx * overlap * (a.mass / totalMass) * 0.85;
          b.y += ny * overlap * (a.mass / totalMass) * 0.85;
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel < 0) {
            const imp = -rel * 0.62;
            a.vx -= (imp * nx * b.mass) / totalMass;
            a.vy -= (imp * ny * b.mass) / totalMass;
            b.vx += (imp * nx * a.mass) / totalMass;
            b.vy += (imp * ny * a.mass) / totalMass;
            if (-rel > 145) {
              const dmg = clamp((-rel - 120) * 0.05, 1, 24);
              a.damage(dmg * 0.7, world, 'car');
              b.damage(dmg, world, 'car');
              const midX = (pa.x + pb.x) / 2;
              const midY = (pa.y + pb.y) / 2;
              world?.onVehicleImpact?.(a, -rel, 'car', midX, midY);
              if (world) world.camera.shake = Math.min(12, world.camera.shake + (-rel) * 0.015);
            }
          }
        }
      }
    }
  }
}

export function stepVehicles(world, dt) {
  for (const v of world.vehicles) {
    v.update(dt, world);
    if (v.dead) v.deadTimer += dt;
    if (v.driver && v.driver.kind && v.driver.kind !== 'player') {
      v.driver.x = v.x;
      v.driver.y = v.y;
      v.driver.angle = v.angle;
    }
  }
  collideVehicles(world.vehicles, world);
}

export function spawnParkedVehicle(world, x, y, angle, typeId = null, opts = {}) {
  const specs = ['sedan', 'sedan', 'hatch', 'hatch', 'taxi', 'van', 'truck', 'sports'];
  const type = typeId ?? specs[Math.floor(Math.random() * specs.length)];
  const car = new Vehicle(type, x, y, angle, {
    role: 'parked',
    parkBrake: true,
    ...opts,
  });
  world.vehicles.push(car);
  return car;
}

export function randomTrafficType() {
  const r = Math.random();
  if (r < 0.45) return 'sedan';
  if (r < 0.63) return 'hatch';
  if (r < 0.76) return 'taxi';
  if (r < 0.87) return 'van';
  if (r < 0.94) return 'truck';
  return 'sports';
}

export function removeVehicle(world, vehicle) {
  const index = world.vehicles.indexOf(vehicle);
  if (index >= 0) world.vehicles.splice(index, 1);
  if (world.player.driving === vehicle) world.player.driving = null;
}

export { rand, dist2 };
