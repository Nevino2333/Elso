/**
 * Symbolic-but-principled chemistry & technology tree.
 *
 * Elements carry real physical numbers (atomic mass, reactivity); minerals are
 * real chemical species with formulas, hardness (Mohs) and density; every recipe
 * conserves nothing we do not track but states its inputs, condition and outputs
 * so agents can rediscover the same laws humans did: knap stone, strike fire,
 * char wood, fire clay, smelt ore, alloy metals.
 */

export interface ElementSpec {
  symbol: string;
  name: string;
  atomicNumber: number;
  mass: number; // g/mol
  state: "solid" | "liquid" | "gas";
  reactivity: number; // 0..1
}

export const ELEMENTS: ElementSpec[] = [
  { symbol: "H", name: "Hydrogen", atomicNumber: 1, mass: 1.008, state: "gas", reactivity: 0.9 },
  { symbol: "C", name: "Carbon", atomicNumber: 6, mass: 12.011, state: "solid", reactivity: 0.5 },
  { symbol: "O", name: "Oxygen", atomicNumber: 8, mass: 15.999, state: "gas", reactivity: 0.8 },
  { symbol: "Na", name: "Sodium", atomicNumber: 11, mass: 22.99, state: "solid", reactivity: 0.95 },
  { symbol: "Si", name: "Silicon", atomicNumber: 14, mass: 28.085, state: "solid", reactivity: 0.3 },
  { symbol: "S", name: "Sulfur", atomicNumber: 16, mass: 32.06, state: "solid", reactivity: 0.7 },
  { symbol: "Cl", name: "Chlorine", atomicNumber: 17, mass: 35.45, state: "gas", reactivity: 0.85 },
  { symbol: "K", name: "Potassium", atomicNumber: 19, mass: 39.098, state: "solid", reactivity: 0.9 },
  { symbol: "Ca", name: "Calcium", atomicNumber: 20, mass: 40.078, state: "solid", reactivity: 0.7 },
  { symbol: "Fe", name: "Iron", atomicNumber: 26, mass: 55.845, state: "solid", reactivity: 0.6 },
  { symbol: "Cu", name: "Copper", atomicNumber: 29, mass: 63.546, state: "solid", reactivity: 0.4 },
  { symbol: "Sn", name: "Tin", atomicNumber: 50, mass: 118.71, state: "solid", reactivity: 0.3 },
];

/** Minerals agents can find embedded in terrain cells. */
export interface MineralSpec {
  id: string;
  name: string;
  formula: string; // molecular formula shown to the player
  elements: Record<string, number>;
  hardness: number; // Mohs 1..10
  density: number; // g/cm3
  color: string; // css color for the viewer
  depth: "surface" | "shallow" | "deep";
}

export const MINERALS: MineralSpec[] = [
  { id: "flint", name: "Flint", formula: "SiO2", elements: { Si: 1, O: 2 }, hardness: 7, density: 2.65, color: "#4a4a55", depth: "surface" },
  { id: "clay", name: "Kaolinite clay", formula: "Al2Si2O5(OH)4", elements: { Al: 2, Si: 2, O: 9, H: 4 }, hardness: 2, density: 2.6, color: "#b0623c", depth: "surface" },
  { id: "peat", name: "Peat (young coal)", formula: "C·H2O", elements: { C: 1, H: 2, O: 1 }, hardness: 1.5, density: 1.1, color: "#4d3a24", depth: "surface" },
  { id: "halite", name: "Halite", formula: "NaCl", elements: { Na: 1, Cl: 1 }, hardness: 2.5, density: 2.17, color: "#dfe3ea", depth: "surface" },
  { id: "gypsum", name: "Gypsum", formula: "CaSO4·2H2O", elements: { Ca: 1, S: 1, O: 6, H: 4 }, hardness: 2, density: 2.32, color: "#cfd8dc", depth: "shallow" },
  { id: "hematite", name: "Hematite", formula: "Fe2O3", elements: { Fe: 2, O: 3 }, hardness: 5.5, density: 5.26, color: "#8a2b23", depth: "shallow" },
  { id: "magnetite", name: "Magnetite", formula: "Fe3O4", elements: { Fe: 3, O: 4 }, hardness: 6, density: 5.17, color: "#2e2e34", depth: "deep" },
  { id: "chalcopyrite", name: "Chalcopyrite", formula: "CuFeS2", elements: { Cu: 1, Fe: 1, S: 2 }, hardness: 3.5, density: 4.2, color: "#c9962c", depth: "deep" },
  { id: "cassiterite", name: "Cassiterite", formula: "SnO2", elements: { Sn: 1, O: 2 }, hardness: 6.5, density: 6.99, color: "#7d5a3c", depth: "deep" },
  { id: "quartz", name: "Quartz", formula: "SiO2", elements: { Si: 1, O: 2 }, hardness: 7, density: 2.65, color: "#e8e2d8", depth: "surface" },
];

