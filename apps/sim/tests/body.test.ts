import { test } from "node:test";
import assert from "node:assert/strict";
import {
  timeOfDay,
  phaseOf,
  weatherAt,
  ambientTemperature,
  visionRadius,
  agentName,
  lifeStageOf,
  bodyComfortOf,
  TICKS_PER_DAY,
} from "@elso/shared";
import { createAgent } from "../src/agent/state.ts";
import { executeAction } from "../src/rules/actions.ts";
import { perceiveAgent } from "../src/agent/perception.ts";
import { monologueFor } from "../src/llm/monologue.ts";
import { LatLonGridGenerator } from "../src/world/generator.ts";
import { MockProvider } from "../src/llm/mock.ts";
import { runSimulation } from "../src/sim/engine.ts";
import type { TickLog } from "@elso/shared";

test("time of day follows a 24-hour clock", () => {
  assert.equal(TICKS_PER_DAY, 24);
  const t0 = timeOfDay(0);
  assert.equal(t0.day, 1);
  assert.equal(t0.hour, 0);
  assert.equal(t0.phase, "night");
  assert.equal(phaseOf(6), "dawn");
  assert.equal(phaseOf(12), "day");
  assert.equal(phaseOf(18), "dusk");
  assert.equal(phaseOf(23), "night");
  const t25 = timeOfDay(25);
  assert.equal(t25.day, 2);
  assert.equal(t25.hour, 1);
});

test("weather is deterministic per day", () => {
  assert.equal(weatherAt(42, 3), weatherAt(42, 3));
  // 寒冷星球才可能下雪, 温暖星球最差是雨。
  let sawSnowCold = false;
  let sawSnowWarm = false;
  for (let d = 0; d < 80; d++) {
    if (weatherAt(7, d, true) === "snow") sawSnowCold = true;
    if (weatherAt(7, d, false) === "snow") sawSnowWarm = true;
  }
  assert.equal(sawSnowCold, true, "cold planet should see snow eventually");
  assert.equal(sawSnowWarm, false, "warm planet never snows");
});

test("night is colder and harder to see through", () => {
  const day = ambientTemperature(0.5, "day", "clear");
  const night = ambientTemperature(0.5, "night", "clear");
  assert.ok(night < day - 5, `night ${night} should be much colder than day ${day}`);
  assert.ok(visionRadius("night", "clear") < visionRadius("day", "clear"));
  assert.ok(visionRadius("day", "storm") < visionRadius("day", "clear"));
  assert.equal(visionRadius("night", "snow"), 1);
});

test("every resident has a name, a gender and a body", () => {
  const a = createAgent("a0", 3, 4, [], "farmer", 42);
  assert.ok(a.name.length >= 3 && a.name.length <= 12);
  assert.ok(a.gender === "female" || a.gender === "male");
  assert.equal(a.bodyTemp, 37);
  assert.ok(a.awake);
  assert.equal(a.thirst, 0);
  assert.deepEqual(a.emotions, { joy: 0.35, fear: 0.05, anger: 0.05, sadness: 0.05 });
  // 确定性: 同一 id/seed 生成同一个"人"。
  const b = createAgent("a0", 3, 4, [], "farmer", 42);
  assert.equal(b.name, a.name);
  assert.equal(b.gender, a.gender);
  // 姓名按性别分化。
  const f = agentName(1, 2, "female");
  const m = agentName(1, 2, "male");
  assert.notEqual(f, m);
});

test("life stages and body comfort bands", () => {
  assert.equal(lifeStageOf(10, 200), "child");
  assert.equal(lifeStageOf(45, 200), "youth");
  assert.equal(lifeStageOf(100, 200), "adult");
  assert.equal(lifeStageOf(180, 200), "elder");
  assert.equal(bodyComfortOf(37), "comfort");
  assert.equal(bodyComfortOf(34), "freezing");
  assert.equal(bodyComfortOf(40), "fever");
});

