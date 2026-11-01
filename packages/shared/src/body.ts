// 赋身层 (Embodiment): 时间、天气、姓名、感官与生理。
// 这个世界不是一个人的舞台 —— 每一个居民都有名字、身体、昼夜与体温。
import type { DayPhase, TimeInfo, Weather, Gender, Emotions } from "./types.ts";
import { createRng } from "./rng.ts";

/** 1 tick = 1 小时。 */
export const TICKS_PER_DAY = 24;

export function timeOfDay(tick: number): TimeInfo {
  const day = Math.floor(tick / TICKS_PER_DAY) + 1;
  const hour = ((tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  return { day, hour, phase: phaseOf(hour) };
}

export function phaseOf(hour: number): DayPhase {
  if (hour >= 5 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 17) return "day";
  if (hour >= 17 && hour < 19) return "dusk";
  return "night";
}

/** 一天当中的确定性天气(整个星球共享, 寒冷星球允许降雪)。 */
export function weatherAt(seed: number, day: number, coldPlanet = false): Weather {
  const rng = createRng(seed * 7919 + day * 131 + 17);
  const r = rng();
  if (r < 0.5) return "clear";
  if (r < 0.72) return "cloudy";
  if (r < 0.86) return "rain";
  if (r < 0.93) return "storm";
  return coldPlanet ? "snow" : "rain";
}

/** 体感温度(°C): 纬向基础温度 + 昼夜 + 天气修正。 */
export function ambientTemperature(cellTemp: number, phase: DayPhase, weather: Weather): number {
  let t = -25 + cellTemp * 60; // -25..35 °C
  if (phase === "day") t += 3;
  else if (phase === "night") t -= 6;
  else if (phase === "dawn") t -= 3;
  if (weather === "rain") t -= 2;
  if (weather === "storm") t -= 4;
  if (weather === "snow") t -= 8;
  return Math.max(-40, Math.min(45, t));
}

/** 视野半径: 白天5格, 夜晚2格, 恶劣天气进一步收缩。 */
export function visionRadius(phase: DayPhase, weather: Weather): number {
  let r = phase === "day" ? 5 : phase === "night" ? 2 : 4;
  if (weather === "rain" || weather === "storm") r -= 1;
  if (weather === "snow") r -= 2;
  return Math.max(1, r);
}

// ---------------------------------------------------------------------------
// 生命周期与身体状态

export type LifeStage = "child" | "youth" | "adult" | "elder";

export function lifeStageOf(age: number, lifespan: number): LifeStage {
  if (age < 30) return "child";
  if (age < 60) return "youth";
  if (age < lifespan * 0.75) return "adult";
  return "elder";
}

export const LIFE_STAGE_ZH: Record<LifeStage, string> = {
  child: "幼年",
  youth: "青年",
  adult: "壮年",
  elder: "暮年",
};

export type BodyComfort = "freezing" | "cold" | "comfort" | "hot" | "fever";

export function bodyComfortOf(t: number): BodyComfort {
  if (t < 34.5) return "freezing";
  if (t < 36.2) return "cold";
  if (t <= 37.8) return "comfort";
  if (t <= 39) return "hot";
  return "fever";
}

export const BODY_COMFORT_ZH: Record<BodyComfort, string> = {
  freezing: "失温",
  cold: "寒冷",
  comfort: "舒适",
  hot: "燥热",
  fever: "高热",
};

// ---------------------------------------------------------------------------
// 姓名: 确定性音节拼装, 男名/女名风格不同

const FEMALE_A = ["El", "Ly", "Na", "Mi", "Se", "Ka", "Ri", "Ta", "Ve", "Yu", "Sae", "No", "Fay", "Iri", "Su", "Ael"];
const FEMALE_B = ["ra", "na", "lia", "wen", "sha", "mi", "ya", "ris", "nne", "ko", "la", "vi", "rin", "sa", "ya", "the"];
const MALE_A = ["Ka", "Tor", "Bra", "Dor", "Gar", "Hal", "Jor", "Ko", "Lu", "Mar", "Ran", "Sten", "Thra", "Vor", "Ak", "Be"];
const MALE_B = ["ro", "en", "ic", "gar", "th", "lo", "mir", "dan", "us", "ek", "an", "or", "un", "dar", "is", "vo"];

export function agentName(seed: number, n: number, gender: Gender): string {
  const rng = createRng(seed * 31 + n * 1013 + (gender === "female" ? 7 : 13));
  const a = gender === "female" ? FEMALE_A : MALE_A;
  const b = gender === "female" ? FEMALE_B : MALE_B;
  return a[Math.floor(rng() * a.length)] + b[Math.floor(rng() * b.length)];
}

// ---------------------------------------------------------------------------
// 情绪: 四种基本情绪, 全部 0..1

export const EMOTION_KEYS = ["joy", "fear", "anger", "sadness"] as const;
export type EmotionKey = (typeof EMOTION_KEYS)[number];

export const EMOTION_ZH: Record<EmotionKey, string> = {
  joy: "喜悦",
  fear: "恐惧",
  anger: "愤怒",
  sadness: "哀伤",
};

export function clampEmotion(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** 当前最强的情绪(若都很弱返回 null —— 平静)。 */
export function dominantEmotion(e: Emotions, threshold = 0.25): EmotionKey | null {
  let best: EmotionKey | null = null;
  for (const k of EMOTION_KEYS) {
    if (e[k] >= threshold && (best === null || e[k] > e[best])) best = k;
  }
  return best;
}

export const WEATHER_ZH: Record<Weather, string> = {
  clear: "晴朗",
  cloudy: "多云",
  rain: "落雨",
  storm: "风暴",
  snow: "落雪",
};

export const PHASE_ZH: Record<DayPhase, string> = {
  dawn: "黎明",
  day: "白昼",
  dusk: "黄昏",
  night: "夜晚",
};
