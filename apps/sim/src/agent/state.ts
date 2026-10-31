import type { AgentState, Inventory } from "@elso/shared";

export function createAgent(id: string, x: number, y: number): AgentState {
  const inventory: Inventory = { food: 2, wood: 0, stone: 0, ore: 0 };
  return { id, x, y, energy: 100, hunger: 0, inventory, memory: [] };
}

export function addMemory(agent: AgentState, event: string, max = 10): void {
  agent.memory.push(event);
  if (agent.memory.length > max) agent.memory.shift();
}