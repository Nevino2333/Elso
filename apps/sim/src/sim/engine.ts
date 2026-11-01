import type { World, AgentState, TickLog, Weather } from "@elso/shared";
import {
  techStageOf,
  createRng,
  timeOfDay,
  weatherAt,
  ambientTemperature,
  clampEmotion,
  dominantEmotion,
  EMOTION_ZH,
  PHASE_ZH,
  WEATHER_ZH,
} from "@elso/shared";
import { executeAction } from "../rules/actions.ts";
import type { LLMProvider } from "../llm/provider.ts";
import { addMemory, adjustRelationship, mixDNA, createAgent } from "../agent/state.ts";
import { perceiveAgent } from "../agent/perception.ts";
import { monologueFor } from "../llm/monologue.ts";

export interface SimConfig {
  seed: number;
  ticks: number;
  agentCount: number;
  width: number;
  height: number;
}

import type { RuleEngine } from "../rules/engine.ts";

const REGEN_PER_TICK = 0.002;
const MAX_POP = 90;
const STARVE_DEATH_AGE_MIN = 40; // children below this die of weakness only if starving long
const VOICES_PER_TICK = 8;

/** 情绪触发的小工具。 */
function feel(a: AgentState, key: "joy" | "fear" | "anger" | "sadness", delta: number): void {
  a.emotions[key] = clampEmotion(a.emotions[key] + delta);
}

