// Generates Solara Bay: a deterministic road grid, eight named districts, raised buildings,
// screen-space sidewalk loops, parks, parking lots, beach and a south ocean edge. It also builds
// the spatial hash the physics uses for building collisions and the props the renderer draws.

import {
  CELL, ROAD, SIDEWALK, GRID, CITY_SIZE, WORLD_WIDTH, WORLD_HEIGHT, SHORE_Y, OCEAN_DEPTH,
  DISTRICTS, districtAt, LANDMARKS,
} from './config.js';
import { makeRng, pickRng, clamp } from './math.js';

const SPECIAL_BLOCKS = {
  '2,9': { type: 'garage', sign: 'CRUZ CUSTOMS' },
  '3,8': { type: 'lot' },
  '12,3': { type: 'valet', sign: 'PALM VALET' },
  '5,7': { type: 'plaza', sign: 'CIVIC PLAZA' },
  '9,3': { type: 'club', sign: 'COBALT ROOM' },
  '7,2': { type: 'hospital', sign: 'BAY GENERAL' },
  '0,5': { type: 'police', sign: 'PRECINCT 9' },
  '6,10': { type: 'docks', sign: 'SUNSET DOCKS' },
  '5,4': { type: 'park' },
  '10,6': { type: 'park' },
  '2,11': { type: 'park' },
  '12,9': { type: 'park' },
  '11,2': { type: 'lot' },
  '4,11': { type: 'lot' },
};

function hashColor(hex, factor) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * factor), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * factor), 0, 255);
  const b = clamp(Math.round((n & 255) * factor), 0, 255);
  return `rgb(${r},${g},${b})`;
}

export { hashColor };

function makeBuilding(city, rect, district, rng, opts = {}) {
  const wall = opts.wall ?? pickRng(rng, district.walls);
  const roof = opts.roof ?? pickRng(rng, district.roofs);
  const base = district.height;
  let height = opts.height;
  if (height === undefined) {
    const t = rng() ** 1.55;
    height = base[0] + (base[1] - base[0]) * t;
    const cx = CITY_SIZE / 2;
    const cy = CITY_SIZE / 2;
    const d = Math.hypot((rect.x - cx) / CITY_SIZE, (rect.y - cy) / CITY_SIZE);
    if (district.id === 'palms' || district.id === 'civic' || district.id === 'harbor') {
      height *= 0.72 + (1 - Math.min(d, 0.6)) * 0.95;
    }
  }
  const details = [];
  const vents = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < vents; i++) {
    details.push({
      dx: 10 + rng() * Math.max(8, rect.w - 36),
      dy: 10 + rng() * Math.max(8, rect.h - 36),
      w: 8 + rng() * 12,
      h: 6 + rng() * 10,
    });
  }
  const building = {
    id: city.buildings.length,
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    height: Math.round(height),
    wall,
    roof,
    wallDark: hashColor(wall, 0.72),
    wallLight: hashColor(wall, 1.12),
    roofLight: hashColor(roof, 1.18),
    district: district.id,
    districtName: district.name,
    neon: Boolean(district.neon && rng() < 0.5),
    neonColor: pickRng(rng, ['#ff6fae', '#63e6d5', '#ffbe5c', '#a98bff']),
    trim: pickRng(rng, ['#3f3a34', '#565049', '#6f5c4a']),
    details,
    sign: opts.sign ?? null,
  };
  city.buildings.push(building);
  return building;
}

function addLotParking(city, lot, rng, rows, cols, angle = 0) {
  const pw = 52;
  const ph = 84;
  const totalW = cols * pw + (cols - 1) * 8;
  const totalH = rows * ph + (rows - 1) * 10;
  const ox = lot.x + (lot.w - totalW) / 2;
  const oy = lot.y + (lot.h - totalH) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      city.parkingSpots.push({
        x: ox + c * (pw + 8) + pw / 2,
        y: oy + r * (ph + 10) + ph / 2,
        angle,
        lot: true,
      });
    }
  }
}

