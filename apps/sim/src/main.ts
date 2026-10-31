import { LatLonGridGenerator } from "./world/generator.ts";
import { createAgent } from "./agent/state.ts";
import { MockProvider } from "./llm/mock.ts";
import { OpenAICompatProvider } from "./llm/openai.ts";
import { runSimulation } from "./sim/engine.ts";
import { createJsonlWriter } from "./log/jsonl.ts";
import { RuleEngine } from "./rules/engine.ts";
import { energyRegenPlugin } from "./rules/plugins/energy.ts";
import { hungerSlowPlugin } from "./rules/plugins/hunger.ts";

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") && argv[i + 1] !== "--" ? argv[++i] : "true";
      args[key] = val;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const seed = Number(args.seed ?? 42);
  const ticks = Number(args.ticks ?? 100);
  const agentCount = Number(args.agents ?? 24);
  const width = Number(args.width ?? 64);
  const height = Number(args.height ?? 48);
  const mock = args.mock === "true" || args.mock === undefined ? true : args.mock !== "false";
  const out = args.out ?? `../../logs/run-${seed}-${ticks}.jsonl`;
  const { mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(out), { recursive: true });

  const gen = new LatLonGridGenerator();
  const world = gen.generate(seed, { width, height });
  const rng = (await import("@elso/shared")).createRng(seed + 1);

  // Spawn only on land: deterministic Fisher–Yates over walkable cells.
  const landCells: { x: number; y: number }[] = [];
  for (const row of world.cells) {
    for (const cell of row) {
      if (cell.terrain === "land") landCells.push({ x: cell.x, y: cell.y });
    }
  }
  if (landCells.length < agentCount) {
    console.warn(
      `Only ${landCells.length} land cells for ${agentCount} agents; some share a cell.`
    );
  }
  for (let i = landCells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [landCells[i], landCells[j]] = [landCells[j], landCells[i]];
  }
  const agents = landCells.slice(0, agentCount).map((c, i) => createAgent(`a${i}`, c.x, c.y));
  while (agents.length < agentCount) agents.push(createAgent(`a${agents.length}`, 0, 0));

  const provider = mock
    ? new MockProvider(seed)
    : new OpenAICompatProvider({
        apiKey: process.env.OPENAI_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? "",
        baseUrl: process.env.OPENAI_BASE_URL,
        model: process.env.OPENAI_MODEL,
      });

  const ruleEngine = new RuleEngine();
  if (args.rule === "energy") ruleEngine.register(energyRegenPlugin);
  if (args.rule === "hunger") ruleEngine.register(hungerSlowPlugin);

  const writer = createJsonlWriter(out);
  await runSimulation(
    { seed, ticks, agentCount, width, height },
    provider,
    world,
    agents,
    (log) => writer.write(log),
    ruleEngine
  );
  writer.close();
  console.log(`Done. Log written to ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});