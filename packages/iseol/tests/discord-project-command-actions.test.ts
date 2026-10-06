import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectWorkspace } from "../src/project-model/contracts.js";
import type { StoredProject } from "../src/services/projects.js";
import { projectCommand } from "../src/commands/project.js";
import {
  bindDiscordProjectWorkspace,
  discordProjectBindingHistoryFact,
  listDiscordProjectBindingChoices,
} from "../src/discord-project/project-command-actions.js";
import { withDurableProjectWorkspaceLock } from "../src/project-model/workspace-lock.js";

const storedProject: StoredProject = {
  id: "legacy-1",
  name: "Washer",
  guildId: "guild-1",
  categoryId: "category-1",
  organization: "team-washer",
  frontend: { owner: "team-washer", repo: "web", url: "https://github.com/team-washer/web" },
  backend: { owner: "team-washer", repo: "api", url: "https://github.com/team-washer/api" },
};

function workspace(status: "active" | "archived" = "active"): ProjectWorkspace {
  return {
    version: 1,
    id: "project-1",
    name: "Washer",
    status,
    genesis: {
      prototypeId: "prototype-1",
      repository: { url: "https://github.com/team-washer/web", branch: "main", commitSha: "abc" },
      deployment: { url: "https://washer.example.com" },
      runs: [],
      promotedAt: "2026-09-07T00:00:00.000Z",
    },
    tree: [{ id: "root", kind: "root", title: "Washer", status: "in-progress", runIds: [], createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" }],
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
  };
}

test("binding choices are isolated to the current guild and active workspaces", async () => {
  const choices = await listDiscordProjectBindingChoices("guild-1", {
    listStoredProjects: async () => [storedProject, { ...storedProject, id: "other", guildId: "guild-2" }],
    listWorkspaces: async () => [workspace(), { ...workspace("archived"), id: "archived" }],
  });
  assert.deepEqual(choices.projects.map((item) => item.value), ["legacy-1"]);
  assert.deepEqual(choices.workspaces.map((item) => item.value), ["project-1"]);
});

test("binding requires the StoredProject guild and an active Workspace root", async () => {
  await assert.rejects(
    bindDiscordProjectWorkspace({ guildId: "guild-2", storedProjectId: "legacy-1", projectId: "project-1", at: "2026-09-08T00:00:00.000Z" }, {
      findStoredProject: async () => storedProject,
      loadWorkspace: async () => workspace(),
      createBinding: async () => { throw new Error("must not bind"); },
    }),
    /guild/i,
  );
  await assert.rejects(
    bindDiscordProjectWorkspace({ guildId: "guild-1", storedProjectId: "legacy-1", projectId: "project-1", at: "2026-09-08T00:00:00.000Z" }, {
      findStoredProject: async () => storedProject,
      loadWorkspace: async () => workspace("archived"),
      createBinding: async () => { throw new Error("must not bind"); },
    }),
    /active/i,
  );
});

test("same bind is idempotent while conflicting bind errors are preserved", async () => {
  let calls = 0;
  const deps = {
    findStoredProject: async () => storedProject,
    loadWorkspace: async () => workspace(),
    createBinding: async (input: any) => {
      calls += 1;
      return { version: 1 as const, ...input, defaultNodeId: "root", createdAt: input.at, updatedAt: input.at };
    },
  };
  const first = await bindDiscordProjectWorkspace(
    { guildId: "guild-1", storedProjectId: "legacy-1", projectId: "project-1", at: "2026-09-08T00:00:00.000Z" },
    deps,
  );
  assert.equal(first.defaultNodeId, "root");
  assert.equal(calls, 1);

  await assert.rejects(
    bindDiscordProjectWorkspace(
      { guildId: "guild-1", storedProjectId: "legacy-1", projectId: "project-2", at: "2026-09-08T00:00:00.000Z" },
      { ...deps, loadWorkspace: async () => ({ ...workspace(), id: "project-2" }), createBinding: async () => { throw new Error("explicit rebind required"); } },
    ),
    /rebind/i,
  );
});

test("binding waits for the Project Workspace lock before validating and writing", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "iseol-discord-bind-"));
  let acquired!: () => void;
  let release!: () => void;
  const lockAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const lockReleased = new Promise<void>((resolve) => { release = resolve; });
  const holder = withDurableProjectWorkspaceLock(workspaceRoot, "project-1", async () => {
    acquired();
    await lockReleased;
  });
  await lockAcquired;

  let completed = false;
  const binding = bindDiscordProjectWorkspace(
    { guildId: "guild-1", storedProjectId: "legacy-1", projectId: "project-1", at: "2026-09-08T00:00:00.000Z" },
    {
      workspaceRoot,
      findStoredProject: async () => storedProject,
      loadWorkspace: async () => workspace(),
      createBinding: async (input) => ({ version: 1 as const, ...input, createdAt: input.at, updatedAt: input.at }),
    },
  ).finally(() => { completed = true; });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(completed, false);

  release();
  assert.equal((await binding).defaultNodeId, "root");
  await holder;
});

test("project command preserves create/delete and adds bind/status", () => {
  const json = projectCommand.toJSON();
  const names = (json.options ?? []).map((option: any) => option.name).sort();
  assert.deepEqual(names, ["bind", "create", "delete", "status"]);
});

test("binding history fact is stable and project-scoped", () => {
  const fact = discordProjectBindingHistoryFact({
    version: 1,
    guildId: "guild-1",
    storedProjectId: "legacy-1",
    projectId: "project-1",
    defaultNodeId: "root",
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
  });
  assert.equal(fact.eventType, "discord-project-bound");
  assert.equal(fact.source, "discord");
  assert.equal(fact.reference, "discord-binding:guild-1:legacy-1:project-1");
});
