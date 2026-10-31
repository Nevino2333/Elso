import type { AgentState, MemoryEntry, Inventory } from "@elso/shared";

export function createAgent(id: string, x: number, y: number, allIds: string[] = [], profession: AgentState["profession"] = "unemployed"): AgentState {
  const inventory: Inventory = { food: 2, wood: 0, stone: 0, ore: 0 };
  const relationships: Record<string, number> = {};
  for (const other of allIds) {
    if (other !== id) relationships[other] = 0;
  }
  return {
    id,
    x,
    y,
    energy: 100,
    hunger: 0,
    inventory,
    memory: [],
    relationships,
    plan: [],
    profession,
    money: 10,
    mood: 0.5,
    skills: {},
  };
}
export function addMemory(
  agent: AgentState,
  tick: number,
  kind: MemoryEntry["kind"],
  text: string,
  importance = 0.5,
  max = 16
): void {
  agent.memory.push({ tick, kind, text, importance });
  if (agent.memory.length > max) agent.memory.shift();
}

export function adjustRelationship(agent: AgentState, otherId: string, delta: number): void {
  if (agent.relationships[otherId] === undefined) agent.relationships[otherId] = 0;
  agent.relationships[otherId] = Math.max(-1, Math.min(1, agent.relationships[otherId] + delta));
}