export async function runSimulation(
  config: SimConfig,
  provider: LLMProvider,
  world: World,
  agents: AgentState[],
  onTick: (log: TickLog) => void,
  ruleEngine?: RuleEngine
): Promise<void> {
  let gatheredTotal = 0;
  let communications = 0;
  let events = 0;
  let socialEvents = 0;
  let traded = 0;
  let birthsTotal = 0;
  let deathsTotal = 0;
  let nextAgentNum = agents.length;
  const usedNames = new Set(agents.map((a) => a.name));

  // Snapshot initial resource stocks so regeneration never exceeds them.
  const initialStock = new Map<string, number>();
  for (const row of world.cells) {
    for (const cell of row) {
      if (cell.resourceKind) initialStock.set(`${cell.x},${cell.y}`, cell.resource);
    }
  }

  // 寒冷星球(平均温度低)才允许下雪。
  let tempSum = 0;
  let tempCount = 0;
  for (const row of world.cells) {
    for (const cell of row) {
      tempSum += cell.temperature;
      tempCount++;
    }
  }
  const coldPlanet = tempCount > 0 && tempSum / tempCount < 0.35;

  const rng = createRng(config.seed + 999);

  for (let tick = 0; tick < config.ticks; tick++) {
    const time = timeOfDay(tick);
    const weather: Weather = weatherAt(config.seed, time.day, coldPlanet);
    const isNight = time.phase === "night";

    // Resources slowly regrow toward their pre-harvest stock.
    for (const row of world.cells) {
      for (const cell of row) {
        const cap = initialStock.get(`${cell.x},${cell.y}`);
        if (cap !== undefined && cell.resource < cap) {
          cell.resource = Math.min(cap, cell.resource + REGEN_PER_TICK);
        }
      }
    }

    // Social event scheduling (deterministic).
    if (tick % 20 === 0) {
      const venues = world.buildings.filter((b) => b.kind === "stage" || b.kind === "plaza" || b.kind === "market");
      const v = venues[tick % Math.max(1, venues.length)];
      if (v) {
        const kind = v.kind === "stage" ? "concert" : v.kind === "market" ? "market" : "festival";
        world.events.push({
          id: `e${tick}`,
          kind,
          title: kind === "concert" ? "Town Concert" : kind === "market" ? "Market Day" : "Festival",
          x: v.x,
          y: v.y,
          startTick: tick,
          duration: 8,
          hostId: world.buildings.find((b) => b.kind === "home")?.ownerId,
          attendees: [],
        });
        socialEvents++;
      }
    }
    // Settle ended events.
    for (const ev of world.events) {
      if (!ev.ended && tick >= ev.startTick + ev.duration) {
        ev.ended = true;
        for (const aid of ev.attendees) {
          const a = agents.find((x) => x.id === aid);
          if (!a || a.energy <= 0) continue;
          addMemory(a, tick, "social", `attended ${ev.title}`, 0.7);
          a.mood = Math.min(1, a.mood + 0.15);
          feel(a, "joy", 0.15);
          if (ev.hostId && ev.hostId !== a.id) adjustRelationship(a, ev.hostId, 0.1);
        }
        if (ev.hostId) {
          const host = agents.find((x) => x.id === ev.hostId);
          if (host && host.energy > 0) host.money += ev.kind === "concert" ? 20 : 5;
        }
      }
    }

    const births: TickLog["births"] = [];
    const deaths: TickLog["deaths"] = [];

    // ---- Lifecycle + 生理: 衰老、口渴、睡眠、体温、情绪衰减 -----------------
    for (const agent of agents) {
      if (agent.health <= 0) continue; // already dead in an earlier tick
      agent.age += 1;
      const cell = world.cells[agent.y]?.[agent.x];

      // 口渴: 干热的地方失水更快。
      let thirstRate = 0.8;
      if (cell && (cell.biome === "desert" || cell.biome === "savanna" || cell.biome === "barren")) thirstRate += 0.5;
      if (agent.bodyTemp > 37.8) thirstRate += 0.3;
      agent.thirst = Math.min(100, agent.thirst + (agent.awake ? thirstRate : thirstRate * 0.6));

      // 困倦: 夜晚来得更猛。
      const sleepRate = isNight ? 1.6 : time.phase === "day" ? 0.6 : 1.0;
      if (agent.awake) agent.sleepiness = Math.min(100, agent.sleepiness + sleepRate);
      if (agent.awake && agent.sleepiness >= 100) agent.energy = Math.max(0, agent.energy - 0.5);

      // 体温: 人体恒温调节 —— 清醒或有屋檐时接近 37°C,
      // 露宿遭受严寒/酷热才会真正失温或中暑。
      if (cell) {
        const air = ambientTemperature(cell.temperature, time.phase, weather);
        const home = world.buildings.find((b) => b.id === agent.homeBuildingId);
        const sheltered = !!home && Math.abs(home.x - agent.x) + Math.abs(home.y - agent.y) <= 1;
        let target = 37;
        if (!agent.awake && !sheltered) {
          const cold = Math.max(0, 22 - air); // 低于22°C的冷应激
          const hot = Math.max(0, air - 30); // 高于30°C的热应激
          target = 37 - cold * 0.05 - hot * 0.06;
          if (weather === "snow" || weather === "storm") target -= 0.6;
        } else if (!sheltered && air < 5) {
          target = 37 - (5 - air) * 0.03; // 清醒时挨冻也会慢慢失温
        }
        agent.bodyTemp += (target - agent.bodyTemp) * 0.08;
        // 生火取暖: 身体发冷且带着火种。
        if (agent.bodyTemp < 36 && (agent.materials.fire ?? 0) >= 1 && tick % 4 === 0) {
          agent.materials.fire -= 1;
          agent.bodyTemp = Math.min(39, agent.bodyTemp + 1.8);
          addMemory(agent, tick, "event", "warmed myself by the fire", 0.5);
        }
      }

      // 情绪随时间缓缓平复。
      for (const k of ["joy", "fear", "anger", "sadness"] as const) {
        agent.emotions[k] = clampEmotion(agent.emotions[k] * 0.97);
      }

      // 极端身体状态带来恐惧。
      if (agent.thirst >= 90) feel(agent, "fear", 0.04);
      if (agent.hunger >= 90) feel(agent, "fear", 0.04);
      if (agent.bodyTemp < 35) feel(agent, "fear", 0.03);

      // Senescence: past DNA lifespan the body declines; endurance softens it.
      if (agent.age > agent.dna.lifespan) {
        const decline = 1.6 * (1.3 - agent.dna.endurance);
        agent.health = Math.max(0, agent.health - decline);
      }
      if (agent.hunger >= 100) agent.health = Math.max(0, agent.health - 1.2);
      if (agent.thirst >= 100) agent.health = Math.max(0, agent.health - 1.0);
      if (agent.energy <= 0) agent.health = Math.max(0, agent.health - 0.6); // 力竭也在消耗身体
      if (agent.bodyTemp < 34.5) agent.health = Math.max(0, agent.health - (agent.bodyTemp < 33 ? 1.5 : 0.8));
      if (agent.bodyTemp > 40.5) agent.health = Math.max(0, agent.health - 1.0);
      if (agent.health <= 0) {
        const wasExhausted = agent.energy <= 0;
        agent.energy = 0;
        const cause =
          agent.age > agent.dna.lifespan
            ? "old age"
            : agent.bodyTemp < 34.5
              ? "cold"
              : agent.bodyTemp > 40.5
                ? "heat"
                : agent.thirst >= 100
                  ? "thirst"
                  : agent.hunger >= 100
                    ? "starvation"
                    : wasExhausted
                      ? "exhaustion"
                      : "illness";
        deaths.push({ id: agent.id, name: agent.name, age: agent.age, cause });
        deathsTotal++;
        addMemory(agent, tick, "event", `died of ${cause} at age ${agent.age}`, 1);
        // 有关系的居民会哀悼 —— 世界不是一个人的, 死亡会波及生者。
        for (const other of agents) {
          if (other === agent || other.energy <= 0) continue;
          const aff = other.relationships[agent.id] ?? 0;
          if (aff > 0.3) {
            feel(other, "sadness", 0.4);
            feel(other, "fear", 0.1);
            addMemory(other, tick, "social", `${agent.name} (${agent.id}) died — I will miss them`, 0.9);
          }
        }
      }
    }

    // ---- Knowledge transfer between generations (progressive curriculum) --
    for (const t of agents) {
      if (t.energy <= 0 || t.knownRecipes.length === 0) continue;
      for (const s of agents) {
        if (s === t || s.energy <= 0) continue;
        if (s.knownRecipes.length >= t.knownRecipes.length) continue;
        if (Math.abs(s.x - t.x) + Math.abs(s.y - t.y) > 2) continue;
        // Deterministic 4% chance per (tick, pair) — no Math.random anywhere.
        if (((tick * 31 + t.id.charCodeAt(0) * 7 + s.id.charCodeAt(0) * 13) % 100) / 100 >= 0.04) continue;
        // The student only ever receives the NEXT recipe in the curriculum.
        const curriculum = ["knap_flint", "make_fire", "charcoal", "pottery", "cook_meal", "quicklime", "smelt_copper", "smelt_tin", "smelt_iron", "bronze", "iron_tool", "glass"];
        const next = curriculum.find((r) => !s.knownRecipes.includes(r) && t.knownRecipes.includes(r));
        if (!next) continue;
        s.knownRecipes.push(next);
        addMemory(s, tick, "social", `learned ${next} from elder ${t.name}`, 0.8);
        feel(s, "joy", 0.12);
        adjustRelationship(s, t.id, 0.1);
      }
    }

    // ---- Reproduction: adult, healthy, well-fed pairs may bear a child ----
    if (agents.filter((a) => a.energy > 0).length < MAX_POP && tick % 6 === 3) {
      const adults = agents
        .filter((a) => a.energy > 0 && a.health > 55 && a.age > 30 && a.age < a.dna.lifespan * 0.8)
        .sort((a, b) => b.age - a.age);
      outer: for (let i = 0; i < adults.length; i++) {
        for (let j = i + 1; j < adults.length; j++) {
          const p1 = adults[i];
          const p2 = adults[j];
          if (Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y) > 3) continue;
          if ((p1.mood + p2.mood) / 2 < 0.45) continue;
          if (agents.some((a) => a.parentIds.includes(p1.id) && a.parentIds.includes(p2.id) && a.energy > 0)) continue;
          const id = `g${p1.generation + 1}x${nextAgentNum++}`;
          const dna = mixDNA(p1.dna, p2.dna, rng);
          const child = createAgent(
            id,
            Math.min(world.width - 1, Math.max(0, p1.x + (rng() < 0.5 ? 1 : -1))),
            Math.min(world.height - 1, Math.max(0, p1.y + (rng() < 0.5 ? 1 : -1))),
            agents.map((a) => a.id),
            "unemployed",
            config.seed + tick,
            tick,
            [p1.id, p2.id],
            Math.max(p1.generation, p2.generation) + 1,
            dna,
            rng() < 0.5 ? "female" : "male",
            undefined,
            usedNames
          );
          // Cultural inheritance: each parent passes ONE already-known recipe.
          const inherited: string[] = [];
          if (p1.knownRecipes.length) inherited.push(p1.knownRecipes[rng() * p1.knownRecipes.length | 0]);
          if (p2.knownRecipes.length) inherited.push(p2.knownRecipes[rng() * p2.knownRecipes.length | 0]);
          child.knownRecipes.push(...new Set(inherited));
          // Birth costs the parents.
          p1.energy = Math.max(1, p1.energy - 12);
          p2.energy = Math.max(1, p2.energy - 12);
          agents.push(child);
          births.push({ id: child.id, name: child.name, parentIds: [p1.id, p2.id], generation: child.generation });
          birthsTotal++;
          addMemory(p1, tick, "social", `child ${child.name} born (gen ${child.generation})`, 0.9);
          addMemory(p2, tick, "social", `child ${child.name} born (gen ${child.generation})`, 0.9);
          feel(p1, "joy", 0.25);
          feel(p2, "joy", 0.25);
          adjustRelationship(p1, p2.id, 0.1);
          adjustRelationship(p2, p1.id, 0.1);
          break outer;
        }
      }
    }

    // ---- Decisions & actions ----------------------------------------------
    const actions: TickLog["actions"] = [];
    const discoveries: TickLog["discoveries"] = [];
    const lastActionByAgent = new Map<string, { type: string; ok: boolean; message?: string }>();
    for (const agent of agents) {
      if (agent.energy <= 0) continue;

      // 睡眠中的居民不做决策, 身体在恢复。
      if (!agent.awake) {
        agent.sleepiness = Math.max(0, agent.sleepiness - 9);
        agent.energy = Math.min(100, agent.energy + 3);
        agent.health = Math.min(100, agent.health + 0.15);
        agent.hunger = Math.min(100, agent.hunger + 0.5);
        const danger = agent.hunger >= 80 || agent.thirst >= 85;
        if (danger || agent.sleepiness < 12 || (time.phase === "dawn" && agent.sleepiness < 60)) {
          agent.awake = true;
          addMemory(agent, tick, "event", "woke up", 0.3);
        }
        continue;
      }

      const context = `tick ${tick}, day ${time.day} hour ${time.hour} (${PHASE_ZH[time.phase]}), weather ${WEATHER_ZH[weather]}`;
      agent.thought = undefined;
      const action = await provider.decide(agent, world, agents, context);
      const res = ruleEngine
        ? ruleEngine.execute(world, agents, agent, action, tick)
        : executeAction(world, agents, agent, action);
      actions.push({ agentId: agent.id, action, result: res.message });
      lastActionByAgent.set(agent.id, { type: action.type, ok: res.ok, message: res.message });
      if (action.type === "speak" && res.ok) communications++;
      if (action.type === "give" && res.ok) {
        traded += (action.payload?.amount as number) ?? 0;
        feel(agent, "joy", 0.05);
        const target = agents.find((a) => a.id === (action.payload?.to as string));
        if (target) feel(target, "joy", 0.1);
      }
      if (res.ok) events++;
      if (res.discovered) {
        discoveries.push({ agentId: agent.id, recipeId: res.discovered, via: res.discoveredVia ?? "experiment" });
        feel(agent, "joy", 0.3);
      }
      // 社交动作带来喜悦。
      if (res.ok && (action.type === "talk" || action.type === "play" || action.type === "attend" || action.type === "perform")) {
        feel(agent, "joy", 0.08);
        if (action.type === "play" || action.type === "talk") {
          const target = agents.find((a) => a.id === (action.payload?.to as string));
          if (target) feel(target, "joy", 0.06);
        }
      }
      if (action.type === "teach" && res.ok) {
        feel(agent, "joy", 0.1);
        const student = agents.find((a) => a.id === (action.payload?.to as string));
        if (student) feel(student, "joy", 0.15);
      }
      addMemory(agent, tick, "event", `${action.type} ${res.message}`, res.ok ? 0.6 : 0.3);
      // Standing cost (per-biome) + hunger; starvation drains energy.
      const cell = world.cells[agent.y]?.[agent.x];
      if (cell) agent.energy = Math.max(0, agent.energy - cell.energyDecay);
      agent.hunger = Math.min(100, agent.hunger + 1);
      if (agent.hunger >= 100) agent.energy = Math.max(0, agent.energy - 0.5);
      if (agent.energy <= 0) agent.energy = 0;
    }
    // rule hooks that adjust state once per tick (run after per-agent actions/decay)
    ruleEngine?.tick(world, agents, tick);
    // count gathered
    for (const a of actions) {
      if (a.action.type === "gather" && a.result?.startsWith("gathered")) {
        const m = a.result.match(/gathered ([\d.]+)/);
        if (m) gatheredTotal += parseFloat(m[1]);
      }
    }

    // ---- 心声: 每个活着的居民这一刻在想什么 -------------------------------
    const aliveAgents = agents.filter((a) => a.energy > 0);
    for (const agent of aliveAgents) {
      const perception = perceiveAgent(world, agents, agent, time, weather);
      if (!agent.thought) {
        agent.thought = monologueFor(
          agent,
          tick,
          perception,
          time,
          weather,
          lastActionByAgent.get(agent.id)
        );
      }
      // 情绪沉淀为心境 —— 身体舒不舒服, 心情最诚实。
      const moodTarget = Math.max(
        0,
        Math.min(
          1,
          0.26 +
            agent.emotions.joy * 0.35 +
            (1 - agent.hunger / 100) * 0.12 +
            (1 - agent.thirst / 100) * 0.1 +
            (1 - agent.sleepiness / 100) * 0.08 -
            agent.emotions.fear * 0.25 -
            agent.emotions.sadness * 0.2 +
            agent.emotions.anger * 0.03
        )
      );
      agent.mood = Math.max(0, Math.min(1, agent.mood + (moodTarget - agent.mood) * 0.1));
    }
    // 世界心声: 挑出此刻情绪最强烈的几位。
    const voices = aliveAgents
      .filter((a) => a.thought)
      .map((a) => {
        // 只有情绪足够强烈才打标签, 否则"平静"不该被误标成喜悦。
        const dom = dominantEmotion(a.emotions, 0.5);
        return { a, intensity: Math.max(a.emotions.joy, a.emotions.fear, a.emotions.anger, a.emotions.sadness), dom };
      })
      .sort((x, y) => y.intensity - x.intensity)
      .slice(0, VOICES_PER_TICK)
      .map(({ a, dom }) => ({ id: a.id, name: a.name, text: a.thought!, emotion: dom ? EMOTION_ZH[dom] : undefined }));

    const alive = aliveAgents.length;
    const allKnown = new Set<string>();
    for (const a of aliveAgents) for (const r of a.knownRecipes) allKnown.add(r);
    const log: TickLog = {
      tick,
      seed: config.seed,
      ...(tick === 0 ? { world } : {}),
      time,
      weather,
      agents: agents
        .filter((a) => a.energy > 0 || deaths.some((d) => d.id === a.id))
        .map((a) => {
          // 回放只需要"此刻能看见的东西": 裁掉内部字段与已由 UI 推导的冗余。
          const r2 = (v: number) => Math.round(v * 100) / 100;
          const copy: Record<string, unknown> = {
            ...a,
            memory: a.memory.slice(-4).map((m) => ({
              ...m,
              text: m.text.length > 64 ? `${m.text.slice(0, 61)}…` : m.text,
            })),
            experiments: a.experiments.slice(-2),
            knownRecipes: [...a.knownRecipes],
            emotions: {
              joy: r2(a.emotions.joy),
              fear: r2(a.emotions.fear),
              anger: r2(a.emotions.anger),
              sadness: r2(a.emotions.sadness),
            },
            relationships: Object.fromEntries(
              Object.entries(a.relationships).filter(([, v]) => Math.abs(v) > 0.05)
            ),
          };
          delete copy.knowledge;
          delete copy.plan;
          delete copy.skills;
          return copy as unknown as AgentState;
        }),
      actions,
      voices,
      discoveries,
      births,
      deaths,
      techStage: techStageOf([...allKnown]),
      metrics: {
        alive,
        gathered: gatheredTotal,
        communications,
        events,
        traded,
        socialEvents,
        moneySupply: agents.reduce((s, a) => s + a.money, 0),
        recipes: allKnown.size,
        births: birthsTotal,
        deaths: deathsTotal,
      },
    };
    onTick(log);
  }
}
