import assert from "node:assert/strict";
import test from "node:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { withStoredProjectLifecycleLock } from "../src/discord-project/project-command-actions.js";
import { deleteProject, findProject, withProjectDeleteLock, type StoredProject } from "../src/services/projects.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("project command lifecycle work skips a stale project after waiting for deletion", async () => {
  const file = "data/projects.json";
  let previous: Buffer | null = null;
  try { previous = await readFile(file); } catch { /* test creates the file */ }

  const project: StoredProject = {
    id: "project-command-lifecycle-lock",
    name: "Project command lifecycle lock",
    guildId: "project-command-lifecycle-lock-guild",
    categoryId: "project-command-lifecycle-lock-category",
    organization: "iseol",
    frontend: { owner: "iseol", repo: "frontend" },
    backend: { owner: "iseol", repo: "backend" },
  };
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let sideEffects = 0;

  try {
    await writeFile(file, JSON.stringify([project], null, 2), "utf8");
    const deletion = withProjectDeleteLock(project.guildId, project.id, async () => {
      await held;
      assert.equal(await deleteProject(project.id), true);
    });

    await delay(30);
    const commandWork = withStoredProjectLifecycleLock(
      { guildId: project.guildId, storedProjectId: project.id },
      {
        findStoredProject: findProject,
        withLifecycleLock: (task) => withProjectDeleteLock(project.guildId, project.id, task),
      },
      async () => { sideEffects += 1; },
    );
    await delay(80);
    release();

    assert.equal(await Promise.all([deletion, commandWork]).then(([, result]) => result), undefined);
    assert.equal(sideEffects, 0);
  } finally {
    if (previous) await writeFile(file, previous);
    else await rm(file, { force: true });
  }
});
