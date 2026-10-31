import type { RulePlugin } from "../plugin.ts";

/** 单变量实验示例：每 tick 所有智能体额外恢复 0.5 能量 */
export const energyRegenPlugin: RulePlugin = {
  name: "energy-regen-0.5",
  onTick(world, agents) {
    for (const a of agents) {
      if (a.energy > 0) a.energy = Math.min(100, a.energy + 0.5);
    }
  },
};