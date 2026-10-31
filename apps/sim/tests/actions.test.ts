import { test } from "node:test";
import assert from "node:assert/strict";
import { LatLonGridGenerator } from "../src/world/generator.ts";
import { createAgent } from "../src/agent/state.ts";
import { executeAction } from "../src/rules/actions.ts";

const world = new LatLonGridGenerator().generate(42, { width: 16, height: 12 });

function firstCell(pred: (c: (typeof world.cells)[number][number]) => boolean) {
  for (const row of world.cells) for (const c of row) if (pred(c)) return c;
  return null;
}

test("move is blocked by water", () => {
  const land = firstCell((c) => c.terrain === "land");
  const water = firstCell((c) => c.terrain === "water");
  assert.ok(land && water, "16x12 world has both land and water");

  // Find a land cell adjacent to water (scan passes, not required by generator).
  let from: (typeof world.cells)[number][number] | null = null;
  let dx = 0;
  let dy = 0;
  for (const row of world.cells) {
    for (const c of row) {
      if (c.terrain !== "land") continue;
      for (const [cx, cy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const n = world.cells[c.y + cy]?.[c.x + cx];
        if (n && n.terrain === "water") {
          from = c;
          dx = cx;
          dy = cy;
          break;
        }
      }
      if (from) break;
    }
    if (from) break;
  }
  assert.ok(from, "found a land cell touching water");
  const agent = createAgent("a0", from.x, from.y);
  const res = executeAction(world, [agent], agent, { type: "move", payload: { dx, dy } });
  assert.equal(res.ok, false);
  assert.equal(agent.x, from.x);
  assert.equal(agent.y, from.y);
});

test("gather harvests the cell resource kind into inventory", () => {
  const cell = firstCell((c) => c.terrain === "land" && !!c.resourceKind && c.resource > 0.2);
  assert.ok(cell, "some land cell bears a resource");
  const kind = cell.resourceKind!;
  const before = cell.resource;
  const agent = createAgent("a0", cell.x, cell.y);
  agent.inventory[kind] = 0;
  const res = executeAction(world, [agent], agent, { type: "gather" });
  assert.equal(res.ok, true);
  assert.ok(cell.resource < before, "cell stock decreases");
  assert.ok(agent.inventory[kind] > 0, "gathered units land in inventory");
});

test("eat consumes inventory food", () => {
  const cell = firstCell((c) => c.terrain === "land")!;
  const agent = createAgent("a0", cell.x, cell.y);
  agent.hunger = 80;
  const res = executeAction(world, [agent], agent, { type: "eat" });
  assert.equal(res.ok, true);
  assert.equal(agent.inventory.food, 1);
  assert.equal(agent.hunger, 50);

  // Eating with no food fails instead of cheating.
  agent.inventory.food = 0;
  const res2 = executeAction(world, [agent], agent, { type: "eat" });
  assert.equal(res2.ok, false);
});

test("give transfers units between nearby agents only", () => {
  const cell = firstCell((c) => c.terrain === "land")!;
  const a = createAgent("a0", cell.x, cell.y);
  const b = createAgent("a1", cell.x + 1, cell.y);
  a.inventory.food = 3;
  b.inventory.food = 0;

  const ok = executeAction(world, [a, b], a, {
    type: "give",
    payload: { to: b.id, kind: "food", amount: 1 },
  });
  assert.equal(ok.ok, true);
  assert.equal(a.inventory.food, 2);
  assert.equal(b.inventory.food, 1);

  // Too far away.
  b.x = cell.x + 3;
  const far = executeAction(world, [a, b], a, {
    type: "give",
    payload: { to: b.id, kind: "food", amount: 1 },
  });
  assert.equal(far.ok, false);

  // Unknown target.
  const ghost = executeAction(world, [a, b], a, {
    type: "give",
    payload: { to: "nobody", kind: "food", amount: 1 },
  });
  assert.equal(ghost.ok, false);
});