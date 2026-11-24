// Everyone on foot: sunburned civilians looping the sidewalks, cops and Cobalt crew with guns,
// panic after gunfire, crowd separation, knockdowns, blood and car strikes. Cops and gangsters
// share one small hostile-brain routine.

import { PEDS, PLAYER, SHORE_Y, CITY_SIZE, COLORS } from './config.js';
import { clamp, dist, angleTo, angleDiff, resolveCircleRect, pickRng, pick, rand } from './math.js';
import { fireBullet } from './combat.js';

const SHIRTS = ['#e06f57', '#efb34b', '#6fb7a6', '#eee4cd', '#b98bc9', '#6f8fc9', '#d4a0a0', '#88c06f', '#f3f0e4', '#d17b5a'];
const PANTS = ['#3c4a57', '#5b5248', '#8a8172', '#d6cdb8', '#2f3a44', '#6f6a5f'];
const SKINS = ['#6b4632', '#8a5c3f', '#b07a55', '#d19b72', '#e6bb95', '#f0cba7'];
const HAIRS = ['#231b17', '#3b2a20', '#5a3f2c', '#c0a36a', '#1b1b1b', '#7c5a3f'];

let pedId = 1;

export function resetPedIds() {
  pedId = 1;
}

export function spawnPed(world, x, y, opts = {}) {
  const kind = opts.kind ?? 'civ';
  const ped = {
    id: pedId++,
    kind,
    x, y,
    angle: opts.angle ?? Math.random() * Math.PI * 2,
    radius: kind === 'civ' ? PEDS.radius : 10,
    health: opts.health ?? (kind === 'cop' ? 88 : kind === 'gang' ? 78 : 52),
    maxHealth: kind === 'cop' ? 88 : kind === 'gang' ? 78 : 52,
    state: 'walk',
    dead: false,
    deadTimer: 0,
    downTimer: 0,
    hitCooldown: 0,
    hitFlash: 0,
    walkPhase: Math.random() * Math.PI * 2,
    speed: opts.speed ?? (PEDS.walkMin + Math.random() * (PEDS.walkMax - PEDS.walkMin)),
    shirt: opts.shirt ?? pickRng(Math.random, SHIRTS),
    pants: opts.pants ?? pickRng(Math.random, PANTS),
    skin: opts.skin ?? pickRng(Math.random, SKINS),
    hair: opts.hair ?? pickRng(Math.random, HAIRS),
    hat: opts.hat ?? Math.random() < 0.18,
    armed: kind === 'cop' || kind === 'gang',
    gunCooldown: 0.6 + Math.random() * 1.6,
    shootRange: kind === 'cop' ? 430 : 390,
    accuracy: kind === 'cop' ? 0.11 : 0.16,
    strafe: Math.random() < 0.5 ? 1 : -1,
    strafeTimer: 0.6 + Math.random() * 1.6,
    reaction: 0.3,
    fleeTimer: 0,
    fleeAngle: 0,
    knockVx: 0,
    knockVy: 0,
    loopBlock: opts.loopBlock ?? null,
    corner: opts.corner ?? 0,
    cornerDir: opts.cornerDir ?? 1,
    tag: opts.tag ?? null,
    missionTag: opts.missionTag ?? null,
    inVehicle: null,
    aimAngle: 0,
    role: kind,
    spottedPlayer: false,
    footStepPhase: 0,
  };
  world.peds.push(ped);
  return ped;
}

function randomLoopBlock(world) {
  const player = world.player;
  const blocks = world.city.walkableBlocks;
  for (let attempt = 0; attempt < 26; attempt++) {
    const block = blocks[Math.floor(Math.random() * blocks.length)];
    const d = dist(block.outer.x + block.outer.w / 2, block.outer.y + block.outer.h / 2, player.x, player.y);
    if (d >= PEDS.spawnMin && d <= PEDS.spawnMax) return block;
  }
  return blocks[Math.floor(Math.random() * blocks.length)];
}

