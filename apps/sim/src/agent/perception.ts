// 感知系统: 居民以身体感官认识世界 —— 视野有限的视觉、听觉、嗅觉与脚下触觉。
// 引擎/LLM 的决策输入只能是这份切片, 而不是整张地图。
import type { World, AgentState, Perception, TimeInfo, Weather, Biome } from "@elso/shared";
import { visionRadius, ambientTemperature } from "@elso/shared";

const BIOME_ZH: Record<Biome, string> = {
  "deep-water": "深海",
  water: "湖水",
  shallows: "浅滩",
  beach: "沙滩",
  snow: "雪原",
  tundra: "苔原",
  taiga: "针叶林",
  grassland: "草原",
  savanna: "稀树草原",
  desert: "荒漠",
  "temperate-forest": "温带森林",
  rainforest: "雨林",
  mountain: "山地",
  barren: "焦土",
};

/** 听觉半径(夜里更重要)。 */
const HEARING_RADIUS = 6;
/** 嗅觉半径。 */
const SMELL_RADIUS = 2;

export function perceiveAgent(
  world: World,
  agents: AgentState[],
  agent: AgentState,
  time: TimeInfo,
  weather: Weather
): Perception {
  const vr = visionRadius(time.phase, weather);
  const here = world.cells[agent.y]?.[agent.x];
  const airTemp = here
    ? ambientTemperature(here.temperature, time.phase, weather)
    : 20;

  // 视觉: 视野内所有格子(含资源与裸露矿物)。
  const vision: Perception["vision"] = [];
  for (let dy = -vr; dy <= vr; dy++) {
    for (let dx = -vr; dx <= vr; dx++) {
      if (dx === 0 && dy === 0) continue;
      const cell = world.cells[agent.y + dy]?.[agent.x + dx];
      if (!cell) continue;
      vision.push({
        dx,
        dy,
        biome: cell.biome,
        resource: cell.resourceKind && cell.resource > 0.08 ? cell.resourceKind : null,
        minerals: (cell.minerals ?? []).slice(0, 2),
      });
    }
  }

  // 听觉: 附近的人声与脚步(睡觉的人也会被吵醒)。
  const hearing: Perception["hearing"] = agents
    .filter(
      (a) =>
        a.id !== agent.id &&
        a.energy > 0 &&
        Math.abs(a.x - agent.x) <= HEARING_RADIUS &&
        Math.abs(a.y - agent.y) <= HEARING_RADIUS
    )
    .slice(0, 8)
    .map((a) => ({ id: a.id, name: a.name, gender: a.gender, dx: a.x - agent.x, dy: a.y - agent.y }));

  // 嗅觉: 水、矿石、雨与烟。
  const smells: string[] = [];
  let waterNear = false;
  for (let dy = -SMELL_RADIUS; dy <= SMELL_RADIUS && !waterNear; dy++) {
    for (let dx = -SMELL_RADIUS; dx <= SMELL_RADIUS; dx++) {
      const cell = world.cells[agent.y + dy]?.[agent.x + dx];
      if (cell && (cell.biome === "water" || cell.biome === "deep-water" || cell.biome === "shallows")) {
        waterNear = true;
        break;
      }
    }
  }
  if (waterNear) smells.push("水的气息");
  if (here && (here.minerals ?? []).length > 0) smells.push("矿石的味道");
  if (weather === "rain" || weather === "storm") smells.push("雨前的土腥味");
  if (weather === "snow") smells.push("雪的清冷");
  if ((agent.materials.fire ?? 0) > 0) smells.push("烟熏味");

  const light =
    time.phase === "day" ? "明亮" : time.phase === "night" ? "黑暗" : "昏暗";

  const ground = here
    ? `${BIOME_ZH[here.biome]}, ${here.moisture > 0.7 ? "湿润" : here.moisture < 0.25 ? "干燥" : "微潮"}的地面`
    : "未知之地";

  return { light, ground, airTemp: Math.round(airTemp), vision, hearing, smells };
}

/** 方位描述(供心声与提示词)。 */
export function directionOf(dx: number, dy: number): string {
  const ns = dy < 0 ? "北" : dy > 0 ? "南" : "";
  const ew = dx < 0 ? "西" : dx > 0 ? "东" : "";
  return ns + ew || "原地";
}

export { BIOME_ZH };
