import type { World, Cell, Biome, ResourceKind, TerrainType } from "@elso/shared";
import { fbm2 } from "./noise.ts";

export interface WorldOpts {
  width: number;
  height: number;
}

export interface IWorldGenerator {
  readonly name: string;
  generate(seed: number, opts: WorldOpts): World;
}

/**
 * Noise-driven planet generator.
 *
 * Elevation: layered fbm (continents + ridges) split at sea level.
 * Temperature: latitude falloff, perturbed by noise and cooled by altitude.
 * Moisture: independent fbm field.
 * Biome: temperature x moisture x elevation lookup.
 * Resources: each land biome yields a kind (or none); stock is position-hashed.
 *
 * Deterministic per seed; longitude (x) wraps, latitude (y) is open.
 */
export class LatLonGridGenerator implements IWorldGenerator {
  readonly name = "latlon-biome-v2";

  generate(seed: number, opts: WorldOpts): World {
    const { width, height } = opts;
    const cells: Cell[][] = [];

    for (let y = 0; y < height; y++) {
      const row: Cell[] = [];
      const lat = 90 - ((y + 0.5) / height) * 180; // y=0 is the north pole
      const latFactor = 1 - Math.abs(lat) / 90; // 0 at poles, 1 at equator

      for (let x = 0; x < width; x++) {
        // Values are functions of (x, y, seed) only — reproducible across runs.
        const sx = (x + 0.5) / width; // 0..1 around the equator
        const sy = (y + 0.5) / height;

        const elevation = fbm2(sx * 3.2, sy * 3.2, 3.2, seed);
        const moisture = fbm2(sx * 3.8 + 9, sy * 3.8 + 9, 3.8, seed + 101);
        const tempNoise = fbm2(sx * 5 + 23, sy * 5 + 23, 5, seed + 211);

        let temperature = latFactor + (tempNoise - 0.5) * 0.34;
        if (elevation > 0.6) temperature -= (elevation - 0.6) * 1.5;
        temperature = clamp01(temperature);
        const m = clamp01(moisture);

        const { terrain, biome } = classify(elevation, temperature, m);
        const resourceKind = resourceFor(biome, x, y, seed);
        const resource =
          resourceKind === null ? 0 : resourceAmount(biome, x, y, seed, resourceKind);

        row.push({
          x,
          y,
          terrain,
          biome,
          elevation: round3(elevation),
          temperature: round3(temperature),
          moisture: round3(m),
          resource: round3(resource),
          resourceKind,
          energyDecay: decayFor(biome),
        });
      }
      cells.push(row);
    }

    return { width, height, seed, cells };
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function classify(
  elevation: number,
  temperature: number,
  moisture: number
): { terrain: TerrainType; biome: Biome } {
  if (elevation < 0.42) return { terrain: "water", biome: "deep-water" };
  if (elevation < 0.47) return { terrain: "water", biome: "water" };
  if (elevation < 0.51) return { terrain: "water", biome: "shallows" };
  if (elevation < 0.54) return { terrain: "land", biome: "beach" };

  if (elevation >= 0.82) return { terrain: "land", biome: "mountain" };
  if (temperature < 0.16) return { terrain: "land", biome: "snow" };
  if (temperature < 0.3) return { terrain: "land", biome: "tundra" };
  if (temperature >= 0.82) {
    if (moisture > 0.55) return { terrain: "land", biome: "rainforest" };
    if (moisture > 0.28) return { terrain: "land", biome: "savanna" };
    return { terrain: "land", biome: "desert" };
  }
  if (temperature >= 0.58) {
    if (moisture > 0.6) return { terrain: "land", biome: "temperate-forest" };
    if (moisture > 0.34) return { terrain: "land", biome: "grassland" };
    if (moisture > 0.12) return { terrain: "land", biome: "savanna" };
    return { terrain: "land", biome: "desert" };
  }
  if (temperature >= 0.42) {
    if (moisture > 0.5) return { terrain: "land", biome: "temperate-forest" };
    if (moisture > 0.24) return { terrain: "land", biome: "grassland" };
    if (moisture > 0.1) return { terrain: "land", biome: "barren" };
    return { terrain: "land", biome: "desert" };
  }
  // Cold temperate band
  if (moisture > 0.52) return { terrain: "land", biome: "taiga" };
  if (moisture > 0.22) return { terrain: "land", biome: "grassland" };
  return { terrain: "land", biome: "tundra" };
}

function positionHash(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 0.771) * 43758.5453;
  return n - Math.floor(n);
}

function resourceFor(biome: Biome, x: number, y: number, seed: number): ResourceKind | null {
  switch (biome) {
    case "taiga":
    case "temperate-forest":
    case "rainforest":
      // Forest biomes split between timber and edible flora.
      return positionHash(x, y, seed + 7) < 0.55 ? "wood" : "food";
    case "grassland":
    case "savanna":
      return "food";
    case "desert":
    case "barren":
      return "stone";
    case "mountain":
      return positionHash(x, y, seed + 31) < 0.55 ? "ore" : "stone";
    default:
      return null;
  }
}

function resourceAmount(
  biome: Biome,
  x: number,
  y: number,
  seed: number,
  kind: ResourceKind
): number {
  // Position-hashed and seeded: stable per cell, uncorrelated noise.
  const r = positionHash(x, y, seed + 53);
  const rich = r > 0.72;
  switch (kind) {
    case "food":
      return rich ? 0.85 : 0.35 + r * 0.45;
    case "wood":
      return rich ? 0.8 : 0.3 + r * 0.5;
    case "stone":
      return 0.35 + r * 0.55;
    case "ore":
      return 0.08 + r * 0.32;
  }
}

function decayFor(biome: Biome): number {
  switch (biome) {
    case "deep-water":
    case "water":
    case "shallows":
      return 0; // unwalkable
    case "beach":
      return 0.025;
    case "grassland":
    case "temperate-forest":
      return 0.035;
    case "savanna":
    case "taiga":
      return 0.045;
    case "rainforest":
      return 0.05;
    case "desert":
    case "barren":
      return 0.06;
    case "tundra":
    case "snow":
      return 0.05;
    case "mountain":
      return 0.08;
  }
}

export function isWaterBiome(biome: Biome): boolean {
  return biome === "deep-water" || biome === "water" || biome === "shallows";
}

export function walkableIcon(biome: Biome): string {
  return isWaterBiome(biome) ? "~" : ".";
}