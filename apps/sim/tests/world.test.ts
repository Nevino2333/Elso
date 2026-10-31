import { test } from "node:test";
import assert from "node:assert/strict";
import { LatLonGridGenerator } from "../src/world/generator.ts";

test("world reproducible", () => {
  const g = new LatLonGridGenerator();
  const w1 = g.generate(7, { width: 5, height: 5 });
  const w2 = g.generate(7, { width: 5, height: 5 });
  assert.deepEqual(w1, w2);
});

test("planet has biome variety, seas and land, and deterministic resources", () => {
  const g = new LatLonGridGenerator();
  const w = g.generate(42, { width: 64, height: 48 });
  const biomes = new Set(w.cells.flat().map((c) => c.biome));
  const land = w.cells.flat().filter((c) => c.terrain === "land").length;
  const kinds = new Set(
    w.cells.flat().map((c) => c.resourceKind).filter((k) => k !== null)
  );

  // A 64x48 world should not collapse into one blob.
  assert.ok(biomes.size >= 8, `expected >= 8 biomes, got ${biomes.size}: ${[...biomes]}`);
  assert.ok(land > w.width * w.height * 0.2, "planets are mostly not water");
  assert.ok(land < w.width * w.height * 0.95, "some sea must exist");
  assert.ok(kinds.size >= 3, `expected >= 3 resource kinds, got ${[...kinds]}`);

  // All cells conform to ranges the engine relies on.
  for (const c of w.cells.flat()) {
    assert.ok(c.elevation >= 0 && c.elevation <= 1);
    assert.ok(c.temperature >= 0 && c.temperature <= 1);
    assert.ok(c.moisture >= 0 && c.moisture <= 1);
    assert.ok(c.energyDecay >= 0);
  }

  // Same seed, same cells down to the resource kind selected per cell.
  const w2 = g.generate(42, { width: 64, height: 48 });
  for (let y = 0; y < w.height; y++) {
    for (let x = 0; x < w.width; x++) {
      assert.equal(w.cells[y][x].resourceKind, w2.cells[y][x].resourceKind);
      assert.equal(w.cells[y][x].biome, w2.cells[y][x].biome);
    }
  }
});