import type { AgentState, World, Action, ResourceKind } from "@elso/shared";
import type { LLMProvider } from "./provider.ts";
import { createRng } from "@elso/shared";

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
 * Deterministic survival strategy (replaces a real LLM for offline runs):
 *  1. starving  -> eat if food, else hunt toward nearby food, else rest
 *  2. exhausted -> rest (eat first if hungry and fed)
 *  3. stocked   -> gather the cell's resource if below 4 units
 *  4. craft     -> turn wood+stone into a tool when materials allow
 *  5. social    -> talk to a nearby agent to build affinity / share info
 *  6. generous  -> give food to a hungrier neighbor within reach
 *  7. otherwise -> explore toward a promising resource, or chat
 */
export class MockProvider implements LLMProvider {
  private rng: () => number;

  constructor(seed: number) {
    this.rng = createRng(seed);
  }

  async decide(
    agent: AgentState,
    world: World,
    agents: AgentState[],
    _context: string
  ): Promise<Action> {
    const here = cellAt(world, agent.x, agent.y);

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

    // 4. Harvest the standing resource while the stock is low.
    if (
      here &&
      here.resourceKind &&
      here.resource > 0.08 &&
      agent.inventory[here.resourceKind] < 4
    ) {
      return { type: "gather" };
    }

    // 5. Craft when materials allow (social/progression layer).
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
    for (let r = 1; r <= 4; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const cell = cellAt(world, agent.x + dx, agent.y + dy);
          if (cell && cell.resourceKind === "food" && cell.resource > 0.05) {
            return { x: cell.x, y: cell.y };
          }
        }
      }
    }
    return null;
  }

  private findBestCell(
    world: World,
    agent: AgentState
  ): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestScore = 0;
    for (let r = 1; r <= 3; r++) {
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