import type { World, AgentState, Action, ResourceKind } from "@elso/shared";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Manhattan distance between two agents (used to gate give/trade). */
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
    case "speak": {
      return { ok: true, message: `said: ${action.payload?.text ?? ""}` };
    }
    default:
      return { ok: false, message: "unknown action" };
  }
}