// 心声: 居民的第一人称独白(mock 世界的心跳; 接真实 LLM 时由模型生成)。
// 世界不是一个人的 —— 每个居民每个 tick 都有一句属于TA自己的心声。
import type { AgentState, Perception, TimeInfo, Weather } from "@elso/shared";
import { createRng, bodyComfortOf, lifeStageOf, dominantEmotion, EMOTION_ZH } from "@elso/shared";
import { directionOf, BIOME_ZH } from "../agent/perception.ts";

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function rngFor(agent: AgentState, tick: number): () => number {
  let h = tick | 0;
  for (let i = 0; i < agent.id.length; i++) h = (h * 31 + agent.id.charCodeAt(i)) | 0;
  return createRng(Math.abs(h) % 2147483647);
}

const SHE = (a: AgentState) => (a.gender === "female" ? "她" : "他");

export function monologueFor(
  agent: AgentState,
  tick: number,
  perception: Perception,
  time: TimeInfo,
  weather: Weather,
  lastAction?: { type: string; ok: boolean; message?: string }
): string {
  const rng = rngFor(agent, tick);

  // 睡着的人有梦。
  if (!agent.awake) {
    return pick(rng, [
      "……梦里又回到了出生的那片草地。",
      "……睡得很沉, 梦里有吃不完的果子。",
      "……梦里有人在高声唱歌。",
      "……身体在睡梦中慢慢回暖。",
    ]);
  }

  // 身体的呼喊优先于一切诗意。
  if (agent.thirst >= 80)
    return pick(rng, ["喉咙干得发烫……必须找到水。", "嘴唇已经裂开了, 我需要喝水。"]);
  if (agent.hunger >= 80)
    return pick(rng, ["胃在绞疼, 我需要食物。", "再找不到吃的, 我就走不动了。"]);
  if (agent.sleepiness >= 85)
    return pick(rng, ["眼皮沉得抬不起来……", "再走一步就要睡着了。"]);
  const comfort = bodyComfortOf(agent.bodyTemp);
  if (comfort === "freezing") return pick(rng, ["指尖已经没有知觉了, 好冷。", "牙齿在打颤, 我得取暖。"]);
  if (comfort === "fever") return "浑身发烫, 脑袋昏昏沉沉……我是不是病了。";
  if (comfort === "hot") return pick(rng, ["汗一直流, 太热了。", "太阳把石头都晒透了。"]);

  // 这一tick的发现与成败。
  if (lastAction?.type === "experiment" && lastAction.ok && /DISCOVERED/.test(lastAction.message ?? "")) {
    return pick(rng, ["我做到了! 原来是这样!", "手还在抖……但我弄明白了!"]);
  }
  if (lastAction?.type === "teach" && lastAction.ok) {
    return pick(rng, ["把我知道的教给TA, 就像当年有人教我。", "TA眼睛亮了一下 —— 学会了。"]);
  }
  if (lastAction?.type === "drink" && lastAction.ok) return "凉水顺着喉咙下去, 活过来了。";
  if (lastAction?.type === "play" && lastAction.ok) return pick(rng, ["笑得肚子疼, 已经很久没这样了。", "和TA在一起的时候时间过得很快。"]);
  if (lastAction?.type === "attend" && lastAction.ok) return pick(rng, ["鼓声和歌声震得胸口发麻。", "火光里所有人的脸都是暖的。"]);

  // 情绪的余韵。
  const dom = dominantEmotion(agent.emotions, 0.35);
  if (dom === "fear") return pick(rng, ["心口一直不安地跳。", "总觉得有什么不好的事要发生。"]);
  if (dom === "sadness") return pick(rng, ["胸口闷闷的, 像压着一块石头。", "风吹过来的时候, 更难过了。"]);
  if (dom === "anger") return pick(rng, ["握紧了拳头, 又慢慢松开。", "不能生气, 生气解决不了问题。"]);
  if (dom === "joy") return pick(rng, ["今天心里是亮堂的。", "脚步都轻快了不少。"]);

  // 昼夜与天气的心境。
  if (time.phase === "night")
    return pick(rng, ["星空很安静, 我在等天亮。", "夜里有虫鸣, 世界没有睡着。", "月亮把影子拉得很长。"]);
  if (time.phase === "dawn") return pick(rng, ["天边泛白了, 新的一天。", "晨雾里全是露水的味道。"]);
  if (time.phase === "dusk") return pick(rng, ["太阳落下去了, 该找地方过夜。", "晚霞把云烧成了铜的颜色。"]);
  if (weather === "storm") return pick(rng, ["风大得站不稳, 得躲一躲。", "雷声在很远的地方滚动。"]);
  if (weather === "rain") return pick(rng, ["雨点打在叶子上, 噼啪作响。", "淋湿了, 但雨后的蘑菇会多起来。"]);
  if (weather === "snow") return "雪落下来的时候, 世界安静得能听见自己呼吸。";

  // 年龄与远方。
  const stage = lifeStageOf(agent.age, agent.dna.lifespan);
  if (stage === "child") return pick(rng, ["今天的云像一只大鸟。", "跑起来! 风在耳朵里呼呼响。"]);
  if (stage === "elder") return pick(rng, ["骨头在提醒我走过的路。", "年轻人的笑声让我想起自己年轻的时候。"]);
  const heard = perception.hearing[0];
  if (heard) {
    const dir = directionOf(heard.dx, heard.dy);
    return `${dir}边有人声, 是${heard.name}。`;
  }
  const far = perception.vision.find((c) => c.biome === "mountain");
  if (far) return `远处${directionOf(far.dx, far.dy)}有山, ${BIOME_ZH[far.biome]}的轮廓很清晰。`;
  return pick(rng, ["风里有说不清的味道。", "路还长, 一步一步走。", "这里的一切都值得记住。"]);
}
