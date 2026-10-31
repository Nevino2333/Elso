import { readFileSync } from "node:fs";
import type { TickLog } from "@elso/shared";

function loadLast(path: string): TickLog {
  const lines = readFileSync(path, "utf8").trim().split("\n");
  return JSON.parse(lines[lines.length - 1]);
}

const [baselinePath, variantPath] = process.argv.slice(2);
if (!baselinePath || !variantPath) {
  console.error("Usage: tsx src/compare.ts <baseline.jsonl> <variant.jsonl>");
  process.exit(1);
}

const a = loadLast(baselinePath);
const b = loadLast(variantPath);

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

console.log("metric        baseline   variant    delta");
for (const key of ["alive", "gathered", "communications", "events", "traded"] as const) {
  const av = a.metrics[key];
  const bv = b.metrics[key];
  console.log(
    `${key.padEnd(13)} ${fmt(av).padEnd(10)} ${fmt(bv).padEnd(10)} ${fmt(bv - av)}`
  );
}