function addTree(city, rng, x, y, kind = 'tree') {
  const size = kind === 'palm' ? 22 + rng() * 18 : 16 + rng() * 15;
  city.props.push({ type: kind, x, y, size, sway: rng() * Math.PI * 2 });
}

function addLamp(city, x, y) {
  city.props.push({ type: 'lamp', x, y });
}

function addBench(city, x, y, angle) {
  city.props.push({ type: 'bench', x, y, angle });
}

function decorateLoopLamps(city, block) {
  const p = block.outer;
  const corners = [
    [p.x + 12, p.y + 12],
    [p.x + p.w - 12, p.y + 12],
    [p.x + p.w - 12, p.y + p.h - 12],
    [p.x + 12, p.y + p.h - 12],
  ];
  for (const [x, y] of corners) addLamp(city, x, y);
}

function blockLoop(block) {
  const p = block.outer;
  const o = SIDEWALK / 2;
  return [
    { x: p.x + o, y: p.y + o },
    { x: p.x + p.w - o, y: p.y + o },
    { x: p.x + p.w - o, y: p.y + p.h - o },
    { x: p.x + o, y: p.y + p.h - o },
  ];
}

function generateBuildings(city, block, rng) {
  const lot = block.lot;
  const district = block.district;
  const pattern = rng();
  const gap = 7 + rng() * 5;
  if (pattern < 0.24) {
    makeBuilding(city, { x: lot.x + 7, y: lot.y + 7, w: lot.w - 14, h: lot.h - 14 }, district, rng);
    return;
  }
  if (pattern < 0.46) {
    const split = 0.42 + rng() * 0.16;
    const w1 = (lot.w - gap) * split;
    makeBuilding(city, { x: lot.x + 5, y: lot.y + 6, w: w1 - 5, h: lot.h - 12 }, district, rng);
    makeBuilding(city, { x: lot.x + w1 + gap, y: lot.y + 9, w: lot.w - w1 - gap - 5, h: lot.h - 18 }, district, rng);
    return;
  }
  if (pattern < 0.68) {
    const split = 0.4 + rng() * 0.18;
    const h1 = (lot.h - gap) * split;
    makeBuilding(city, { x: lot.x + 6, y: lot.y + 5, w: lot.w - 12, h: h1 - 5 }, district, rng);
    makeBuilding(city, { x: lot.x + 9, y: lot.y + h1 + gap, w: lot.w - 18, h: lot.h - h1 - gap - 5 }, district, rng);
    return;
  }
  const w1 = (lot.w - gap) / 2;
  const h1 = (lot.h - gap) / 2;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      if (rng() < 0.1) continue;
      makeBuilding(city, {
        x: lot.x + c * (w1 + gap) + 4,
        y: lot.y + r * (h1 + gap) + 4,
        w: w1 - 8,
        h: h1 - 8,
      }, district, rng);
    }
  }
}