/** Smelted / crafted materials referenced by recipes. */
export const MATERIALS: Record<string, { name: string; formula: string }> = {
  charcoal: { name: "Charcoal", formula: "C" },
  fire: { name: "Fire", formula: "C + O2 → CO2 (exothermic)" },
  pottery: { name: "Fired pottery", formula: "Al2Si2O7 (dehydroxylated clay)" },
  quicklime: { name: "Quicklime", formula: "CaO" },
  copper: { name: "Copper metal", formula: "Cu" },
  iron: { name: "Iron metal", formula: "Fe" },
  tin: { name: "Tin metal", formula: "Sn" },
  bronze: { name: "Bronze", formula: "Cu·Sn (alloy)" },
  glass: { name: "Glass", formula: "SiO2 (amorphous)" },
  stone_axe: { name: "Stone axe", formula: "SiO2 edge + wood haft" },
  iron_tool: { name: "Iron tool", formula: "Fe head + wood haft" },
  cooked_meal: { name: "Cooked meal", formula: "cooked C/H/O compounds" },
};

export type CraftCondition = "none" | "fire";

export interface RecipeSpec {
  id: string;
  name: string;
  /** Civilisation stage: 0 stone age, 1 fire, 2 pottery/charcoal, 3 smelting, 4 alloys/tools. */
  tech: number;
  /** Recipe ids that must be known before this one can be learned or taught. */
  requires: string[];
  inputs: Record<string, number>; // mineral/material id -> units
  condition: CraftCondition;
  outputs: Record<string, number>;
  note: string; // human-readable chemistry, logged as discovered knowledge
}

/**
 * Ordered so that teaching "the next thing" is literally walking this list:
 * each entry only depends on earlier entries.
 */
