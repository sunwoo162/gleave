import assert from "node:assert/strict";
import test from "node:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { withProjectAutomationPollingLifecycleLock } from "../src/services/github-automation-polling.js";
import { deleteProject, withProjectDeleteLock, type StoredProject } from "../src/services/projects.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("GitHub automation polling skips a stale project after waiting for project deletion", async () => {
  const file = "data/projects.json";
  let previous: Buffer | null = null;
  try { previous = await readFile(file); } catch { /* test creates the file */ }

  const project: StoredProject = {
    id: "github-automation-lifecycle-lock",
    name: "GitHub automation lifecycle lock",
    guildId: "github-automation-lifecycle-lock-guild",
    categoryId: "github-automation-lifecycle-lock-category",
    organization: "iseol",
    frontend: { owner: "iseol", repo: "frontend" },
    backend: { owner: "iseol", repo: "backend" },
  };
  let syncCalls = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });

  try {
    await writeFile(file, JSON.stringify([project], null, 2), "utf8");
    const deletion = withProjectDeleteLock(project.guildId, project.id, async () => {
      await held;
      assert.equal(await deleteProject(project.id), true);
    });

    await delay(30);
    const sync = withProjectAutomationPollingLifecycleLock(project, async () => {
      syncCalls += 1;
    });
    await delay(80);
    release();

    await Promise.all([deletion, sync]);
    assert.equal(syncCalls, 0);
  } finally {
    if (previous) await writeFile(file, previous);
    else await rm(file, { force: true });
  }
});
