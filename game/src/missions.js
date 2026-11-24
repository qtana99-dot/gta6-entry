// Story and jobs: Nadia Cruz's four-part descent through Solara Bay, the dialogue box, objective
// markers, timed chases and deliveries, and the free-roam epilogue. The module owns only mission
// state; police, traffic and combat are called through their own public functions.

import { LANDMARKS, MISSIONS as MCFG, districtAt, PLAYER } from './config.js';
import { Vehicle } from './vehicles.js';
import { spawnGangster, clearMissionPeds } from './peds.js';
import { randomRoadSpawn, driveToward } from './traffic.js';
import { fireBullet } from './combat.js';
import { setWanted, clearWanted } from './police.js';
import { addAmmo } from './combat.js';
import { addMoney } from './player.js';
import { clamp, dist, formatTimer, pick } from './math.js';

const SPEAKER_COLORS = {
  Nadia: '#e8896c',
  Rico: '#6fc7c0',
  Dax: '#b98bc9',
  Radio: '#e5c468',
  Buyer: '#9fb3c9',
};

const MISSION_LIST = [
  {
    id: 'repo',
    title: 'The Repo',
    reward: 600,
    brief: [
      { speaker: 'Nadia', text: 'Rico. You still owe Mama Vex six grand, and she does not do payment plans.' },
      { speaker: 'Rico', text: 'I am aware. The bike courier thing is not exactly printing money.' },
      { speaker: 'Nadia', text: 'Then do this. A cherry Vulcan GT is sitting on the Palm Heights valet deck. Bring it to my garage and I will shave a grand off what you owe.' },
      { speaker: 'Rico', text: 'Stealing a car for the woman who owns my debt. Great.' },
      { speaker: 'Nadia', text: 'The keys are in it. Try not to scratch the paint.' },
    ],
    success: [
      { speaker: 'Nadia', text: 'That is the one. Mama Vex just moved her calendar back a week.' },
      { speaker: 'Rico', text: 'And my cut?' },
      { speaker: 'Nadia', text: 'Your cut is that I do not tell her where you live. Here is six hundred. Do not spend it on anything sensible.' },
    ],
  },
  {
    id: 'heat',
    title: 'Heat Check',
    reward: 1200,
    brief: [
      { speaker: 'Nadia', text: 'New problem. A buyer from the Cobalt Kings is sniffing around my lot, so I need him looking the other way.' },
      { speaker: 'Rico', text: 'So you want me to make noise.' },
      { speaker: 'Nadia', text: 'Loud noise. Take the decoy Kite from the Marina lot, pull three stars, and keep the whole precinct busy for forty-five seconds. Then lose them.' },
      { speaker: 'Rico', text: 'You know, normal people ask for coffee.' },
      { speaker: 'Nadia', text: 'Normal people do not owe Mama Vex.' },
    ],
    success: [
      { speaker: 'Nadia', text: 'Beautiful. Half the precinct is writing reports about a yellow hatchback.' },
      { speaker: 'Rico', text: 'You owe me a new paint job.' },
      { speaker: 'Nadia', text: 'I owe you twelve hundred. That is better than paint.' },
    ],
  },
  {
    id: 'drop',
    title: 'The Drop',
    reward: 2500,
    brief: [
      { speaker: 'Nadia', text: 'One more. A hard case is coming through the docks tonight, and my buyer paid in advance.' },
      { speaker: 'Rico', text: 'Let me guess. I am the delivery guy.' },
      { speaker: 'Nadia', text: 'You are the delivery guy. Take the package van, get the case to Pier Six at Sunset Docks in two and a half minutes. The Cobalt Kings know about it, so they will be rude.' },
      { speaker: 'Rico', text: 'And if I make it?' },
      { speaker: 'Nadia', text: 'Twenty-five hundred. If you do not, do not come back.' },
    ],
    success: [
      { speaker: 'Nadia', text: 'Buyer has the case. The Cobalt Kings will not like it, but they are not paid to like things.' },
      { speaker: 'Rico', text: 'I took three bullets worth of paint. My van is a colander.' },
      { speaker: 'Nadia', text: 'Twenty-five hundred, and I will have the van repainted. Probably.' },
    ],
  },
  {
    id: 'lastcall',
    title: 'Last Call',
    reward: 5000,
    brief: [
      { speaker: 'Nadia', text: 'The Cobalt Kings just torched my lot on Harbor Point. Dax Cobalt is at the Cobalt Room, toasting himself.' },
      { speaker: 'Rico', text: 'And you want me to send a message.' },
      { speaker: 'Nadia', text: 'I want you to end the conversation. Take the Harbor 9. Dax keeps four shooters with him.' },
      { speaker: 'Rico', text: 'That is a lot of conversation.' },
      { speaker: 'Nadia', text: 'Five grand says you are a good talker.' },
    ],
    success: [
      { speaker: 'Nadia', text: 'Dax is quiet. The whole strip is quiet. That was the last job, Rico.' },
      { speaker: 'Rico', text: 'So what happens now?' },
      { speaker: 'Nadia', text: 'Now you find out what a free man does on a Tuesday. Five thousand. Welcome to Solara Bay.' },
    ],
  },
];

