import { test } from "node:test";
import assert from "node:assert/strict";
import { matchRecipe, prerequisitesMet, nextRecipeToLearn, techStageOf, RECIPE_BY_ID, RECIPES, createRng } from "@elso/shared";
import { createAgent, mixDNA } from "../src/agent/state.ts";
import { LatLonGridGenerator } from "../src/world/generator.ts";
import { executeAction } from "../src/rules/actions.ts";

const world = new LatLonGridGenerator().generate(42, { width: 24, height: 18 });

function firstCell(pred: (c: (typeof world.cells)[number][number]) => boolean) {
  for (const row of world.cells) for (const c of row) if (pred(c)) return c;
  return null;
}

test("recipe table is a consistent curriculum", () => {
  for (const r of RECIPES) {
    // Every prerequisite must reference an existing recipe that appears earlier.
    for (const req of r.requires) {
      const dep = RECIPE_BY_ID[req];
      assert.ok(dep, `${r.id} depends on unknown recipe ${req}`);
      assert.ok(RECIPES.indexOf(dep) < RECIPES.indexOf(r), `${r.id} depends on later recipe ${req}`);
    }
  }
  assert.equal(nextRecipeToLearn([])!.id, "knap_flint", "curriculum starts at knapping");
  assert.equal(
    nextRecipeToLearn(["knap_flint", "make_fire"])!.id,
    "charcoal",
    "fire unlocks pyrotechnology"
  );
});

test("experiment rediscovers knapping from raw flint", () => {
  const cell = firstCell((c) => c.minerals.includes("flint"));
  assert.ok(cell, "seed 42/24x18 has flint somewhere");
  const agent = createAgent("a0", cell.x, cell.y);
  agent.materials.flint = 2;
  agent.materials.halite = 2;
  const res = executeAction(world, [agent], agent, {
    type: "experiment",
    payload: { inputs: ["flint"], condition: "none" },
  });
  assert.equal(res.ok, true);
  assert.equal(res.discovered, "knap_flint");
  assert.ok(agent.materials.stone_axe > 0, "stone axe produced");
  assert.ok(agent.knownRecipes.includes("knap_flint"));
  // Failure is recorded too, not hidden.
  const fail = executeAction(world, [agent], agent, {
    type: "experiment",
    payload: { inputs: ["flint", "halite"], condition: "none" },
  });
  assert.equal(fail.ok, false);
  assert.equal(agent.experiments.at(-1)?.success, false);
});

test("fire cannot be discovered before knapping (prerequisite gate)", () => {
  const agent = createAgent("a1", 0, 0);
  agent.materials.flint = 2;
  agent.materials.peat = 2;
  const res = executeAction(world, [agent], agent, {
    type: "experiment",
    payload: { inputs: ["flint", "peat"], condition: "none" },
  });
  assert.equal(res.ok, false, "make_fire requires knap_flint first");
  assert.ok(prerequisitesMet(["knap_flint"], RECIPE_BY_ID.make_fire));
  assert.ok(!prerequisitesMet([], RECIPE_BY_ID.make_fire));
});

test("teaching follows the curriculum one step at a time", () => {
  const cell = firstCell((c) => c.terrain === "land")!;
  const teacher = createAgent("t", cell.x, cell.y);
  const student = createAgent("s", cell.x + 1, cell.y);
  teacher.knownRecipes.push("knap_flint", "make_fire");
  const res = executeAction(world, [teacher, student], teacher, {
    type: "teach",
    payload: { to: student.id },
  });
  // Student must end up with exactly the NEXT recipe, never the whole library.
  assert.ok(
    student.knownRecipes.length <= 1,
    "a single lesson conveys a single recipe"
  );
  if (res.ok) {
    assert.ok(student.knownRecipes.includes("charcoal") || student.knownRecipes.includes("knap_flint"));
  } else {
    assert.match(res.message, /did not stick|whole curriculum|teacher does not know/);
  }
});

test("mixDNA blends parents and stays in range", () => {
  const rng = createRng(7);
  const a = { curiosity: 0.9, endurance: 0.2, intelligence: 0.5, lifespan: 200 };
  const b = { curiosity: 0.1, endurance: 0.8, intelligence: 0.4, lifespan: 160 };
  const dna = mixDNA(a, b, rng);
  for (const v of [dna.curiosity, dna.endurance, dna.intelligence]) {
    assert.ok(v >= 0.05 && v <= 1);
  }
  assert.ok(dna.lifespan >= 60);
  // Deterministic: same rng seed -> same child DNA.
  const dna2 = mixDNA(a, b, createRng(7));
  assert.deepEqual(dna2, dna);
});

test("minerals are deterministic and biome-plausible", () => {
  const w1 = new LatLonGridGenerator().generate(42, { width: 24, height: 18 });
  const w2 = new LatLonGridGenerator().generate(42, { width: 24, height: 18 });
  assert.deepEqual(w1.cells.map((r) => r.map((c) => c.minerals)), w2.cells.map((r) => r.map((c) => c.minerals)));
  const mountain = firstCell((c) => c.biome === "mountain" && c.minerals.length > 0);
  if (mountain) {
    for (const m of mountain.minerals) {
      assert.ok(
        ["magnetite", "cassiterite", "hematite", "chalcopyrite", "quartz"].includes(m),
        `mountain mineral ${m} is an ore or quartz`
      );
    }
  }
});

test("techStageOf reports the civilisation frontier", () => {
  assert.equal(techStageOf([]), 0);
  assert.equal(techStageOf(["knap_flint"]), 0);
  assert.equal(techStageOf(["make_fire"]), 1);
  assert.equal(techStageOf(["smelt_copper", "bronze"]), 4);
});
