import assert from "node:assert/strict";
import test from "node:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { ChannelType, type Guild } from "discord.js";
import { resetGuildState } from "../src/services/guild-reset.js";
import { deleteProject, withProjectDeleteLock, type StoredProject } from "../src/services/projects.js";

const DATA_FILES = [
  "data/projects.json",
  "data/contest-feed.json",
  "data/contest-audience-feeds.json",
  "data/contest-votes.json",
  "data/job-feed.json",
  "data/music-playlists.json",
  "data/voice-study-time.json",
  "data/daily-scrum.json",
  "data/github-users.json",
  "data/calendar-state.json",
  "data/github-commit-feed.json",
  "data/github-automation-polling.json",
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("guild reset waits for a concurrent project deletion before fetching channels", async () => {
  const previous = new Map<string, Buffer>();
  for (const file of DATA_FILES) {
    try { previous.set(file, await readFile(file)); } catch { /* test creates the file */ }
  }

  const project: StoredProject = {
    id: "guild-reset-project-lifecycle-lock",
    name: "Guild reset project lifecycle lock",
    guildId: "guild-reset-project-lifecycle-lock-guild",
    categoryId: "guild-reset-project-lifecycle-lock-category",
    organization: "iseol",
    frontend: { owner: "iseol", repo: "frontend" },
    backend: { owner: "iseol", repo: "backend" },
  };
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let channelsFetched = false;
  const guild = {
    id: project.guildId,
    name: "Guild reset project lifecycle lock",
    channels: {
      fetch: async () => {
        channelsFetched = true;
        return new Map();
      },
    },
  } as unknown as Guild;

  try {
    await writeFile("data/projects.json", JSON.stringify([project], null, 2), "utf8");
    const deletion = withProjectDeleteLock(project.guildId, project.id, async () => {
      await held;
      assert.equal(await deleteProject(project.id), true);
    });

    await delay(30);
    const reset = resetGuildState(guild);
    await delay(80);
    assert.equal(channelsFetched, false);

    release();
    await Promise.all([deletion, reset]);
    assert.equal(channelsFetched, true);
  } finally {
    for (const file of DATA_FILES) {
      const content = previous.get(file);
      if (content) await writeFile(file, content);
      else await rm(file, { force: true });
    }
  }
});

test("guild reset clears project-scoped polling, Calendar state, and GitHub account links for removed projects", async () => {
  const previous = new Map<string, Buffer>();
  for (const file of DATA_FILES) {
    try { previous.set(file, await readFile(file)); } catch { /* test creates the file */ }
  }

  const project: StoredProject = {
    id: "guild-reset-poll-state-project",
    name: "Guild reset poll state project",
    guildId: "guild-reset-poll-state-guild",
    categoryId: "guild-reset-poll-state-category",
    organization: "iseol",
    frontend: { owner: "iseol", repo: "frontend" },
    backend: { owner: "iseol", repo: "backend" },
  };
  const guild = {
    id: project.guildId,
    name: "Guild reset poll state",
    channels: { fetch: async () => new Map() },
  } as unknown as Guild;

  try {
    await writeFile("data/projects.json", JSON.stringify([project], null, 2), "utf8");
    await writeFile("data/github-commit-feed.json", JSON.stringify([
      { key: `${project.id}:frontend`, guildId: project.guildId, projectId: project.id, side: "frontend", seenEventIds: [], seenCommitShas: [], initializedAt: "2026-09-30T00:00:00.000Z" },
      { key: "active-project:frontend", guildId: "other-guild", projectId: "active-project", side: "frontend", seenEventIds: [], seenCommitShas: [], initializedAt: "2026-09-30T00:00:00.000Z" },
    ], null, 2), "utf8");
    await writeFile("data/github-automation-polling.json", JSON.stringify({ repositories: {
      [`${project.id}:iseol/frontend`]: { milestones: { "1": "deleted" } },
      "active-project:iseol/frontend": { milestones: { "2": "active" } },
    } }, null, 2), "utf8");
    await writeFile("data/calendar-state.json", JSON.stringify([
      { externalKey: `${project.id}:iseol/frontend:issue:1`, projectId: project.id, calendarId: "guild-reset-calendar", eventId: "deleted-event", source: "issue" },
      { externalKey: "active-project:iseol/frontend:issue:2", projectId: "active-project", calendarId: "active-calendar", eventId: "active-event", source: "issue" },
    ], null, 2), "utf8");
    await writeFile("data/github-users.json", JSON.stringify([
      { guildId: project.guildId, discordUserId: "deleted-user", githubLogin: "deleted-login", connectedAt: "2026-09-30T00:00:00.000Z" },
      { guildId: "other-guild", discordUserId: "active-user", githubLogin: "active-login", connectedAt: "2026-09-30T00:00:00.000Z" },
    ], null, 2), "utf8");

    const summary = await resetGuildState(guild);
    assert.equal(summary.warnings.length, 0);
    assert.deepEqual(JSON.parse(await readFile("data/github-commit-feed.json", "utf8")), [
      { key: "active-project:frontend", guildId: "other-guild", projectId: "active-project", side: "frontend", seenEventIds: [], seenCommitShas: [], initializedAt: "2026-09-30T00:00:00.000Z" },
    ]);
    assert.deepEqual(JSON.parse(await readFile("data/github-automation-polling.json", "utf8")), {
      repositories: { "active-project:iseol/frontend": { milestones: { "2": "active" } } },
    });
    assert.deepEqual(JSON.parse(await readFile("data/calendar-state.json", "utf8")), [
      { externalKey: "active-project:iseol/frontend:issue:2", projectId: "active-project", calendarId: "active-calendar", eventId: "active-event", source: "issue" },
    ]);
    assert.deepEqual(JSON.parse(await readFile("data/github-users.json", "utf8")), [
      { guildId: "other-guild", discordUserId: "active-user", githubLogin: "active-login", connectedAt: "2026-09-30T00:00:00.000Z" },
    ]);
  } finally {
    for (const file of DATA_FILES) {
      const content = previous.get(file);
      if (content) await writeFile(file, content);
      else await rm(file, { force: true });
    }
  }
});

test("guild reset redacts credential-shaped channel deletion warnings", async () => {
  const previous = new Map<string, Buffer>();
  for (const file of DATA_FILES) {
    try { previous.set(file, await readFile(file)); } catch { /* test creates the file */ }
  }

  const project: StoredProject = {
    id: "guild-reset-warning-redaction",
    name: "Guild reset warning redaction",
    guildId: "guild-reset-warning-redaction-guild",
    categoryId: "guild-reset-warning-redaction-category",
    organization: "iseol",
    frontend: { owner: "iseol", repo: "frontend" },
    backend: { owner: "iseol", repo: "backend" },
  };
  const category = {
    id: project.categoryId,
    name: "📁 warning redaction",
    type: ChannelType.GuildCategory,
    parentId: null,
    delete: async () => { throw new Error("token=reset-secret"); },
  };
  const guild = {
    id: project.guildId,
    name: "Guild reset warning redaction",
    channels: { fetch: async () => new Map([[category.id, category]]) },
  } as unknown as Guild;

  try {
    await writeFile("data/projects.json", JSON.stringify([project], null, 2), "utf8");
    const summary = await resetGuildState(guild);

    assert.equal(summary.warnings.length, 1);
    assert.match(summary.warnings[0], /\[redacted\]/);
    assert.doesNotMatch(summary.warnings[0], /reset-secret/);
  } finally {
    for (const file of DATA_FILES) {
      const content = previous.get(file);
      if (content) await writeFile(file, content);
      else await rm(file, { force: true });
    }
  }
});