function generatePark(city, block, rng, plaza = false) {
  const lot = block.lot;
  const cx = lot.x + lot.w / 2;
  const cy = lot.y + lot.h / 2;
  if (plaza) {
    city.props.push({ type: 'fountain', x: cx, y: cy, size: 34 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      addTree(city, rng, cx + Math.cos(a) * 68, cy + Math.sin(a) * 68, rng() < 0.5 ? 'palm' : 'tree');
    }
    addBench(city, cx - 54, cy + 48, 0);
    addBench(city, cx + 54, cy - 48, Math.PI);
    return;
  }
  for (let i = 0; i < 13; i++) {
    const x = lot.x + 16 + rng() * (lot.w - 32);
    const y = lot.y + 16 + rng() * (lot.h - 32);
    if (Math.hypot(x - cx, y - cy) < 28) continue;
    addTree(city, rng, x, y, rng() < 0.4 ? 'palm' : 'tree');
  }
  addBench(city, cx - 20, cy + 30, 0);
  addBench(city, cx + 20, cy - 30, Math.PI);
  if (rng() < 0.65) city.props.push({ type: 'pond', x: cx, y: cy, size: 28 });
}

function specialBlock(city, block, rng) {
  const lot = block.lot;
  const district = block.district;
  const s = block.special;
  const cx = lot.x + lot.w / 2;
  const cy = lot.y + lot.h / 2;
  if (s.type === 'garage') {
    makeBuilding(city, { x: lot.x + 4, y: lot.y + 2, w: lot.w - 8, h: 58 }, district, rng, {
      height: 28, wall: '#8a7b67', roof: '#5f5648', sign: s.sign,
    });
    city.props.push({ type: 'crate', x: lot.x + 18, y: lot.y + 84, size: 13 });
    city.props.push({ type: 'crate', x: lot.x + 34, y: lot.y + 92, size: 10 });
    city.parkingSpots.push({ x: cx + 42, y: lot.y + 118, angle: 0, lot: true });
    city.parkingSpots.push({ x: cx + 42, y: lot.y + 118, angle: 0, lot: true });
    addLotParking(city, { x: lot.x + 4, y: lot.y + 70, w: lot.w - 80, h: 96 }, rng, 1, 2, 0);
    return;
  }
  if (s.type === 'club') {
    makeBuilding(city, { x: lot.x + 3, y: lot.y + 2, w: lot.w - 6, h: 70 }, district, rng, {
      height: 62, wall: '#5d3d57', roof: '#3a2838', sign: s.sign, neon: true,
    });
    city.props.push({ type: 'neon', x: cx, y: lot.y + 74, color: '#ff5fa8', text: 'COBALT' });
    city.props.push({ type: 'neon', x: cx - 54, y: lot.y + 20, color: '#65e3e0', text: 'OPEN' });
    addBench(city, cx - 48, lot.y + 138, 0);
    addTree(city, rng, lot.x + 12, lot.y + 150, 'palm');
    addTree(city, rng, lot.x + lot.w - 14, lot.y + 148, 'palm');
    return;
  }
  if (s.type === 'valet') {
    makeBuilding(city, { x: lot.x + 4, y: lot.y + 2, w: 42, h: 24 }, district, rng, {
      height: 16, wall: '#d8cbb1', roof: '#9c8f78', sign: 'VALET',
    });
    addLotParking(city, lot, rng, 2, 3, 0);
    for (let i = 0; i < 2; i++) addTree(city, rng, lot.x + 12 + i * 30, lot.y + lot.h - 14, 'palm');
    city.props.push({ type: 'neon', x: lot.x + 34, y: lot.y + 32, color: '#63e6d5', text: 'VALET' });
    return;
  }
  if (s.type === 'plaza') {
    generatePark(city, block, rng, true);
    return;
  }
  if (s.type === 'hospital') {
    makeBuilding(city, { x: lot.x + 6, y: lot.y + 6, w: lot.w - 12, h: lot.h - 26 }, district, rng, {
      height: 138, wall: '#d6d2c6', roof: '#9b978c', sign: s.sign,
    });
    city.props.push({ type: 'cross', x: cx, y: cy - 24, size: 15 });
    addLotParking(city, { x: lot.x + 12, y: lot.y + lot.h - 16, w: lot.w - 24, h: 24 }, rng, 0, 2, 0);
    return;
  }
  if (s.type === 'police') {
    makeBuilding(city, { x: lot.x + 8, y: lot.y + 8, w: lot.w - 16, h: lot.h - 30 }, district, rng, {
      height: 74, wall: '#b3b2ab', roof: '#767770', sign: s.sign,
    });
    city.props.push({ type: 'cross', x: cx, y: cy - 30, size: 12, color: '#6da2e8' });
    return;
  }
  if (s.type === 'docks') {
    makeBuilding(city, { x: lot.x + 2, y: lot.y + 2, w: lot.w - 4, h: 74 }, district, rng, {
      height: 34, wall: '#8f8b7c', roof: '#61604f', sign: s.sign,
    });
    const colors = ['#a8624a', '#436d7a', '#7d8460'];
    for (let i = 0; i < 4; i++) {
      city.props.push({
        type: 'container', x: lot.x + 16 + (i % 2) * 78, y: lot.y + 100 + Math.floor(i / 2) * 34,
        w: 50, h: 24, color: colors[i % colors.length],
      });
    }
    addLotParking(city, { x: lot.x + 6, y: lot.y + 86, w: 62, h: 48 }, rng, 1, 1, 0);
    return;
  }
  if (s.type === 'park') {
    generatePark(city, block, rng, false);
    return;
  }
  if (s.type === 'beach') {
    for (let i = 0; i < 5; i++) {
      addTree(city, rng, lot.x + 16 + rng() * (lot.w - 32), lot.y + 18 + rng() * 42, 'palm');
    }
    for (let i = 0; i < 3; i++) {
      city.props.push({
        type: 'umbrella', x: lot.x + 24 + rng() * (lot.w - 48), y: lot.y + 86 + rng() * 56,
        color: pickRng(rng, ['#e5715d', '#efb34b', '#69b5a3']),
      });
    }
    return;
  }
  if (s.type === 'lot') {
    addLotParking(city, lot, rng, 2, 2, 0);
    if (rng() < 0.5) addTree(city, rng, lot.x + 12, lot.y + lot.h - 12, 'palm');
    return;
  }
  generateBuildings(city, block, rng);
}


function segmentHitsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rx, rx + rw - x1, y1 - ry, ry + rh - y1];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

