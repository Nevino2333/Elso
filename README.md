# Elso

**An AI-only random planet society sandbox.** Agents are driven by LLM decisions on a
procedurally generated planet. Every tick is written to a causal JSONL log and can be
replayed in a Vue 3 viewer (2D grid or low-poly 3D globe).

Elso is a **mechanism-exploration sandbox**, not a model of real human society and not a
prediction tool. The point is to make small rules visible and reproducible: change one
variable, replay the same seed, compare the metrics.

## What is in the MVP

- 64×48 (configurable) lat/lon grid planet with 14 biomes (deep-water … mountain) derived from
  fractal fbm noise (elevation / temperature / moisture), per-cell resource kind (food / wood /
  stone / ore) and per-biome energy decay.
- 24 (configurable) agents with position, energy, hunger, inventory and a rolling memory.
- Actions: `move`, `gather`, `eat`, `rest`, `speak`, `give` (trade units between nearby agents).
- Resources slowly regrow; starvation drains energy; agents spawn only on land.
- Deterministic seeds (Mulberry32) for world, agent placement and the mock provider.
- Provider abstraction: **mock** (offline, deterministic) or any **OpenAI-compatible**
  chat-completions endpoint.
- Causal JSONL log: per tick agents, actions, results and aggregate metrics (alive / gathered /
  communications / events / traded).
- Vue 3 replay: 2D biome canvas (hover tooltips, click-to-select, message feed, autoplay) and
  Three.js globe (high-res biome texture, clouds, Fresnel atmosphere, OrbitControls,
  day/night cycle, clickable agents).

## Quick start

Requires Node.js 22+ and pnpm 10+.

```bash
pnpm install
pnpm sim:mock -- --ticks 100          # -> logs/run-42-100.jsonl
pnpm web:dev                          # http://localhost:5173
```

The viewer loads `/sample.jsonl` by default. To replay your own run, copy it to
`logs/sample.jsonl` (the Vite dev server serves `logs/` as `publicDir`). Use the
timeline to scrub ticks, the `2D` / `3D` toggle to switch between the flat grid and the
low-poly globe, and the `Load` button to fetch another JSONL URL.

## Log format

One JSON object per line, one line per tick:

```jsonc
{
  "tick": 0,
  "seed": 42,
  "world": { "width": 64, "height": 48, "cells": [[{ "biome": "grassland", "resourceKind": "food", "resource": 0.4, "elevation": 0.52, "temperature": 0.71, "moisture": 0.44 }, ...], ...] },
  "agents": [{ "id": "a0", "x": 19, "y": 5, "energy": 100, "hunger": 0, "inventory": { "food": 2, "wood": 0, "stone": 0, "ore": 0 }, "memory": [...] }],
  "actions": [{ "agentId": "a0", "action": { "type": "gather" }, "result": "gathered 0.35 food" }],
  "metrics": { "alive": 24, "gathered": 6.3, "communications": 0, "events": 24, "traded": 0.0 }
}
```

`world` is emitted on tick 0 only; later ticks reference the same grid so the log stays
small. The viewer reads that snapshot to draw both the 2D cells and the 3D texture.

## Using a real model

Keys are read from environment variables only and are never written into the repo.

```bash
# OpenAI
set OPENAI_API_KEY=sk-...
set OPENAI_MODEL=gpt-4o-mini
pnpm sim -- --ticks 100

# Any OpenAI-compatible endpoint (DeepSeek, local gateway, etc.)
set OPENAI_API_KEY=...
set OPENAI_BASE_URL=https://api.deepseek.com/v1
set OPENAI_MODEL=deepseek-chat
pnpm sim -- --ticks 100
```

`pnpm sim` defaults to the OpenAI-compatible provider; pass `--mock` to force the offline
provider. If no key is present the request fails, so use `sim:mock` for offline work.

## Single-variable experiments

`RuleEngine` loads `RulePlugin`s with `beforeAction` / `afterAction` / `onTick` hooks.
`--rule <name>` enables one plugin; everything else stays fixed.