export function createMissionState() {
  return {
    index: 0,
    completed: 0,
    stage: 'idle',
    objective: 'Meet Nadia Cruz at Cruz Customs.',
    title: 'Free roam',
    marker: { x: LANDMARKS.garage.x, y: LANDMARKS.garage.y, radius: MCFG.giverRadius, kind: 'job', label: 'Nadia Cruz' },
    timer: 0,
    startCooldown: 1.4,
    flags: {},
    primary: null,
    successTimer: 0,
    failReason: '',
    freeRoam: false,
    visited: new Set(),
    tourBonus: false,
    lastPrompt: '',
  };
}

export function showDialogue(world, lines, onDone = null) {
  world.dialogue = {
    active: true,
    lines,
    index: 0,
    reveal: 0,
    onDone,
    elapsed: 0,
  };
  world.audio?.play('dialogue');
}

export function updateDialogue(world, dt, input) {
  const d = world.dialogue;
  if (!d || !d.active) return false;
  d.elapsed += dt;
  const line = d.lines[d.index];
  if (!line) {
    closeDialogue(world);
    return true;
  }
  d.reveal += dt * 58;
  const wantsAdvance =
    input.anyPressed('KeyE', 'Enter', 'Space') ||
    (input.mouse.pressed && d.elapsed > 0.15);
  if (wantsAdvance) {
    if (d.reveal < line.text.length) {
      d.reveal = line.text.length;
    } else if (d.index + 1 < d.lines.length) {
      d.index++;
      d.reveal = 0;
      world.audio?.play('click', { soft: true });
    } else {
      closeDialogue(world);
    }
    return true;
  }
  return false;
}

function closeDialogue(world) {
  const d = world.dialogue;
  if (!d) return;
  d.active = false;
  const cb = d.onDone;
  d.onDone = null;
  if (cb) cb();
}

export function speakerColor(name) {
  return SPEAKER_COLORS[name] ?? '#d8cbb2';
}

function missionDef(index) {
  return MISSION_LIST[index] ?? null;
}

function setMarker(world, marker) {
  world.mission.marker = marker;
}

function setObjective(world, text) {
  world.mission.objective = text;
}

function setTitle(world, title) {
  world.mission.title = title;
}

function garageMarker() {
  return { x: LANDMARKS.garage.x, y: LANDMARKS.garage.y, radius: MCFG.giverRadius, kind: 'job', label: 'Nadia Cruz' };
}

export function resetMissions(world) {
  world.mission = createMissionState();
  world.dialogue = { active: false, lines: [], index: 0, reveal: 0, onDone: null, elapsed: 0 };
  setTitle(world, 'New in town');
  setObjective(world, 'Meet Nadia Cruz at Cruz Customs in Marina Flats.');
  setMarker(world, garageMarker());
}

export function failMission(world, reason = 'Job failed') {
  const state = world.mission;
  if (!state || state.freeRoam || state.stage === 'idle' || state.stage === 'failed') return;
  if (state.stage === 'success') return;
  cleanupMission(world, state);
  state.stage = 'failed';
  state.timer = 0;
  state.startCooldown = 2.2;
  state.failReason = reason;
  state.primary = null;
  state.flags = {};
  world.police.lockDecay = false;
  setMarker(world, garageMarker());
  setObjective(world, 'Job blown. Return to Cruz Customs to run it again.');
  setTitle(world, 'Job failed');
  world.notify?.(`MISSION FAILED — ${reason}`, 'bad');
  world.audio?.play('fail');
}

