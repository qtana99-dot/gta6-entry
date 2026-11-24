// Every number that shapes Solara Bay lives here: world scale, tuning, palettes, names.
// Distances are world pixels, speeds are pixels per second and the simulation runs at 60 Hz.

export const STEP = 1 / 60;
export const MAX_STEPS = 3;

export const CELL = 300;
export const ROAD = 88;
export const SIDEWALK = 18;
export const GRID = 14;
export const CITY_SIZE = CELL * GRID;
export const OCEAN_DEPTH = 560;
export const WORLD_WIDTH = CITY_SIZE;
export const WORLD_HEIGHT = CITY_SIZE + OCEAN_DEPTH;
export const SHORE_Y = CITY_SIZE;

export const SAVE_KEY = 'solara-heat-save-v1';
export const GAME_TITLE = 'SOLARA HEAT';
export const GAME_TAGLINE = 'A sun-baked crime story';

export const PLAYER = {
  radius: 12,
  walkSpeed: 152,
  runSpeed: 238,
  accel: 1250,
  friction: 12,
  maxHealth: 100,
  maxArmor: 100,
  startMoney: 350,
  startPos: { x: 750, y: 2905 },
  respawnHealth: 100,
  punchRange: 48,
  punchArc: 1.15,
  pickupRange: 30,
};

export const WEAPONS = {
  fist: {
    id: 'fist',
    name: 'Fists',
    short: 'FIST',
    damage: 17,
    cooldown: 0.34,
    range: 48,
    arc: 1.2,
    melee: true,
  },
  pistol: {
    id: 'pistol',
    name: 'Harbor 9',
    short: 'HARBOR 9',
    damage: 32,
    cooldown: 0.19,
    speed: 1560,
    spread: 0.028,
    range: 1050,
    clip: 12,
    reloadTime: 1.25,
    melee: false,
  },
};

export const VEHICLE_TYPES = {
  sedan: {
    id: 'sedan',
    name: 'Marlin 4',
    length: 86,
    width: 42,
    maxSpeed: 430,
    accel: 330,
    brake: 640,
    grip: 7.4,
    handbrakeGrip: 2.1,
    turn: 2.05,
    mass: 1,
    colors: ['#d9d2c2', '#7d8fa6', '#b6544a', '#4f6b5d', '#c8b07a', '#556074'],
  },
  hatch: {
    id: 'hatch',
    name: 'Kite',
    length: 72,
    width: 40,
    maxSpeed: 382,
    accel: 305,
    brake: 600,
    grip: 8.1,
    handbrakeGrip: 2.4,
    turn: 2.35,
    mass: 0.85,
    colors: ['#e0a84b', '#739e86', '#cf6e5b', '#e7dfce', '#6b7fa1'],
  },
  taxi: {
    id: 'taxi',
    name: 'Sun Cab',
    length: 88,
    width: 44,
    maxSpeed: 424,
    accel: 325,
    brake: 630,
    grip: 7.2,
    handbrakeGrip: 2.0,
    turn: 2.0,
    mass: 1,
    colors: ['#e8b23a', '#e8b23a', '#e8b23a'],
  },
  van: {
    id: 'van',
    name: 'Hauler',
    length: 104,
    width: 50,
    maxSpeed: 348,
    accel: 265,
    brake: 560,
    grip: 6.5,
    handbrakeGrip: 1.7,
    turn: 1.72,
    mass: 1.45,
    colors: ['#c9c5b8', '#8b98a0', '#b27052', '#93a88a'],
  },
  truck: {
    id: 'truck',
    name: 'Dray',
    length: 124,
    width: 56,
    maxSpeed: 300,
    accel: 225,
    brake: 520,
    grip: 6,
    handbrakeGrip: 1.6,
    turn: 1.5,
    mass: 2.1,
    colors: ['#9a8f7c', '#748289', '#a9674e'],
  },
  sports: {
    id: 'sports',
    name: 'Vulcan GT',
    length: 94,
    width: 44,
    maxSpeed: 640,
    accel: 500,
    brake: 780,
    grip: 10.2,
    handbrakeGrip: 2.6,
    turn: 2.18,
    mass: 0.9,
    colors: ['#ce2f2a'],
  },
  police: {
    id: 'police',
    name: 'Precinct 9',
    length: 92,
    width: 46,
    maxSpeed: 566,
    accel: 420,
    brake: 720,
    grip: 8.7,
    handbrakeGrip: 2.2,
    turn: 2.12,
    mass: 1.1,
    colors: ['#e9edf2'],
  },
  gang: {
    id: 'gang',
    name: 'Cobalt Coupe',
    length: 90,
    width: 44,
    maxSpeed: 548,
    accel: 435,
    brake: 700,
    grip: 8.9,
    handbrakeGrip: 2.3,
    turn: 2.08,
    mass: 1.05,
    colors: ['#29466b'],
  },
};

