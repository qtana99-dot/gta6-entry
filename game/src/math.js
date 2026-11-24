// Small geometry and number helpers shared by the simulation. No state, no imports.

export const TAU = Math.PI * 2;
export const HALF_PI = Math.PI / 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (a, b, v) => {
  const t = clamp(invLerp(a, b, v), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (current, target, rate, dt) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));
export const approach = (current, target, maxDelta) => {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
};

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function angleDiff(target, current) {
  return wrapAngle(target - current);
}

export function angleTo(dx, dy) {
  return Math.atan2(dy, dx);
}

export function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function dist2(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

export function norm(x, y) {
  const l = Math.hypot(x, y);
  if (l < 1e-6) return { x: 0, y: 0, len: 0 };
  return { x: x / l, y: y / l, len: l };
}

export function clampToWorld(x, y, margin = 0) {
  return {
    x: clamp(x, margin, 4200 - margin),
    y: clamp(y, margin, 4760 - margin),
  };
}

export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = (lo = 0, hi = 1) => lo + Math.random() * (hi - lo);
export const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
export const chance = (p) => Math.random() < p;
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function pickRng(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

export function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function circleRect(cx, cy, cr, r) {
  const nx = clamp(cx, r.x, r.x + r.w);
  const ny = clamp(cy, r.y, r.y + r.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= cr * cr;
}

export function resolveCircleRect(cx, cy, cr, r) {
  const nx = clamp(cx, r.x, r.x + r.w);
  const ny = clamp(cy, r.y, r.y + r.h);
  let dx = cx - nx;
  let dy = cy - ny;
  let d = Math.hypot(dx, dy);
  if (d > cr) return null;
  if (d < 1e-5) {
    const left = cx - r.x;
    const right = r.x + r.w - cx;
    const top = cy - r.y;
    const bottom = r.y + r.h - cy;
    const m = Math.min(left, right, top, bottom);
    if (m === left) return { x: r.x - cr, y: cy, nx: -1, ny: 0 };
    if (m === right) return { x: r.x + r.w + cr, y: cy, nx: 1, ny: 0 };
    if (m === top) return { x: cx, y: r.y - cr, nx: 0, ny: -1 };
    return { x: cx, y: r.y + r.h + cr, nx: 0, ny: 1 };
  }
  dx /= d;
  dy /= d;
  return { x: nx + dx * cr, y: ny + dy * cr, nx: dx, ny: dy };
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function segDist2(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const denom = abx * abx + aby * aby;
  const t = denom > 1e-6 ? clamp((apx * abx + apy * aby) / denom, 0, 1) : 0;
  const qx = ax + abx * t;
  const qy = ay + aby * t;
  return dist2(px, py, qx, qy);
}

export function pointSegmentDistance(px, py, ax, ay, bx, by) {
  return Math.sqrt(segDist2(px, py, ax, ay, bx, by));
}

export function rotatedRect(x, y, len, wid, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const hl = len / 2;
  const hw = wid / 2;
  const pts = [
    [-hl, -hw],
    [hl, -hw],
    [hl, hw],
    [-hl, hw],
  ];
  return pts.map(([lx, ly]) => ({ x: x + lx * c - ly * s, y: y + lx * s + ly * c }));
}

export function formatMoney(value) {
  const n = Math.max(0, Math.floor(value));
  return '$' + n.toLocaleString('en-US');
}

export function formatClock(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = Math.floor(m % 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  return `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

export function formatTimer(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
