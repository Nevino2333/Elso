import type { RulePlugin } from "../plugin.ts";

/** 单变量实验示例：饥饿增长减半（每 tick 只 +0.5，而非默认 +1） */
export const hungerSlowPlugin: RulePlugin = {
  name: "hunger-slow-0.5",
  onTick(world, agents) {
    for (const a of agents) {
      a.hunger = Math.max(0, a.hunger - 0.5);
    }
  },
};