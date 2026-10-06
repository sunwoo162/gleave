import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectContext } from "../src/services/project-context.js";
import type { ProjectWorkspace } from "../src/project-model/contracts.js";
import { saveProjectWorkspace } from "../src/project-model/workspace-store.js";
import { loadProjectHistory } from "../src/project-model/history-store.js";
import { createDiscordProjectBinding } from "../src/discord-project/binding-store.js";
import { resolveBoundActionContext } from "../src/discord-project/action-context.js";
import {
  discordProjectHistoryEventId,
  recordDiscordProjectHistory,
} from "../src/discord-project/history-recorder.js";

const legacy: ProjectContext = {
  projectId: "legacy-1",
  name: "Washer",
  guildId: "guild-1",
  categoryId: "category-1",
  organization: "team-washer",
  repositories: {
    frontend: { owner: "team-washer", repo: "web", url: "https://github.com/team-washer/web" },
    backend: { owner: "team-washer", repo: "api", url: "https://github.com/team-washer/api" },
  },
  integrations: { calendar: {}, figma: {}, notion: {} },
  channels: {},
};

function workspace(): ProjectWorkspace {
  return {
    version: 1,
    id: "project-1",
    name: "Washer",
    status: "active",
    genesis: {
      prototypeId: "prototype-1",
      repository: { url: "https://github.com/team-washer/web", branch: "main", commitSha: "abc" },
      deployment: { url: "https://washer.example.com" },
      runs: [],
      promotedAt: "2026-09-07T00:00:00.000Z",
    },
    tree: [{ id: "root", kind: "root", title: "Washer", status: "in-progress", runIds: ["run-1"], createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" }],
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
  };
}

async function fixture(bound = true) {
  const root = await mkdtemp(join(tmpdir(), "iseol-discord-history-"));
  const modelRoot = join(root, "model");
  await saveProjectWorkspace(modelRoot, workspace());
  if (bound) {
    await createDiscordProjectBinding(modelRoot, {
      guildId: "guild-1", storedProjectId: "legacy-1", projectId: "project-1", defaultNodeId: "root", at: "2026-09-08T00:00:00.000Z",
    });
  }
  return { modelRoot };
}

test("bound action context resolves default node and validates attached Run", async () => {
  const { modelRoot } = await fixture(true);
  const context = await resolveBoundActionContext({
    modelRoot,
    bindingRoot: modelRoot,
    guildId: "guild-1",
    storedProjectId: "legacy-1",
    runId: "run-1",
    resolveLegacy: async () => legacy,
  });
  assert.ok(context);
  assert.equal(context.projectId, "project-1");
  assert.equal(context.nodeId, "root");
  assert.equal(context.runId, "run-1");
});

test("unbound actions return null while stale bindings fail closed", async () => {
  const unbound = await fixture(false);
  assert.equal(await resolveBoundActionContext({
    modelRoot: unbound.modelRoot,
    bindingRoot: unbound.modelRoot,
    guildId: "guild-1",
    storedProjectId: "legacy-1",
    resolveLegacy: async () => legacy,
  }), null);

  const stale = await fixture(true);
  await saveProjectWorkspace(stale.modelRoot, { ...workspace(), tree: [] });
  await assert.rejects(resolveBoundActionContext({
    modelRoot: stale.modelRoot,
    bindingRoot: stale.modelRoot,
    guildId: "guild-1",
    storedProjectId: "legacy-1",
    resolveLegacy: async () => legacy,
  }), /stale/i);
});

test("history event ids are deterministic and duplicate recording is suppressed", async () => {
  const { modelRoot } = await fixture(true);
  const identity = {
    projectId: "project-1",
    nodeId: "root",
    source: "calendar" as const,
    action: "event-created",
    reference: "calendar:event-1",
  };
  assert.equal(discordProjectHistoryEventId(identity), discordProjectHistoryEventId(identity));

  const input = {
    modelRoot,
    context: { projectId: "project-1", nodeId: "root" },
    eventType: "integration-action-recorded" as const,
    source: "calendar" as const,
    action: "event-created",
    reference: "calendar:event-1",
    summary: "Calendar event created",
    at: "2026-09-08T01:00:00.000Z",
  };
  assert.equal(await recordDiscordProjectHistory(input), true);
  assert.equal(await recordDiscordProjectHistory(input), false);
  const history = await loadProjectHistory(modelRoot, "project-1");
  assert.equal(history.length, 1);
  assert.equal(history[0]?.source, "calendar");
  assert.equal(history[0]?.action, "event-created");
  assert.equal(history[0]?.nodeId, "root");
});

test("history recorder rejects credential-like summaries", async () => {
  const { modelRoot } = await fixture(true);
  await assert.rejects(recordDiscordProjectHistory({
    modelRoot,
    context: { projectId: "project-1", nodeId: "root" },
    eventType: "discord-action-recorded",
    source: "discord",
    action: "unsafe",
    reference: "discord:1",
    summary: "Authorization: Bearer secret-value",
    at: "2026-09-08T01:00:00.000Z",
  }), /credential|secret/i);
});

test("history retry does not require repeating the provider action", async () => {
  const { modelRoot } = await fixture(true);
  let providerCalls = 0;
  providerCalls += 1;
  let appendAttempts = 0;
  const input = {
    modelRoot,
    context: { projectId: "project-1", nodeId: "root" },
    eventType: "integration-action-recorded" as const,
    source: "github" as const,
    action: "issue-created",
    reference: "github:issue-42",
    summary: "GitHub issue created",
    at: "2026-09-08T01:00:00.000Z",
  };
  await assert.rejects(recordDiscordProjectHistory(input, {
    appendOnce: async () => {
      appendAttempts += 1;
      throw new Error("history store unavailable");
    },
  }), /unavailable/);
  assert.equal(providerCalls, 1);
  assert.equal(appendAttempts, 1);

  assert.equal(await recordDiscordProjectHistory(input), true);
  assert.equal(providerCalls, 1);
  const history = await loadProjectHistory(modelRoot, "project-1");
  assert.equal(history.length, 1);
  assert.equal(history[0]?.reference, "github:issue-42");
});
