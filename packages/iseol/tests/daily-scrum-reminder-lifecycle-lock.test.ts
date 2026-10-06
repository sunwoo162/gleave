import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Client, TextChannel } from "discord.js";
import { DailyScrumStore, sendDailyScrumReminders } from "../src/services/daily-scrum.js";
import { deleteProject, withProjectDeleteLock, type StoredProject } from "../src/services/projects.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("daily scrum reminders skip delivery when the project is deleted while waiting", async () => {
  const projectFile = "data/projects.json";
  let previousProjects: Buffer | null = null;
  try { previousProjects = await readFile(projectFile); } catch { /* test creates the file */ }

  const project: StoredProject = {
    id: "daily-scrum-reminder-lifecycle-lock",
    name: "Daily scrum reminder lifecycle lock",
    guildId: "daily-scrum-reminder-lifecycle-lock-guild",
    categoryId: "daily-scrum-reminder-lifecycle-lock-category",
    organization: "iseol",
    frontend: { owner: "iseol", repo: "frontend" },
    backend: { owner: "iseol", repo: "backend" },
  };
  const dir = await mkdtemp(join(tmpdir(), "iseol-daily-scrum-reminder-lifecycle-"));
  const store = new DailyScrumStore(join(dir, "daily-scrum.json"));
  let sentMessages = 0;
  const channel = {
    send: async () => { sentMessages += 1; },
  } as unknown as TextChannel;
  const dependencies = {
    store,
    listProjects: async () => [project],
    findChannel: async () => channel,
  };
  const client = {
    guilds: { cache: new Map([[project.guildId, {}]]) },
  } as unknown as Client;

  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });

  try {
    await writeFile(projectFile, JSON.stringify([project], null, 2), "utf8");
    const deletion = withProjectDeleteLock(project.guildId, project.id, async () => {
      await held;
      assert.equal(await deleteProject(project.id), true);
    });

    await delay(30);
    const reminder = sendDailyScrumReminders(client, new Date("2026-09-30T00:00:00.000Z"), dependencies);
    await delay(80);
    release();

    await Promise.all([deletion, reminder]);
    assert.equal(sentMessages, 0);
    assert.equal(await store.isReminderSent(project.id, "2026-09-30"), false);
  } finally {
    if (previousProjects) await writeFile(projectFile, previousProjects);
    else await rm(projectFile, { force: true });
    await rm(dir, { recursive: true, force: true });
  }
});
