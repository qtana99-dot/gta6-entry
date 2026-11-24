// Rico Vela on foot: acceleration, friction, aim, building collisions, footstep timing and the
// health/armour damage model. Death and respawn hand control back to main's screen state.

import { PLAYER, WEAPONS, SHORE_Y, CITY_SIZE } from './config.js';
import { clamp, dist, resolveCircleRect, angleTo } from './math.js';

export function createPlayer(x = PLAYER.startPos.x, y = PLAYER.startPos.y) {
  return {
    kind: 'player',
    x,
    y,
    angle: -Math.PI / 2,
    aimAngle: -Math.PI / 2,
    vx: 0,
    vy: 0,
    radius: PLAYER.radius,
    health: PLAYER.maxHealth,
    maxHealth: PLAYER.maxHealth,
    armor: 0,
    maxArmor: PLAYER.maxArmor,
    money: PLAYER.startMoney,
    weapon: 'pistol',
    clip: WEAPONS.pistol.clip,
    reserve: 36,
    fireCooldown: 0,
    reloadTimer: 0,
    punchCooldown: 0,
    driving: null,
    dead: false,
    invuln: 0,
    hitFlash: 0,
    footPhase: 0,
    stepTimer: 0,
    walking: false,
    sprinting: false,
    moveAngle: -Math.PI / 2,
    lastHurtAt: -10,
    kills: 0,
    arrests: 0,
    missionsDone: 0,
    cashEarned: 0,
    exitCooldown: 0,
  };
}

export function updatePlayer(world, dt, input) {
  const p = world.player;
  p.invuln = Math.max(0, p.invuln - dt);
  p.hitFlash = Math.max(0, p.hitFlash - dt * 2.4);
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  p.exitCooldown = Math.max(0, p.exitCooldown - dt);
  if (p.reloadTimer > 0) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) finishReload(world);
  }
  if (p.dead) return;

  let mx = input.moveX;
  let my = input.moveY;
  const moving = mx !== 0 || my !== 0;
  p.walking = moving;
  const sprinting = input.sprint && moving;
  p.sprinting = sprinting;

  const speed = sprinting ? PLAYER.runSpeed : PLAYER.walkSpeed;
  let targetVx = 0;
  let targetVy = 0;
  if (moving) {
    const len = Math.hypot(mx, my);
    mx /= len;
    my /= len;
    targetVx = mx * speed;
    targetVy = my * speed;
    p.moveAngle = angleTo(mx, my);
  }
  const accel = moving ? PLAYER.accel : PLAYER.accel * 0.7;
  p.vx += (targetVx - p.vx) * clamp(accel / (speed + 1) * dt, 0, 1);
  p.vy += (targetVy - p.vy) * clamp(accel / (speed + 1) * dt, 0, 1);
  if (!moving) {
    const f = Math.exp(-PLAYER.friction * dt);
    p.vx *= f;
    p.vy *= f;
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;

  collidePlayerWorld(world, p);

  if (world.mouseWorld) {
    p.aimAngle = Math.atan2(world.mouseWorld.y - p.y, world.mouseWorld.x - p.x);
  }
  p.angle = moving ? p.moveAngle : p.aimAngle;

  const sp = Math.hypot(p.vx, p.vy);
  p.footPhase += sp * dt * (sprinting ? 0.05 : 0.06);
  if (sp > 25) {
    p.stepTimer -= dt;
    if (p.stepTimer <= 0) {
      p.stepTimer = sprinting ? 0.26 : 0.38;
      world.audio?.play('step', { soft: true, rate: 0.85 + Math.random() * 0.35 });
    }
  } else {
    p.stepTimer = 0;
  }
}

function collidePlayerWorld(world, p) {
  const nearby = world.city.nearbyBuildings(p.x, p.y, p.radius + 30);
  for (const b of nearby) {
    const hit = resolveCircleRect(p.x, p.y, p.radius, b);
    if (hit) {
      p.x = hit.x;
      p.y = hit.y;
      const vn = p.vx * hit.nx + p.vy * hit.ny;
      if (vn < 0) {
        p.vx -= vn * hit.nx;
        p.vy -= vn * hit.ny;
      }
    }
  }
  p.x = clamp(p.x, 18, CITY_SIZE - 18);
  p.y = clamp(p.y, 18, SHORE_Y - 20);
}

export function damagePlayer(world, amount, source = 'hit', attacker = null) {
  const p = world.player;
  if (p.dead || p.invuln > 0 || amount <= 0) return;
  let left = amount;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, left);
    p.armor -= absorbed;
    left -= absorbed;
  }
  p.health -= left;
  p.hitFlash = 1;
  p.lastHurtAt = world.time;
  p.invuln = 0.08;
  world.camera.shake = Math.min(16, world.camera.shake + 3 + amount * 0.06);
  world.audio?.play('hurt', { source });
  world.spawnBlood?.(p.x, p.y, Math.min(12, 3 + amount * 0.25));
  if (p.health <= 0) {
    p.health = 0;
    p.dead = true;
    p.driving?.stop?.();
    world.onPlayerDeath?.(source, attacker);
  }
}

export function healPlayer(world, amount) {
  const p = world.player;
  p.health = Math.min(p.maxHealth, p.health + amount);
}

export function addArmor(world, amount) {
  const p = world.player;
  p.armor = Math.min(p.maxArmor, p.armor + amount);
}

export function addMoney(world, amount) {
  const p = world.player;
  p.money = Math.max(0, p.money + amount);
  if (amount > 0) p.cashEarned += amount;
}

export function startReload(world) {
  const p = world.player;
  if (p.weapon !== 'pistol' || p.reloadTimer > 0) return false;
  const spec = WEAPONS.pistol;
  if (p.clip >= spec.clip || p.reserve <= 0) return false;
  p.reloadTimer = spec.reloadTime;
  world.audio?.play('reload');
  world.notify?.('Reloading…', 'info');
  return true;
}

function finishReload(world) {
  const p = world.player;
  const spec = WEAPONS.pistol;
  const need = spec.clip - p.clip;
  const take = Math.min(need, p.reserve);
  p.clip += take;
  p.reserve -= take;
  world.audio?.play('reloadDone');
}

export function cycleWeapon(world) {
  const p = world.player;
  p.weapon = p.weapon === 'pistol' ? 'fist' : 'pistol';
  p.reloadTimer = 0;
  world.audio?.play('click');
  world.notify?.(p.weapon === 'pistol' ? WEAPONS.pistol.name : 'Fists', 'info');
}

export function playerAimPoint(world) {
  const p = world.player;
  if (world.mouseWorld) return world.mouseWorld;
  return { x: p.x + Math.cos(p.aimAngle) * 100, y: p.y + Math.sin(p.aimAngle) * 100 };
}

export function nearPlayer(world, x, y, r) {
  return dist(world.player.x, world.player.y, x, y) <= r;
}
