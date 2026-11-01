import type { AgentState, World } from "@elso/shared";
import type { Action } from "@elso/shared";

export interface LLMProvider {
  decide(
    agent: AgentState,
    world: World,
    agents: AgentState[],
    context: string
  ): Promise<Action>;
}

export interface DecisionContext {
  /** Cell contents at the agent's feet (biome/resource), for provider prompts. */
  cellSummary: string;
}

export interface DecisionContext {
  /** Cell contents at the agent's feet (biome/resource), for provider prompts. */
  cellSummary: string;
}