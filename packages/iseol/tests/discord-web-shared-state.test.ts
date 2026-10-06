import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import type { ProjectWorkspace } from "../src/project-model/contracts.js";
import type { ProjectContext } from "../src/services/project-context.js";
import { saveHarnessRun } from "../src/harness/run-store.js";
import { createDiscordProjectBinding } from "../src/discord-project/binding-store.js";
import { resolveDiscordProjectContext } from "../src/discord-project/context-resolver.js";
import { buildDiscordProjectStatus } from "../src/discord-project/status-card.js";
import { updateProjectTreeNodeStatus } from "../src/project-model/project-tree.js";
import { saveProjectWorkspace, loadProjectWorkspace } from "../src/project-model/workspace-store.js";
import { buildProjectWorkspaceView } from "../src/web-control-plane/view-model.js";

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
    tree: [
      { id: "root", kind: "root", title: "Washer", status: "in-progress", runIds: [], createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" },
      { id: "profile", parentId: "root", kind: "feature", title: "Profile", status: "planned", runIds: ["run-1"], createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" },
    ],
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
  };
}

function run(stage: "ANALYZE" | "IMPLEMENT"): HarnessRuntimeRunEnvelope {
  return {
    version: 1,
    request: { version: 1, runId: "run-1", mode: "project-workspace", objective: "Profile editing", targetRoot: "C:/repo" },
    preflight: { version: 1, runId: "run-1", status: "ready", policy: { version: 1, loadedAt: "2026-09-07T00:00:00.000Z", sources: [], effectiveSha256: "a".repeat(64) } },
    state: {
      version: 1,
      stage,
      status: "RUNNING",
      completedStages: ["PREFLIGHT", "CONTEXT"],
      skippedStages: [],
      updatedAt: "2026-09-08T04:00:00.000Z",
    },
    evidence: [],
    updatedAt: "2026-09-08T04:00:00.000Z",
  };
}

test("Discord and Web observe the same Workspace node and Run state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-shared-state-"));
  const modelRoot = join(root, "model");
  const runRoot = join(root, "runs");
  await saveProjectWorkspace(modelRoot, workspace());
  await saveHarnessRun(runRoot, run("ANALYZE"));
  await createDiscordProjectBinding(modelRoot, {
    guildId: "guild-1", storedProjectId: "legacy-1", projectId: "project-1", defaultNodeId: "profile", at: "2026-09-08T03:00:00.000Z",
  });

  const current = await loadProjectWorkspace(modelRoot, "project-1");
  assert.ok(current);
  await saveProjectWorkspace(modelRoot, updateProjectTreeNodeStatus(current, "profile", "in-progress", "2026-09-08T04:00:00.000Z"));
  await saveHarnessRun(runRoot, run("IMPLEMENT"));

  const context = await resolveDiscordProjectContext({
    modelRoot,
    bindingRoot: modelRoot,
    guildId: "guild-1",
    storedProjectId: "legacy-1",
    resolveLegacy: async () => legacy,
  });
  assert.ok(context);
  const discord = await buildDiscordProjectStatus(context, {
    loadWorkspace: (id) => loadProjectWorkspace(modelRoot, id),
    loadRun: async (id) => id === "run-1" ? run("IMPLEMENT") : null,
  });
  const web = await buildProjectWorkspaceView(modelRoot, runRoot, "project-1");
  assert.ok(web);

  const webNode = web.tree.find((node) => node.id === "profile");
  assert.equal(discord.workspace.node?.status, "in-progress");
  assert.equal(webNode?.status, "in-progress");
  assert.equal(discord.workspace.runs[0]?.stage, "IMPLEMENT");
  assert.equal(web.runs[0]?.stage, "IMPLEMENT");
});

test("an unbound legacy project remains readable without Workspace state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-shared-state-"));
  const context = await resolveDiscordProjectContext({
    modelRoot: join(root, "model"),
    bindingRoot: join(root, "model"),
    guildId: "guild-1",
    storedProjectId: "legacy-1",
    resolveLegacy: async () => legacy,
  });
  assert.equal(context?.state, "legacy-only");
  const discord = await buildDiscordProjectStatus(context!, { loadWorkspace: async () => null, loadRun: async () => null });
  assert.equal(discord.legacy.name, "Washer");
  assert.equal(discord.workspace.state, "unbound");
});
