export type Profession =
  | "farmer"
  | "miner"
  | "builder"
  | "artist"
  | "merchant"
  | "scholar"
  | "unemployed";

export type BuildingKind =
  | "home"
  | "workshop"
  | "stage"
  | "market"
  | "plaza"
  | "shop";

export interface Building {
  id: string;
  kind: BuildingKind;
  x: number;
  y: number;
  capacity: number;
  ownerId?: string; // agent id for homes
}

export type SocialEventKind = "concert" | "game" | "festival" | "market";

export interface SocialEvent {
  id: string;
  kind: SocialEventKind;
  title: string;
  x: number;
  y: number;
  startTick: number;
  duration: number; // ticks
  hostId?: string;
  attendees: string[]; // agent ids
  ended?: boolean;
}

export type MemoryKind = "event" | "plan" | "social" | "observation";

// ---------------------------------------------------------------------------
// 赋身层: 每个居民都有性别、姓名、身体、感官与情绪

export type Gender = "female" | "male";

export type DayPhase = "dawn" | "day" | "dusk" | "night";
export type Weather = "clear" | "cloudy" | "rain" | "storm" | "snow";

export interface TimeInfo {
  day: number; // 第几天(从1起)
  hour: number; // 0..23
  phase: DayPhase;
}

export interface Emotions {
  joy: number; // 0..1 喜悦
  fear: number; // 恐惧
  anger: number; // 愤怒
  sadness: number; // 哀伤
}

export interface PerceivedCell {
  dx: number;
  dy: number;
  biome: Biome;
  resource: string | null; // resourceKind 或 null
  minerals: string[];
}

export interface PerceivedAgent {
  id: string;
  name: string;
  gender: Gender;
  dx: number;
  dy: number;
}

/** 一个代理以身体感官获得的世界切片(不是全图)。 */
export interface Perception {
  light: string; // 明亮/昏暗/黑暗
  ground: string; // 脚下
  airTemp: number; // 体感温度 °C
  vision: PerceivedCell[];
  hearing: PerceivedAgent[];
  smells: string[];
}

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

export type TerrainType = "water" | "land";

export type ResourceKind = "food" | "wood" | "stone" | "ore";

export interface MemoryEntry {
  tick: number;
  kind: MemoryKind;
  text: string;
  importance: number; // 0..1
}

export interface Inventory {
  food: number;
  wood: number;
  stone: number;
  ore: number;
}

export interface Cell {
  x: number;
  y: number;
  terrain: TerrainType; // coarse walkability bucket
  biome: Biome;
  elevation: number; // 0..1, sea level split around 0.5
  temperature: number; // 0..1 (0 = polar, 1 = equatorial)
  moisture: number; // 0..1
  resource: number; // 0..1 stock of resourceKind
  resourceKind: ResourceKind | null;
  energyDecay: number; // per tick while standing here
  /** Mineral ids embedded in this cell (see MINERALS in chemistry.ts). */
  minerals: string[];
}

export interface World {
  width: number;
  height: number;
  seed: number;
  cells: Cell[][];
  buildings: Building[];
  events: SocialEvent[];
}

export interface AgentDNA {
  curiosity: number; // 0..1
  endurance: number;
  intelligence: number;
  lifespan: number; // ticks
}

export interface AgentState {
  id: string;
  name: string; // 居民姓名(确定性生成)
  gender: Gender;
  x: number;
  y: number;
  energy: number; // 0..100
  hunger: number; // 0..100
  thirst: number; // 0..100 口渴
  sleepiness: number; // 0..100 困倦
  awake: boolean; // 睡着时为 false
  bodyTemp: number; // 体温 °C(正常约37)
  emotions: Emotions;
  thought?: string; // 本 tick 的心声(第一人称)
  inventory: Inventory;
  materials: Record<string, number>; // elements/compounds discovered or carried
  knowledge: string[]; // discovered formulas/reactions
  dna: AgentDNA;
  age: number; // ticks
  health: number; // 0..100
  birthTick: number;
  parentIds: string[];
  teacherId?: string;
  memory: MemoryEntry[]; // rolling memory stream (most recent last)
  /** Recipe ids this agent has personally discovered. */
  knownRecipes: string[];
  /** Rolling log of experiments (successes and failures alike). */
  experiments: { tick: number; inputs: string[]; condition: string; success: boolean }[];
  /** Generations since the founding population. */
  generation: number;
  /** Affinity toward other agents, -1..1. */
  relationships: Record<string, number>;
  /** Short-term plan queue (human-readable steps). */
  plan: string[];
  // Social life layer
  profession: Profession;
  homeBuildingId?: string;
  workplaceId?: string;
  money: number;
  mood: number; // 0..1
  skills: Record<string, number>;
}

export type ActionType =
  | "move"
  | "gather"
  | "eat"
  | "rest"
  | "speak"
  | "give"
  | "talk"
  | "craft"
  | "work"
  | "trade"
  | "build"
  | "attend"
  | "perform"
  | "play"
  | "rest_at_home"
  | "experiment"
  | "smelt"
  | "teach"
  | "drink"
  | "sleep";

export interface Action {
  type: ActionType;
  payload?: Record<string, unknown>;
}

export interface TickLog {
  tick: number;
  seed: number;
  /** Emitted on tick 0 only so the viewer can render terrain without the generator. */
  world?: World;
  /** 世界时刻与天气(1 tick = 1 小时)。 */
  time: TimeInfo;
  weather: Weather;
  agents: AgentState[];
  actions: { agentId: string; action: Action; result?: string }[];
  /** 本 tick 情绪最强烈的居民心声(世界不是一个人的, 人人都在感受)。 */
  voices: { id: string; name: string; text: string; emotion?: string }[];
  /** Recipes first discovered this tick ("discovered:recipeId" entries in actions mirror this). */
  discoveries: { agentId: string; recipeId: string; via: "experiment" | "teach" }[];
  /** Agents born / died this tick. */
  births: { id: string; name: string; parentIds: string[]; generation: number }[];
  deaths: { id: string; name: string; age: number; cause: string }[];
  /** Highest tech stage known to any living agent. */
  techStage: number;
  metrics: {
    alive: number;
    gathered: number; // total resource units collected (all kinds)
    communications: number; // speak/talk actions
    events: number; // successful actions
    traded: number; // units transferred via give
    socialEvents: number; // events started/ended
    moneySupply: number; // total money
    recipes: number; // distinct recipes known population-wide
    births: number; // total births so far
    deaths: number; // total deaths so far
  };
}