export const TRAFFIC = {
  target: 24,
  hardCap: 34,
  spawnMin: 700,
  spawnMax: 1750,
  despawn: 2450,
  laneOffset: ROAD * 0.25,
  followDistance: 108,
  playerSlowDistance: 92,
  stuckTime: 3.2,
};

export const PEDS = {
  target: 58,
  hardCap: 85,
  spawnMin: 260,
  spawnMax: 1250,
  despawn: 1750,
  walkMin: 34,
  walkMax: 66,
  fleeSpeed: 132,
  radius: 9,
  panicRadius: 250,
};

export const POLICE = {
  starDecayAfter: 7.5,
  starDecayInterval: 5.5,
  chaseDistance: 2600,
  spawnMin: 900,
  spawnMax: 1450,
  spawnEvery: 3.2,
  maxCarsByStar: [0, 1, 2, 2, 3, 4],
  maxFootByStar: [0, 1, 2, 3, 5, 7],
  bustRange: 62,
  bustTime: 1.6,
  carShootRange: 560,
  officerShootRange: 430,
  officerCooldown: 1.35,
  clearanceBribe: 180,
};

export const MISSIONS = {
  rewardMultiplier: 1,
  arriveRadius: 72,
  giverRadius: 58,
};

export const DAY = {
  minutes: 9.5 * 60,
  realSecondsPerDay: 720,
  dawn: 5.5,
  dusk: 20.2,
};

export const COLORS = {
  asphalt: '#3d4247',
  asphaltEdge: '#33383d',
  lane: '#d8c880',
  crosswalk: '#cfcbc0',
  sidewalk: '#8d8b82',
  sidewalkEdge: '#76746c',
  lot: '#6f7070',
  grass: '#5d7d4f',
  grassDark: '#4b6a40',
  sand: '#d8bd86',
  sandDark: '#c6a86f',
  water: '#2f7f8f',
  waterDeep: '#1e5f70',
  waterFoam: '#a9d9d3',
  curb: '#a4a196',
  shadow: 'rgba(18,20,22,0.32)',
  blood: '#7d1f22',
  mission: '#f5c542',
  police: '#4f8cff',
  policeRed: '#e04848',
  player: '#f3e7d1',
  playerAccent: '#d9503f',
  ui: '#f4ead6',
  uiDim: '#a9a397',
  uiPanel: 'rgba(15,19,24,0.82)',
  uiGold: '#f0c658',
};