```bash
# Baseline
pnpm sim:mock -- --ticks 100 --out ../../logs/run-baseline-100.jsonl

# Same seed, one rule changed: hunger grows at half speed
pnpm sim:mock -- --ticks 100 --rule hunger --out ../../logs/run-hunger-100.jsonl

pnpm compare ../../logs/run-baseline-100.jsonl ../../logs/run-hunger-100.jsonl
```

Recorded result (seed 42, 5 agents, 20×20, 100 ticks):

| metric         | baseline | hunger-slow | delta |
|----------------|---------:|------------:|------:|
| alive          | 5        | 5           | 0     |
| gathered       | 26.28    | 24.50       | -1.78 |
| communications | 64       | 62          | -2    |
| events         | 464      | 461         | -3    |

The difference is small on purpose: this is one rule at one seed, not evidence about
societies. Increase `--ticks` and repeat across seeds before drawing conclusions.

Available plugins:

- `--rule energy` — `energy-regen-0.5`: +0.5 energy per tick.
- `--rule hunger` — `hunger-slow-0.5`: hunger grows at +0.5/tick instead of +1.

## CLI options

| flag      | default | meaning                          |
|-----------|---------|----------------------------------|
| `--seed`  | 42      | RNG seed                         |
| `--ticks` | 100     | simulation length                |
| `--agents`| 24      | number of agents                 |
| `--width` | 64      | grid width                       |
| `--height`| 48      | grid height                      |
| `--out`   | `logs/run-<seed>-<ticks>.jsonl` | output path |
| `--mock`  | `true`  | use deterministic mock provider  |
| `--rule`  | —       | enable a rule plugin             |

## Reproducibility

The same seed and options produce byte-identical action streams with the mock provider.
Real LLM providers are not deterministic even at temperature 0 due to provider-side
batching and model updates, so store the JSONL log as the record of what happened.

## Architecture

```
apps/sim                 headless simulation (tsx, Node 22)
  src/world/             IWorldGenerator + LatLonGridGenerator
  src/agent/             agent state and memory
  src/rules/             actions, RuleEngine, plugins
  src/llm/               LLMProvider, MockProvider, OpenAICompatProvider
  src/sim/               tick loop, metrics, JSONL writer
  src/compare.ts         baseline vs variant metrics
apps/web                 Vue 3 + Vite replay viewer
  src/composables/       streaming JSONL parser
  src/components/        GlobeViewer (Three.js)
packages/shared          shared types and seeded RNG
```

The default planet generator is dependency-free. A spherical mesh can be produced from
the same grid for the 3D view; heavier external planet generators are intentionally not
vendored. See acknowledgements.

## Vapor Mode

Vapor Mode is **not enabled**. Vue 3.5 does not ship the stable Vapor compiler, and this
MVP targets the stable toolchain. Components use standard `<script setup lang="ts">` and
are structured so the migration is a compiler-level change later (no render-function
dependencies, no Vapor-incompatible patterns).

## Hardware notes

The simulation is headless and cheap: the 100-tick / 5-agent mock run is a few hundred
milliseconds on a low-end CPU. The web viewer needs WebGL; a low-poly icosphere is
comfortable on integrated graphics, and a discrete GPU is only useful for larger scenes.
This project intentionally avoids local LLMs, heavy engines, and high-fidelity rendering.

## Roadmap

- Phase 2 (delivered in this MVP): pluggable rules with single-variable comparison,
  3D globe replay, Vapor Mode assessed (not enabled, see above).
- Phase 3: multi-seed experiment runner, then social-emergence experiments (trade,
  groups, norms) with causal logs.
- Later: Vapor Mode once stable; optional adapter for external planet generators.

## Acknowledgements

- [42arch/another-earth-generator](https://github.com/42arch/another-earth-generator) —
  inspiration for procedural spherical planet generation. Elso keeps planet generation
  pluggable and focuses on the agent-society loop rather than reimplementing a
  high-fidelity Earth.
- The deterministic PRNG is Mulberry32.

## License

MIT — see [LICENSE](./LICENSE).
