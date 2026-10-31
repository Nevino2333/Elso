import type { World, AgentState } from "@elso/shared";
import type { RulePlugin } from "./plugin.ts";
import { executeAction } from "./actions.ts";

export class RuleEngine {
  private plugins: RulePlugin[] = [];
  register(p: RulePlugin) { this.plugins.push(p); }
  get pluginsList() { return this.plugins; }

  tick(world: World, agents: AgentState[], tick: number) {
    for (const p of this.plugins) p.onTick?.(world, agents, tick);
  }

  execute(world: World, agents: AgentState[], agent: AgentState, action: any, tick: number) {
    let a = action;
    for (const p of this.plugins) {
      const r = p.beforeAction?.({ world, agent, action: a, tick });
      if (r) a = r;
    }
    const res = executeAction(world, agents, agent, a);
    for (const p of this.plugins) p.afterAction?.({ world, agent, action: a, tick }, res);
    return res;
  }
}