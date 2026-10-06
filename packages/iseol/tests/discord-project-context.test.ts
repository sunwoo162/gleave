import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectWorkspace } from "../src/project-model/contracts.js";
import { saveProjectWorkspace } from "../src/project-model/workspace-store.js";
import type { ProjectContext } from "../src/services/project-context.js";
import { createDiscordProjectBinding } from "../src/discord-project/binding-store.js";
import { resolveDiscordProjectContext } from "../src/discord-project/context-resolver.js";
import { withDurableProjectWorkspaceLock } from "../src/project-model/workspace-lock.js";

function legacy(): ProjectContext {
  return {
    projectId: "legacy-001",
    name: "Iseol",
    guildId: "1234567890",
    categoryId: "category-1",
    organization: "example",
    repositories: {
      frontend: { owner: "example", repo: "front", url: "https://github.com/example/front" },
      backend: { owner: "example", repo: "back", url: "https://github.com/example/back" },
    },
    integrations: { calendar: {}, figma: {}, notion: {} },
    channels: {},
  };
}

function workspace(): ProjectWorkspace {
  const at = "2026-09-07T12:00:00.000Z";
  return {
    version: 1,
    id: "project-prototype-001",
    name: "Iseol Workspace",
    status: "active",
    genesis: {
      prototypeId: "prototype-001",
      repository: { url: "https://github.com/example/front", branch: "main", commitSha: "abc123" },
      deployment: { url: "https://iseol.example.com" },
      runs: [],
      promotedAt: at,
    },
    tree: [
      { id: "root", kind: "root", title: "Iseol", status: "in-progress", runIds: [], createdAt: at, updatedAt: at },
      { id: "feature-a", parentId: "root", kind: "feature", title: "Feature A", status: "in-progress", runIds: ["run-001"], createdAt: at, updatedAt: at },
    ],
    createdAt: at,
    updatedAt: at,
  };
}

async function fixture(bound = true) {
  const root = await mkdtemp(join(tmpdir(), "iseol-discord-context-"));
  const modelRoot = join(root, "model");
  const bindingRoot = join(root, "bindings");
  await saveProjectWorkspace(modelRoot, workspace());
  if (bound) {
    await createDiscordProjectBinding(bindingRoot, {
      guildId: "1234567890",
      storedProjectId: "legacy-001",
      projectId: "project-prototype-001",
      defaultNodeId: "root",
      at: "2026-09-07T12:00:00.000Z",
    });
  }
  return { root, modelRoot, bindingRoot };
}

const resolveLegacy = async (projectId: string, guildId: string) => {
  const context = legacy();
  return projectId === context.projectId && guildId === context.guildId ? context : null;
};

test("unbound legacy project remains usable without Workspace context", async () => {
  const { modelRoot, bindingRoot } = await fixture(false);
  const context = await resolveDiscordProjectContext({
    modelRoot,
    bindingRoot,
    guildId: "1234567890",
    storedProjectId: "legacy-001",
    resolveLegacy,
  });
  assert.equal(context?.state, "legacy-only");
  assert.equal(context?.legacy.projectId, "legacy-001");
  assert.equal(context?.binding, undefined);
  assert.equal(context?.work, undefined);
});

test("bound project resolves the default root work context", async () => {
  const { modelRoot, bindingRoot } = await fixture();
  const context = await resolveDiscordProjectContext({
    modelRoot,
    bindingRoot,
    guildId: "1234567890",
    storedProjectId: "legacy-001",
    resolveLegacy,
  });
  assert.equal(context?.state, "bound");
  assert.equal(context?.work?.projectId, "project-prototype-001");
  assert.equal(context?.work?.nodeId, "root");
});

test("bound context resolution waits for the Project Workspace lock", async () => {
  const { modelRoot, bindingRoot } = await fixture();
  let acquired!: () => void;
  let release!: () => void;
  const lockAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const lockReleased = new Promise<void>((resolve) => { release = resolve; });
  const holder = withDurableProjectWorkspaceLock(modelRoot, "project-prototype-001", async () => {
    acquired();
    await lockReleased;
  });
  await lockAcquired;

  let completed = false;
  const resolving = resolveDiscordProjectContext({
    modelRoot,
    bindingRoot,
    workspaceRoot: modelRoot,
    guildId: "1234567890",
    storedProjectId: "legacy-001",
    resolveLegacy,
  }).finally(() => { completed = true; });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(completed, false);

  release();
  assert.equal((await resolving)?.state, "bound");
  await holder;
});

test("explicit node and attached Run are validated together", async () => {
  const { modelRoot, bindingRoot } = await fixture();
  const context = await resolveDiscordProjectContext({
    modelRoot,
    bindingRoot,
    guildId: "1234567890",
    storedProjectId: "legacy-001",
    nodeId: "feature-a",
    runId: "run-001",
    resolveLegacy,
  });
  assert.equal(context?.state, "bound");
  assert.equal(context?.work?.nodeId, "feature-a");
  assert.equal(context?.work?.runId, "run-001");
});

test("invalid node or Run relation creates a stale binding result", async () => {
  const { modelRoot, bindingRoot } = await fixture();
  const invalidNode = await resolveDiscordProjectContext({
    modelRoot, bindingRoot, guildId: "1234567890", storedProjectId: "legacy-001",
    nodeId: "missing", resolveLegacy,
  });
  assert.equal(invalidNode?.state, "stale-binding");
  assert.equal(invalidNode?.work, undefined);

  const invalidRun = await resolveDiscordProjectContext({
    modelRoot, bindingRoot, guildId: "1234567890", storedProjectId: "legacy-001",
    nodeId: "feature-a", runId: "run-other", resolveLegacy,
  });
  assert.equal(invalidRun?.state, "stale-binding");
  assert.equal(invalidRun?.work, undefined);
});

test("guild mismatch is rejected before binding resolution", async () => {
  const { modelRoot, bindingRoot } = await fixture();
  const context = await resolveDiscordProjectContext({
    modelRoot,
    bindingRoot,
    guildId: "other-guild",
    storedProjectId: "legacy-001",
    resolveLegacy,
  });
  assert.equal(context, null);
});

test("binding to a missing Workspace fails closed as stale", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-discord-context-"));
  const bindingRoot = join(root, "bindings");
  await createDiscordProjectBinding(bindingRoot, {
    guildId: "1234567890",
    storedProjectId: "legacy-001",
    projectId: "project-missing",
    defaultNodeId: "root",
    at: "2026-09-07T12:00:00.000Z",
  });
  const context = await resolveDiscordProjectContext({
    modelRoot: join(root, "model"),
    bindingRoot,
    guildId: "1234567890",
    storedProjectId: "legacy-001",
    resolveLegacy,
  });
  assert.equal(context?.state, "stale-binding");
  assert.match(context?.staleReason ?? "", /workspace/i);
});
