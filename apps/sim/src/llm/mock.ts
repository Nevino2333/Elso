import type { AgentState, World, Action, ResourceKind, Weather } from "@elso/shared";
import type { LLMProvider } from "./provider.ts";
import { createRng, timeOfDay, visionRadius, WEATHER_ZH, nextRecipeToLearn, RECIPE_BY_ID, RECIPES } from "@elso/shared";

const WEATHER_BY_ZH: Record<string, Weather> = Object.fromEntries(
  Object.entries(WEATHER_ZH).map(([k, v]) => [v, k as Weather])
) as Record<string, Weather>;

type Cell = World["cells"][number][number];

const DIRECTIONS = [
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
];

const SPEECH = [
  "The land provides.",
  "I gather what I can.",
  "Cold nights ahead.",
  "The forest is plentiful.",
  "Stay fed, stay strong.",
  "I saw water to the east.",
  "This soil is rich.",
  "We survive together.",
  "Let us build a shelter.",
  "Trade keeps us alive.",
];

const TALK_TOPICS = [
  "food stores",
  "the weather",
  "moving camp",
  "sharing tools",
  "the forest edge",
  "night watch",
];

function cellAt(world: World, x: number, y: number): Cell | undefined {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return undefined;
  return world.cells[y]?.[x];
}

function isWalkable(cell: Cell | undefined): cell is Cell {
  return !!cell && cell.terrain !== "water";
}

/**
 * Deterministic survival strategy (replaces a real LLM for offline runs).
 * 身体需求层次: 口渴 > 饥饿 > 睡眠 > 保暖 > 精力 > 好奇/教学/社交。
 * 视野随昼夜与天气收缩 —— 夜里只能看到身边两三格。
 */
export class MockProvider implements LLMProvider {
  private rng: () => number;
  /** 当前时刻的视野半径(decide 开头按昼夜/天气刷新)。 */
  private vr = 5;

  constructor(seed: number) {
    this.rng = createRng(seed);
  }

  async decide(
    agent: AgentState,
    world: World,
    agents: AgentState[],
    context: string
  ): Promise<Action> {
    const here = cellAt(world, agent.x, agent.y);

    // 从引擎上下文解析时刻与天气(保持 provider 接口不变)。
    const tick = parseInt(context.match(/tick (\d+)/)?.[1] ?? "0", 10);
    const time = timeOfDay(tick);
    const weather = WEATHER_BY_ZH[context.match(/weather ([^,)]+)/)?.[1] ?? ""] ?? "clear";
    this.vr = visionRadius(time.phase, weather);
    const isNight = time.phase === "night";

    // 0. 身体: 口渴比饥饿更急 —— 先喝水。
    if (agent.thirst >= 55) {
      if (this.nearWater(world, agent)) return { type: "drink" };
      const water = this.findWater(world, agent);
      if (water) return this.moveToward(agent, water, world);
    }

    // 0b. 身体: 夜晚或困极了就睡 —— 能回家就回家睡, 别在野地里过夜。
    if (agent.sleepiness >= 82 || (isNight && agent.sleepiness >= 40)) {
      const nightHome = world.buildings.find((b) => b.id === agent.homeBuildingId);
      if (nightHome) {
        const d = Math.abs(nightHome.x - agent.x) + Math.abs(nightHome.y - agent.y);
        if (d <= 1) return { type: "sleep" };
        if (d <= 12 && agent.energy > 12) return this.moveToward(agent, nightHome, world);
      }
      return { type: "sleep" };
    }

    // 0c. 身体: 失温时奔向庇护所或更暖的地方。
    if (agent.bodyTemp < 35.8) {
      const home = world.buildings.find((b) => b.id === agent.homeBuildingId);
      if (home && (home.x !== agent.x || home.y !== agent.y)) {
        return this.moveToward(agent, home, world);
      }
      const warmer = this.findWarmer(world, agent);
      if (warmer) return this.moveToward(agent, warmer, world);
      return { type: "rest" };
    }

    // 1. Starvation: eat what we carry, or hunt.
    if (agent.hunger >= 70) {
      if (agent.inventory.food >= 1) return { type: "eat" };
      if (here && here.resourceKind === "food" && here.resource > 0.1) {
        return { type: "gather" };
      }
      const foodTarget = this.findFood(world, agent);
      if (foodTarget) return this.moveToward(agent, foodTarget, world);
      if (agent.energy >= 10 && here && isWalkable(here)) return { type: "rest" };
      return this.wander(agent, world);
    }

    // 2. Exhaustion: rest (eat first if hungry and fed).
    if (agent.energy < 30) {
      if (agent.hunger >= 50 && agent.inventory.food >= 1) return { type: "eat" };
      return { type: "rest" };
    }

