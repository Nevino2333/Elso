export interface ElementSpec {
  symbol: string;
  name: string;
  atomicNumber: number;
  mass: number; // g/mol approx
  state: "solid" | "liquid" | "gas";
  reactivity: number; // 0..1
}

export const ELEMENTS: ElementSpec[] = [
  { symbol: "H", name: "Hydrogen", atomicNumber: 1, mass: 1, state: "gas", reactivity: 0.9 },
  { symbol: "O", name: "Oxygen", atomicNumber: 8, mass: 16, state: "gas", reactivity: 0.8 },
  { symbol: "C", name: "Carbon", atomicNumber: 6, mass: 12, state: "solid", reactivity: 0.5 },
  { symbol: "N", name: "Nitrogen", atomicNumber: 7, mass: 14, state: "gas", reactivity: 0.4 },
  { symbol: "Fe", name: "Iron", atomicNumber: 26, mass: 56, state: "solid", reactivity: 0.6 },
  { symbol: "Si", name: "Silicon", atomicNumber: 14, mass: 28, state: "solid", reactivity: 0.3 },
  { symbol: "Na", name: "Sodium", atomicNumber: 11, mass: 23, state: "solid", reactivity: 0.95 },
  { symbol: "Cl", name: "Chlorine", atomicNumber: 17, mass: 35.5, state: "gas", reactivity: 0.85 },
  { symbol: "Ca", name: "Calcium", atomicNumber: 20, mass: 40, state: "solid", reactivity: 0.7 },
  { symbol: "Cu", name: "Copper", atomicNumber: 29, mass: 63.5, state: "solid", reactivity: 0.4 },
];

export interface CompoundSpec {
  formula: string;
  name: string;
  elements: Record<string, number>;
  state: "solid" | "liquid" | "gas";
  energy: number; // energy released/absorbed per unit (positive = exothermic)
}

export const COMPOUNDS: CompoundSpec[] = [
  { formula: "H2O", name: "Water", elements: { H: 2, O: 1 }, state: "liquid", energy: 0 },
  { formula: "CO2", name: "Carbon Dioxide", elements: { C: 1, O: 2 }, state: "gas", energy: 0 },
  { formula: "CH4", name: "Methane", elements: { C: 1, H: 4 }, state: "gas", energy: 10 },
  { formula: "Fe2O3", name: "Rust", elements: { Fe: 2, O: 3 }, state: "solid", energy: 5 },
  { formula: "NaCl", name: "Salt", elements: { Na: 1, Cl: 1 }, state: "solid", energy: 2 },
  { formula: "CaCO3", name: "Limestone", elements: { Ca: 1, C: 1, O: 3 }, state: "solid", energy: 3 },
  { formula: "SiO2", name: "Silica", elements: { Si: 1, O: 2 }, state: "solid", energy: 1 },
  { formula: "CuSO4", name: "Copper Sulfate", elements: { Cu: 1, S: 1, O: 4 }, state: "solid", energy: 4 },
];

export interface ReactionSpec {
  inputs: string[]; // formulas or element symbols
  outputs: string[];
  condition: "heat" | "catalyst" | "any";
  energy: number;
}

export const REACTIONS: ReactionSpec[] = [
  { inputs: ["H", "O"], outputs: ["H2O"], condition: "any", energy: 15 },
  { inputs: ["C", "O"], outputs: ["CO2"], condition: "heat", energy: 12 },
  { inputs: ["Fe", "O"], outputs: ["Fe2O3"], condition: "any", energy: 8 },
  { inputs: ["Na", "Cl"], outputs: ["NaCl"], condition: "any", energy: 6 },
  { inputs: ["Ca", "C", "O"], outputs: ["CaCO3"], condition: "any", energy: 5 },
  { inputs: ["Si", "O"], outputs: ["SiO2"], condition: "heat", energy: 7 },
  { inputs: ["H2O", "CO2"], outputs: ["H2CO3"], condition: "any", energy: 2 },
];

export function findElement(symbol: string): ElementSpec | undefined {
  return ELEMENTS.find((e) => e.symbol === symbol);
}

export function findCompound(formula: string): CompoundSpec | undefined {
  return COMPOUNDS.find((c) => c.formula === formula);
}