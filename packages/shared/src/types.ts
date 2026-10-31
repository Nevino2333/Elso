export type TerrainType = "water" | "land";

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
}

export interface AgentState {
  id: string;
  x: number;
  y: number;
  energy: number; // 0..100
  hunger: number; // 0..100
  inventory: Inventory;
  memory: string[]; // last N events
}

export type ActionType = "move" | "gather" | "eat" | "rest" | "speak" | "give";

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
    communications: number; // speak actions
    events: number; // successful actions
    traded: number; // units transferred via give
  };
}