// The player's fists and Harbor 9 pistol, plus every bullet in flight. Bullets are stepped in
// short slices so they cannot tunnel through walls, cars or people, and each impact reports
// sparks, damage and sound through the world's small effect hooks.

import { WEAPONS, PLAYER } from './config.js';
import { angleDiff, clamp, dist } from './math.js';
import { damagePlayer, startReload, cycleWeapon } from './player.js';

export function createCombatState() {
  return {
    muzzleFlash: 0,
    hitMarker: 0,
    lastShotAt: -10,
    shots: 0,
  };
}

export function updateCombat(world, dt, input) {
  const p = world.player;
  const c = world.combat;
  c.muzzleFlash = Math.max(0, c.muzzleFlash - dt * 6);
  c.hitMarker = Math.max(0, c.hitMarker - dt * 4);

  if (p.dead) {
    updateBullets(world, dt);
    return;
  }

  if (input.wasPressed('KeyQ')) cycleWeapon(world);
  if (input.wasPressed('KeyR')) startReload(world);
  if (input.wasPressed('KeyF') || (input.mouse.pressed && p.weapon === 'fist')) {
    punch(world);
  }
  const wantsShot = p.weapon === 'pistol' && (input.mouse.down || input.mouse.pressed);
  if (wantsShot && !world.dialogue?.active) {
    shoot(world);
  }
  updateBullets(world, dt);
}

export function shoot(world) {
  const p = world.player;
  if (p.driving) {
    // Aiming from a car uses the car's heading, pistol out the window.
    p.aimAngle = p.driving.angle;
  }
  const spec = WEAPONS.pistol;
  if (p.fireCooldown > 0 || p.reloadTimer > 0) return;
  if (p.clip <= 0) {
    if (p.reserve > 0) {
      startReload(world);
    } else {
      p.fireCooldown = 0.35;
      world.audio?.play('dryFire');
      world.notify?.('Out of ammo — find a crate.', 'warn');
    }
    return;
  }
  p.clip--;
  p.fireCooldown = spec.cooldown;
  world.combat.lastShotAt = world.time;
  world.combat.shots++;
  const spread = (Math.random() - 0.5) * spec.spread * 2;
  const a = p.aimAngle + spread;
  const muzzleX = p.x + Math.cos(a) * 19;
  const muzzleY = p.y + Math.sin(a) * 19;
  fireBullet(world, muzzleX, muzzleY, a, {
    owner: 'player',
    damage: spec.damage,
    speed: spec.speed,
    range: spec.range,
  });
  world.combat.muzzleFlash = 1;
  world.spawnMuzzle?.(muzzleX, muzzleY, a);
  world.audio?.play('shot', { x: p.x, y: p.y, player: true });
  world.addShake?.(2.2);
  world.panicAt?.(p.x, p.y, 420);
  world.reportCrime?.({ level: 1, reason: 'Shots fired', x: p.x, y: p.y });
  if (p.clip === 0 && p.reserve > 0) startReload(world);
}

export function fireBullet(world, x, y, angle, opts = {}) {
  const speed = opts.speed ?? 1200;
  const bullet = {
    x, y,
    px: x,
    py: y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    life: (opts.range ?? 900) / speed,
    owner: opts.owner ?? 'player',
    damage: opts.damage ?? 20,
    shooter: opts.shooter ?? null,
    color: opts.color ?? (opts.owner === 'police' ? '#a8c8ff' : opts.owner === 'gang' ? '#ffb08a' : '#ffe28a'),
  };
  world.bullets.push(bullet);
  if (opts.owner && opts.owner !== 'player') {
    world.spawnMuzzle?.(x, y, angle);
    world.audio?.play('shot', { x, y, quiet: true });
    world.panicAt?.(x, y, 260);
  }
  return bullet;
}

function updateBullets(world, dt) {
  const bullets = world.bullets;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    if (b.life <= 0) {
      bullets.splice(i, 1);
      continue;
    }
    b.px = b.x;
    b.py = b.y;
    const travel = Math.hypot(b.vx, b.vy) * dt;
    const steps = Math.max(1, Math.ceil(travel / 18));
    let dead = false;
    for (let s = 0; s < steps && !dead; s++) {
      b.x += (b.vx * dt) / steps;
      b.y += (b.vy * dt) / steps;
      dead = bulletHits(world, b);
    }
    if (dead) bullets.splice(i, 1);
  }
}