function cleanupMission(world, state) {
  if (state.primary) {
    const car = state.primary;
    if (world.player.driving === car && !car.dead) {
      car.missionTag = null;
      car.role = 'stolen';
    } else {
      car.driver = null;
      world.removeVehicle?.(car);
    }
    state.primary = null;
  }
  for (const tag of ['repoCar', 'decoyCar', 'packageCar', 'dropGang', 'dockGang', 'cobaltCrew']) {
    for (let i = world.vehicles.length - 1; i >= 0; i--) {
      const v = world.vehicles[i];
      if (v.missionTag === tag) {
        if (world.player.driving === v) v.missionTag = null;
        else world.vehicles.splice(i, 1);
      }
    }
    clearMissionPeds(world, tag);
  }
}

function beginMission(world, def) {
  const state = world.mission;
  if (!state || state.stage !== 'brief') return;
  state.stage = 'active';
  state.flags = {};
  state.timer = 0;
  state.primary = null;
  setTitle(world, def.title);
  if (def.id === 'repo') setupRepo(world);
  else if (def.id === 'heat') setupHeat(world);
  else if (def.id === 'drop') setupDrop(world);
  else if (def.id === 'lastcall') setupLastCall(world);
}

function spawnMissionVehicle(world, type, x, y, angle, tag, opts = {}) {
  const car = new Vehicle(type, x, y, angle, { role: 'parked', missionTag: tag, ...opts });
  world.vehicles.push(car);
  world.mission.primary = car;
  return car;
}

function setupRepo(world) {
  const car = spawnMissionVehicle(world, 'sports', LANDMARKS.valet.x, LANDMARKS.valet.y, 0, 'repoCar', {
    color: '#ce2f2a',
    label: 'Cherry Vulcan GT',
  });
  setObjective(world, 'Steal the cherry Vulcan GT from the Palm Heights valet deck.');
  setMarker(world, { x: car.x, y: car.y, radius: 62, kind: 'car', label: 'Vulcan GT' });
  world.notify?.('Nadia: bring me that Vulcan.', 'info');
}

function setupHeat(world) {
  const car = spawnMissionVehicle(world, 'hatch', LANDMARKS.decoy.x, LANDMARKS.decoy.y, 0, 'decoyCar', {
    color: '#e0a84b',
    label: 'Decoy Kite',
  });
  setObjective(world, 'Take the decoy Kite from the Marina lot.');
  setMarker(world, { x: car.x, y: car.y, radius: 62, kind: 'car', label: 'Decoy Kite' });
}

function setupDrop(world) {
  const car = spawnMissionVehicle(world, 'van', LANDMARKS.garage.x, LANDMARKS.garage.y, 0, 'packageCar', {
    color: '#c9c5b8',
    label: 'Package van',
  });
  setObjective(world, 'Take the package van from Cruz Customs.');
  setMarker(world, { x: car.x, y: car.y, radius: 66, kind: 'car', label: 'Package van' });
  world.notify?.('Nadia: the clock starts when you roll.', 'info');
}

function setupLastCall(world) {
  setObjective(world, 'Drive to the Cobalt Room in the Neon Strip.');
  setMarker(world, { x: LANDMARKS.club.x, y: LANDMARKS.club.y, radius: 110, kind: 'club', label: 'Cobalt Room' });
  world.player.clip = Math.max(world.player.clip, 12);
  addAmmo(world, 24);
  world.notify?.('Nadia: Dax keeps four shooters. Make them count.', 'info');
}

function completeMission(world, def, lines) {
  const state = world.mission;
  if (state.stage === 'success') return;
  state.stage = 'success';
  state.timer = 0;
  state.marker = null;
  state.flags = {};
  addMoney(world, def.reward);
  world.player.missionsDone++;
  world.notify?.(`${def.title} complete — $${def.reward.toLocaleString('en-US')}`, 'good');
  world.audio?.play('mission');
  cleanupMission(world, state);
  world.police.lockDecay = false;
  clearWanted(world, true);
  showDialogue(world, lines, () => advanceMission(world));
  world.requestSave?.();
}

