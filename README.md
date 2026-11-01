# Elso

**一个由 AI 生活的平行世界。** AI 居民在一颗程序生成的星球上出生、觅食、喝水、睡觉、
恋爱、生育、衰老、死亡；他们从零开始敲打燧石、生火、烧陶、冶炼青铜，把知识一步步教给
下一代。每一次心跳都写进因果 JSONL 日志，可以在 Vue 3 回放器（2D 星球 / 3D 地球）里重看。

线上回放：**https://elso-world-byrv.zai.site**

Elso 是一个**机制探索沙盒**，不是对真实人类社会的预测工具。它的意义在于让微小的规则
可见、可复现：改一个变量，用同一个种子重放，比较指标。

## 世界是什么样的

- **赋身 (embodiment)**：每个居民都有姓名、性别、年龄阶段（幼年/青年/壮年/暮年）、
  体温、口渴、困倦、精力、健康与四种基本情绪（喜悦/恐惧/愤怒/哀伤）。没有全图视野——
  视觉半径白天 5 格、夜里 2 格，恶劣天气更短；还能听见附近的人声、闻到水与矿石的气味。
- **昼夜与天气**：1 tick = 1 小时。黎明/白昼/黄昏/夜晚影响温度、视野和睡眠；天气
  （晴/多云/雨/风暴/雪）按天确定性生成，影响体感温度与行动。
- **生存循环**：口渴比饥饿更急；夜里会困、要睡；太冷会失温，太热会中暑；饥饿、干渴、
  严寒都能致死。居民会生火取暖、回家躲避、去水边喝水。
- **社会**：职业、建筑（家/工坊/舞台/集市/广场）、金钱、社交活动（音乐会/节日/集市）、
  关系与亲密度、恋爱与生育（DNA 混合 + 突变 + 文化继承）。
- **文明**：真实元素与矿物（分子式、硬度、密度、成矿深度）、配方需要前置技术、
  实验会失败、失败也会被记录；老师只能按课程表一次教下一步；技术阶段 0–4
  （石器 → 火 → 陶器与木炭 → 冶炼 → 合金与工具）。
- **心声**：每位居民每个 tick 都有一句第一人称独白（口渴、困倦、发现、教学、天气、
  对某个人的思念），回放器里有"此刻心声"列表；接入真实 LLM 时由模型生成。

## 快速开始

需要 Node.js 22+ 与 pnpm 10+。

```bash
pnpm install
pnpm sim:mock -- --ticks 240 --agents 20       # -> apps/sim/logs/run-*.jsonl
pnpm web:dev                                    # http://localhost:5173
```

回放器默认加载 `/sample.jsonl`。要回放自己的运行，把日志复制到 `logs/sample.jsonl`
（Vite 开发服务器把 `logs/` 当作 `publicDir`）。用时间轴拖动 tick，`2D` / `3D` 切换
平面星球与低多边形地球，点任意居民查看TA的身体、情绪、心声、DNA 与掌握的技术。

## 日志格式

一行一个 tick，每个 tick 记录世界时刻、天气、所有居民、行动、发现、出生与死亡：

```jsonc
{
  "tick": 130,
  "seed": 42,
  "time": { "day": 6, "hour": 10, "phase": "day" },
  "weather": "storm",
  "world": { "width": 64, "height": 48, "cells": [[{ "biome": "grassland", "minerals": ["flint"], ... }]] }, // 仅 tick 0
  "agents": [{
    "id": "a0", "name": "Garus", "gender": "male", "age": 167,
    "energy": 76, "hunger": 54, "thirst": 28, "sleepiness": 40, "bodyTemp": 36.8,
    "awake": true, "emotions": { "joy": 0.34, "fear": 0.05, "anger": 0.05, "sadness": 0.05 },
    "thought": "雷声在很远的地方滚动。",
    "knownRecipes": ["knap_flint", "make_fire"], "materials": { "flint": 2 },
    "memory": [...], "relationships": { "a7": 0.3 }
  }],
  "actions": [{ "agentId": "a0", "action": { "type": "rest" }, "result": "rested" }],
  "voices": [{ "id": "a7", "name": "Yumi", "text": "胃在绞疼, 我需要食物。", "emotion": "恐惧" }],
  "discoveries": [{ "agentId": "a4", "recipeId": "cook_meal", "via": "experiment" }],
  "births": [{ "id": "g1x22", "name": "Nalia", "parentIds": ["a4", "a9"], "generation": 1 }],
  "deaths": [{ "id": "a11", "name": "Riris", "age": 255, "cause": "old age" }],
  "techStage": 2,
  "metrics": { "alive": 40, "births": 20, "deaths": 0, "recipes": 5, ... }
}
```

