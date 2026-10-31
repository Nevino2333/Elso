import { ref } from "vue";

export type Biome =
  | "deep-water"
  | "water"
  | "shallows"
  | "beach"
  | "snow"
  | "tundra"
  | "taiga"
  | "grassland"
  | "savanna"
  | "desert"
  | "temperate-forest"
  | "rainforest"
  | "mountain"
  | "barren";

export type ResourceKind = "food" | "wood" | "stone" | "ore";

export interface Inventory {
  food: number;
  wood: number;
  stone: number;
  ore: number;
}

export interface LogCell {
  x: number;
  y: number;
  terrain: "water" | "land";
  biome: Biome;
  elevation: number;
  temperature: number;
  moisture: number;
  resource: number;
  resourceKind: ResourceKind | null;
  energyDecay: number;
}

export interface LogWorld {
  width: number;
  height: number;
  seed: number;
  cells: LogCell[][];
}

export interface MemoryEntry {
  tick: number;
  kind: "event" | "plan" | "social" | "observation";
  text: string;
  importance: number;
}

export interface LogAgent {
  id: string;
  x: number;
  y: number;
  energy: number;
  hunger: number;
  inventory: Inventory;
  memory: MemoryEntry[];
  relationships: Record<string, number>;
  plan: string[];
}

export interface TickLog {
  tick: number;
  seed: number;
  world?: LogWorld;
  agents: LogAgent[];
  actions: { agentId: string; action: { type: string; payload?: any }; result?: string }[];
  metrics: {
    alive: number;
    gathered: number;
    communications: number;
    events: number;
    traded: number;
  };
}

export function useJsonlStream() {
  const logs = ref<TickLog[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function load(url: string) {
    loading.value = true;
    error.value = null;
    logs.value = [];
    const parsed: TickLog[] = [];
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("Response has no body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            parsed.push(JSON.parse(line));
          } catch {
            // Skip malformed lines instead of failing the whole replay.
          }
        }
      }
      if (buffer.trim()) {
        try {
          parsed.push(JSON.parse(buffer));
        } catch {
          // Ignore a truncated trailing line.
        }
      }
      logs.value = parsed;
    } catch (e: any) {
      error.value = e?.message ?? String(e);
    } finally {
      loading.value = false;
    }
  }

  return { logs, loading, error, load };
}