import { test } from "node:test";
import assert from "node:assert/strict";
import type { TickLog } from "@elso/shared";
import { LatLonGridGenerator } from "../src/world/generator.ts";
import { createAgent } from "../src/agent/state.ts";
import { MockProvider } from "../src/llm/mock.ts";
import { runSimulation } from "../src/sim/engine.ts";
import { RuleEngine } from "../src/rules/engine.ts";
import { hungerSlowPlugin } from "../src/rules/plugins/hunger.ts";

async function run(useHungerRule: boolean) {
  const world = new LatLonGridGenerator().generate(42, { width: 5, height: 5 });
  const agents = [createAgent("a0", 0, 0)];
  const ruleEngine = new RuleEngine();
  if (useHungerRule) ruleEngine.register(hungerSlowPlugin);

  let last: TickLog | undefined;
  await runSimulation(
    { seed: 42, ticks: 10, agentCount: 1, width: 5, height: 5 },
    new MockProvider(42),
    world,
    agents,
    (log) => {
      last = log;
    },
    ruleEngine
  );
  return { agents, last };
}

test("onTick plugin runs once per tick", async () => {
  const baseline = await run(false);
  const variant = await run(true);

  assert.ok(baseline.last);
  assert.ok(variant.last);
  assert.equal(baseline.last.tick, 9);

  // Same seed and actions; the only difference is -0.5 hunger per tick.
  assert.equal(baseline.agents[0].hunger - variant.agents[0].hunger, 5);
});
