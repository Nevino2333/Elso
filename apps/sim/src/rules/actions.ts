import type { World, AgentState, Action, ResourceKind } from "@elso/shared";
import {
  matchRecipe,
  prerequisitesMet,
  nextRecipeToLearn,
  describeMaterial,
  RECIPE_BY_ID,
} from "@elso/shared";

export interface ActionResult {
  ok: boolean;
  message: string;
  /** Set when this action produced a first-time discovery (engine logs it). */
  discovered?: string;
  discoveredVia?: "experiment" | "teach";
}

function manhattan(a: AgentState, b: AgentState): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function executeAction(
  world: World,
  agents: AgentState[],
  agent: AgentState,
  action: Action
): ActionResult {
  switch (action.type) {
    case "move": {
      const dx = (action.payload?.dx as number) ?? 0;
      const dy = (action.payload?.dy as number) ?? 0;
      const nx = Math.max(0, Math.min(world.width - 1, agent.x + dx));
      const ny = Math.max(0, Math.min(world.height - 1, agent.y + dy));
      const cell = world.cells[ny]?.[nx];
      if (!cell || cell.terrain === "water") return { ok: false, message: "blocked" };
      agent.x = nx;
      agent.y = ny;
      agent.energy = Math.max(0, agent.energy - 2);
      return { ok: true, message: `moved to ${nx},${ny}` };
    }
    case "gather": {
      const cell = world.cells[agent.y]?.[agent.x];
      if (!cell || cell.terrain === "water") return { ok: false, message: "no resource" };
      const parts: string[] = [];
      // Organic stock (food/wood/...) — same behaviour as before.
      if (cell.resourceKind && cell.resource > 0) {
        const kind = cell.resourceKind as ResourceKind;
        const amt = Math.min(cell.resource, 0.35);
        cell.resource -= amt;
        agent.inventory[kind] += amt;
        agent.energy = Math.min(100, agent.energy + amt * 12);
        parts.push(`${amt.toFixed(2)} ${kind}`);
      }
      // Embedded minerals (flint, hematite, ...): agents carry them in `materials`.
      let mined = 0;
      for (const min of cell.minerals ?? []) {
        if (mined >= 1) break;
        agent.materials[min] = (agent.materials[min] ?? 0) + 0.5;
        mined += 0.5;
      }
      // 草药采集: 森林/草原/雨林中可能采到药材。
      if (cell.biome === "temperate-forest" || cell.biome === "rainforest" || cell.biome === "taiga" || cell.biome === "grassland") {
        agent.medicine = Math.min(20, (agent.medicine ?? 0) + 0.2);
      }
      return { ok: true, message: `gathered ${parts.join(", ")}` };
    }
    case "eat": {
      if (agent.hunger < 20) return { ok: false, message: "not hungry" };
      if (agent.inventory.food < 1) return { ok: false, message: "no food" };
      agent.inventory.food -= 1;
      agent.hunger = Math.max(0, agent.hunger - 30);
      agent.energy = Math.min(100, agent.energy + 15);
      return { ok: true, message: "ate 1 food" };
    }
    case "rest": {
      agent.energy = Math.min(100, agent.energy + 10);
      agent.hunger = Math.min(100, agent.hunger + 1);
      agent.sleepiness = Math.max(0, agent.sleepiness - 4);
      return { ok: true, message: "rested" };
    }
    case "drink": {
      // 身体: 必须站在水边(自身或四邻有水体)才能喝到水。
      const nearWater = (x: number, y: number) => {
        const c = world.cells[y]?.[x];
        return !!c && (c.terrain === "water" || c.biome === "shallows");
      };
      const byWater =
        nearWater(agent.x, agent.y) ||
        nearWater(agent.x + 1, agent.y) ||
        nearWater(agent.x - 1, agent.y) ||
        nearWater(agent.x, agent.y + 1) ||
        nearWater(agent.x, agent.y - 1);
      if (!byWater) return { ok: false, message: "no water within reach" };
      if (agent.thirst < 10) return { ok: false, message: "not thirsty" };
      agent.thirst = Math.max(0, agent.thirst - 40);
      return { ok: true, message: "drank cool water" };
    }
    case "sleep": {
      if (!agent.awake) return { ok: false, message: "already asleep" };
      agent.awake = false;
      return { ok: true, message: "fell asleep" };
    }
    case "give": {
      const toId = action.payload?.to as string;
      const kind = (action.payload?.kind as ResourceKind) ?? "food";
      const requested = (action.payload?.amount as number) ?? 1;
      const target = agents.find((a) => a.id === toId);
      if (!target) return { ok: false, message: "no target" };
      if (target === agent) return { ok: false, message: "give to self" };
      if (manhattan(agent, target) > 2) return { ok: false, message: "too far" };
      const amt = Math.min(requested, agent.inventory[kind]);
      if (amt <= 0) return { ok: false, message: `no ${kind}` };
      agent.inventory[kind] -= amt;
      target.inventory[kind] += amt;
      return { ok: true, message: `gave ${amt.toFixed(2)} ${kind} to ${target.id}` };
    }
    case "talk": {
      const toId = action.payload?.to as string;
      const text = (action.payload?.text as string) ?? "";
      const target = agents.find((a) => a.id === toId);
      if (!target) return { ok: false, message: "no target" };
      if (target === agent) return { ok: false, message: "talk to self" };
      if (manhattan(agent, target) > 2) return { ok: false, message: "too far" };
      // Affinity grows with conversation.
      const cur = agent.relationships[toId] ?? 0;
      agent.relationships[toId] = Math.max(-1, Math.min(1, cur + 0.05));
      if (target.relationships[agent.id] === undefined) target.relationships[agent.id] = 0;
      target.relationships[agent.id] = Math.max(-1, Math.min(1, target.relationships[agent.id] + 0.03));
      return { ok: true, message: `talked to ${target.id}: ${text}` };
    }
    case "craft": {
      const recipe = action.payload?.recipe as string;
      if (recipe === "tool") {
        if (agent.inventory.wood < 1 || agent.inventory.stone < 1) {
          return { ok: false, message: "missing materials" };
        }
        agent.inventory.wood -= 1;
        agent.inventory.stone -= 1;
        agent.energy = Math.min(100, agent.energy + 8);
        return { ok: true, message: "crafted tool" };
      }
      if (recipe === "meal") {
        if (agent.inventory.food < 2) return { ok: false, message: "not enough food" };
        agent.inventory.food -= 2;
        agent.hunger = Math.max(0, agent.hunger - 15);
        agent.energy = Math.min(100, agent.energy + 5);
        return { ok: true, message: "crafted meal" };
      }
      return { ok: false, message: "unknown recipe" };
    }
    case "work": {
      const b = world.buildings.find((x) => x.id === agent.workplaceId);
      const pay = agent.profession === "artist" ? 4 : agent.profession === "merchant" ? 5 : 3;
      agent.money += pay;
      agent.energy = Math.max(0, agent.energy - 3);
      agent.skills[agent.profession] = (agent.skills[agent.profession] ?? 0) + 0.1;
      return { ok: true, message: `worked (${agent.profession}) +${pay} money` };
    }
    case "trade": {
      const toId = action.payload?.to as string;
      const kind = (action.payload?.kind as ResourceKind) ?? "food";
      const price = (action.payload?.price as number) ?? 2;
      const target = agents.find((a) => a.id === toId);
      if (!target) return { ok: false, message: "no target" };
      if (manhattan(agent, target) > 2) return { ok: false, message: "too far" };
      if (agent.inventory[kind] < 1) return { ok: false, message: `no ${kind}` };
      if (target.money < price) return { ok: false, message: "buyer broke" };
      agent.inventory[kind] -= 1;
      target.inventory[kind] += 1;
      agent.money += price;
      target.money -= price;
      return { ok: true, message: `traded 1 ${kind} for ${price} money` };
    }
    case "build": {
      const kind = action.payload?.kind as any;
      const cost = kind === "home" ? 8 : 12;
      if (agent.money < cost) return { ok: false, message: "not enough money" };
      const x = agent.x;
      const y = agent.y;
      if (world.buildings.some((b) => b.x === x && b.y === y)) return { ok: false, message: "occupied" };
      agent.money -= cost;
      const id = `b${world.buildings.length}`;
      world.buildings.push({ id, kind, x, y, capacity: kind === "home" ? 1 : 4, ownerId: kind === "home" ? agent.id : undefined });
      if (kind === "home") agent.homeBuildingId = id;
      return { ok: true, message: `built ${kind}` };
    }
    case "attend": {
      const eventId = action.payload?.eventId as string;
      const ev = world.events.find((e) => e.id === eventId);
      if (!ev) return { ok: false, message: "no event" };
      if (manhattan(agent, { x: ev.x, y: ev.y } as any) > 3) return { ok: false, message: "too far" };
      if (ev.attendees.includes(agent.id)) return { ok: false, message: "already attending" };
      ev.attendees.push(agent.id);
      agent.mood = Math.min(1, agent.mood + 0.1);
      return { ok: true, message: `attended ${ev.title}` };
    }
    case "perform": {
      const stage = world.buildings.find((b) => b.kind === "stage" && manhattan(b as any, agent) <= 1);
      if (!stage) return { ok: false, message: "no stage" };
      agent.money += 6;
      agent.mood = Math.min(1, agent.mood + 0.15);
      agent.skills.artist = (agent.skills.artist ?? 0) + 0.2;
      return { ok: true, message: "performed on stage" };
    }
    case "play": {
      const toId = action.payload?.to as string;
      const target = agents.find((a) => a.id === toId);
      if (!target) return { ok: false, message: "no target" };
      if (manhattan(agent, target) > 2) return { ok: false, message: "too far" };
      agent.mood = Math.min(1, agent.mood + 0.08);
      target.mood = Math.min(1, target.mood + 0.08);
      const cur = agent.relationships[toId] ?? 0;
      agent.relationships[toId] = Math.max(-1, Math.min(1, cur + 0.06));
      if (target.relationships[agent.id] === undefined) target.relationships[agent.id] = 0;
      target.relationships[agent.id] = Math.max(-1, Math.min(1, target.relationships[agent.id] + 0.06));
      return { ok: true, message: `played with ${target.id}` };
    }
    case "rest_at_home": {
      const home = world.buildings.find((b) => b.id === agent.homeBuildingId);
      if (!home || manhattan(home as any, agent) > 1) return { ok: false, message: "not at home" };
      agent.energy = Math.min(100, agent.energy + 15);
      agent.hunger = Math.min(100, agent.hunger - 3);
      agent.mood = Math.min(1, agent.mood + 0.05);
      return { ok: true, message: "rested at home" };
    }
    case "experiment":
    case "smelt": {
      // Free-form trial-and-error against the reaction table. Agents start from
      // zero: an experiment only succeeds when inputs + condition match a recipe
      // whose prerequisites the agent already understands.
      const inputs = (action.payload?.inputs as string[]) ?? [];
      const condition = action.type === "smelt" ? "fire" : ((action.payload?.condition as any) ?? "none");
      const has = (id: string) => (agent.materials[id] ?? 0) > 0;
      const bag: Record<string, number> = {};
      // 配方按真实携带数量匹配(烧陶要 2 份黏土, 不是 1 份)。
      for (const id of inputs) if (has(id)) bag[id] = agent.materials[id];
      const record = (success: boolean) => {
        agent.experiments.push({ tick: -1, inputs, condition, success });
        if (agent.experiments.length > 12) agent.experiments.shift();
      };
      const recipe = matchRecipe(bag, condition);
      if (!recipe) {
        record(false);
        return { ok: false, message: `experiment failed: ${inputs.join("+") || "nothing"} × ${condition} → no reaction` };
      }
      if (!prerequisitesMet(agent.knownRecipes, recipe)) {
        record(false);
        return { ok: false, message: `experiment fizzled: needs prior knowledge (${recipe.requires.join(", ") || "none"})` };
      }
      // Consume inputs, produce outputs.
      for (const [id, n] of Object.entries(recipe.inputs)) {
        agent.materials[id] = Math.max(0, (agent.materials[id] ?? 0) - n);
      }
      for (const [id, n] of Object.entries(recipe.outputs)) {
        agent.materials[id] = (agent.materials[id] ?? 0) + n;
      }
      agent.energy = Math.max(0, agent.energy - 4);
      record(true);
      const first = !agent.knownRecipes.includes(recipe.id);
      if (first) {
        agent.knownRecipes.push(recipe.id);
        agent.knowledge.push(`${recipe.name}: ${recipe.note}`);
        if (agent.knowledge.length > 16) agent.knowledge.shift();
      }
      return {
        ok: true,
        message: `${first ? "DISCOVERED" : "repeated"} ${recipe.name} (${Object.keys(recipe.outputs).map(describeMaterial).join(", ")})`,
        discovered: first ? recipe.id : undefined,
        discoveredVia: "experiment",
      };
    }
    case "teach": {
      // Progressive teaching: hand over the *next* recipe in the curriculum,
      // never the whole library at once.
      const toId = action.payload?.to as string;
      const student = agents.find((a) => a.id === toId);
      if (!student || student === agent) return { ok: false, message: "no student" };
      if (manhattan(agent, student) > 2) return { ok: false, message: "too far" };
      const next = nextRecipeToLearn(student.knownRecipes);
      if (!next) return { ok: false, message: "student knows the whole curriculum" };
      if (!agent.knownRecipes.includes(next.id)) {
        return { ok: false, message: `teacher does not know ${next.name} yet` };
      }
      // Learning speed: curiosity + intelligence of the student vs recipe stage.
      const aptitude = 0.3 + 0.7 * (student.dna.intelligence * 0.6 + student.dna.curiosity * 0.4);
      const hash = ((agent.x * 31 + student.y * 17 + agent.knownRecipes.length * 7 + student.experiments.length) % 100) / 100;
      if (hash > aptitude) {
        student.experiments.push({ tick: -1, inputs: [next.id], condition: "lesson", success: false });
        return { ok: false, message: `lesson on ${next.name} did not stick` };
      }
      student.knownRecipes.push(next.id);
      student.knowledge.push(`${next.name} (taught by ${agent.id}): ${next.note}`);
      if (student.knowledge.length > 16) student.knowledge.shift();
      // Teaching bonds teacher and student.
      const cur = agent.relationships[student.id] ?? 0;
      agent.relationships[student.id] = Math.min(1, cur + 0.08);
      student.relationships[agent.id] = Math.min(1, (student.relationships[agent.id] ?? 0) + 0.12);
      return {
        ok: true,
        message: `taught ${student.id} → ${next.name}`,
        discovered: next.id,
        discoveredVia: "teach",
      };
    }
    case "heal": {
      const sick = agent.illness;
      if (!sick) return { ok: false, message: "not sick" };
      if ((agent.medicine ?? 0) < 1) return { ok: false, message: "no medicine" };
      agent.medicine = (agent.medicine ?? 0) - 1;
      agent.illness = null;
      agent.health = Math.min(100, agent.health + 25);
      return { ok: true, message: `healed from ${sick}` };
    }
    case "speak": {
      return { ok: true, message: `said: ${action.payload?.text ?? ""}` };
    }
    default:
      return { ok: false, message: "unknown action" };
  }
}