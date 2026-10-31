<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="logo">ELSO</span>
        <span class="tagline">AI-only planet society sandbox</span>
      </div>
      <div class="controls">
        <input
          v-model="url"
          class="url"
          spellcheck="false"
          placeholder="JSONL URL"
          @keyup.enter="load"
        />
        <button class="btn" :disabled="loading" @click="load">
          {{ loading ? "Loading…" : "Load" }}
        </button>
        <div class="seg" role="group" aria-label="View mode">
          <button :class="{ active: viewMode === '2d' }" @click="viewMode = '2d'">2D</button>
          <button :class="{ active: viewMode === '3d' }" @click="viewMode = '3d'">3D</button>
        </div>
      </div>
    </header>

    <div v-if="error" class="error">{{ error }}</div>

    <main class="layout">
      <section class="stage">
        <div class="viewport">
          <canvas
            v-show="viewMode === '2d'"
            ref="canvas"
            class="grid"
            width="720"
            height="720"
            @mousemove="onHover"
            @mouseleave="hover = null"
            @click="onCanvasClick"
          ></canvas>
          <GlobeViewer
            v-if="viewMode === '3d'"
            :agents="current?.agents ?? []"
            :world="world"
            :selected="selected"
            :day="day"
            @select="selected = $event"
          />
          <div v-if="!current" class="placeholder">
            <p>Load a JSONL log to begin.</p>
            <p class="hint">Run <code>pnpm sim:mock -- --ticks 100</code> and copy the output to <code>logs/sample.jsonl</code>.</p>
          </div>

          <div v-if="hover" class="tooltip" :style="{ left: hover.x + 'px', top: hover.y + 'px' }">
            <div class="tt-row"><b>{{ hover.cell?.biome ?? '—' }}</b> <span class="tt-dim">cell {{ hover.cx }},{{ hover.cy }}</span></div>
            <div class="tt-row">elev {{ (hover.cell?.elevation ?? 0).toFixed(2) }} · temp {{ (hover.cell?.temperature ?? 0).toFixed(2) }} · moist {{ (hover.cell?.moisture ?? 0).toFixed(2) }}</div>
            <div v-if="hover.cell?.resourceKind" class="tt-row">resource: {{ hover.cell.resourceKind }} × {{ (hover.cell.resource ?? 0).toFixed(2) }}</div>
            <div v-if="hover.agent" class="tt-row tt-agent">{{ hover.agent.id }} · E {{ hover.agent.energy.toFixed(0) }} · H {{ hover.agent.hunger.toFixed(0) }}</div>
          </div>
        </div>

        <div class="timeline">
          <button class="step" :disabled="tick <= 0" @click="tick = Math.max(0, tick - 1)">◀</button>
          <input
            v-model.number="tick"
            class="scrubber"
            type="range"
            min="0"
            :max="maxTick"
            :disabled="maxTick === 0"
          />
          <button class="step" :disabled="tick >= maxTick" @click="tick = Math.min(maxTick, tick + 1)">▶</button>
          <span class="ticklabel">tick {{ tick }} / {{ maxTick }}</span>
        </div>

        <div class="transport">
          <button class="playbtn" :disabled="maxTick === 0" @click="togglePlay">
            {{ playing ? "⏸ Pause" : "▶ Play" }}
          </button>
          <div class="speeds">
            <button
              v-for="s in speeds"
              :key="s"
              :class="{ active: speed === s }"
              @click="speed = s"
            >{{ s }}×</button>
          </div>
          <div class="daybox">
            <span class="daylabel">day</span>
            <input v-model.number="day" class="day" type="range" min="0" max="24" step="0.5" />
            <span class="dayval">{{ day.toFixed(1) }}h</span>
          </div>
        </div>

        <div class="legend">
          <span v-for="b in biomeLegend" :key="b.key"><i class="sw" :style="{ background: b.color }"></i>{{ b.key }}</span>
          <span><i class="sw resource"></i>resource</span>
          <span><i class="sw agent"></i>agent</span>
        </div>
      </section>

      <aside class="panel">
        <div class="metrics" v-if="current">
          <div class="metric"><span class="k">alive</span><span class="v">{{ current.metrics.alive }}</span></div>
          <div class="metric"><span class="k">gathered</span><span class="v">{{ current.metrics.gathered.toFixed(1) }}</span></div>
          <div class="metric"><span class="k">comm</span><span class="v">{{ current.metrics.communications }}</span></div>
          <div class="metric"><span class="k">events</span><span class="v">{{ current.metrics.events }}</span></div>
          <div class="metric"><span class="k">traded</span><span class="v">{{ current.metrics.traded.toFixed(1) }}</span></div>
        </div>

        <div class="spark" v-if="logs.length">
          <canvas ref="spark" width="300" height="60"></canvas>
          <div class="sparklabel">alive over time</div>
        </div>

        <h2>Selected agent</h2>
        <div class="selected" v-if="selectedAgent">
          <div class="sel-head">
            <span class="dot" :class="energyClass(selectedAgent.energy)"></span>
            <span class="aname">{{ selectedAgent.id }}</span>
            <span class="pos">({{ selectedAgent.x }}, {{ selectedAgent.y }}) · {{ selectedAgent.profession }} · 💰{{ selectedAgent.money }} · mood {{ (selectedAgent.mood*100).toFixed(0) }}</span>
          </div>
          <div class="sel-bars">
            <div class="barrow"><span>energy</span><div class="bar"><i :style="{ width: selectedAgent.energy + '%', background: '#4be3a4' }"></i></div><span>{{ selectedAgent.energy.toFixed(0) }}</span></div>
            <div class="barrow"><span>hunger</span><div class="bar"><i :style="{ width: selectedAgent.hunger + '%', background: '#f0b44c' }"></i></div><span>{{ selectedAgent.hunger.toFixed(0) }}</span></div>
          </div>
          <div class="inv">
            <span v-for="(v, k) in selectedAgent.inventory" :key="k" class="invchip">
              {{ k }} <b>{{ (v as number).toFixed(1) }}</b>
            </span>
          </div>
          <div class="mem" v-if="selectedAgent.memory?.length">
            <div class="memtitle">recent memory</div>
            <div v-for="(m, i) in selectedAgent.memory.slice(-6)" :key="i" class="memline">
            <span class="memkind">{{ m.kind }}</span> {{ m.text }}
          </div>
          </div>
          <button class="clearsel" @click="selected = null">clear selection</button>
        </div>
        <div v-else class="empty">Click an agent (2D or 3D) to inspect.</div>

        <h2>Message feed</h2>
        <div class="feed">
          <div v-for="(m, i) in feed" :key="i" class="feedline">
            <span class="who">{{ m.who }}</span>
            <span class="what">{{ m.text }}</span>
          </div>
          <div v-if="feed.length === 0" class="empty">No messages yet.</div>
        </div>

        <h2>Actions <span class="dim">tick {{ tick }}</span></h2>
        <div class="logbox">
          <div v-for="a in current?.actions ?? []" :key="a.agentId" class="logline">
            <span class="who">{{ a.agentId }}</span>
            <span class="what">{{ actionLabel(a.action) }}</span>
            <span class="res">{{ a.result }}</span>
          </div>
          <div v-if="current && current.actions.length === 0" class="empty">No actions this tick.</div>
          <div v-if="!current" class="empty">No log loaded.</div>
        </div>

        <h2>Agents</h2>
        <div class="agents">
          <div
            v-for="a in current?.agents ?? []"
            :key="a.id"
            class="agent"
            :class="{ sel: a.id === selected }"
            @click="selected = a.id"
          >
            <span class="dot" :class="energyClass(a.energy)"></span>
            <span class="aname">{{ a.id }}</span>
            <span class="pos">({{ a.x }}, {{ a.y }})</span>
            <span class="bar"><i :style="{ width: a.energy + '%' }"></i></span>
            <span class="energy">{{ a.energy.toFixed(0) }}</span>
          </div>
          <div v-if="!current" class="empty">No agents.</div>
        </div>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useJsonlStream, type TickLog, type LogAgent, type LogCell } from "./composables/useJsonlStream";
