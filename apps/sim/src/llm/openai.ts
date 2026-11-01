import type { AgentState, World, Action } from "@elso/shared";
import {
  ambientTemperature,
  visionRadius,
  lifeStageOf,
  LIFE_STAGE_ZH,
  bodyComfortOf,
  BODY_COMFORT_ZH,
  EMOTION_ZH,
  EMOTION_KEYS,
} from "@elso/shared";
import type { LLMProvider } from "./provider.ts";

const MAX_NEIGHBORS = 6;
const MAX_MEMORY = 5;

/**
 * 第一人称处境: 身体感受 + 感官切片 + 记忆。
 * 代理只能"看见"视野内的世界, 和自己的身体。
 */
function buildSituation(agent: AgentState, world: World, agents: AgentState[], tick: number): string {
  const cell = world.cells[agent.y]?.[agent.x];
  const vr = visionRadius(
    (tick % 24 >= 5 && tick % 24 < 7) || (tick % 24 >= 17 && tick % 24 < 19)
      ? "dusk"
      : tick % 24 >= 7 && tick % 24 < 17
        ? "day"
        : "night",
    "clear"
  );

  const body = [
    `饥饿 ${agent.hunger.toFixed(0)}/100, 口渴 ${agent.thirst.toFixed(0)}/100, 困倦 ${agent.sleepiness.toFixed(0)}/100`,
    `体力 ${agent.energy.toFixed(0)}/100, 健康 ${agent.health.toFixed(0)}/100, 体温 ${agent.bodyTemp.toFixed(1)}°C(${BODY_COMFORT_ZH[bodyComfortOf(agent.bodyTemp)]})`,
    `情绪: ${EMOTION_KEYS.map((k) => `${EMOTION_ZH[k]} ${agent.emotions[k].toFixed(2)}`).join(", ")}`,
    agent.awake ? "" : "(你正睡着)",
  ]
    .filter(Boolean)
    .join("\n");

  const sees: string[] = [];
  for (let dy = -vr; dy <= vr && sees.length < 10; dy++) {
    for (let dx = -vr; dx <= vr && sees.length < 10; dx++) {
      if (dx === 0 && dy === 0) continue;
      const c = world.cells[agent.y + dy]?.[agent.x + dx];
      if (!c) continue;
      if (c.terrain === "water") sees.push(`(${dx},${dy})是水`);
      else if (c.resourceKind && c.resource > 0.15) sees.push(`(${dx},${dy})${c.biome}有${c.resourceKind}`);
      else if ((c.minerals ?? []).length > 0) sees.push(`(${dx},${dy})岩石里露出${c.minerals.join("、")}`);
    }
  }

  const nearby = agents
    .filter(
      (a) =>
        a.id !== agent.id &&
        a.energy > 0 &&
        Math.abs(a.x - agent.x) <= 3 &&
        Math.abs(a.y - agent.y) <= 3
    )
    .slice(0, MAX_NEIGHBORS)
    .map(
      (a) =>
        `${a.name}(${a.gender === "female" ? "女" : "男"}, ${LIFE_STAGE_ZH[lifeStageOf(a.age, a.dna.lifespan)]})在(${a.x - agent.x},${a.y - agent.y}), 亲密度${((agent.relationships[a.id] ?? 0) + 1).toFixed(1)}/2`
    );

  const inv = Object.entries(agent.inventory)
    .filter(([, v]) => v >= 0.5)
    .map(([k, v]) => `${k}:${v.toFixed(1)}`)
    .join(", ") || "空";
  const mats = Object.entries(agent.materials)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}×${v}`)
    .join(", ") || "无";

  const air = cell ? ambientTemperature(cell.temperature, "day", "clear").toFixed(0) : "20";

  return [
    `身份: ${agent.name}, ${agent.gender === "female" ? "女性" : "男性"}, ${agent.age}岁(${LIFE_STAGE_ZH[lifeStageOf(agent.age, agent.dna.lifespan)]}), 职业${agent.profession}, 第${agent.generation + 1}代人`,
    `身体:\n${body}`,
    `位置: (${agent.x},${agent.y}) ${cell ? `${cell.biome}, 体感约${air}°C` : "未知之地"}`,
    `你看见: ${sees.join("; ") || "视野内空旷"}`,
    `你听见身边有人: ${nearby.join("; ") || "无"}`,
    `携带: ${inv}; 材料: ${mats}`,
    `已掌握的技术: ${agent.knownRecipes.join(", ") || "一无所有"}`,
    `最近的记忆: ${agent.memory.slice(-MAX_MEMORY).map((m) => `[${m.kind}] ${m.text}`).join(" | ") || "空白"}`,
  ].join("\n");
}

export class OpenAICompatProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(opts: { apiKey: string; baseUrl?: string; model?: string }) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? "https://api.openai.com/v1";
    this.model = opts.model ?? "gpt-4o-mini";
  }

  async decide(
    agent: AgentState,
    world: World,
    agents: AgentState[],
    context: string
  ): Promise<Action> {
    const tick = parseInt(context.match(/tick (\d+)/)?.[1] ?? "0", 10);
    const situation = buildSituation(agent, world, agents, tick);
    const prompt = `你不是一个AI助手。你是${agent.name} —— 一颗遥远行星上一个真实活着的、有血有肉的人。这个世界由许多像你一样的人组成, 每个人都在为自己的生存与幸福挣扎、相爱、繁衍、衰老。