function loopPoint(block, side, t) {
  const a = block.loop[side];
  const b = block.loop[(side + 1) % 4];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, next: (side + 1) % 4 };
}

export function spawnCivilian(world, x = null, y = null, opts = {}) {
  let px = x;
  let py = y;
  let block = opts.loopBlock ?? null;
  let corner = 0;
  if (px === null || py === null) {
    block = block ?? randomLoopBlock(world);
    const side = Math.floor(Math.random() * 4);
    const t = 0.12 + Math.random() * 0.76;
    const pt = loopPoint(block, side, t);
    px = pt.x;
    py = pt.y;
    corner = pt.next;
  }
  if (block && corner === 0) corner = nearestCorner(block, px, py);
  return spawnPed(world, px, py, {
    kind: 'civ',
    loopBlock: block,
    corner: corner || 0,
    cornerDir: Math.random() < 0.5 ? 1 : -1,
    ...opts,
  });
}

function nearestCorner(block, x, y) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < 4; i++) {
    const d = (block.loop[i].x - x) ** 2 + (block.loop[i].y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function spawnOfficer(world, x, y, opts = {}) {
  return spawnPed(world, x, y, {
    kind: 'cop',
    shirt: '#31517e',
    pants: '#1c2b40',
    skin: pick(SKINS),
    hat: true,
    speed: 96,
    ...opts,
  });
}

export function spawnGangster(world, x, y, opts = {}) {
  return spawnPed(world, x, y, {
    kind: 'gang',
    shirt: '#2a4c78',
    pants: '#1f2733',
    skin: pick(SKINS),
    hat: Math.random() < 0.5,
    speed: 104,
    ...opts,
  });
}

export function initPeds(world) {
  world.pedState = { spawnTimer: 0, spawned: 0 };
  for (let i = 0; i < Math.floor(PEDS.target * 0.8); i++) {
    spawnCivilian(world);
  }
}

function attachLoop(ped, world) {
  const block = randomLoopBlock(world);
  ped.loopBlock = block;
  ped.corner = nearestCorner(block, ped.x, ped.y);
  ped.cornerDir = Math.random() < 0.5 ? 1 : -1;
  ped.state = 'walk';
}

function movePed(world, ped, dx, dy, speed, dt) {
  const len = Math.hypot(dx, dy);
  if (len < 0.0001) return;
  const nx = dx / len;
  const ny = dy / len;
  ped.x += nx * speed * dt;
  ped.y += ny * speed * dt;
  ped.angle = Math.atan2(ny, nx);
  ped.walkPhase += speed * dt * 0.12;
  resolvePedWorld(world, ped);
}

function resolvePedWorld(world, ped) {
  const nearby = world.city.nearbyBuildings(ped.x, ped.y, ped.radius + 18);
  for (const b of nearby) {
    const hit = resolveCircleRect(ped.x, ped.y, ped.radius, b);
    if (hit) {
      ped.x = hit.x;
      ped.y = hit.y;
    }
  }
  ped.x = clamp(ped.x, 14, CITY_SIZE - 14);
  ped.y = clamp(ped.y, 14, SHORE_Y - 18);
}

function updateCivilian(world, ped, dt) {
  if (ped.state === 'down' || ped.state === 'dead') return;
  if (ped.state === 'flee') {
    ped.fleeTimer -= dt;
    let ax = Math.cos(ped.fleeAngle);
    let ay = Math.sin(ped.fleeAngle);
    for (const other of world.peds) {
      if (other === ped || other.dead) continue;
      const d2 = (other.x - ped.x) ** 2 + (other.y - ped.y) ** 2;
      if (d2 < 22 * 22 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        ax += ((ped.x - other.x) / d) * 0.7;
        ay += ((ped.y - other.y) / d) * 0.7;
      }
    }
    movePed(world, ped, ax, ay, PEDS.fleeSpeed, dt);
    if (ped.fleeTimer <= 0) {
      if (ped.loopBlock) {
        ped.corner = nearestCorner(ped.loopBlock, ped.x, ped.y);
        ped.state = 'walk';
      } else {
        attachLoop(ped, world);
      }
    }
    return;
  }
  if (!ped.loopBlock) {
    attachLoop(ped, world);
    return;
  }
  const target = ped.loopBlock.loop[ped.corner];
  const dx = target.x - ped.x;
  const dy = target.y - ped.y;
  const d = Math.hypot(dx, dy);
  if (d < 7) {
    if (Math.random() < 0.18) ped.cornerDir *= -1;
    ped.corner = (ped.corner + ped.cornerDir + 4) % 4;
    return;
  }
  let ax = dx / d;
  let ay = dy / d;
  for (const other of world.peds) {
    if (other === ped || other.dead) continue;
    const ddx = ped.x - other.x;
    const ddy = ped.y - other.y;
    const d2 = ddx * ddx + ddy * ddy;
    if (d2 < 19 * 19 && d2 > 0.01) {
      const dd = Math.sqrt(d2);
      ax += (ddx / dd) * 0.55;
      ay += (ddy / dd) * 0.55;
    }
  }
  const p = world.player;
  if (!p.driving) {
    const ddx = ped.x - p.x;
    const ddy = ped.y - p.y;
    const d2 = ddx * ddx + ddy * ddy;
    if (d2 < 24 * 24 && d2 > 0.01) {
      const dd = Math.sqrt(d2);
      ax += (ddx / dd) * 0.9;
      ay += (ddy / dd) * 0.9;
    }
  }
  movePed(world, ped, ax, ay, ped.speed, dt);
}

function updateHostile(world, ped, dt) {
  if (ped.state === 'down' || ped.state === 'dead') return;
  const p = world.player;
  if (p.dead) return;
  const targetX = p.driving ? p.driving.x : p.x;
  const targetY = p.driving ? p.driving.y : p.y;
  const dx = targetX - ped.x;
  const dy = targetY - ped.y;
  const d = Math.hypot(dx, dy);
  const toPlayer = Math.atan2(dy, dx);
  ped.aimAngle = toPlayer;
  ped.angle = toPlayer;
  ped.gunCooldown -= dt;
  ped.reaction -= dt;
  ped.strafeTimer -= dt;
  if (ped.strafeTimer <= 0) {
    ped.strafe *= -1;
    ped.strafeTimer = 0.8 + Math.random() * 1.8;
  }

  if (ped.arresting) {
    const a = Math.atan2(p.y - ped.y, p.x - ped.x);
    ped.aimAngle = a;
    ped.angle = a;
    if (d > 34) movePed(world, ped, p.x - ped.x, p.y - ped.y, 74, dt);
    return;
  }
  const los = d < 620 && !world.city.lineBlocked(ped.x, ped.y, targetX, targetY);
  const desired = ped.kind === 'cop' ? 195 : 170;
  let mx = 0;
  let my = 0;
  if (!los || d > desired + 40) {
    mx = dx / (d || 1);
    my = dy / (d || 1);
  } else if (d < desired - 55) {
    mx = -dx / (d || 1);
    my = -dy / (d || 1);
  } else {
    mx = (-dy / (d || 1)) * ped.strafe;
    my = (dx / (d || 1)) * ped.strafe;
  }
  if (mx || my) {
    const sepX = mx;
    const sepY = my;
    movePed(world, ped, sepX, sepY, ped.kind === 'cop' ? 92 : 98, dt);
  }

  const shootRange = p.driving ? ped.shootRange + 110 : ped.shootRange;
  if (los && d < shootRange && ped.gunCooldown <= 0 && ped.reaction <= 0) {
    const spread = (Math.random() - 0.5) * ped.accuracy * 2;
    const muzzleX = ped.x + Math.cos(toPlayer) * 16;
    const muzzleY = ped.y + Math.sin(toPlayer) * 16;
    fireBullet(world, muzzleX, muzzleY, toPlayer + spread, {
      owner: ped.kind === 'cop' ? 'police' : 'gang',
      damage: ped.kind === 'cop' ? 10 : 12,
      speed: 1180,
      range: 760,
      shooter: ped,
    });
    ped.gunCooldown = ped.kind === 'cop' ? 1.25 + Math.random() * 0.8 : 1.4 + Math.random() * 0.9;
  }
}

function updateDowned(world, ped, dt) {
  ped.downTimer -= dt;
  ped.x += ped.knockVx * dt;
  ped.y += ped.knockVy * dt;
  ped.knockVx *= Math.exp(-3.6 * dt);
  ped.knockVy *= Math.exp(-3.6 * dt);
  resolvePedWorld(world, ped);
  if (ped.downTimer <= 0) {
    if (ped.health <= 0) {
      ped.state = 'dead';
      ped.dead = true;
      ped.deadTimer = 0;
    } else {
      ped.state = 'flee';
      ped.fleeTimer = 3 + Math.random() * 3;
      ped.fleeAngle = Math.random() * Math.PI * 2;
      ped.health = Math.max(ped.health, 14);
      if (ped.kind === 'cop' || ped.kind === 'gang') {
        ped.state = 'combat';
        ped.gunCooldown = 0.8;
      }
    }
  }
}

export function updatePeds(world, dt) {
  const p = world.player;
  for (const ped of world.peds) {
    ped.hitFlash = Math.max(0, ped.hitFlash - dt * 3);
    ped.hitCooldown = Math.max(0, ped.hitCooldown - dt);
    if (ped.dead) {
      ped.deadTimer += dt;
      continue;
    }
    if (ped.state === 'down') {
      updateDowned(world, ped, dt);
      continue;
    }
    if (ped.state === 'flee' && (ped.kind === 'cop' || ped.kind === 'gang')) ped.state = 'combat';
    if (ped.kind === 'civ') updateCivilian(world, ped, dt);
    else updateHostile(world, ped, dt);
  }

  checkPedVehicleHits(world, dt);

  if (world.pedState) {
    world.pedState.spawnTimer -= dt;
    let civCount = 0;
    for (const ped of world.peds) {
      if (ped.kind === 'civ' && !ped.dead) civCount++;
    }
    if (civCount < PEDS.target && world.pedState.spawnTimer <= 0) {
      for (let i = 0; i < 2 && civCount < PEDS.target; i++) {
        spawnCivilian(world);
        civCount++;
      }
      world.pedState.spawnTimer = 0.55;
    }
    for (let i = world.peds.length - 1; i >= 0; i--) {
      const ped = world.peds[i];
      if (ped.kind !== 'civ') continue;
      if (ped.dead && ped.deadTimer > 24) {
        world.peds.splice(i, 1);
        continue;
      }
      const d = dist(ped.x, ped.y, p.x, p.y);
      if (d > PEDS.despawn && ped.state !== 'flee' && !ped.dead) {
        world.peds.splice(i, 1);
      }
    }
  }
}

export function checkPedVehicleHits(world, dt) {
  const p = world.player;
  for (const ped of world.peds) {
    if (ped.dead || ped.hitCooldown > 0) continue;
    for (const v of world.vehicles) {
      if (v.dead) continue;
      const speed = v.speed;
      if (speed < 48) continue;
      if (Math.abs(v.x - ped.x) > v.length + 20 || Math.abs(v.y - ped.y) > v.length + 20) continue;
      const c = Math.cos(v.angle);
      const s = Math.sin(v.angle);
      const dx = ped.x - v.x;
      const dy = ped.y - v.y;
      const lx = dx * c + dy * s;
      const ly = -dx * s + dy * c;
      if (Math.abs(lx) > v.length * 0.5 + ped.radius || Math.abs(ly) > v.width * 0.5 + ped.radius) continue;
      const isPlayer = v.driver === p;
      const damage = clamp(speed * 0.075, 5, 70) * (isPlayer ? 1.25 : 1);
      const angle = Math.atan2(dy, dx);
      damagePed(world, ped, damage, {
        source: 'car',
        player: isPlayer,
        angle,
        knockback: 120 + speed * 0.55,
        car: v,
      });
      ped.hitCooldown = 0.4;
      if (isPlayer) {
        world.reportCrime?.({
          level: ped.dead ? 3 : 2,
          reason: ped.dead ? 'Hit and run fatality' : 'Vehicular assault',
          x: ped.x,
          y: ped.y,
        });
      }
      panicAt(world, ped.x, ped.y, 300);
      world.addShake?.(Math.min(8, speed * 0.012));
      world.audio?.play('impact', { force: speed, x: ped.x, y: ped.y });
      break;
    }
  }
}

export function damagePed(world, ped, amount, opts = {}) {
  if (ped.dead || amount <= 0) return;
  ped.health -= amount;
  ped.hitFlash = 1;
  const a = opts.angle ?? Math.atan2(ped.y - world.player.y, ped.x - world.player.x);
  if (opts.knockback) {
    ped.knockVx = Math.cos(a) * opts.knockback;
    ped.knockVy = Math.sin(a) * opts.knockback;
    ped.state = 'down';
    ped.downTimer = 2.2 + Math.random() * 2;
  } else if (opts.source === 'punch' || opts.source === 'car') {
    ped.knockVx = Math.cos(a) * (opts.knockback ?? 120);
    ped.knockVy = Math.sin(a) * (opts.knockback ?? 120);
    ped.state = 'down';
    ped.downTimer = 1.6 + Math.random() * 1.6;
  }
  if (ped.health <= 0) {
    ped.health = 0;
    ped.dead = true;
    ped.state = 'dead';
    ped.deadTimer = 0;
    world.spawnBlood?.(ped.x, ped.y, 14);
    world.addDecal?.(ped.x, ped.y, 'blood', { size: 15 + Math.random() * 12 });
    if (opts.player) {
      if (ped.kind === 'cop') {
        world.reportCrime?.({ level: 4, reason: 'Officer down', x: ped.x, y: ped.y });
        world.player.kills++;
      } else if (ped.kind === 'gang') {
        world.notify?.('Cobalt crew member down.', 'good');
        world.player.kills++;
      } else {
        world.reportCrime?.({ level: 3, reason: 'Homicide', x: ped.x, y: ped.y });
        world.player.kills++;
      }
    }
    panicAt(world, ped.x, ped.y, 340);
    if (ped.missionTag) world.onMissionPedKilled?.(ped);
    return;
  }
  if (opts.source !== 'car') panicAt(world, ped.x, ped.y, 260);
}

export function panicAt(world, x, y, radius) {
  const r2 = radius * radius;
  for (const ped of world.peds) {
    if (ped.kind !== 'civ' || ped.dead || ped.state === 'down') continue;
    if ((ped.x - x) ** 2 + (ped.y - y) ** 2 > r2) continue;
    if (ped.state === 'flee' && ped.fleeTimer > 1.2) continue;
    ped.state = 'flee';
    ped.fleeTimer = 3.5 + Math.random() * 4;
    ped.fleeAngle = Math.atan2(ped.y - y, ped.x - x) + (Math.random() - 0.5) * 0.8;
  }
}

export function removePed(world, ped) {
  const i = world.peds.indexOf(ped);
  if (i >= 0) world.peds.splice(i, 1);
}

export function clearMissionPeds(world, tag) {
  for (let i = world.peds.length - 1; i >= 0; i--) {
    const ped = world.peds[i];
    if (ped.missionTag === tag) world.peds.splice(i, 1);
  }
}

export { COLORS };