    // 3. Pre-emptive eating keeps hunger in check.
    if (agent.hunger >= 50 && agent.inventory.food >= 2) return { type: "eat" };

    // 3b. Curiosity-driven experimentation (the road from flint to bronze).
    //     DNA curiosity gates how often an agent plays with fire and stones.
    if (
      !isNight &&
      agent.energy > 45 &&
      this.rng() < 0.12 + agent.dna.curiosity * 0.35
    ) {
      const has = (id: string) => (agent.materials[id] ?? 0) > 0;
      const cellMinerals = (world.cells[agent.y]?.[agent.x]?.minerals ?? []).filter((m) => has(m));
      const carried = Object.keys(agent.materials).filter(has);

      // 1) 沿课程表尝试"下一步": 料够就试; 缺料就补(先造消耗品, 再挖矿)。
      const next = nextRecipeToLearn(agent.knownRecipes);
      if (next) {
        if (this.hasAll(agent, next.inputs)) {
          return this.attemptRecipe(agent, next);
        }
        // 缺什么补什么: 已知配方能生产的先生产, 否则去挖。
        for (const [k, v] of Object.entries(next.inputs)) {
          if ((agent.materials[k] ?? 0) >= v) continue;
          const producer = RECIPES.find(
            (p) =>
              p.id !== next.id &&
              agent.knownRecipes.includes(p.id) &&
              (p.outputs[k] ?? 0) > 0
          );
          if (producer) {
            const act = this.makeKnown(agent, producer.id, world, 0);
            if (act) return act;
          }
          // 脚下就有这种矿: 先挖, 别去远处找。
          if ((world.cells[agent.y]?.[agent.x]?.minerals ?? []).includes(k)) {
            return { type: "gather" };
          }
          const spot = this.findSpecificMineral(world, agent, [k]);
          if (spot) return this.moveToward(agent, spot, world);
          break;
        }
      }

      // 2) 没有明确目标: 随手组合携带物, 或单独摆弄一块石头。
      if (carried.length >= 2) {
        const a = carried[Math.floor(this.rng() * carried.length)];
        let b = carried[Math.floor(this.rng() * carried.length)];
        if (b === a) b = carried[(carried.indexOf(a) + 1) % carried.length];
        return { type: "experiment", payload: { inputs: [a, b], condition: "none" } };
      }
      if (carried.length === 1) {
        return { type: "experiment", payload: { inputs: [carried[0]], condition: "none" } };
      }

      // 3) 空手: 去找矿石。
      if (cellMinerals.length === 0) {
        const target = this.findMineral(world, agent);
        if (target) return this.moveToward(agent, target, world);
      }
    }

    // 3c. Teaching: knowledgeable elders near an ignorant junior teach the next step.
    if (agent.knownRecipes.length > 0 && this.rng() < 0.18) {
      const student = agents.find(
        (s) =>
          s !== agent &&
          s.energy > 0 &&
          s.knownRecipes.length < agent.knownRecipes.length &&
          Math.abs(s.x - agent.x) + Math.abs(s.y - agent.y) <= 2
      );
      if (student) return { type: "teach", payload: { to: student.id } };
    }

    // 4. Harvest the standing resource while the stock is low.
    if (
      here &&
      here.resourceKind &&
      here.resource > 0.08 &&
      agent.inventory[here.resourceKind] < 4
    ) {
      return { type: "gather" };
    }

    // 4b. Attend nearby social events.
    const ev = world.events.find((e) => !e.ended && Math.abs(e.x - agent.x) + Math.abs(e.y - agent.y) <= 3);
    if (ev && this.rng() < 0.6) {
      return { type: "attend", payload: { eventId: ev.id } };
    }

    // 4c. Perform if artist on stage.
    if (agent.profession === "artist") {
      const stage = world.buildings.find((b) => b.kind === "stage" && Math.abs(b.x - agent.x) + Math.abs(b.y - agent.y) <= 1);
      if (stage && this.rng() < 0.4) return { type: "perform" };
    }

    // 4d. Work at workplace.
    if (agent.workplaceId && this.rng() < 0.35) return { type: "work" };

    // 4e. Play with nearby neighbor.
    const playMate = agents.find((a) => a.id !== agent.id && a.energy > 0 && Math.abs(a.x - agent.x) + Math.abs(a.y - agent.y) <= 2);
    if (playMate && this.rng() < 0.2) return { type: "play", payload: { to: playMate.id } };