function advanceMission(world) {
  const state = world.mission;
  state.completed = Math.max(state.completed, state.index + 1);
  state.index++;
  state.stage = 'idle';
  state.startCooldown = 2.4;
  state.timer = 0;
  state.flags = {};
  if (state.index >= MISSION_LIST.length) {
    state.freeRoam = true;
    state.completed = MISSION_LIST.length;
    setTitle(world, 'Solara Bay');
    setObjective(world, 'Free roam — explore all seven districts, collect cash, and outrun the heat.');
    state.marker = null;
    world.notify?.('Free roam unlocked. The city is yours.', 'good');
    world.audio?.play('unlock');
  } else {
    setTitle(world, 'Between jobs');
    setObjective(world, 'Meet Nadia Cruz at Cruz Customs for the next job.');
    setMarker(world, garageMarker());
  }
  world.requestSave?.();
}

function handleIdle(world) {
  const state = world.mission;
  state.startCooldown = Math.max(0, state.startCooldown - 1 / 60);
  const def = missionDef(state.index);
  if (!def) return;
  if (state.startCooldown > 0) return;
  if (world.dialogue?.active) return;
  if (world.player.driving || world.player.dead) return;
  const d = dist(world.player.x, world.player.y, LANDMARKS.garage.x, LANDMARKS.garage.y);
  if (d < MCFG.giverRadius) {
    state.stage = 'brief';
    setTitle(world, def.title);
    setObjective(world, `Talking to Nadia — ${def.title}`);
    showDialogue(world, def.brief, () => beginMission(world, def));
  }
}

function updateRepo(world, def, dt) {
  const state = world.mission;
  const car = state.primary;
  if (!car || car.dead || !world.vehicles.includes(car)) {
    failMission(world, 'The Vulcan was wrecked.');
    return;
  }
  if (!state.flags.entered && world.player.driving === car) {
    state.flags.entered = true;
    setObjective(world, 'Deliver the Vulcan to Cruz Customs in Marina Flats.');
    setMarker(world, { x: LANDMARKS.garage.x, y: LANDMARKS.garage.y, radius: 78, kind: 'drop', label: 'Cruz Customs' });
    world.reportCrime?.({ level: 1, reason: 'Stolen Vulcan reported', x: car.x, y: car.y });
    world.notify?.('Valet called it in. Get moving.', 'warn');
  }
  if (state.flags.entered && world.player.driving === car) {
    if (dist(car.x, car.y, LANDMARKS.garage.x, LANDMARKS.garage.y) < 84) {
      completeMission(world, def, def.success);
    }
  }
}

function updateHeat(world, def, dt) {
  const state = world.mission;
  const car = state.primary;
  if (state.stage === 'active') {
    if (!car || car.dead || !world.vehicles.includes(car)) {
      failMission(world, 'The decoy car was wrecked.');
      return;
    }
    if (world.player.driving === car) {
      state.flags.entered = true;
      state.stage = 'survive';
      state.timer = 45;
      world.police.lockDecay = true;
      setWanted(world, 3, 'Decoy run');
      setObjective(world, 'Survive the 3-star pursuit — 45 seconds.');
      setMarker(world, null);
      world.notify?.('Three stars. Keep the whole precinct busy.', 'warn');
      world.audio?.play('sirenStart');
    }
    return;
  }
  if (state.stage === 'survive') {
    state.timer -= dt;
    if (world.police.stars < 3) {
      world.police.stars = 3;
    }
    world.police.lastCrime = world.time;
    if (state.timer <= 0) {
      state.timer = 0;
      state.stage = 'escape';
      world.police.lockDecay = false;
      world.police.lastCrime = world.time - 9;
      setObjective(world, 'Lose the cops. Break line of sight.');
      setMarker(world, null);
      world.notify?.('Now lose them.', 'warn');
      world.audio?.play('unlock');
    }
    return;
  }
  if (state.stage === 'escape') {
    if (world.police.stars === 0) {
      completeMission(world, def, def.success);
    }
  }
}

function spawnGangChase(world, count = 2) {
  for (let i = 0; i < count; i++) {
    const spot = randomRoadSpawn(world, 480, 900);
    if (!spot) continue;
    const car = new Vehicle('gang', spot.x, spot.y, spot.angle, { role: 'gang', missionTag: 'dropGang' });
    car.siren = false;
    car.cruise = car.spec.maxSpeed * 0.9;
    car.shootCooldown = 1.5 + Math.random();
    world.vehicles.push(car);
  }
}

