import { test } from "node:test";
import assert from "node:assert/strict";
import { createRng } from "../../../packages/shared/src/rng.ts";

test("rng reproducible", () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
});