import assert from "node:assert/strict";
import test from "node:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { withProjectJoinLifecycleLock } from "../src/interactions/project-join.js";
import { deleteProject, withProjectDeleteLock, type StoredProject } from "../src/services/projects.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("project join skips a stale project after waiting for project deletion", async () => {
  const file = "data/projects.json";
  let previous: Buffer | null = null;
  try { previous = await readFile(file); } catch { /* test creates the file */ }

  const project: StoredProject = {
    id: "project-join-lifecycle-lock",
    name: "Project join lifecycle lock",
    guildId: "project-join-lifecycle-lock-guild",
    categoryId: "project-join-lifecycle-lock-category",
    organization: "iseol",
    frontend: { owner: "iseol", repo: "frontend" },
    backend: { owner: "iseol", repo: "backend" },
  };
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let inviteCalls = 0;

  try {
    await writeFile(file, JSON.stringify([project], null, 2), "utf8");
    const deletion = withProjectDeleteLock(project.guildId, project.id, async () => {
      await held;
      assert.equal(await deleteProject(project.id), true);
    });

    await delay(30);
    const join = withProjectJoinLifecycleLock(project.guildId, project.id, async () => {
      inviteCalls += 1;
    });
    await delay(80);
    release();

    await Promise.all([deletion, join]);
    assert.equal(inviteCalls, 0);
  } finally {
    if (previous) await writeFile(file, previous);
    else await rm(file, { force: true });
  }
});