export const DISTRICTS = [
  {
    id: 'old',
    name: 'Old Quarter',
    x0: 0, x1: 4, y0: 0, y1: 7,
    ground: '#716b60',
    walls: ['#b98d6a', '#c9a27a', '#a67d62', '#d0ab80'],
    roofs: ['#8d6a4e', '#7b5c45', '#9a7657'],
    accent: '#e0c08a',
    height: [34, 88],
    density: 0.85,
    neon: false,
    note: 'Low brick blocks, taquerias and the old courthouse.',
  },
  {
    id: 'civic',
    name: 'Civic Center',
    x0: 4, x1: 8, y0: 0, y1: 7,
    ground: '#7a786e',
    walls: ['#cfc7b4', '#b9b09b', '#d8d0bd', '#a9a291'],
    roofs: ['#8e8878', '#797363', '#9c9685'],
    accent: '#d8c690',
    height: [52, 142],
    density: 0.72,
    neon: false,
    note: 'Plazas, the hospital and the courthouse columns.',
  },
  {
    id: 'neon',
    name: 'Neon Strip',
    x0: 8, x1: 11, y0: 0, y1: 7,
    ground: '#635f5c',
    walls: ['#765c73', '#8a5d62', '#6a607f', '#94586b'],
    roofs: ['#5a4659', '#684854', '#54495f'],
    accent: '#ff71a8',
    height: [54, 150],
    density: 0.9,
    neon: true,
    note: 'Clubs, motels, karaoke signs and the Cobalt Kings.',
  },
  {
    id: 'palms',
    name: 'Palm Heights',
    x0: 11, x1: 14, y0: 0, y1: 7,
    ground: '#7d7b6c',
    walls: ['#ddd3bd', '#c9c1ae', '#e7ddc6', '#bdb5a4'],
    roofs: ['#a49b87', '#918875', '#b4ab96'],
    accent: '#7fd6c3',
    height: [96, 250],
    density: 0.62,
    neon: false,
    note: 'Glass towers, valet stands and money with a view.',
  },
  {
    id: 'marina',
    name: 'Marina Flats',
    x0: 0, x1: 4, y0: 7, y1: 13,
    ground: '#736f66',
    walls: ['#b78663', '#c59a76', '#a56f57', '#d0a985'],
    roofs: ['#7c5a44', '#916b50', '#6f513e'],
    accent: '#efb34b',
    height: [36, 108],
    density: 0.78,
    neon: false,
    note: 'Cruz Customs, fish shacks, laundromats and low tide.',
  },
  {
    id: 'docks',
    name: 'Sunset Docks',
    x0: 4, x1: 8, y0: 7, y1: 13,
    ground: '#6b6862',
    walls: ['#8d8a7d', '#a09a88', '#7b817d', '#b0a58c'],
    roofs: ['#6e6c61', '#7d7a6b', '#62605a'],
    accent: '#e59a56',
    height: [30, 92],
    density: 0.55,
    neon: false,
    note: 'Container yards, cranes and the night market.',
  },
  {
    id: 'harbor',
    name: 'Harbor Point',
    x0: 8, x1: 14, y0: 7, y1: 13,
    ground: '#74726a',
    walls: ['#b9b09c', '#a6a492', '#c8bfa9', '#968f80'],
    roofs: ['#888274', '#9a9383', '#777163'],
    accent: '#76c9d4',
    height: [44, 138],
    density: 0.7,
    neon: false,
    note: 'The marina, sea wall and a boardwalk that never sleeps.',
  },
  {
    id: 'beach',
    name: 'Solara Beach',
    x0: 0, x1: 14, y0: 13, y1: 14,
    ground: '#d8bd86',
    walls: ['#e0c995'],
    roofs: ['#c6a86f'],
    accent: '#6fd0d8',
    height: [18, 34],
    density: 0.1,
    neon: false,
    note: 'Palm shade, warm sand and the long water.',
  },
];

export function districtAt(bx, by) {
  for (const d of DISTRICTS) {
    if (bx >= d.x0 && bx < d.x1 && by >= d.y0 && by < d.y1) return d;
  }
  return DISTRICTS[0];
}

function bc(bx, by) {
  return { x: (bx + 0.5) * CELL, y: (by + 0.5) * CELL };
}

export const LANDMARKS = {
  garage: { x: 750, y: 2892, name: 'Cruz Customs' },
  valet: { x: 3750, y: 1088, name: 'Palm Heights Valet' },
  decoy: { x: 1050, y: 2580, name: 'Marina Lot' },
  docks: { x: 1950, y: 3172, name: 'Sunset Docks' },
  club: { x: 2850, y: 1092, name: 'Cobalt Room' },
  hospital: { x: 2250, y: 750, name: 'Bay General' },
  hospitalBay: { x: 2250, y: 902, name: 'Bay General' },
  police: { x: 150, y: 1650, name: 'Precinct 9' },
  policeBay: { x: 302, y: 1650, name: 'Precinct 9' },
  plaza: bc(5, 7),
  beach: { x: 2550, y: 3970, name: 'Solara Beach' },
  start: { x: 750, y: 2905, name: 'Cruz Customs' },
};

export const AUDIO = {
  master: 0.34,
  engine: 0.055,
  siren: 0.05,
  ambient: 0.018,
};
