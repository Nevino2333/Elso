import type { World, AgentState, Action } from "@elso/shared";

export interface RuleContext {
  world: World;
  agent: AgentState;
  action: Action;
  tick: number;
}

export interface RulePlugin {
  name: string;
  /** 返回修改后的 action 或 null 表示允许原 action */
  beforeAction?(ctx: RuleContext): Action | null;
  afterAction?(ctx: RuleContext, result: { ok: boolean; message: string }): void;
  onTick?(world: World, agents: AgentState[], tick: number): void;
}