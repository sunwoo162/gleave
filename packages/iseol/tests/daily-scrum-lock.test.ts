import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Client, TextChannel } from "discord.js";
import {
  DailyScrumStore,
  sendDailyScrumReminders,
  type DailyScrumRecord,
} from "../src/services/daily-scrum.js";
import type { StoredProject } from "../src/services/projects.js";

function record(projectId: string, userId: string): DailyScrumRecord {
  return {
    guildId: `guild-${projectId}`,
    projectId,
    userId,
    date: "2026-09-30",
    todo: `todo-${projectId}`,
    did: `did-${projectId}`,
    channelId: `channel-${projectId}`,
    messageId: `message-${projectId}`,
    updatedAt: "2026-09-30T06:00:00.000Z",
  };
}

test("daily scrum state preserves concurrent records from independent stores", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-daily-scrum-lock-"));
  const file = join(dir, "daily-scrum.json");
  const first = new DailyScrumStore(file);
  const second = new DailyScrumStore(file);

  await Promise.all([
    first.saveRecord(record("project-a", "user-a")),
    second.saveRecord(record("project-b", "user-b")),
  ]);

  assert.ok(await new DailyScrumStore(file).getRecord("project-a", "user-a", "2026-09-30"));
  assert.ok(await new DailyScrumStore(file).getRecord("project-b", "user-b", "2026-09-30"));
  await rm(dir, { recursive: true, force: true });
});

test("daily scrum state preserves concurrent project clears from independent stores", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-daily-scrum-clear-lock-"));
  const file = join(dir, "daily-scrum.json");
  const first = new DailyScrumStore(file);
  const second = new DailyScrumStore(file);
  await first.saveRecord(record("project-a", "user-a"));
  await first.saveRecord(record("project-b", "user-b"));

  await Promise.all([
    first.clearProject("project-a"),
    second.clearProject("project-b"),
  ]);

  const result = new DailyScrumStore(file);
  assert.equal(await result.getRecord("project-a", "user-a", "2026-09-30"), null);
  assert.equal(await result.getRecord("project-b", "user-b", "2026-09-30"), null);
  await rm(dir, { recursive: true, force: true });
});

test("daily scrum reminder delivery is once-per-project-and-date across concurrent pollers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-daily-scrum-reminder-lock-"));
  const store = new DailyScrumStore(join(dir, "daily-scrum.json"));
  const project = {
    id: "project-reminder",
    name: "Reminder project",
    guildId: "guild-reminder",
    categoryId: "category-reminder",
  } as StoredProject;
  let sends = 0;
  let releaseSend!: () => void;
  const sendStarted = new Promise<void>((resolve) => {
    releaseSend = resolve;
  });
  const channel = {
    send: async () => {
      sends += 1;
      await sendStarted;
    },
  } as unknown as TextChannel;
  const dependencies = {
    store,
    listProjects: async () => [project],
    findProject: async () => project,
    findChannel: async () => channel,
  };
  const client = {
    guilds: { cache: new Map([[project.guildId, {}]]) },
  } as unknown as Client;

  const first = sendDailyScrumReminders(client, new Date("2026-09-30T00:00:00.000Z"), dependencies);
  while (sends === 0) await new Promise((resolve) => setImmediate(resolve));
  const second = sendDailyScrumReminders(client, new Date("2026-09-30T00:00:00.000Z"), dependencies);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sends, 1);
  releaseSend();
  await Promise.all([first, second]);

  assert.equal(sends, 1);
  assert.equal(await store.isReminderSent(project.id, "2026-09-30"), true);
  await rm(dir, { recursive: true, force: true });
});

test("daily scrum reminder remains retryable when Discord delivery fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-daily-scrum-reminder-retry-"));
  const store = new DailyScrumStore(join(dir, "daily-scrum.json"));
  const project = {
    id: "project-reminder-retry",
    name: "Reminder retry project",
    guildId: "guild-reminder-retry",
    categoryId: "category-reminder-retry",
  } as StoredProject;
  let attempts = 0;
  const channel = {
    send: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("Discord unavailable");
    },
  } as unknown as TextChannel;
  const dependencies = {
    store,
    listProjects: async () => [project],
    findProject: async () => project,
    findChannel: async () => channel,
  };
  const client = {
    guilds: { cache: new Map([[project.guildId, {}]]) },
  } as unknown as Client;
  const now = new Date("2026-09-30T00:00:00.000Z");

  await sendDailyScrumReminders(client, now, dependencies);
  assert.equal(await store.isReminderSent(project.id, "2026-09-30"), false);
  await sendDailyScrumReminders(client, now, dependencies);

  assert.equal(attempts, 2);
  assert.equal(await store.isReminderSent(project.id, "2026-09-30"), true);
  await rm(dir, { recursive: true, force: true });
});