import GlobeViewer from "./components/GlobeViewer.vue";

const url = ref("/sample.jsonl");
const { logs, loading, error, load: loadStream } = useJsonlStream();
const tick = ref(0);
const viewMode = ref<"2d" | "3d">("2d");
const canvas = ref<HTMLCanvasElement | null>(null);
const spark = ref<HTMLCanvasElement | null>(null);
const selected = ref<string | null>(null);
const playing = ref(false);
const speed = ref(1);
const speeds = [1, 2, 4, 8];
const day = ref(12);
let playTimer: number | null = null;

const maxTick = computed(() => Math.max(0, logs.value.length - 1));
const current = computed<TickLog | null>(() => logs.value[tick.value] ?? null);
const world = computed(() => logs.value.find((l) => l.world)?.world ?? null);
const gridW = computed(() => world.value?.width ?? 20);
const gridH = computed(() => world.value?.height ?? 20);

const selectedAgent = computed<LogAgent | null>(() => {
  if (!selected.value || !current.value) return null;
  return current.value.agents.find((a) => a.id === selected.value) ?? null;
});

const BIOME_COLORS: Record<string, string> = {
  "deep-water": "#0a2640",
  water: "#12354f",
  shallows: "#2a7fa8",
  beach: "#d4c28a",
  snow: "#f0f4fa",
  tundra: "#b2bab0",
  taiga: "#2e4e3a",
  grassland: "#4e8a42",
  savanna: "#a2a856",
  desert: "#ceba78",
  "temperate-forest": "#30663a",
  rainforest: "#1a4e36",
  mountain: "#9e9a96",
  barren: "#6d5a44",
};