function spawnDockGreeters(world) {
  const base = LANDMARKS.docks;
  const spots = [
    { x: base.x - 48, y: base.y + 16 },
    { x: base.x + 46, y: base.y - 14 },
  ];
  for (const s of spots) {
    const ped = spawnGangster(world, s.x, s.y, { missionTag: 'dockGang' });
    ped.angle = Math.PI / 2;
  }
  world.notify?.('Cobalt lookouts at the dock.', 'warn');
}

function updateDrop(world, def, dt) {
  const state = world.mission;
  const car = state.primary;
  if (!car || car.dead || !world.vehicles.includes(car)) {
    failMission(world, 'The package van was destroyed.');
    return;
  }
  if (state.stage === 'active') {
    if (world.player.driving === car) {
      state.flags.entered = true;
      state.stage = 'deliver';
      state.timer = 150;
      state.flags.gangSpawned = true;
      state.flags.greetSpawned = false;
      setObjective(world, 'Deliver the case to Sunset Docks — 2:30.');
      setMarker(world, { x: LANDMARKS.docks.x, y: LANDMARKS.docks.y, radius: 82, kind: 'drop', label: 'Pier Six' });
      spawnGangChase(world, 2);
      world.notify?.('Cobalt Kings are moving. Do not stop.', 'warn');
      world.audio?.play('sirenStart');
    }
    return;
  }
  if (state.stage === 'deliver') {
    state.timer -= dt;
    if (!state.flags.greetSpawned && dist(world.player.x, world.player.y, LANDMARKS.docks.x, LANDMARKS.docks.y) < 480) {
      state.flags.greetSpawned = true;
      spawnDockGreeters(world);
    }
    for (const other of world.vehicles) {
      if (other.missionTag !== 'dropGang' || other.dead) continue;
      const targetX = world.player.driving ? world.player.driving.x : world.player.x;
      const targetY = world.player.driving ? world.player.driving.y : world.player.y;
      driveToward(world, other, targetX, targetY, dt, {
        aggressive: true,
        speed: other.spec.maxSpeed * 0.9,
        stopDistance: world.player.driving ? 0 : 100,
      });
      const d = dist(other.x, other.y, targetX, targetY);
      other.shootCooldown = Math.max(0, (other.shootCooldown ?? 0) - dt);
      if (d < 520 && other.shootCooldown <= 0 && !world.city.lineBlocked(other.x, other.y, targetX, targetY)) {
        const a = Math.atan2(targetY - other.y, targetX - other.x) + (Math.random() - 0.5) * 0.13;
        fireBullet(world, other.x + Math.cos(a) * (other.length * 0.5 + 2), other.y + Math.sin(a) * (other.length * 0.5 + 2), a, {
          owner: 'gang',
          damage: 9,
          speed: 1220,
          range: 700,
        });
        other.shootCooldown = 1.5 + Math.random() * 1.4;
      }
    }
    if (state.timer <= 0) {
      failMission(world, 'The buyer walked.');
      return;
    }
    if (dist(car.x, car.y, LANDMARKS.docks.x, LANDMARKS.docks.y) < 90 && world.player.driving === car) {
      completeMission(world, def, def.success);
    }
  }
}

function updateLastCall(world, def, dt) {
  const state = world.mission;
  if (state.stage === 'active') {
    if (dist(world.player.x, world.player.y, LANDMARKS.club.x, LANDMARKS.club.y) < 125) {
      state.flags.arrived = true;
      state.stage = 'confront';
      setObjective(world, 'Confront Dax Cobalt.');
      showDialogue(world, [
        { speaker: 'Dax', text: 'Cruz sent the errand boy. Does she think I am going to apologize for a burned parking lot?' },
        { speaker: 'Rico', text: 'No. She thinks you talk too much.' },
        { speaker: 'Dax', text: 'Boys. Teach him some manners.' },
      ], () => {
        state.stage = 'fight';
        setObjective(world, 'Take out Dax Cobalt and his crew.');
        setMarker(world, null);
        spawnCobaltCrew(world);
      });
    }
    return;
  }
  if (state.stage === 'fight') {
    let alive = 0;
    for (const ped of world.peds) {
      if (ped.missionTag === 'cobaltCrew' && !ped.dead) alive++;
    }
    if (alive === 0) {
      state.stage = 'escape';
      setWanted(world, 3, 'Cobalt Room shootout');
      setObjective(world, 'Escape the 3-star police response.');
      setMarker(world, null);
      world.notify?.('Someone called it in. Run.', 'bad');
    }
    return;
  }
  if (state.stage === 'escape') {
    if (world.police.stars === 0) {
      completeMission(world, def, def.success);
    }
  }
}

