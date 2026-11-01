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
  minerals: string[];
}

export interface LogBuilding {
  id: string;
  kind: "home" | "workshop" | "stage" | "market" | "plaza" | "shop";
  x: number;
  y: number;
  capacity: number;
  ownerId?: string;
}

export interface LogEvent {
  id: string;
  kind: "concert" | "game" | "festival" | "market";
  title: string;
  x: number;
  y: number;
  startTick: number;
  duration: number;
  hostId?: string;
  attendees: string[];
  ended?: boolean;
}

export interface LogWorld {
  width: number;
  height: number;
  seed: number;
  cells: LogCell[][];
  buildings: LogBuilding[];
  events: LogEvent[];
}

export interface MemoryEntry {
  tick: number;
  kind: "event" | "plan" | "social" | "observation";
  text: string;
  importance: number;
}

export type LogGender = "female" | "male";
export type LogDayPhase = "dawn" | "day" | "dusk" | "night";
export type LogWeather = "clear" | "cloudy" | "rain" | "storm" | "snow";

export interface LogTime {
  day: number;
  hour: number;
  phase: LogDayPhase;
}

export interface LogEmotions {
  joy: number;
  fear: number;
  anger: number;
  sadness: number;
}

export interface LogVoice {
  id: string;
  name: string;
  text: string;
  emotion?: string;
}

export interface LogAgent {
  id: string;
  name?: string;
  gender?: LogGender;
  x: number;
  y: number;
  energy: number;
  hunger: number;
  thirst?: number;
  sleepiness?: number;
  awake?: boolean;
  bodyTemp?: number;
  emotions?: LogEmotions;
  thought?: string;
  inventory: Inventory;
  memory: MemoryEntry[];
  relationships: Record<string, number>;
  profession: string;
  materials: Record<string, number>;
  knowledge: string[];
  knownRecipes: string[];
  experiments: { tick: number; inputs: string[]; condition: string; success: boolean }[];
  generation: number;
  dna: { curiosity: number; endurance: number; intelligence: number; lifespan: number };
  age: number;
  health: number;
  birthTick: number;
  parentIds: string[];
  homeBuildingId?: string;
  workplaceId?: string;
  money: number;
  mood: number;
  skills: Record<string, number>;
}

export interface TickLog {
  tick: number;
  seed: number;
  world?: LogWorld;
  time?: LogTime;
  weather?: LogWeather;
  agents: LogAgent[];
  actions: { agentId: string; action: { type: string; payload?: any }; result?: string }[];
  voices?: LogVoice[];
  discoveries: { agentId: string; recipeId: string; via: "experiment" | "teach" }[];
  births: { id: string; name?: string; parentIds: string[]; generation: number }[];
  deaths: { id: string; name?: string; age: number; cause: string }[];
  techStage: number;
  metrics: {
    alive: number;
    gathered: number;
    communications: number;
    events: number;
    traded: number;
    socialEvents: number;
    moneySupply: number;
    recipes: number;
    births: number;
    deaths: number;
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