    // 4f. Rest at home if tired.
    const home = world.buildings.find((b) => b.id === agent.homeBuildingId);
    if (home && agent.energy < 50 && Math.abs(home.x - agent.x) + Math.abs(home.y - agent.y) <= 1 && this.rng() < 0.5) {
      return { type: "rest_at_home" };
    }
    if (agent.inventory.wood >= 1 && agent.inventory.stone >= 1 && this.rng() < 0.25) {
      return { type: "craft", payload: { recipe: "tool" } };
    }
    if (agent.inventory.food >= 2 && agent.hunger < 40 && this.rng() < 0.15) {
      return { type: "craft", payload: { recipe: "meal" } };
    }

    // 6. Social: talk to a nearby agent to build affinity.
    const neighbor = this.socialNeighbor(agent, agents);
    if (neighbor && this.rng() < 0.3) {
      const topic = TALK_TOPICS[Math.floor(this.rng() * TALK_TOPICS.length)];
      return {
        type: "talk",
        payload: { to: neighbor.id, text: `let's discuss ${topic}` },
      };
    }

    // 7. Share food with a hungrier neighbor within reach.
    const hungry = this.hungriestNeighbor(agent, agents);
    if (hungry && agent.inventory.food >= 3 && this.rng() < 0.4) {
      return {
        type: "give",
        payload: { to: hungry.id, kind: "food", amount: 1 },
      };
    }