function spawnCobaltCrew(world) {
  const base = LANDMARKS.club;
  const crew = [
    { dx: 0, dy: -18, dax: true },
    { dx: -58, dy: 2 },
    { dx: 58, dy: 2 },
    { dx: 0, dy: 38 },
  ];
  for (const c of crew) {
    const ped = spawnGangster(world, base.x + c.dx, base.y + c.dy, {
      missionTag: 'cobaltCrew',
      health: c.dax ? 155 : 78,
      shirt: c.dax ? '#d9b45a' : '#2a4c78',
      hat: c.dax,
      speed: 105,
    });
    if (c.dax) {
      ped.name = 'Dax Cobalt';
      ped.gunCooldown = 0.9;
    }
  }
  world.audio?.play('explosion');
}

function updateFreeRoam(world, dt) {
  const state = world.mission;
  const block = world.city.blockAt(world.player.x, world.player.y);
  if (block) {
    state.visited.add(block.district.id);
  }
  if (!state.tourBonus && state.visited.size >= 7) {
    state.tourBonus = true;
    addMoney(world, 1500);
    world.notify?.('District tour complete — $1,500 bonus.', 'good');
    world.audio?.play('unlock');
  }
  if (state.tourBonus) {
    setObjective(world, 'Free roam — collect cash, test the police, enjoy the sun.');
  } else {
    setObjective(world, `Free roam — districts explored ${state.visited.size}/7.`);
  }
}

export function updateMissions(world, dt) {
  const state = world.mission;
  if (!state) return;
  if (state.stage === 'failed') {
    state.startCooldown = Math.max(0, state.startCooldown - dt);
    if (state.startCooldown <= 0) {
      state.stage = 'idle';
      setTitle(world, 'Between jobs');
      setObjective(world, 'Return to Cruz Customs to run the job again.');
      setMarker(world, garageMarker());
    }
    return;
  }
  if (state.freeRoam) {
    updateFreeRoam(world, dt);
    return;
  }
  if (state.stage === 'idle') {
    state.startCooldown = Math.max(0, state.startCooldown - dt);
    handleIdle(world);
    return;
  }
  if (state.stage === 'brief') return;
  const def = missionDef(state.index);
  if (!def) return;
  if (state.stage === 'success') return;
  if (def.id === 'repo') updateRepo(world, def, dt);
  else if (def.id === 'heat') updateHeat(world, def, dt);
  else if (def.id === 'drop') updateDrop(world, def, dt);
  else if (def.id === 'lastcall') updateLastCall(world, def, dt);
}

export function missionProgress(world) {
  const state = world.mission;
  return {
    index: state.index,
    completed: state.completed,
    freeRoam: state.freeRoam,
    visited: [...state.visited],
    tourBonus: state.tourBonus,
  };
}

export function restoreMissions(world, progress) {
  if (!progress) return;
  const state = world.mission;
  state.index = clamp(progress.index ?? 0, 0, MISSION_LIST.length);
  state.completed = progress.completed ?? state.index;
  state.freeRoam = Boolean(progress.freeRoam) || state.index >= MISSION_LIST.length;
  state.stage = 'idle';
  state.startCooldown = 2;
  state.flags = {};
  state.primary = null;
  state.visited = new Set(progress.visited ?? []);
  state.tourBonus = Boolean(progress.tourBonus);
  if (state.freeRoam) {
    setTitle(world, 'Solara Bay');
    setObjective(world, 'Free roam — explore the city, collect cash, and outrun the heat.');
    state.marker = null;
  } else {
    setTitle(world, 'Between jobs');
    setObjective(world, 'Meet Nadia Cruz at Cruz Customs for the next job.');
    setMarker(world, garageMarker());
  }
}

export function missionCount() {
  return MISSION_LIST.length;
}

export function currentMissionName(world) {
  const state = world.mission;
  if (state.freeRoam) return 'Free roam';
  return missionDef(state.index)?.title ?? 'Solara Bay';
}

export function objectiveLine(world) {
  const state = world.mission;
  if (!state) return '';
  if (state.stage === 'survive' || state.stage === 'deliver') {
    return `${state.objective}  ${formatTimer(state.timer)}`;
  }
  return state.objective;
}

export { MISSION_LIST, SPEAKER_COLORS };