const biomeLegend = Object.entries(BIOME_COLORS).map(([key, color]) => ({ key, color }));

const hover = ref<{ x: number; y: number; cx: number; cy: number; cell: LogCell | null; agent: LogAgent | null } | null>(null);

function energyClass(energy: number) {
  if (energy > 60) return "ok";
  if (energy > 30) return "warn";
  return "low";
}

function actionLabel(action: { type: string; payload?: any }) {
  if (action.type === "speak") return `speak “${action.payload?.text ?? ""}”`;
  if (action.type === "move" && action.payload) return `move (${action.payload.dx ?? 0}, ${action.payload.dy ?? 0})`;
  if (action.type === "give") return `give ${action.payload?.amount ?? 1} ${action.payload?.kind ?? "food"} → ${action.payload?.to}`;
  return action.type;
}

const feed = computed(() => {
  if (!current.value) return [];
  const out: { who: string; text: string }[] = [];
  for (const a of current.value.actions) {
    if (a.action.type === "speak") {
      out.push({ who: a.agentId, text: `“${a.action.payload?.text ?? ""}”` });
    } else if (a.action.type === "talk" && a.result?.startsWith("talked")) {
      out.push({ who: a.agentId, text: `→ ${a.action.payload?.to}: ${a.action.payload?.text ?? ""}` });
    } else if (a.action.type === "give" && a.result?.startsWith("gave")) {
      out.push({ who: a.agentId, text: a.result });
    } else if (["work","trade","build","attend","perform","play","rest_at_home"].includes(a.action.type) && a.result) {
      out.push({ who: a.agentId, text: `${a.action.type}: ${a.result}` });
    }
  }
  return out.slice(-12).reverse();
});

async function load() {
  await loadStream(url.value);
  tick.value = 0;
  selected.value = null;
  await nextTick();
  draw();
  drawSpark();
}

watch(logs, () => {
  tick.value = 0;
  nextTick(() => {
    draw();
    drawSpark();
  });
});

watch(tick, () => {
  nextTick(() => {
    draw();
    drawSpark();
  });
});

watch(viewMode, async () => {
  if (viewMode.value === "2d") {
    await nextTick();
    draw();
  }
});

watch(selected, () => draw());

function togglePlay() {
  playing.value = !playing.value;
  if (playing.value) startPlay();
  else stopPlay();
}

function startPlay() {
  stopPlay();
  const step = () => {
    if (!playing.value) return;
    if (tick.value >= maxTick.value) {
      playing.value = false;
      return;
    }
    tick.value = Math.min(maxTick.value, tick.value + 1);
    playTimer = window.setTimeout(step, 1000 / speed.value);
  };
  playTimer = window.setTimeout(step, 1000 / speed.value);
}

function stopPlay() {
  if (playTimer !== null) {
    clearTimeout(playTimer);
    playTimer = null;
  }
}

onUnmounted(() => stopPlay());

