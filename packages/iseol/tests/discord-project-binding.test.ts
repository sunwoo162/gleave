import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StoredProject } from "../src/services/projects.js";
import {
  mapStoredProjectContext,
  resolveProjectContext,
  selectProjectRepository,
} from "../src/services/project-context.js";
import {
  createDiscordProjectBinding,
  deleteDiscordProjectBinding,
  loadDiscordProjectBinding,
} from "../src/discord-project/binding-store.js";
import { withDurableDiscordProjectBindingLock } from "../src/discord-project/binding-lock.js";

function storedProject(): StoredProject {
  return {
    id: "legacy-001",
    name: "Iseol",
    guildId: "1234567890",
    categoryId: "category-1",
    organization: "example",
    frontend: { owner: "example", repo: "frontend", url: "https://github.com/example/frontend" },
    backend: { owner: "example", repo: "backend", url: "https://github.com/example/backend" },
    frontendLogChannelId: "front-log",
    backendLogChannelId: "back-log",
    calendarId: "calendar-1",
    calendarUrl: "https://calendar.example.com/1",
    calendarChannelId: "calendar-channel",
    figmaUrl: "https://figma.com/design/file",
    figmaFileKey: "figma-key",
    figmaChannelId: "figma-channel",
    notionUrl: "https://notion.so/page",
    notionPageId: "notion-page",
    notionChannelId: "notion-channel",
  };
}

test("StoredProject maps to a read-only guild-scoped ProjectContext", async () => {
  const project = storedProject();
  const context = mapStoredProjectContext(project);
  assert.equal(context.projectId, project.id);
  assert.equal(context.guildId, project.guildId);
  assert.equal(context.repositories.frontend.repo, "frontend");
  assert.equal(context.integrations.calendar.id, "calendar-1");
  assert.equal(context.integrations.figma.fileKey, "figma-key");
  assert.equal(context.integrations.notion.pageId, "notion-page");
  assert.equal(context.channels.frontendLogId, "front-log");
  assert.equal(selectProjectRepository(context, "backend").repo, "backend");
});

test("ProjectContext resolver enforces guild isolation", async () => {
  const project = storedProject();
  const find = async (id: string) => id === project.id ? project : null;

  const context = await resolveProjectContext(project.id, project.guildId, find);
  assert.equal(context?.projectId, project.id);
  assert.equal(await resolveProjectContext(project.id, "other-guild", find), null);
  assert.equal(await resolveProjectContext("missing", project.guildId, find), null);
});

test("binding create/read/delete is explicit and idempotent for the same target", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-discord-binding-"));
  const input = {
    guildId: "1234567890",
    storedProjectId: "legacy-001",
    projectId: "project-prototype-001",
    defaultNodeId: "root",
    at: "2026-09-07T12:00:00.000Z",
  } as const;

  const created = await createDiscordProjectBinding(root, input);
  const repeated = await createDiscordProjectBinding(root, input);
  assert.deepEqual(repeated, created);
  assert.deepEqual(await loadDiscordProjectBinding(root, input.guildId, input.storedProjectId), created);
  assert.equal(await deleteDiscordProjectBinding(root, input.guildId, input.storedProjectId), true);
  assert.equal(await loadDiscordProjectBinding(root, input.guildId, input.storedProjectId), null);
});

test("binding rejects conflicting rebinds and unsafe ids", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-discord-binding-"));
  await createDiscordProjectBinding(root, {
    guildId: "1234567890",
    storedProjectId: "legacy-001",
    projectId: "project-a",
    defaultNodeId: "root",
    at: "2026-09-07T12:00:00.000Z",
  });

  await assert.rejects(
    createDiscordProjectBinding(root, {
      guildId: "1234567890",
      storedProjectId: "legacy-001",
      projectId: "project-b",
      defaultNodeId: "root",
      at: "2026-09-07T12:01:00.000Z",
    }),
    /rebind/i,
  );

  await assert.rejects(
    loadDiscordProjectBinding(root, "../escape", "legacy-001"),
    /invalid/i,
  );
});

test("binding creation waits for the durable binding lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-discord-binding-"));
  const input = {
    guildId: "1234567890",
    storedProjectId: "legacy-001",
    projectId: "project-a",
    defaultNodeId: "root",
    at: "2026-09-07T12:00:00.000Z",
  } as const;
  let acquired!: () => void;
  let release!: () => void;
  const lockAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const lockReleased = new Promise<void>((resolve) => { release = resolve; });
  const holder = withDurableDiscordProjectBindingLock(
    root,
    input.guildId,
    input.storedProjectId,
    async () => {
      acquired();
      await lockReleased;
    },
  );
  await lockAcquired;

  let completed = false;
  const creating = createDiscordProjectBinding(root, input).finally(() => { completed = true; });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(completed, false);

  release();
  const created = await creating;
  await holder;
  assert.deepEqual(
    await loadDiscordProjectBinding(root, input.guildId, input.storedProjectId),
    created,
  );
});

test("binding reads wait for the durable binding lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-discord-binding-"));
  const input = {
    guildId: "1234567890",
    storedProjectId: "legacy-001",
    projectId: "project-a",
    defaultNodeId: "root",
    at: "2026-09-07T12:00:00.000Z",
  } as const;
  const created = await createDiscordProjectBinding(root, input);
  let acquired!: () => void;
  let release!: () => void;
  const lockAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const lockReleased = new Promise<void>((resolve) => { release = resolve; });
  const holder = withDurableDiscordProjectBindingLock(
    root,
    input.guildId,
    input.storedProjectId,
    async () => {
      acquired();
      await lockReleased;
    },
  );
  await lockAcquired;

  let completed = false;
  const loading = loadDiscordProjectBinding(root, input.guildId, input.storedProjectId)
    .finally(() => { completed = true; });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(completed, false);

  release();
  assert.deepEqual(await loading, created);
  await holder;
});
