import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectStore } from "../src/services/projects.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("project deletion lock serializes the same project across store instances", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-delete-lock-"));
  const file = join(root, "projects.json");
  const first = new ProjectStore(file);
  const second = new ProjectStore(file);
  let active = 0;
  let maximumActive = 0;

  await Promise.all([
    first.withDeleteLock("guild-1", "project-1", async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await delay(40);
      active -= 1;
    }),
    second.withDeleteLock("guild-1", "project-1", async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await delay(40);
      active -= 1;
    }),
  ]);

  assert.equal(maximumActive, 1);
});