export const RECIPES: RecipeSpec[] = [
  {
    id: "knap_flint",
    name: "Knapped flint",
    tech: 0,
    requires: [],
    inputs: { flint: 1 },
    condition: "none",
    outputs: { stone_axe: 1 },
    note: "Conchoidal fracture of SiO2 gives a sharp edge.",
  },
  {
    id: "make_fire",
    name: "Fire",
    tech: 1,
    requires: ["knap_flint"],
    inputs: { flint: 1, peat: 1 },
    condition: "none",
    outputs: { fire: 1 },
    note: "Pyrite-free striking sparks + peat tinder: C + O2 -> CO2, exothermic.",
  },
  {
    id: "charcoal",
    name: "Charcoal",
    tech: 2,
    requires: ["make_fire"],
    inputs: { peat: 2, fire: 1 },
    condition: "fire",
    outputs: { charcoal: 2 },
    note: "Pyrolysis removes volatiles leaving near-pure carbon.",
  },
  {
    id: "pottery",
    name: "Fired pottery",
    tech: 2,
    requires: ["make_fire"],
    inputs: { clay: 2, fire: 1 },
    condition: "fire",
    outputs: { pottery: 1 },
    note: "Clay dehydroxylates above ~600C into hard Al2Si2O7.",
  },
  {
    id: "cook_meal",
    name: "Cooked meal",
    tech: 2,
    requires: ["make_fire"],
    inputs: { fire: 1 },
    condition: "fire",
    outputs: { cooked_meal: 1 },
    note: "Cooking gelatinises starch and denatures protein: more energy per meal.",
  },
  {
    id: "quicklime",
    name: "Quicklime",
    tech: 2,
    requires: ["charcoal"],
    inputs: { gypsum: 2, fire: 1 },
    condition: "fire",
    outputs: { quicklime: 1 },
    note: "CaSO4·2H2O calcines to CaO + SOx + steam.",
  },
  {
    id: "smelt_copper",
    name: "Copper smelting",
    tech: 3,
    requires: ["charcoal", "pottery"],
    inputs: { chalcopyrite: 2, charcoal: 1, fire: 1 },
    condition: "fire",
    outputs: { copper: 2 },
    note: "Carbon reduces CuFeS2 at ~1100C: Cu drops as metal, Fe slags.",
  },
  {
    id: "smelt_tin",
    name: "Tin smelting",
    tech: 3,
    requires: ["charcoal", "pottery"],
    inputs: { cassiterite: 2, charcoal: 1, fire: 1 },
    condition: "fire",
    outputs: { tin: 2 },
    note: "SnO2 + 2C -> Sn + 2CO at ~1300C.",
  },
  {
    id: "smelt_iron",
    name: "Iron smelting",
    tech: 3,
    requires: ["smelt_copper"],
    inputs: { hematite: 2, charcoal: 2, fire: 1 },
    condition: "fire",
    outputs: { iron: 2 },
    note: "Fe2O3 + 3CO -> 2Fe + 3CO2 in a bloomery furnace.",
  },
  {
    id: "bronze",
    name: "Bronze",
    tech: 4,
    requires: ["smelt_copper", "smelt_tin"],
    inputs: { copper: 2, tin: 1, fire: 1 },
    condition: "fire",
    outputs: { bronze: 2 },
    note: "Cu-Sn solid solution: harder than either parent metal.",
  },
  {
    id: "iron_tool",
    name: "Iron tool",
    tech: 4,
    requires: ["smelt_iron"],
    inputs: { iron: 2 },
    condition: "none",
    outputs: { iron_tool: 1 },
    note: "Forged Fe head on a haft: multiplies gather and build yield.",
  },
  {
    id: "glass",
    name: "Glass",
    tech: 4,
    requires: ["smelt_iron"],
    inputs: { quartz: 2, fire: 1 },
    condition: "fire",
    outputs: { glass: 1 },
    note: "Quartz melts to an amorphous SiO2 melt above 1700C.",
  },
];

export const RECIPE_BY_ID: Record<string, RecipeSpec> = Object.fromEntries(
  RECIPES.map((r) => [r.id, r])
);

export const MINERAL_BY_ID: Record<string, MineralSpec> = Object.fromEntries(
  MINERALS.map((m) => [m.id, m])
);

/** Formula (or name) shown for any carried material/mineral id. */
export function describeMaterial(id: string): string {
  const min = MINERAL_BY_ID[id];
  if (min) return `${min.name} ${min.formula}`;
  const mat = MATERIALS[id];
  if (mat) return `${mat.name} ${mat.formula}`;
  return id;
}

/**
 * Does this agent satisfy the prerequisites of a recipe?
 * Teaching and independent discovery both route through here: nobody can learn
 * iron smelting before they hold fire, charcoal and pottery.
 */
export function prerequisitesMet(known: string[], recipe: RecipeSpec): boolean {
  return recipe.requires.every((r) => known.includes(r));
}

/** Find the first recipe unlocked by `known` that is not yet known (curriculum order). */
export function nextRecipeToLearn(known: string[]): RecipeSpec | null {
  for (const r of RECIPES) {
    if (known.includes(r.id)) continue;
    if (prerequisitesMet(known, r)) return r;
  }
  return null;
}

/** Match a free-form experiment against the recipe table (order-insensitive on ids). */
export function matchRecipe(
  inputs: Record<string, number>,
  condition: CraftCondition
): RecipeSpec | null {
  const ids = Object.keys(inputs).filter((k) => (inputs[k] ?? 0) > 0);
  for (const r of RECIPES) {
    const need = Object.keys(r.inputs);
    if (need.length !== ids.length) continue;
    if (r.condition !== condition) continue;
    if (!need.every((k) => ids.includes(k) && (inputs[k] ?? 0) >= r.inputs[k])) continue;
    return r;
  }
  return null;
}

/** Civilisation stage = highest tech among all recipes the population knows. */
export function techStageOf(known: string[]): number {
  let stage = 0;
  for (const id of known) {
    const r = RECIPE_BY_ID[id];
    if (r && r.tech > stage) stage = r.tech;
  }
  return stage;
}

export const TECH_NAMES = [
  "Stone age",
  "Fire",
  "Pottery & charcoal",
  "Smelting",
  "Alloys & tools",
];
