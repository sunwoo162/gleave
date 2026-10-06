import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildBatches } from "../scripts/run-test-suite.mjs";

test("npm test runs the full suite with deterministic single-file concurrency", async () => {
  const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
    scripts?: { test?: string };
  };

  assert.match(packageJson.scripts?.test ?? "", /scripts\/run-test-suite\.mjs/);
});

test("test suite runner splits files into deterministic bounded batches", () => {
  assert.deepEqual(buildBatches(["a.test.ts", "b.test.ts", "c.test.ts", "d.test.ts", "e.test.ts"], 2), [
    ["a.test.ts", "b.test.ts"],
    ["c.test.ts", "d.test.ts"],
    ["e.test.ts"],
  ]);
});
