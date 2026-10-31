import type { AgentState, World, Action, ResourceKind } from "@elso/shared";
import type { LLMProvider } from "./provider.ts";

const MAX_NEIGHBORS = 6;
const MAX_MEMORY = 5;

/**
 * Local proxy of a full observable world for the prompt:
 * what the agent can literally see from its feet and its recent memory.
 * Keeps token usage bounded regardless of world size.
 */
function buildSituation(
  agent: AgentState,
  world: World,
  agents: AgentState[]
): string {
  const cell = world.cells[agent.y]?.[agent.x];
  const here = cell
    ? `${cell.biome} (elevation ${cell.elevation.toFixed(2)}, temp ${cell.temperature.toFixed(
        2
      )}, moisture ${cell.moisture.toFixed(2)}), resource ${cell.resourceKind ?? "none"} x${(
        cell.resource ?? 0
      ).toFixed(2)}`
    : "unknown";

  const visible: string[] = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue;
      const c = world.cells[agent.y + dy]?.[agent.x + dx];
      if (c && c.terrain === "land" && c.resourceKind && c.resource > 0.2) {
        visible.push(`${c.biome} at offset (${dx},${dy}) ${c.resourceKind} x${c.resource.toFixed(2)}`);
      }
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
        `${a.id} at (${a.x},${a.y}) hunger ${a.hunger.toFixed(0)} energy ${a.energy.toFixed(
          0
        )}, carrying ${a.inventory.food.toFixed(1)} food`
    );

  const inv = (Object.keys(agent.inventory) as ResourceKind[])
    .map((k) => `${k}:${agent.inventory[k].toFixed(1)}`)
    .join(", ");

  return [
    `position: (${agent.x},${agent.y}), biome: ${here}`,
    `energy: ${agent.energy.toFixed(0)}/100, hunger: ${agent.hunger.toFixed(0)}/100`,
    `inventory: ${inv}`,
    visible.length ? `nearby resources: ${visible.join("; ")}` : "nearby resources: none",
    nearby.length ? `other agents visible: ${nearby.join("; ")}` : "other agents visible: none",
    `memory (recent): ${agent.memory.slice(-MAX_MEMORY).join(" | ") || "empty"}`,
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
    const situation = buildSituation(agent, world, agents);
    const prompt = `You are a small human-like settler at tick ${context} on a procedurally generated planet. You are one of ${agents.length} settlers, each an independent thinker.

Situation:
${situation}

Act for long-term survival: stay fed (hunger is your only death clock), manage energy, gather resources, and help neighbors who are hungry — you may give them food. Speak sparingly and only with purpose.

Choose exactly one action, JSON only, no prose:
- {"type":"move","payload":{"dx":-1|0|1,"dy":-1|0|1}} — move one cell (never into water)
- {"type":"gather"} — harvest the resource standing in your cell (food/wood/stone/ore), does not work on empty cells
- {"type":"eat"} — consumes 1 food from inventory, -30 hunger
- {"type":"rest"} — recover energy, costs nothing
- {"type":"give","payload":{"to":"<agent id>","kind":"food","amount":1}} — only if that agent is within 2 cells and you have surplus
- {"type":"speak","payload":{"text":"<short message>"}}

Eat only if hunger is high; gather food whenever standing on food; move toward food if you are hungry and have none. Never be idle when you can act.`;

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
        max_tokens: 150,
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
        type?: Action["type"];
        payload?: Record<string, unknown>;
      };
      return { type: parsed.type ?? "rest", payload: parsed.payload };
    } catch {
      return { type: "rest" };
    }
  }
}