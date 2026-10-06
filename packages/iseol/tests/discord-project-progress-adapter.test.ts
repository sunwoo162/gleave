import assert from "node:assert/strict";
import test from "node:test";
import { createBoundProjectProgressChannelResolver, createDiscordProgressAdapter } from "../src/discord-project/progress-discord-adapter.js";
import { createDiscordProjectBinding } from "../src/discord-project/binding-store.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { withProjectDeleteLock, type StoredProject } from "../src/services/projects.js";

test("Discord progress adapter sends allowlisted content without mentions", async () => {
  let payload: unknown;
  const adapter = createDiscordProgressAdapter({} as never, async () => ({
    send: async (value: unknown) => { payload = value; return { id: "message-1" }; },
  } as never));
  const result = await adapter.send({ eventId: "event-1", projectId: "project-1", title: "run.updated", content: "Project project-1: done", occurredAt: "2026-09-20T00:00:00.000Z" });
  assert.deepEqual(result, { accepted: true, messageId: "message-1" });
  assert.deepEqual(payload, { content: "Project project-1: done", allowedMentions: { parse: [] } });
});

test("Discord progress adapter fails closed when no channel is resolved", async () => {
  const adapter = createDiscordProgressAdapter({} as never, async () => null);
  assert.deepEqual(await adapter.send({ eventId: "event-2", projectId: "project-1", title: "run.updated", content: "bounded", occurredAt: "2026-09-20T00:00:00.000Z" }), { accepted: false });
});

test("bound project resolver uses existing binding and configured log channel", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-discord-binding-"));
  await createDiscordProjectBinding(root, { guildId: "guild-1", storedProjectId: "stored-1", projectId: "project-1", defaultNodeId: "root", at: "2026-09-20T00:00:00.000Z" });
  const channel = { send: async () => ({ id: "message-1" }) };
  const resolver = createBoundProjectProgressChannelResolver({ bindingRoot: root, loadProjects: async () => [{ id: "stored-1", name: "Project", guildId: "guild-1", categoryId: "category-1", organization: "org", frontend: { owner: "owner", repo: "repo" }, backend: { owner: "owner", repo: "repo" }, frontendLogChannelId: "channel-1" }] });
  const resolved = await resolver({ guilds: { cache: new Map(), fetch: async () => ({ channels: { fetch: async () => channel } }) } } as never, { eventId: "event-1", projectId: "project-1", title: "run.updated", content: "bounded", occurredAt: "2026-09-20T00:00:00.000Z" });
  assert.equal(resolved, channel);
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("Project Workspace progress delivery skips a stale project after waiting for deletion", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-progress-lifecycle-"));
  const project: StoredProject = {
    id: "progress-lifecycle-stored",
    name: "Progress lifecycle project",
    guildId: "progress-lifecycle-guild",
    categoryId: "progress-lifecycle-category",
    organization: "iseol",
    frontend: { owner: "iseol", repo: "frontend" },
    backend: { owner: "iseol", repo: "backend" },
    frontendLogChannelId: "progress-lifecycle-channel",
  };
  let current: StoredProject | null = project;
  let sendCalls = 0;
  let release!: () => void;
  let deletionEntered!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const deletionReady = new Promise<void>((resolve) => { deletionEntered = resolve; });
  const channel = {
    send: async () => {
      sendCalls += 1;
      return { id: "message-1" };
    },
  };
  const client = {
    guilds: {
      cache: new Map(),
      fetch: async () => ({ channels: { fetch: async () => channel } }),
    },
  } as never;

  try {
    await createDiscordProjectBinding(root, {
      guildId: project.guildId,
      storedProjectId: project.id,
      projectId: "progress-lifecycle-workspace",
      defaultNodeId: "root",
      at: "2026-09-30T00:00:00.000Z",
    });
    const resolver = createBoundProjectProgressChannelResolver({
      bindingRoot: root,
      loadProjects: async () => current ? [current] : [],
      findProject: async () => current,
    });
    const adapter = createDiscordProgressAdapter(client, resolver);
    const deletion = withProjectDeleteLock(project.guildId, project.id, async () => {
      deletionEntered();
      await held;
      current = null;
    });
    await deletionReady;

    const delivery = adapter.send({
      eventId: "progress-lifecycle-event",
      projectId: "progress-lifecycle-workspace",
      title: "run.updated",
      content: "bounded",
      occurredAt: "2026-09-30T00:00:00.000Z",
    });
    await delay(50);
    assert.equal(sendCalls, 0);
    release();

    assert.deepEqual(await delivery, { accepted: false });
    await deletion;
    assert.equal(sendCalls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