`world` 只在 tick 0 输出；后续 tick 复用同一张地图，日志因此保持紧凑（240 tick / 40 位
居民约 12 MB）。日志里只保留有意义的亲密度与最近几条记忆。

## 接入真实模型

密钥只从环境变量读取，绝不写进代码或提交。

```bash
# OpenAI
set OPENAI_API_KEY=sk-...
set OPENAI_MODEL=gpt-4o-mini
pnpm sim -- --ticks 240

# 任意 OpenAI 兼容端点（DeepSeek 等）
set OPENAI_API_KEY=...
set OPENAI_BASE_URL=https://api.deepseek.com/v1
set OPENAI_MODEL=deepseek-chat
pnpm sim -- --ticks 240
```

真实模型收到的提示词是中文第一人称：你是谁、身体怎么样、你看见/听见/闻到了什么、
你记得什么、你掌握了哪些技术；模型返回 `{ thought, action }`——心声会进入世界回放。
没有密钥时请用 `sim:mock`。

## 单变量实验

`RuleEngine` 支持 `beforeAction` / `afterAction` / `onTick` 钩子，`--rule <name>`
只开启一个插件，其余条件保持不变。

```bash
pnpm sim:mock -- --ticks 100 --rule hunger --out ../../logs/run-hunger-100.jsonl
pnpm compare ../../logs/run-baseline-100.jsonl ../../logs/run-hunger-100.jsonl
```

可用插件：`--rule energy`（每 tick +0.5 精力）、`--rule hunger`（饥饿速度减半）。

## CLI

| flag      | 默认 | 含义 |
|-----------|------|------|
| `--seed`  | 42 | 随机种子 |
| `--ticks` | 100 | 模拟时长（1 tick = 1 小时） |
| `--agents`| 24 | 初始居民数 |
| `--width` / `--height` | 64 / 48 | 地图尺寸 |
| `--out`   | `logs/run-<seed>-<ticks>.jsonl` | 输出路径 |
| `--mock`  | `true` | 使用确定性 mock 提供者 |
| `--rule`  | — | 启用一个规则插件 |

## 可复现性

同一 seed 与参数下，mock 提供者产生逐字节一致的行动流。真实 LLM 即使 temperature 0
也不保证确定性（供应商侧批处理、模型更新），因此**日志本身**才是"发生了什么"的记录。

## 架构

```
apps/sim                 headless simulation (tsx, Node 22)
  src/world/             IWorldGenerator + LatLonGridGenerator（分形噪声、生物群系、矿物）
  src/agent/             state（DNA/身体/记忆）+ perception（有限感官）
  src/rules/             actions（含 experiment/smelt/teach/drink/sleep）、RuleEngine、plugins
  src/llm/               LLMProvider、MockProvider、OpenAICompatProvider、monologue（心声）
  src/sim/               tick loop：生理、昼夜、情绪、生育、教学、死亡、日志
apps/web                 Vue 3 + Vite 回放器（2D 网格 / Three.js 地球）
packages/shared          类型、PRNG、化学（元素/矿物/配方）、身体（时间/天气/姓名/情绪）
```

行星生成器零依赖；3D 视图由同一张网格生成球面纹理。刻意不引入数据库、Docker、
重型 UI 框架或本地模型。

## 硬件说明

模拟是无头且便宜的；回放器需要 WebGL，集成显卡即可。项目只依赖开源 Web 技术栈，
不使用本地 LLM、重型引擎或高保真渲染。

## 路线图

- 已完成：4.0 社会层（职业/建筑/活动/经济），5.0 文明层（化学/实验/教学/生命周期），
  6.0 赋身层（身体/感官/昼夜/天气/情绪/心声）。
- 下一步：多代家族树、疾病与医疗、语言演化、把全城心声接入真实 LLM 做长程人格。

## 致谢

- [42arch/another-earth-generator](https://github.com/42arch/another-earth-generator) —
  程序化球形行星生成思路。
- 确定性 PRNG 使用 Mulberry32。

## 许可

MIT — 见 [LICENSE](./LICENSE)。
