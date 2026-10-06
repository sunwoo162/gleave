import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const sourcePaths = [
  "user-ui/src/pages/Auth.tsx",
  "user-ui/src/pages/Landing.tsx",
  "user-ui/src/pages/Onboarding.tsx",
] as const;

test("entry-state confirmations use the shared semantic check icon", async () => {
  const sources = await Promise.all(sourcePaths.map((path) => readFile(path, "utf8")));

  for (const source of sources) {
    assert.match(source, /<Icon name="check"/);
    assert.doesNotMatch(source, /✓/u);
  }
});
