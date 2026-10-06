import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("personal space control is a real route link instead of a dead button", async () => {
  const source = await readFile(join(process.cwd(), "user-ui", "src", "components", "Navigation.tsx"), "utf8");

  assert.match(source, /<Link to="\/world"[^>]*aria-label="개인 공간"/);
  assert.match(source, /개인 공간<\/Link>/);
  assert.doesNotMatch(source, /<button[^>]*>개인 공간<\/button>/);
});
