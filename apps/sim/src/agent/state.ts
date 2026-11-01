import type { AgentState, MemoryEntry, Inventory, Gender } from "@elso/shared";
import { createRng, agentName } from "@elso/shared";

const BASE_LIFESPAN = 170; // ticks; founding band 140..230
const MUTATION = 0.12; // DNA mutation amplitude
const CHILD_ENERGY = 70;

export function createAgent(
  id: string,
  x: number,
  y: number,
  allIds: string[] = [],
  profession: AgentState["profession"] = "unemployed",
  seed = 1,
  birthTick = 0,
  parentIds: string[] = [],
  generation = 0,
  dna?: AgentState["dna"],
  gender?: Gender,
  name?: string,
  usedNames?: Set<string>
): AgentState {
  const rng = createRng(seed + id.charCodeAt(0) * 31 + id.length);
  const inventory: Inventory = { food: 2, wood: 0, stone: 0, ore: 0 };
  const relationships: Record<string, number> = {};
  for (const other of allIds) {
    if (other !== id) relationships[other] = 0;
  }
  // 身体: 性别与姓名确定性生成, 每个居民都是"某个人"而不是一个编号。
  const myGender: Gender = gender ?? (rng() < 0.5 ? "female" : "male");
  let nameHash = 0;
  for (let i = 0; i < id.length; i++) nameHash = (nameHash * 31 + id.charCodeAt(i)) | 0;
  let myName = name ?? agentName(seed, Math.abs(nameHash) % 10000, myGender);
  // 重名去重: 同名追加罗马数字后缀, 保证每个居民都有可区分的名字。
  if (usedNames) {
    if (usedNames.has(myName)) {
      let n = 2;
      while (usedNames.has(`${myName} ${toRoman(n)}`)) n++;
      myName = `${myName} ${toRoman(n)}`;
    }
    usedNames.add(myName);
  }
  return {
    id,
    name: myName,
    gender: myGender,
    x,
    y,
    thirst: 0,
    sleepiness: 0,
    awake: true,
    bodyTemp: 37,
    emotions: { joy: 0.35, fear: 0.05, anger: 0.05, sadness: 0.05 },
    energy: birthTick === 0 ? 100 : CHILD_ENERGY,
    hunger: 0,
    inventory,
    materials: {},
    knowledge: [],
    knownRecipes: [],
    experiments: [],
    generation,
    dna:
      dna ??
      {
        curiosity: 0.25 + rng() * 0.7,
        endurance: 0.25 + rng() * 0.7,
        intelligence: 0.25 + rng() * 0.7,
        lifespan: BASE_LIFESPAN + Math.floor(rng() * 90),
      },
    age: 0,
    health: 100,
    birthTick,
    parentIds,
    memory: [],
    relationships,
    plan: [],
    profession,
    money: 10,
    mood: 0.5,
    skills: {},
  };
}

/** Sexual DNA: per-trait blend of both parents plus a small mutation. */
export function mixDNA(
  a: AgentState["dna"],
  b: AgentState["dna"],
  rng: () => number
): AgentState["dna"] {
  const blend = (x: number, y: number) => {
    const base = x * 0.5 + y * 0.5;
    return Math.max(0.05, Math.min(1, base + (rng() - 0.5) * 2 * MUTATION));
  };
  const lifespan = Math.round(
    Math.max(60, a.lifespan * 0.5 + b.lifespan * 0.5 + (rng() - 0.5) * 2 * MUTATION * 60)
  );
  return {
    curiosity: blend(a.curiosity, b.curiosity),
    endurance: blend(a.endurance, b.endurance),
    intelligence: blend(a.intelligence, b.intelligence),
    lifespan,
  };
}

export function addMemory(
  agent: AgentState,
  tick: number,
  kind: MemoryEntry["kind"],
  text: string,
  importance = 0.5,
  max = 16
): void {
  agent.memory.push({ tick, kind, text, importance });
  if (agent.memory.length > max) agent.memory.shift();
}

export function adjustRelationship(agent: AgentState, otherId: string, delta: number): void {
  if (agent.relationships[otherId] === undefined) agent.relationships[otherId] = 0;
  agent.relationships[otherId] = Math.max(-1, Math.min(1, agent.relationships[otherId] + delta));
}

export function toRoman(n: number): string {
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
  let out = "";
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) {
      out += syms[i];
      n -= vals[i];
    }
  }
  return out;
}
