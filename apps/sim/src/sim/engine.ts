import type { World, AgentState, TickLog } from "@elso/shared";
import { executeAction } from "../rules/actions.ts";
import type { LLMProvider } from "../llm/provider.ts";
import { addMemory, adjustRelationship } from "../agent/state.ts";

export interface SimConfig {
  seed: number;
  ticks: number;
  agentCount: number;
  width: number;
  height: number;
}

import type { RuleEngine } from "../rules/engine.ts";

const REGEN_PER_TICK = 0.002;

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

  // Snapshot initial resource stocks so regeneration never exceeds them.
  const initialStock = new Map<string, number>();
  for (const row of world.cells) {
    for (const cell of row) {
      if (cell.resourceKind) initialStock.set(`${cell.x},${cell.y}`, cell.resource);
    }
  }

  for (let tick = 0; tick < config.ticks; tick++) {
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
        const ev: World["events"][number] = {
          id: `e${tick}`,
          kind,
          title: kind === "concert" ? "Town Concert" : kind === "market" ? "Market Day" : "Festival",
          x: v.x,
          y: v.y,
          startTick: tick,
          duration: 8,
          hostId: world.buildings.find((b) => b.kind === "home")?.ownerId,
          attendees: [],
        };
        world.events.push(ev);
        socialEvents++;
      }
    }
    // Settle ended events.
    for (const ev of world.events) {
      if (!ev.ended && tick >= ev.startTick + ev.duration) {
        ev.ended = true;
        for (const aid of ev.attendees) {
          const a = agents.find((x) => x.id === aid);
          if (!a) continue;
          addMemory(a, tick, "social", `attended ${ev.title}`, 0.7);
          a.mood = Math.min(1, a.mood + 0.15);
          if (ev.hostId && ev.hostId !== a.id) adjustRelationship(a, ev.hostId, 0.1);
        }
        if (ev.hostId) {
          const host = agents.find((x) => x.id === ev.hostId);
          if (host) host.money += ev.kind === "concert" ? 20 : 5;
        }
      }
    }
    const actions: TickLog["actions"] = [];
    for (const agent of agents) {
      const context = `tick ${tick}`;
      const action = await provider.decide(agent, world, agents, context);
      const res = ruleEngine
        ? ruleEngine.execute(world, agents, agent, action, tick)
        : executeAction(world, agents, agent, action);
      actions.push({ agentId: agent.id, action, result: res.message });
      if (action.type === "speak" && res.ok) communications++;
      if (action.type === "give" && res.ok) {
        traded += (action.payload?.amount as number) ?? 0;
      }
      if (res.ok) events++;
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
        const m = a.result.match(/gathered (\d+\.\d+)/);
        if (m) gatheredTotal += parseFloat(m[1]);
      }
    }
    const alive = agents.filter((a) => a.energy > 0).length;
    const log: TickLog = {
      tick,
      seed: config.seed,
      ...(tick === 0 ? { world } : {}),
      agents: agents.map((a) => ({ ...a, memory: [...a.memory] })),
      actions,
      metrics: { alive, gathered: gatheredTotal, communications, events, traded, socialEvents, moneySupply: agents.reduce((s, a) => s + a.money, 0) },
    };
    onTick(log);
  }
}
