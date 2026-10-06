import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectStore } from "../src/services/projects.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("project creation lock serializes the same guild and normalized name across store instances", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-create-lock-"));
  const file = join(root, "projects.json");
  const first = new ProjectStore(file);
  const second = new ProjectStore(file);
  let active = 0;
  let maximumActive = 0;

  await Promise.all([
    first.withCreateLock("guild-1", " NPC ", async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await delay(40);
      active -= 1;
    }),
    second.withCreateLock("guild-1", "npc", async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await delay(40);
      active -= 1;
    }),
  ]);

  assert.equal(maximumActive, 1);
});