function bulletHits(world, b) {
  if (b.x < 0 || b.y < 0 || b.x > 4200 || b.y > 4760) return true;
  const buildings = world.city.nearbyBuildings(b.x, b.y, 8);
  for (const r of buildings) {
    if (b.x > r.x && b.x < r.x + r.w && b.y > r.y && b.y < r.y + r.h) {
      world.spawnSparks?.(b.x, b.y, 5, '#d9c27c');
      world.audio?.play('ricochet', { x: b.x, y: b.y, quiet: true });
      return true;
    }
  }
  const p = world.player;
  if (b.owner !== 'player' && !p.dead) {
    if (!p.driving && dist(b.x, b.y, p.x, p.y) < p.radius + 3) {
      damagePlayer(world, b.damage, 'gun', b.shooter);
      world.combat.hitMarker = 0.1;
      return true;
    }
  }
  for (const v of world.vehicles) {
    if (v.dead) continue;
    if (Math.abs(v.x - b.x) > v.length + 20 || Math.abs(v.y - b.y) > v.length + 20) continue;
    const c = Math.cos(v.angle);
    const s = Math.sin(v.angle);
    const dx = b.x - v.x;
    const dy = b.y - v.y;
    const lx = dx * c + dy * s;
    const ly = -dx * s + dy * c;
    if (Math.abs(lx) < v.length * 0.5 + 2 && Math.abs(ly) < v.width * 0.5 + 2) {
      if (v === p.driving && b.owner !== 'player') {
        damagePlayer(world, b.damage * 0.4, 'gun', b.shooter);
      }
      v.damage(b.damage * (b.owner === 'player' ? 0.85 : 0.6), world, 'bullet');
      world.spawnSparks?.(b.x, b.y, 4, '#ffcf6b');
      if (b.owner === 'player') world.combat.hitMarker = 0.16;
      return true;
    }
  }
  for (const ped of world.peds) {
    if (ped === b.shooter || ped.dead || ped.state === 'down') continue;
    if (dist(b.x, b.y, ped.x, ped.y) > ped.radius + 4) continue;
    world.damagePed?.(ped, b.damage, {
      source: 'bullet',
      attacker: b.shooter,
      player: b.owner === 'player',
      angle: b.angle,
    });
    world.spawnBlood?.(b.x, b.y, 4);
    if (b.owner === 'player') world.combat.hitMarker = 0.22;
    return true;
  }
  return false;
}

export function punch(world) {
  const p = world.player;
  if (p.punchCooldown > 0 || p.dead) return;
  const spec = WEAPONS.fist;
  p.punchCooldown = spec.cooldown;
  world.combat.muzzleFlash = 0;
  world.audio?.play('punch');
  const reach = PLAYER.punchRange;
  let hitAny = false;
  for (const ped of world.peds) {
    if (ped.dead || ped.state === 'down') continue;
    const d = dist(p.x, p.y, ped.x, ped.y);
    if (d > reach + ped.radius) continue;
    const a = Math.atan2(ped.y - p.y, ped.x - p.x);
    if (Math.abs(angleDiff(a, p.aimAngle)) > spec.arc * 0.5) continue;
    world.damagePed?.(ped, spec.damage, {
      source: 'punch',
      player: true,
      angle: a,
      knockback: 190,
    });
    world.spawnBlood?.(ped.x, ped.y, 2);
    world.addShake?.(3);
    hitAny = true;
    break;
  }
  if (!hitAny) {
    for (const v of world.vehicles) {
      if (v.dead) continue;
      const dx = v.x - p.x;
      const dy = v.y - p.y;
      if (dx * dx + dy * dy > (reach + v.length * 0.5) ** 2) continue;
      const a = Math.atan2(dy, dx);
      if (Math.abs(angleDiff(a, p.aimAngle)) > spec.arc) continue;
      v.damage(2, world, 'punch');
      world.spawnSparks?.(p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22, 3, '#dfd7c4');
      world.audio?.play('impact', { force: 60 });
      hitAny = true;
      break;
    }
  }
  if (hitAny) {
    world.punchFlash = 1;
    world.panicAt?.(p.x, p.y, 250);
  }
}

export function addAmmo(world, amount) {
  const p = world.player;
  p.reserve += amount;
  world.notify?.(`+${amount} Harbor 9 rounds`, 'good');
}

export function bulletCount(world) {
  return world.bullets.length;
}

export { clamp };