function draw() {
  const c = canvas.value;
  if (!c) return;
  const ctx = c.getContext("2d");
  if (!ctx) return;

  const w = gridW.value;
  const h = gridH.value;
  const size = Math.min(c.width / w, c.height / h);
  const ox = (c.width - w * size) / 2;
  const oy = (c.height - h * size) / 2;

  ctx.fillStyle = "#070b10";
  ctx.fillRect(0, 0, c.width, c.height);

  const cells = world.value?.cells;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cell = cells?.[y]?.[x];
      const px = ox + x * size;
      const py = oy + y * size;
      ctx.fillStyle = BIOME_COLORS[cell?.biome ?? "water"] ?? "#12354f";
      ctx.fillRect(px, py, size, size);
      if (cell && cell.resource > 0.02) {
        ctx.fillStyle = `rgba(232, 193, 96, ${0.04 + cell.resource * 0.12})`;
        ctx.fillRect(px, py, size, size);
        if (cell.resource > 0.55 && size > 6) {
          ctx.fillStyle = `rgba(244, 211, 127, ${0.35 + cell.resource * 0.45})`;
          ctx.beginPath();
          ctx.arc(px + size / 2, py + size / 2, Math.max(1.5, size * 0.1), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // Grid lines (subtle).
  ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x++) {
    ctx.beginPath();
    ctx.moveTo(ox + x * size, oy);
    ctx.lineTo(ox + x * size, oy + h * size);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y++) {
    ctx.beginPath();
    ctx.moveTo(ox, oy + y * size);
    ctx.lineTo(ox + w * size, oy + h * size);
    ctx.stroke();
  }

  const log = current.value;
  if (!log) return;

  for (const a of log.agents) {
    const cx = ox + (a.x + 0.5) * size;
    const cy = oy + (a.y + 0.5) * size;
    const color = a.energy > 60 ? "#4be3a4" : a.energy > 30 ? "#f0b44c" : "#ff5f6d";
    const r = Math.max(4, size * 0.26);
    const isSel = a.id === selected.value;

    ctx.beginPath();
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.arc(cx + 1.5, cy + 1.5, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = isSel ? r * 2.6 : r * 1.6;
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(cx, cy, isSel ? r * 1.35 : r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (isSel) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.9, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#06111a";
    ctx.font = `600 ${Math.max(7, r * 1.1)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(a.id, cx, cy + 0.5);
  }
}

function onHover(ev: MouseEvent) {
  const c = canvas.value;
  if (!c || !world.value) return;
  const rect = c.getBoundingClientRect();
  const scaleX = c.width / rect.width;
  const scaleY = c.height / rect.height;
  const px = (ev.clientX - rect.left) * scaleX;
  const py = (ev.clientY - rect.top) * scaleY;
  const w = gridW.value;
  const h = gridH.value;
  const size = Math.min(c.width / w, c.height / h);
  const ox = (c.width - w * size) / 2;
  const oy = (c.height - h * size) / 2;
  const cx = Math.floor((px - ox) / size);
  const cy = Math.floor((py - oy) / size);
  if (cx < 0 || cy < 0 || cx >= w || cy >= h) {
    hover.value = null;
    return;
  }
  const cell = world.value.cells[cy]?.[cx] ?? null;
  const agent = current.value?.agents.find((a) => a.x === cx && a.y === cy) ?? null;
  hover.value = { x: ev.clientX - rect.left + 12, y: ev.clientY - rect.top + 12, cx, cy, cell, agent };
}

function onCanvasClick(ev: MouseEvent) {
  const h = hover.value;
  if (h?.agent) selected.value = h.agent.id;
}

function drawSpark() {
  const c = spark.value;
  if (!c || logs.value.length === 0) return;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const w = c.width;
  const h = c.height;
  ctx.fillStyle = "#070b10";
  ctx.fillRect(0, 0, w, h);
  const vals = logs.value.map((l) => l.metrics.alive);
  const max = Math.max(...vals, 1);
  const step = w / (vals.length - 1 || 1);
  ctx.strokeStyle = "#4be3a4";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  vals.forEach((v, i) => {
    const x = i * step;
    const y = h - (v / max) * (h - 4) - 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  // current tick marker
  const tx = tick.value * step;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.moveTo(tx, 0);
  ctx.lineTo(tx, h);
  ctx.stroke();
}

onMounted(() => {
  load();
  draw();
});

watch(logs, () => drawSpark());
watch(tick, () => drawSpark());
</script>

<style scoped>
.app {
  min-height: 100vh;
  padding: 18px 22px 26px;
  background:
    radial-gradient(1100px 700px at 15% -10%, #14283a 0%, transparent 55%),
    radial-gradient(900px 600px at 110% 10%, #1d1a2e 0%, transparent 50%),
    #080c12;
  color: #dbe7f1;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}

.topbar {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(148, 178, 204, 0.14);
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.logo {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.22em;
  background: linear-gradient(90deg, #83f3d0, #6fb6ff);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.tagline {
  color: #87a0b6;
  font-size: 12px;
  letter-spacing: 0.06em;
}

.controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex: 1;
  justify-content: flex-end;
  min-width: 280px;
}

.url {
  width: min(340px, 40vw);
  padding: 8px 11px;
  border-radius: 8px;
  border: 1px solid rgba(148, 178, 204, 0.22);
  background: rgba(10, 18, 27, 0.85);
  color: #cfe1ef;
  font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
  outline: none;
}

.url:focus {
  border-color: #4fbfa0;
}

.btn,
.step {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid rgba(120, 220, 190, 0.35);
  background: rgba(45, 143, 116, 0.2);
  color: #bdf3e2;
  font-weight: 600;
  cursor: pointer;
}

.btn:disabled,
.step:disabled {
  opacity: 0.4;
  cursor: default;
}

.seg {
  display: flex;
  padding: 3px;
  border-radius: 9px;
  background: rgba(10, 18, 27, 0.9);
  border: 1px solid rgba(148, 178, 204, 0.18);
}

.seg button {
  padding: 5px 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #8fa7bb;
  font: 600 12px ui-sans-serif, system-ui, sans-serif;
  cursor: pointer;
}

.seg button.active {
  background: rgba(90, 210, 175, 0.18);
  color: #a9f3dc;
}

.error {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 95, 109, 0.45);
  background: rgba(255, 95, 109, 0.1);
  color: #ffb3b8;
  font-size: 13px;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 18px;
  margin-top: 18px;
  align-items: start;
}

.stage,
.panel {
  border: 1px solid rgba(148, 178, 204, 0.14);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(18, 29, 42, 0.92), rgba(11, 18, 27, 0.94));
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.32);
}

.stage {
  padding: 14px;
}

.viewport {
  position: relative;
  width: min(100%, 64vh, 760px);
  margin-inline: auto;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 42%, rgba(33, 68, 96, 0.35), transparent 62%),
    #070b10;
}

.grid {
  width: 100%;
  height: 100%;
  display: block;
  image-rendering: auto;
  cursor: crosshair;
}

.placeholder {
  position: absolute;
  text-align: center;
  color: #7e97ac;
  font-size: 14px;
  padding: 24px;
}

.placeholder .hint {
  margin-top: 8px;
  font-size: 12px;
  color: #647c90;
}

.placeholder code {
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(148, 178, 204, 0.12);
  font: 11px ui-monospace, monospace;
  color: #a8c4d8;
}

.tooltip {
  position: absolute;
  pointer-events: none;
  z-index: 5;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(8, 14, 21, 0.92);
  border: 1px solid rgba(148, 178, 204, 0.25);
  font: 11.5px ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #cfe1ef;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  max-width: 260px;
}

.tt-row {
  line-height: 1.4;
}

.tt-dim {
  color: #647c90;
}

.tt-agent {
  color: #4be3a4;
}

.timeline {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.scrubber {
  flex: 1;
  accent-color: #4fbfa0;
  cursor: pointer;
}

.step {
  padding: 5px 11px;
  font-size: 12px;
}

.ticklabel {
  min-width: 108px;
  text-align: right;
  color: #8fa7bb;
  font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
}

.transport {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.playbtn {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid rgba(120, 220, 190, 0.35);
  background: rgba(45, 143, 116, 0.2);
  color: #bdf3e2;
  font-weight: 600;
  cursor: pointer;
  font-size: 12px;
}

.playbtn:disabled {
  opacity: 0.4;
  cursor: default;
}

.speeds {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 8px;
  background: rgba(10, 18, 27, 0.9);
  border: 1px solid rgba(148, 178, 204, 0.18);
}

.speeds button {
  padding: 4px 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #8fa7bb;
  font: 600 11px ui-monospace, monospace;
  cursor: pointer;
}

.speeds button.active {
  background: rgba(90, 210, 175, 0.18);
  color: #a9f3dc;
}

.daybox {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  color: #8fa7bb;
  font-size: 11px;
}

.day {
  width: 120px;
  accent-color: #6fb6ff;
}

.dayval {
  min-width: 42px;
  text-align: right;
  font: 11px ui-monospace, monospace;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
  color: #7e97ac;
  font-size: 10.5px;
}

.legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.sw {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
}

.sw.resource {
  background: #e8c160;
}

.sw.agent {
  background: #4be3a4;
  border-radius: 50%;
}

.panel {
  padding: 14px;
}

.metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 14px;
}

.metric {
  padding: 9px 11px;
  border-radius: 9px;
  border: 1px solid rgba(148, 178, 204, 0.12);
  background: rgba(8, 14, 21, 0.55);
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.metric .k {
  color: #7e97ac;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.metric .v {
  color: #e8f6ff;
  font: 600 15px ui-monospace, monospace;
}

.spark {
  margin-bottom: 14px;
  border: 1px solid rgba(148, 178, 204, 0.12);
  border-radius: 9px;
  background: rgba(6, 11, 17, 0.6);
  padding: 6px;
}

.spark canvas {
  width: 100%;
  height: 60px;
  display: block;
}

.sparklabel {
  margin-top: 4px;
  color: #5f7789;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

h2 {
  margin: 4px 0 9px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #9db6ca;
}

.dim {
  color: #5f7789;
  font-family: ui-monospace, monospace;
  letter-spacing: 0;
}

.logbox {
  height: 200px;
  overflow: auto;
  border: 1px solid rgba(148, 178, 204, 0.12);
  border-radius: 9px;
  background: rgba(6, 11, 17, 0.6);
  padding: 7px;
  margin-bottom: 16px;
  font: 11.5px ui-monospace, SFMono-Regular, Menlo, monospace;
}

.logline {
  display: grid;
  grid-template-columns: 34px 118px minmax(0, 1fr);
  gap: 6px;
  padding: 4px 5px;
  border-radius: 5px;
}

.logline:nth-child(odd) {
  background: rgba(148, 178, 204, 0.045);
}

.who {
  color: #7fd6bb;
}

.what {
  color: #a8c4d8;
}

.res {
  color: #667f92;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected {
  border: 1px solid rgba(148, 178, 204, 0.14);
  border-radius: 9px;
  padding: 10px;
  background: rgba(6, 11, 17, 0.5);
  margin-bottom: 14px;
}

.sel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font: 12px ui-monospace, monospace;
}

.aname {
  color: #e8f6ff;
  font-weight: 700;
}

.pos {
  color: #647c90;
}

.sel-bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.barrow {
  display: grid;
  grid-template-columns: 52px 1fr 30px;
  gap: 8px;
  align-items: center;
  font-size: 11px;
  color: #8fa7bb;
}

.bar {
  height: 6px;
  border-radius: 3px;
  background: rgba(148, 178, 204, 0.14);
  overflow: hidden;
}

.bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
}

.inv {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.invchip {
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(148, 178, 204, 0.1);
  border: 1px solid rgba(148, 178, 204, 0.16);
  font: 11px ui-monospace, monospace;
  color: #a8c4d8;
}

.invchip b {
  color: #e8f6ff;
  margin-left: 4px;
}

.mem {
  margin-bottom: 8px;
}

.memtitle {
  color: #5f7789;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 4px;
}

.memline {
  font: 10.5px ui-monospace, monospace;
  color: #8fa7bb;
  padding: 2px 0;
  border-bottom: 1px solid rgba(148, 178, 204, 0.06);
}

.clearsel {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(148, 178, 204, 0.2);
  background: transparent;
  color: #8fa7bb;
  font-size: 11px;
  cursor: pointer;
}

.feed {
  height: 160px;
  overflow: auto;
  border: 1px solid rgba(148, 178, 204, 0.12);
  border-radius: 9px;
  background: rgba(6, 11, 17, 0.6);
  padding: 7px;
  margin-bottom: 16px;
  font: 11.5px ui-monospace, SFMono-Regular, Menlo, monospace;
}

.feedline {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 6px;
  padding: 4px 5px;
  border-radius: 5px;
}

.feedline:nth-child(odd) {
  background: rgba(148, 178, 204, 0.045);
}

.agents {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agent {
  display: grid;
  grid-template-columns: 10px 26px 58px minmax(0, 1fr) 30px;
  gap: 7px;
  align-items: center;
  font: 11.5px ui-monospace, monospace;
  color: #a8c4d8;
  padding: 3px 4px;
  border-radius: 5px;
  cursor: pointer;
}

.agent.sel {
  background: rgba(90, 210, 175, 0.12);
}

.agent:hover {
  background: rgba(148, 178, 204, 0.08);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot.ok {
  background: #4be3a4;
}

.dot.warn {
  background: #f0b44c;
}

.dot.low {
  background: #ff5f6d;
}

.pos {
  color: #647c90;
}

.energy {
  text-align: right;
  color: #cfe1ef;
}

.bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #2f9e7c, #6fe3bd);
}

.empty {
  color: #5f7789;
  font-size: 12px;
  padding: 10px;
  font-family: ui-sans-serif, system-ui, sans-serif;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .viewport {
    width: min(100%, 62vh, 760px);
  }
  .url {
    width: 100%;
  }
  .controls {
    flex: 1 1 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>