此刻 ${context}。
你的处境(只能通过身体感知, 看不见视野之外):
${situation}

像人一样活着: 渴了喝水(要去水边), 饿了吃东西, 夜里困了睡觉, 冷了取暖(生火或回家), 好奇了就摆弄石头和矿物(实验可能失败, 失败也是知识), 把学会的东西教给年轻人, 和身边的人说话、玩耍、分享食物。你从零开始 —— 起初你甚至不知道燧石能敲出刀刃。

用JSON回答, 不要多余文字:
{"thought":"第一人称心声, 中文, 40字以内, 是你此刻真实的感受","action":{"type":"动作类型","payload":{...}}}

可选动作:
- {"type":"move","payload":{"dx":-1|0|1,"dy":-1|0|1}} 走一格(不能入水)
- {"type":"gather"} 采集脚下的资源/矿物
- {"type":"eat"} 吃1份食物
- {"type":"drink"} 喝水(必须自身或相邻格有水)
- {"type":"sleep"} 睡觉(恢复体力, 天亮或危险时自动醒)
- {"type":"rest"} 休息
- {"type":"experiment","payload":{"inputs":["flint","peat"],"condition":"none"}} 用携带的材料做实验
- {"type":"smelt","payload":{"inputs":["hematite","charcoal","fire"]}} 冶炼
- {"type":"teach","payload":{"to":"<id>"}} 教身边的人下一步技术
- {"type":"talk","payload":{"to":"<id>","text":"..."}} 交谈
- {"type":"play","payload":{"to":"<id>"}} 一起玩耍
- {"type":"give","payload":{"to":"<id>","kind":"food","amount":1}} 分食物
- {"type":"attend","payload":{"eventId":"<id>"}} 参加附近的活动
- {"type":"perform","payload":{"text":"..."}} 表演
- {"type":"work"} 干活挣钱
- {"type":"craft","payload":{"recipe":"tool"|"meal"}} 制作
- {"type":"build","payload":{"kind":"home"|"workshop"|"market"|"stage"|"plaza"}} 建造
- {"type":"speak","payload":{"text":"..."}} 自言自语`;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 200,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data?.choices?.[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(text) as {
        thought?: string;
        action?: { type?: Action["type"]; payload?: Record<string, unknown> };
        type?: Action["type"];
        payload?: Record<string, unknown>;
      };
      // 心声归档(供世界回放); 截断防止失控。
      if (parsed.thought && typeof parsed.thought === "string") {
        agent.thought = parsed.thought.slice(0, 80);
      }
      // 兼容两种形状: {"thought","action":{...}} 或直接的 {"type","payload"}。
      const act = parsed.action ?? parsed;
      return { type: act.type ?? "rest", payload: act.payload };
    } catch {
      return { type: "rest" };
    }
  }
}
