// SKYHARBOUR — small shared helpers: angles, clamping, seeded random, formatting.
// One file, one job: pure functions with no game state, used by every other module.

/** Clamp a number between low and high. */
export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

/** Linear interpolation between a and b. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Smoothstep easing between 0 and 1. */
export function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Wrap an angle in degrees to (-180, 180]. */
export function wrapDegrees(deg) {
  let d = deg % 360;
  if (d <= -180) d += 360;
  if (d > 180) d -= 360;
  return d;
}

/** Degrees to radians. */
export function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Radians to degrees. */
export function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

/** Move `value` toward `target` by at most `maxStep`. */
export function moveToward(value, target, maxStep) {
  if (value < target) return Math.min(target, value + maxStep);
  if (value > target) return Math.max(target, value - maxStep);
  return value;
}

/** Format a speed in km/h with no decimals. */
export function fmtSpeed(kmh) {
  return `${Math.max(0, Math.round(kmh))}`;
}

/** Format an altitude in metres. */
export function fmtAlt(m) {
  return `${Math.max(0, Math.round(m))}`;
}

/** Format a heading as a three-digit compass bearing. */
export function fmtHeading(deg) {
  const h = ((Math.round(deg) % 360) + 360) % 360;
  return String(h).padStart(3, '0');
}

/** Format seconds as m:ss. */
export function fmtTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Format a fuel amount in kg. */
export function fmtFuel(kg) {
  return `${Math.max(0, Math.round(kg))} kg`;
}

/** 16-point compass label for a heading. */
export function compassPoint(deg) {
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const i = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return points[i];
}

/** Deterministic mulberry32 PRNG from an integer seed. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash two integer grid coordinates into a stable 0..1 value. */
export function hash2(ix, iz, seed = 1337) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634239) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 100000) / 100000;
}

/** Value noise in 2D: smooth interpolation of hashed grid corners. */
export function valueNoise2(x, z, seed = 1337) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = smoothstep(fx);
  const sz = smoothstep(fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sz);
}

/** Fractal brownian motion: several octaves of value noise. */
export function fbm2(x, z, octaves = 4, seed = 1337) {
  let total = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    total += amp * valueNoise2(x * freq, z * freq, seed + i * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return total / norm;
}

/** Pick a random element from an array using a supplied random function. */
export function pickRandom(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Fisher-Yates shuffle, in place, using a supplied random function. */
export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
