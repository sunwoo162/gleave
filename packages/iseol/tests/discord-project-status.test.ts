import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import type { ProjectWorkspace } from "../src/project-model/contracts.js";
import type { DiscordProjectContext } from "../src/discord-project/contracts.js";
import { buildDiscordProjectStatus } from "../src/discord-project/status-card.js";
import { withDurableProjectWorkspaceLock } from "../src/project-model/workspace-lock.js";
import { withDurableHarnessRunLock } from "../src/harness/run-lock.js";

const legacy = {
  projectId: "legacy-1",
  name: "Washer",
  guildId: "guild-1",
  categoryId: "category-1",
  organization: "team-washer",
  repositories: {
    frontend: { owner: "team-washer", repo: "web", url: "https://github.com/team-washer/web" },
    backend: { owner: "team-washer", repo: "api", url: "https://github.com/team-washer/api" },
  },
  integrations: {
    calendar: { id: "calendar-1", url: "https://calendar.example.com" },
    figma: { url: "https://figma.com/design/abc" },
    notion: { url: "https://notion.so/spec" },
  },
  channels: {},
};

function workspace(status: "active" | "archived" = "active", deploymentUrl = "https://washer.example.com"): ProjectWorkspace {
  return {
    version: 1, id: "project-1", name: "Washer", status,
    genesis: {
      prototypeId: "prototype-1",
      repository: { url: "https://github.com/team-washer/web", branch: "main", commitSha: "abc123" },
      deployment: { url: deploymentUrl },
      runs: [], promotedAt: "2026-09-07T00:00:00.000Z",
    },
    tree: [
      { id: "root", kind: "root", title: "Washer", status: "in-progress", runIds: ["run-1"], createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" },
    ],
    createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z",
  };
}

function run(): HarnessRuntimeRunEnvelope {
  return {
    version: 1,
    request: { version: 1, runId: "run-1", mode: "project-workspace", objective: "Implement profile", targetRoot: "C:/repo" },
    preflight: { version: 1, runId: "run-1", status: "ready", policy: { version: 1, loadedAt: "2026-09-07T00:00:00.000Z", sources: [], effectiveSha256: "a".repeat(64) } },
    state: { version: 1, stage: "IMPLEMENT", status: "RUNNING", completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN"], skippedStages: [], updatedAt: "2026-09-07T01:00:00.000Z" },
    evidence: [], updatedAt: "2026-09-07T01:00:00.000Z",
  };
}

test("legacy-only status keeps integrations and marks Workspace unbound", async () => {
  const context: DiscordProjectContext = { legacy, state: "legacy-only" };
  const result = await buildDiscordProjectStatus(context, { loadWorkspace: async () => null, loadRun: async () => null });
  assert.equal(result.workspace.state, "unbound");
  assert.equal(result.integrations.calendar, true);
  assert.equal(result.integrations.figma, true);
  assert.equal(result.integrations.notion, true);
});

test("bound status exposes Workspace root Run and Genesis deployment", async () => {
  const context: DiscordProjectContext = {
    legacy,
    state: "bound",
    binding: { version: 1, guildId: "guild-1", storedProjectId: "legacy-1", projectId: "project-1", defaultNodeId: "root", createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" },
    work: { projectId: "project-1", nodeId: "root" },
  };
  const result = await buildDiscordProjectStatus(context, { loadWorkspace: async () => workspace(), loadRun: async () => run() });
  assert.equal(result.workspace.state, "bound");
  assert.equal(result.workspace.projectName, "Washer");
  assert.equal(result.workspace.node?.id, "root");
  assert.equal(result.workspace.runs[0]?.stage, "IMPLEMENT");
  assert.equal(result.workspace.deploymentUrl, "https://washer.example.com");
});

test("bound status omits unsafe Genesis deployment links", async () => {
  const context: DiscordProjectContext = {
    legacy,
    state: "bound",
    binding: { version: 1, guildId: "guild-1", storedProjectId: "legacy-1", projectId: "project-1", defaultNodeId: "root", createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" },
    work: { projectId: "project-1", nodeId: "root" },
  };
  const result = await buildDiscordProjectStatus(context, {
    loadWorkspace: async () => workspace("active", "https://washer.example.com/?token=secret"),
    loadRun: async () => run(),
  });
  assert.equal(result.workspace.deploymentUrl, undefined);
});

test("bound status waits for the Project Workspace lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-discord-status-"));
  const context: DiscordProjectContext = {
    legacy,
    state: "bound",
    binding: { version: 1, guildId: "guild-1", storedProjectId: "legacy-1", projectId: "project-1", defaultNodeId: "root", createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" },
    work: { projectId: "project-1", nodeId: "root" },
  };
  let acquired!: () => void;
  let release!: () => void;
  const lockAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const lockReleased = new Promise<void>((resolve) => { release = resolve; });
  const holder = withDurableProjectWorkspaceLock(root, "project-1", async () => {
    acquired();
    await lockReleased;
  });
  await lockAcquired;

  let completed = false;
  const reading = buildDiscordProjectStatus(context, {
    workspaceRoot: root,
    loadWorkspace: async () => workspace(),
    loadRun: async () => run(),
  }).finally(() => { completed = true; });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(completed, false);

  release();
  assert.equal((await reading).workspace.state, "bound");
  await holder;
});

test("bound status waits for the attached Harness Run lock", async () => {
  const runRoot = await mkdtemp(join(tmpdir(), "iseol-discord-status-run-"));
  const context: DiscordProjectContext = {
    legacy,
    state: "bound",
    binding: { version: 1, guildId: "guild-1", storedProjectId: "legacy-1", projectId: "project-1", defaultNodeId: "root", createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" },
    work: { projectId: "project-1", nodeId: "root" },
  };
  let acquired!: () => void;
  let release!: () => void;
  const lockAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const lockReleased = new Promise<void>((resolve) => { release = resolve; });
  const holder = withDurableHarnessRunLock(runRoot, "run-1", async () => {
    acquired();
    await lockReleased;
  });
  await lockAcquired;

  let completed = false;
  const reading = buildDiscordProjectStatus(context, {
    runRoot,
    loadWorkspace: async () => workspace(),
    loadRun: async () => run(),
  }).finally(() => { completed = true; });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(completed, false);

  release();
  assert.equal((await reading).workspace.runs[0]?.runId, "run-1");
  await holder;
});

test("archived Workspace is visible but explicitly archived", async () => {
  const context: DiscordProjectContext = {
    legacy,
    state: "bound",
    binding: { version: 1, guildId: "guild-1", storedProjectId: "legacy-1", projectId: "project-1", defaultNodeId: "root", createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" },
    work: { projectId: "project-1", nodeId: "root" },
  };
  const result = await buildDiscordProjectStatus(context, { loadWorkspace: async () => workspace("archived"), loadRun: async () => run() });
  assert.equal(result.workspace.projectStatus, "archived");
});

test("stale binding never exposes writable Workspace details", async () => {
  const context: DiscordProjectContext = {
    legacy,
    state: "stale-binding",
    binding: { version: 1, guildId: "guild-1", storedProjectId: "legacy-1", projectId: "project-1", defaultNodeId: "missing", createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" },
    staleReason: "Default node is missing",
  };
  const result = await buildDiscordProjectStatus(context, { loadWorkspace: async () => workspace(), loadRun: async () => run() });
  assert.equal(result.workspace.state, "stale");
  assert.equal(result.workspace.node, undefined);
  assert.match(result.workspace.reason ?? "", /missing/i);
});
