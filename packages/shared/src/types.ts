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
  x: number;
  y: number;
  energy: number; // 0..100
  hunger: number; // 0..100
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
  | "rest_at_home";

export interface Action {
  type: ActionType;
  payload?: Record<string, unknown>;
}

export interface TickLog {
  tick: number;
  seed: number;
  /** Emitted on tick 0 only so the viewer can render terrain without the generator. */
  world?: World;
  agents: AgentState[];
  actions: { agentId: string; action: Action; result?: string }[];
  metrics: {
    alive: number;
    gathered: number; // total resource units collected (all kinds)
    communications: number; // speak/talk actions
    events: number; // successful actions
    traded: number; // units transferred via give
    socialEvents: number; // events started/ended
    moneySupply: number; // total money
  };
}