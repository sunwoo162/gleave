import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectWorkspace } from "../src/project-model/contracts.js";
import { saveProjectWorkspace } from "../src/project-model/workspace-store.js";
import { loadProjectHistory } from "../src/project-model/history-store.js";
import { createDiscordProjectBinding } from "../src/discord-project/binding-store.js";
import { recordStoredProjectAction } from "../src/discord-project/history-recorder.js";
import { calendarHistoryFact, githubIssueCalendarHistoryFact } from "../src/services/calendar/calendar-discord.js";
import { githubReviewHistoryFact } from "../src/services/github-automation-polling.js";
import {
  figmaCommentHistoryFact,
  figmaVersionHistoryFact,
  notionUpdateHistoryFact,
  pollProjectComments,
  pollProjectNotion,
  pollProjectVersions,
} from "../src/services/webhook-server.js";
import type { StoredProject } from "../src/services/projects.js";

function workspace(): ProjectWorkspace {
  return {
    version: 1, id: "project-1", name: "Washer", status: "active",
    genesis: {
      prototypeId: "prototype-1",
      repository: { url: "https://github.com/team-washer/web", branch: "main", commitSha: "abc" },
      deployment: { url: "https://washer.example.com" }, runs: [], promotedAt: "2026-09-07T00:00:00.000Z",
    },
    tree: [{ id: "root", kind: "root", title: "Washer", status: "in-progress", runIds: [], createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" }],
    createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z",
  };
}

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
  integrations: { calendar: {}, figma: {}, notion: {} },
  channels: {},
};

async function fixture(bound: boolean) {
  const root = await mkdtemp(join(tmpdir(), "iseol-provider-context-"));
  const modelRoot = join(root, "model");
  await saveProjectWorkspace(modelRoot, workspace());
  if (bound) {
    await createDiscordProjectBinding(modelRoot, {
      guildId: "guild-1", storedProjectId: "legacy-1", projectId: "project-1", defaultNodeId: "root", at: "2026-09-08T00:00:00.000Z",
    });
  }
  return { modelRoot };
}

test("provider fact builders use stable action references", () => {
  assert.equal(calendarHistoryFact("created", "event-1").reference, "calendar:event:event-1");
  assert.equal(githubReviewHistoryFact("team/repo", 42, "abc").reference, "github:team/repo:pr:42:abc");
  assert.equal(figmaVersionHistoryFact("file-1", "version-1").reference, "figma:file-1:version:version-1");
  assert.equal(figmaCommentHistoryFact("file-1", "comment-1").reference, "figma:file-1:comment:comment-1");
  assert.equal(notionUpdateHistoryFact("page-1", "2026-09-08T01:00:00.000Z").reference, "notion:page-1:2026-09-08T01:00:00.000Z");
});

test("unbound provider results preserve legacy behavior without Project History", async () => {
  const { modelRoot } = await fixture(false);
  const recorded = await recordStoredProjectAction({
    modelRoot,
    bindingRoot: modelRoot,
    guildId: "guild-1",
    storedProjectId: "legacy-1",
    fact: calendarHistoryFact("created", "event-1"),
    at: "2026-09-08T01:00:00.000Z",
    resolveLegacy: async () => legacy,
  });
  assert.equal(recorded, false);
  assert.deepEqual(await loadProjectHistory(modelRoot, "project-1"), []);
});

test("bound provider results append exactly one contextual event", async () => {
  const { modelRoot } = await fixture(true);
  const input = {
    modelRoot,
    bindingRoot: modelRoot,
    guildId: "guild-1",
    storedProjectId: "legacy-1",
    fact: calendarHistoryFact("created", "event-1"),
    at: "2026-09-08T01:00:00.000Z",
    resolveLegacy: async () => legacy,
  };
  assert.equal(await recordStoredProjectAction(input), true);
  assert.equal(await recordStoredProjectAction({ ...input, at: "2026-09-08T03:01:00.000Z" }), false);
  const history = await loadProjectHistory(modelRoot, "project-1");
  assert.equal(history.length, 1);
  assert.equal(history[0]?.source, "calendar");
  assert.equal(history[0]?.nodeId, "root");
});

function storedProviderProject(): StoredProject {
  return {
    id: "legacy-1",
    name: "Washer",
    guildId: "guild-1",
    categoryId: "category-1",
    organization: "team-washer",
    frontend: { owner: "team-washer", repo: "web", url: "https://github.com/team-washer/web" },
    backend: { owner: "team-washer", repo: "api", url: "https://github.com/team-washer/api" },
    figmaFileKey: "file-1",
    figmaChannelId: "figma-channel",
    figmaLastVersionId: "v1",
    figmaKnownCommentIds: ["c1"],
    notionPageId: "page-1",
    notionChannelId: "notion-channel",
    notionLastEditedTime: "2026-09-08T00:00:00.000Z",
  };
}

test("Figma version polling records history after notification cursor update", async () => {
  const project = storedProviderProject();
  const order: string[] = [];
  const figma = {
    listNamedVersions: async () => [
      { id: "v1", created_at: "2026-09-08T00:00:00.000Z", label: "one", description: "" },
      { id: "v2", created_at: "2026-09-08T01:00:00.000Z", label: "two", description: "" },
    ],
  } as any;
  await pollProjectVersions({} as any, figma, project, {
    notifyVersion: async (_client, _project, version) => { order.push(`notify:${version.id}`); },
    updateProject: async (_id, updates) => { Object.assign(project, updates); order.push(`update:${project.figmaLastVersionId}`); return project; },
    recordHistory: async (_project, fact) => { order.push(`history:${fact.reference}`); },
  });
  assert.deepEqual(order, [
    "notify:v2",
    "update:v2",
    "history:figma:file-1:version:v2",
  ]);
});

test("history failure after Figma notification does not repeat the notification", async () => {
  const project = storedProviderProject();
  let notifications = 0;
  const figma = {
    listNamedVersions: async () => [
      { id: "v1", created_at: "2026-09-08T00:00:00.000Z", label: "one", description: "" },
      { id: "v2", created_at: "2026-09-08T01:00:00.000Z", label: "two", description: "" },
    ],
  } as any;
  const deps = {
    notifyVersion: async () => { notifications += 1; },
    updateProject: async (_id: string, updates: Partial<StoredProject>) => { Object.assign(project, updates); return project; },
    recordHistory: async () => { throw new Error("history unavailable"); },
  };
  await assert.rejects(pollProjectVersions({} as any, figma, project, deps), /unavailable/);
  assert.equal(project.figmaLastVersionId, "v2");
  assert.equal(notifications, 1);

  await pollProjectVersions({} as any, figma, project, { ...deps, recordHistory: async () => undefined });
  assert.equal(notifications, 1);
});

test("Figma comment and Notion polling record stable contextual facts", async () => {
  const project = storedProviderProject();
  const facts: string[] = [];
  const shared = {
    updateProject: async (_id: string, updates: Partial<StoredProject>) => { Object.assign(project, updates); return project; },
    recordHistory: async (_project: StoredProject, fact: any) => { facts.push(fact.reference); },
  };

  await pollProjectComments({} as any, {
    listComments: async () => [
      { id: "c1", created_at: "2026-09-08T00:00:00.000Z", message: "old" },
      { id: "c2", created_at: "2026-09-08T01:00:00.000Z", message: "new" },
    ],
  } as any, project, {
    ...shared,
    notifyComment: async () => undefined,
  });

  await pollProjectNotion({} as any, {
    getPage: async () => ({ id: "page-1", last_edited_time: "2026-09-08T02:00:00.000Z" }),
  } as any, project, {
    ...shared,
    notifyNotionUpdate: async () => undefined,
  });

  assert.deepEqual(facts, [
    "figma:file-1:comment:c2",
    "notion:page-1:2026-09-08T02:00:00.000Z",
  ]);
});

test("GitHub Issue plus Calendar fact is stable and bound review polls dedupe", async () => {
  const issueFact = githubIssueCalendarHistoryFact("https://github.com/team/repo/issues/42", 42);
  assert.equal(issueFact.source, "github");
  assert.equal(issueFact.reference, "github:issue:https://github.com/team/repo/issues/42");

  const { modelRoot } = await fixture(true);
  const fact = githubReviewHistoryFact("team/repo", 42, "abc");
  const input = {
    modelRoot,
    bindingRoot: modelRoot,
    guildId: "guild-1",
    storedProjectId: "legacy-1",
    fact,
    at: "2026-09-08T03:00:00.000Z",
    resolveLegacy: async () => legacy,
  };
  assert.equal(await recordStoredProjectAction(input), true);
  assert.equal(await recordStoredProjectAction({ ...input, at: "2026-09-08T03:01:00.000Z" }), false);
  const history = await loadProjectHistory(modelRoot, "project-1");
  assert.equal(history.length, 1);
  assert.equal(history[0]?.type, "review-recorded");
});