    // 8. Explore: head for the best nearby unharvested resource.
    const r = this.rng();
    if (r < 0.6) {
      const target = this.findBestCell(world, agent);
      if (target) return this.moveToward(agent, target, world);
      return this.wander(agent, world);
    }
    if (r < 0.78) {
      const text = SPEECH[Math.floor(this.rng() * SPEECH.length)];
      return { type: "speak", payload: { text } };
    }
    return { type: "rest" };
  }

  private findFood(
    world: World,
    agent: AgentState
  ): { x: number; y: number } | null {
    return this.scanFor(world, agent, (c) => c.resourceKind === "food" && c.resource > 0.05, this.vr);
  }

  /** 是否已站在水边(自身或四邻)。 */
  private nearWater(world: World, agent: AgentState): boolean {
    const wet = (x: number, y: number) => {
      const c = cellAt(world, x, y);
      return !!c && (c.terrain === "water" || c.biome === "shallows");
    };
    return (
      wet(agent.x, agent.y) ||
      wet(agent.x + 1, agent.y) ||
      wet(agent.x - 1, agent.y) ||
      wet(agent.x, agent.y + 1) ||
      wet(agent.x, agent.y - 1)
    );
  }

  /** 听声寻水: 半径10内的水体(夜里也找得到)。 */
  private findWater(world: World, agent: AgentState): { x: number; y: number } | null {
    return this.scanFor(world, agent, (c) => c.terrain === "water" || c.biome === "shallows", 10);
  }

  /** 觅暖: 附近更暖的陆地(白天向阳处)。 */
  private findWarmer(world: World, agent: AgentState): { x: number; y: number } | null {
    const cur = cellAt(world, agent.x, agent.y);
    const curT = cur?.temperature ?? 0.5;
    return this.scanFor(
      world,
      agent,
      (c) => c.terrain === "land" && c.temperature > curT + 0.04,
      4
    );
  }

  /** 材料是否齐备(按配方真实数量)。 */
  private hasAll(agent: AgentState, inputs: Record<string, number>): boolean {
    return Object.entries(inputs).every(([k, v]) => (agent.materials[k] ?? 0) >= v);
  }

  /** 按配方产出一次: 需要火候的进火炼, 其余做实验。 */
  private attemptRecipe(
    agent: AgentState,
    recipe: { condition: string; inputs: Record<string, number> }
  ): Action {
    return recipe.condition === "fire"
      ? { type: "smelt", payload: { inputs: Object.keys(recipe.inputs) } }
      : { type: "experiment", payload: { inputs: Object.keys(recipe.inputs) } };
  }

  /** 让已知配方再产出一次: 缺输入就递归补, 补不了就去挖矿。 */
  private makeKnown(
    agent: AgentState,
    recipeId: string,
    world: World,
    depth: number
  ): Action | null {
    if (depth > 3) return null;
    const r = RECIPE_BY_ID[recipeId];
    if (!r || !agent.knownRecipes.includes(recipeId)) return null;
    if (this.hasAll(agent, r.inputs)) return this.attemptRecipe(agent, r);
    for (const [k, v] of Object.entries(r.inputs)) {
      if ((agent.materials[k] ?? 0) >= v) continue;
      const producer = RECIPES.find(
        (p) =>
          p.id !== recipeId &&
          agent.knownRecipes.includes(p.id) &&
          (p.outputs[k] ?? 0) > 0
      );
      if (producer) {
        const sub = this.makeKnown(agent, producer.id, world, depth + 1);
        if (sub) return sub;
      }
      if ((world.cells[agent.y]?.[agent.x]?.minerals ?? []).includes(k)) {
        return { type: "gather" };
      }
      const spot = this.findSpecificMineral(world, agent, [k]);
      if (spot) return this.moveToward(agent, spot, world);
      return null;
    }
    return null;
  }

  /** 最近的、含指定矿物的格子(缺什么找什么)。 */
  private findSpecificMineral(
    world: World,
    agent: AgentState,
    ids: string[]
  ): { x: number; y: number } | null {
    if (ids.length === 0) return null;
    return this.scanFor(
      world,
      agent,
      (c) => (c.minerals ?? []).some((m) => ids.includes(m)),
      Math.max(this.vr, 20)
    );
  }

  /** 最近的、含未持有矿物的格子。 */
  private findMineral(
    world: World,
    agent: AgentState
  ): { x: number; y: number } | null {
    const wanted = (m: string) => (agent.materials[m] ?? 0) < 2;
    return this.scanFor(world, agent, (c) => (c.minerals ?? []).some(wanted), this.vr);
  }

  /**
   * 最近的目标格。扫描方形范围并按曼哈顿距离取最小 ——
   * 旧版按环形从北往南扫, 会把整个部落一路吸到地图北缘。
   */
  private scanFor(
    world: World,
    agent: AgentState,
    pred: (cell: Cell) => boolean,
    maxR = 5
  ): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestScore = Infinity;
    for (let dy = -maxR; dy <= maxR; dy++) {
      for (let dx = -maxR; dx <= maxR; dx++) {
        if (dx === 0 && dy === 0) continue;
        const cell = cellAt(world, agent.x + dx, agent.y + dy);
        if (!cell || !pred(cell)) continue;
        // 距离为主, 切比雪夫轻微加权打破平局。
        const score =
          Math.abs(dx) + Math.abs(dy) + Math.max(Math.abs(dx), Math.abs(dy)) * 0.01;
        if (score < bestScore) {
          bestScore = score;
          best = { x: cell.x, y: cell.y };
        }
      }
    }
    return best;
  }

  private findBestCell(
    world: World,
    agent: AgentState
  ): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestScore = 0;
    for (let r = 1; r <= Math.min(3, this.vr); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const cell = cellAt(world, agent.x + dx, agent.y + dy);
          if (!cell || !isWalkable(cell)) continue;
          let score = 1;
          if (cell.resourceKind && cell.resource > 0.3) score += 4;
          else if (cell.resourceKind && cell.resource > 0.08) score += 2;
          if (score > bestScore) {
            bestScore = score;
            best = { x: cell.x, y: cell.y };
          }
        }
      }
    }
    return best;
  }

  private moveToward(
    agent: AgentState,
    target: { x: number; y: number },
    world: World
  ): Action {
    const dx = Math.sign(target.x - agent.x);
    const dy = Math.sign(target.y - agent.y);
    const cands = [
      { dx, dy: 0 },
      { dx: 0, dy },
      { dx, dy },
    ].filter((d) => d.dx !== 0 || d.dy !== 0);
    for (const d of cands) {
      const c = cellAt(world, agent.x + d.dx, agent.y + d.dy);
      if (isWalkable(c)) return { type: "move", payload: d };
    }
    return this.wander(agent, world);
  }

  private wander(agent: AgentState, world: World): Action {
    for (let i = 0; i < 4; i++) {
      const d = DIRECTIONS[Math.floor(this.rng() * DIRECTIONS.length)];
      if (isWalkable(cellAt(world, agent.x + d.dx, agent.y + d.dy))) {
        return { type: "move", payload: d };
      }
    }
    return { type: "rest" };
  }

  /** Agent within reach whose affinity is low (good candidate to befriend). */
  private socialNeighbor(agent: AgentState, agents: AgentState[]) {
    let best: AgentState | null = null;
    for (const other of agents) {
      if (other === agent || other.energy <= 0) continue;
      const dist = Math.abs(other.x - agent.x) + Math.abs(other.y - agent.y);
      if (dist > 2) continue;
      const aff = agent.relationships[other.id] ?? 0;
      if (aff < 0.4 && (!best || aff < (agent.relationships[best.id] ?? 0))) {
        best = other;
      }
    }
    return best;
  }

  private hungriestNeighbor(agent: AgentState, agents: AgentState[]) {
    let best: AgentState | null = null;
    for (const other of agents) {
      if (other === agent || other.energy <= 0) continue;
      const dist = Math.abs(other.x - agent.x) + Math.abs(other.y - agent.y);
      if (dist > 1) continue;
      if (other.hunger > agent.hunger + 15 && (!best || other.hunger > best.hunger)) {
        best = other;
      }
    }
    return best;
  }
}