export function createCity(seed = 20261124) {
  const rng = makeRng(seed);
  const blocks = [];
  const buildings = [];
  const props = [];
  const signs = [];
  const parkingSpots = [];

  const city = {
    seed,
    blocks,
    buildings,
    props,
    signs,
    parkingSpots,
    roadLines: { x: [], y: [] },
    water: { y0: SHORE_Y, y1: WORLD_HEIGHT, depth: OCEAN_DEPTH },
    boardwalk: { y0: SHORE_Y - 54, y1: SHORE_Y },
    landmarks: LANDMARKS,
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
  };

  for (let i = 0; i <= GRID; i++) {
    if (i * CELL <= 3900) {
      city.roadLines.x.push(i * CELL);
      city.roadLines.y.push(i * CELL);
    }
  }

  for (let by = 0; by < GRID; by++) {
    for (let bx = 0; bx < GRID; bx++) {
      const outer = {
        x: bx * CELL + ROAD / 2,
        y: by * CELL + ROAD / 2,
        w: CELL - ROAD,
        h: CELL - ROAD,
      };
      const lot = {
        x: outer.x + SIDEWALK,
        y: outer.y + SIDEWALK,
        w: outer.w - SIDEWALK * 2,
        h: outer.h - SIDEWALK * 2,
      };
      const district = districtAt(bx, by);
      const specialKey = `${bx},${by}`;
      let special = SPECIAL_BLOCKS[specialKey] ?? null;
      if (by === GRID - 1) special = { type: 'beach' };
      const block = {
        bx, by, outer, lot, district, special,
        type: special ? special.type : district.id === 'beach' ? 'beach' : 'buildings',
        loop: null,
      };
      block.loop = blockLoop(block);
      blocks.push(block);
      if (block.type === 'beach') {
        specialBlock(city, block, rng);
        continue;
      }
      if (special) specialBlock(city, block, rng);
      else generateBuildings(city, block, rng);

      decorateLoopLamps(city, block);
      if (rng() < 0.42) {
        const edge = Math.floor(rng() * 4);
        const p = block.outer;
        const t = 0.2 + rng() * 0.6;
        const x = edge === 0 || edge === 2 ? p.x + p.w * t : edge === 1 ? p.x + p.w - 14 : p.x + 14;
        const y = edge === 0 ? p.y + 14 : edge === 1 || edge === 3 ? p.y + p.h * t : p.y + p.h - 14;
        addTree(city, rng, x, y, rng() < 0.55 ? 'palm' : 'tree');
      }
      if (rng() < 0.18) {
        const p = block.outer;
        addBench(city, p.x + 12 + rng() * (p.w - 24), p.y + (rng() < 0.5 ? 10 : p.h - 10), rng() < 0.5 ? 0 : Math.PI);
      }
    }
  }

  for (let i = 0; i < 5; i++) {
    const x = 240 + rng() * (CITY_SIZE - 480);
    const y = SHORE_Y + 52 + rng() * (OCEAN_DEPTH - 120);
    city.props.push({ type: 'boat', x, y, size: 18 + rng() * 16, angle: rng() * Math.PI });
  }
  city.props.push({ type: 'pier', x: 2920, y: SHORE_Y + 26, w: 26, h: 210 });
  city.props.push({ type: 'pier', x: 1500, y: SHORE_Y + 26, w: 24, h: 150 });
  city.props.push({ type: 'lighthouse', x: 3910, y: SHORE_Y + 44, size: 16 });

  for (const building of buildings) {
    if (building.sign) {
      signs.push({
        x: building.x + building.w / 2,
        y: building.y + building.h + 2,
        text: building.sign,
        color: '#f0dfb6',
        back: building.neon ? '#241a22' : '#2a2620',
        size: building.sign.length > 11 ? 10 : 12,
      });
    }
  }
  signs.push({ x: LANDMARKS.beach.x, y: SHORE_Y - 18, text: 'SOLARA BEACH', color: '#294b55', back: 'rgba(0,0,0,0)', size: 22 });
  signs.push({ x: LANDMARKS.plaza.x, y: LANDMARKS.plaza.y - 48, text: 'CIVIC PLAZA', color: '#ded4bb', back: 'rgba(0,0,0,0)', size: 14 });

  const buckets = new Map();
  const bucketSize = CELL;
  const bucketKey = (cx, cy) => cx + ',' + cy;
  for (const b of buildings) {
    const x0 = Math.floor(b.x / bucketSize);
    const x1 = Math.floor((b.x + b.w) / bucketSize);
    const y0 = Math.floor(b.y / bucketSize);
    const y1 = Math.floor((b.y + b.h) / bucketSize);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const key = bucketKey(cx, cy);
        let arr = buckets.get(key);
        if (!arr) {
          arr = [];
          buckets.set(key, arr);
        }
        arr.push(b);
      }
    }
  }

  city.nearbyBuildings = (x, y, pad = 70) => {
    const x0 = Math.floor((x - pad) / bucketSize);
    const x1 = Math.floor((x + pad) / bucketSize);
    const y0 = Math.floor((y - pad) / bucketSize);
    const y1 = Math.floor((y + pad) / bucketSize);
    const out = [];
    const seen = new Set();
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const arr = buckets.get(bucketKey(cx, cy));
        if (!arr) continue;
        for (const b of arr) {
          if (!seen.has(b.id)) {
            seen.add(b.id);
            out.push(b);
          }
        }
      }
    }
    return out;
  };

  city.blockAt = (x, y) => {
    const bx = Math.floor(x / CELL);
    const by = Math.floor(y / CELL);
    if (bx < 0 || by < 0 || bx >= GRID || by >= GRID) return null;
    return blocks[by * GRID + bx] ?? null;
  };

  city.lineBlocked = (x1, y1, x2, y2) => {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const half = Math.hypot(x2 - x1, y2 - y1) / 2 + 30;
    const list = city.nearbyBuildings(mx, my, half);
    for (const b of list) {
      if (segmentHitsRect(x1, y1, x2, y2, b.x, b.y, b.w, b.h)) return true;
    }
    return false;
  };

  city.isWater = (x, y) => y >= SHORE_Y;

  city.sidewalkBlocks = blocks.filter((b) => b.type !== 'beach');
  city.walkableBlocks = blocks;

  return city;
}
