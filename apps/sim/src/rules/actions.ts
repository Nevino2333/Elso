import type { World, AgentState, Action, ResourceKind, MemoryEntry } from "@elso/shared";

export interface ActionResult {
  ok: boolean;
  message: string;
}

function manhattan(a: AgentState, b: AgentState): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function executeAction(
  world: World,
  agents: AgentState[],
  agent: AgentState,
  action: Action
): ActionResult {
  switch (action.type) {
    case "move": {
      const dx = (action.payload?.dx as number) ?? 0;
      const dy = (action.payload?.dy as number) ?? 0;
      const nx = Math.max(0, Math.min(world.width - 1, agent.x + dx));
      const ny = Math.max(0, Math.min(world.height - 1, agent.y + dy));
      const cell = world.cells[ny]?.[nx];
      if (!cell || cell.terrain === "water") return { ok: false, message: "blocked" };
      agent.x = nx;
      agent.y = ny;
      agent.energy = Math.max(0, agent.energy - 2);
      return { ok: true, message: `moved to ${nx},${ny}` };
    }
    case "gather": {
      const cell = world.cells[agent.y]?.[agent.x];
      if (!cell || cell.terrain === "water" || !cell.resourceKind || cell.resource <= 0) {
        return { ok: false, message: "no resource" };
      }
      const kind = cell.resourceKind as ResourceKind;
      const amt = Math.min(cell.resource, 0.35);
      cell.resource -= amt;
      agent.inventory[kind] += amt;
      agent.energy = Math.min(100, agent.energy + amt * 12);
      return { ok: true, message: `gathered ${amt.toFixed(2)} ${kind}` };
    }
    case "eat": {
      if (agent.hunger < 20) return { ok: false, message: "not hungry" };
      if (agent.inventory.food < 1) return { ok: false, message: "no food" };
      agent.inventory.food -= 1;
      agent.hunger = Math.max(0, agent.hunger - 30);
      agent.energy = Math.min(100, agent.energy + 15);
      return { ok: true, message: "ate 1 food" };
    }
    case "rest": {
      agent.energy = Math.min(100, agent.energy + 10);
      agent.hunger = Math.min(100, agent.hunger + 5);
      return { ok: true, message: "rested" };
    }
    case "give": {
      const toId = action.payload?.to as string;
      const kind = (action.payload?.kind as ResourceKind) ?? "food";
      const requested = (action.payload?.amount as number) ?? 1;
      const target = agents.find((a) => a.id === toId);
      if (!target) return { ok: false, message: "no target" };
      if (target === agent) return { ok: false, message: "give to self" };
      if (manhattan(agent, target) > 2) return { ok: false, message: "too far" };
      const amt = Math.min(requested, agent.inventory[kind]);
      if (amt <= 0) return { ok: false, message: `no ${kind}` };
      agent.inventory[kind] -= amt;
      target.inventory[kind] += amt;
      return { ok: true, message: `gave ${amt.toFixed(2)} ${kind} to ${target.id}` };
    }
    case "talk": {
      const toId = action.payload?.to as string;
      const text = (action.payload?.text as string) ?? "";
      const target = agents.find((a) => a.id === toId);
      if (!target) return { ok: false, message: "no target" };
      if (target === agent) return { ok: false, message: "talk to self" };
      if (manhattan(agent, target) > 2) return { ok: false, message: "too far" };
      // Affinity grows with conversation.
      const cur = agent.relationships[toId] ?? 0;
      agent.relationships[toId] = Math.max(-1, Math.min(1, cur + 0.05));
      if (target.relationships[agent.id] === undefined) target.relationships[agent.id] = 0;
      target.relationships[agent.id] = Math.max(-1, Math.min(1, target.relationships[agent.id] + 0.03));
      return { ok: true, message: `talked to ${target.id}: ${text}` };
    }
    case "craft": {
      const recipe = action.payload?.recipe as string;
      if (recipe === "tool") {
        if (agent.inventory.wood < 1 || agent.inventory.stone < 1) {
          return { ok: false, message: "missing materials" };
        }
        agent.inventory.wood -= 1;
        agent.inventory.stone -= 1;
        agent.energy = Math.min(100, agent.energy + 8);
        return { ok: true, message: "crafted tool" };
      }
      if (recipe === "meal") {
        if (agent.inventory.food < 2) return { ok: false, message: "not enough food" };
        agent.inventory.food -= 2;
        agent.hunger = Math.max(0, agent.hunger - 15);
        agent.energy = Math.min(100, agent.energy + 5);
        return { ok: true, message: "crafted meal" };
      }
      return { ok: false, message: "unknown recipe" };
    }
    case "speak": {
      return { ok: true, message: `said: ${action.payload?.text ?? ""}` };
    }
    default:
      return { ok: false, message: "unknown action" };
  }
}