test("agents can drink only at the water's edge", () => {
  const world = new LatLonGridGenerator().generate(42, { width: 24, height: 18 });
  // 找一块紧邻水体的陆地。
  let shore: { x: number; y: number } | null = null;
  let inland: { x: number; y: number } | null = null;
  outer: for (const row of world.cells) {
    for (const c of row) {
      if (c.terrain !== "land") continue;
      const nearWater =
        world.cells[c.y]?.[c.x + 1]?.terrain === "water" ||
        world.cells[c.y]?.[c.x - 1]?.terrain === "water" ||
        world.cells[c.y + 1]?.[c.x]?.terrain === "water" ||
        world.cells[c.y - 1]?.[c.x]?.terrain === "water";
      if (nearWater && !shore) shore = { x: c.x, y: c.y };
      if (!nearWater && !inland) inland = { x: c.x, y: c.y };
      if (shore && inland) break outer;
    }
  }
  assert.ok(shore, "world has a shore");
  assert.ok(inland, "world has inland cells");
  const drinker = createAgent("d1", shore!.x, shore!.y, [], "farmer", 42);
  drinker.thirst = 70;
  const ok = executeAction(world, [drinker], drinker, { type: "drink" });
  assert.equal(ok.ok, true);
  assert.ok(drinker.thirst <= 30, `thirst ${drinker.thirst} after drinking`);
  const far = createAgent("d2", inland!.x, inland!.y, [], "farmer", 42);
  far.thirst = 70;
  const no = executeAction(world, [far], far, { type: "drink" });
  assert.equal(no.ok, false);
});

test("sleep toggles and dreams are spoken", () => {
  const world = new LatLonGridGenerator().generate(42, { width: 24, height: 18 });
  const a = createAgent("s1", 0, 0, [], "farmer", 42);
  a.sleepiness = 90;
  const res = executeAction(world, [a], a, { type: "sleep" });
  assert.equal(res.ok, true);
  assert.equal(a.awake, false);
  const again = executeAction(world, [a], a, { type: "sleep" });
  assert.equal(again.ok, false, "already asleep");
  const time = timeOfDay(13);
  const dream = monologueFor(a, 13, perceiveAgent(world, [a], a, time, "clear"), time, "clear");
  assert.match(dream, /梦/);
});

test("perception is bounded by vision and hears neighbors", () => {
  const world = new LatLonGridGenerator().generate(42, { width: 24, height: 18 });
  const a = createAgent("p1", 10, 9, [], "farmer", 42);
  const b = createAgent("p2", 12, 9, [], "farmer", 42);
  const day = perceiveAgent(world, [a, b], a, timeOfDay(12), "clear");
  const night = perceiveAgent(world, [a, b], a, timeOfDay(2), "clear");
  assert.ok(day.vision.length > night.vision.length, "day sees farther than night");
  assert.ok(day.hearing.some((h) => h.id === "p2" && h.name === b.name));
  assert.ok(day.light === "明亮" && night.light === "黑暗");
  assert.ok(Number.isFinite(day.airTemp));
});

test("a short world run produces voices, time and weather", async () => {
  const world = new LatLonGridGenerator().generate(42, { width: 16, height: 12 });
  const agents = [createAgent("a0", 4, 4), createAgent("a1", 5, 5)];
  let last: TickLog | undefined;
  await runSimulation(
    { seed: 42, ticks: 30, agentCount: 2, width: 16, height: 12 },
    new MockProvider(42),
    world,
    agents,
    (l) => {
      last = l;
    }
  );
  assert.ok(last);
  assert.ok(last!.time.day >= 2, "30 ticks span into day 2");
  assert.ok(["clear", "cloudy", "rain", "storm", "snow"].includes(last!.weather));
  assert.ok(last!.voices.length > 0, "someone had a voice");
  assert.ok(last!.agents.every((a) => typeof a.thought === "string" && a.thought.length > 0));
});
