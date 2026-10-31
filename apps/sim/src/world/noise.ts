/**
 * Deterministic value noise with longitude wrap (x is periodic).
 * The planet is a lat/lon grid: longitude circles around (wrap x),
 * latitude does not (open y). All functions return values in roughly [0, 1].
 */

function hash2(ix: number, iy: number): number {
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

/** Smooth interpolation between lattice values, periodic along x. */
export function valueNoise(
  x: number,
  y: number,
  periodX: number,
  salt = 0
): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const wrap = (v: number) => ((v % periodX) + periodX) % periodX;
  const a = hash2(wrap(ix), iy + salt);
  const b = hash2(wrap(ix + 1), iy + salt);
  const c = hash2(wrap(ix), iy + 1 + salt);
  const d = hash2(wrap(ix + 1), iy + 1 + salt);

  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

/** Fractal Brownian motion on the wrapped grid. */
export function fbm(
  x: number,
  y: number,
  periodX: number,
  octaves: number,
  salt = 0,
  lacunarity = 2,
  gain = 0.5
): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * freq, y * freq, periodX, salt + o * 17);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Two-octave helper with an independent salt for secondary features. */
export function fbm2(
  x: number,
  y: number,
  periodX: number,
  salt: number
): number {
  return (
    fbm(x, y, periodX, 4, salt) * 0.65 +
    fbm(x * 3.1, y * 3.1, periodX * 3.1, 3, salt + 7) * 0.35
  );
}