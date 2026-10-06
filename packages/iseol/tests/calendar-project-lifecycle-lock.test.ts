import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { withProjectCalendarLifecycleLock } from "../src/services/calendar/calendar-discord.js";
import { deleteProject, withProjectDeleteLock, type StoredProject } from "../src/services/projects.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("Calendar interaction skips a stale project after waiting for project deletion", async () => {
  const file = "data/projects.json";
  let previous: Buffer | null = null;
  try { previous = await readFile(file); } catch { /* test creates the file */ }

  const project: StoredProject = {
    id: "calendar-project-lifecycle-lock",
    name: "Calendar project lifecycle lock",
    guildId: "calendar-project-lifecycle-lock-guild",
    categoryId: "calendar-project-lifecycle-lock-category",
    organization: "iseol",
    frontend: { owner: "iseol", repo: "frontend" },
    backend: { owner: "iseol", repo: "backend" },
    calendarId: "calendar-project-lifecycle-lock-calendar",
  };
  let calendarCalls = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });

  try {
    await mkdir("data", { recursive: true });
    await writeFile(file, JSON.stringify([project], null, 2), "utf8");
    const deletion = withProjectDeleteLock(project.guildId, project.id, async () => {
      await held;
      assert.equal(await deleteProject(project.id), true);
    });

    await delay(30);
    const interaction = withProjectCalendarLifecycleLock(project, async () => {
      calendarCalls += 1;
    });
    await delay(80);
    release();

    await Promise.all([deletion, interaction]);
    assert.equal(calendarCalls, 0);
  } finally {
    if (previous) await writeFile(file, previous);
    else await rm(file, { force: true });
  }
});
