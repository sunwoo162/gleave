import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { GitHubCommitFeedStore, retainActiveCommitFeedStates, withProjectCommitFeedLifecycleLock, type CommitFeedState } from "../src/services/github-commit-feed.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deleteProject, withProjectDeleteLock, type StoredProject } from "../src/services/projects.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("GitHub commit feed state pruning uses only projects that completed their lifecycle pass", () => {
  const makeState = (key: string): CommitFeedState => ({
    key,
    guildId: key,
    projectId: key.split(":")[0]!,
    side: "frontend",
    seenEventIds: [],
    seenCommitShas: [],
    initializedAt: new Date(0).toISOString(),
  });
  const deleted = makeState("deleted-project:frontend");
  const active = makeState("active-project:frontend");
  assert.deepEqual(
    retainActiveCommitFeedStates([deleted, active], new Set([active.key])),
    [active],
  );
});

test("GitHub commit feed removes all durable states for a deleted project", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-github-commit-feed-delete-"));
  const store = new GitHubCommitFeedStore(join(dir, "state.json"));
  const makeState = (key: string, projectId: string): CommitFeedState => ({
    key,
    guildId: "guild-1",
    projectId,
    side: key.endsWith(":backend") ? "backend" : "frontend",
    seenEventIds: [],
    seenCommitShas: [],
    initializedAt: new Date(0).toISOString(),
  });
  await store.save(makeState("deleted-project:frontend", "deleted-project"));
  await store.save(makeState("deleted-project:backend", "deleted-project"));
  await store.save(makeState("active-project:frontend", "active-project"));

  assert.equal(await store.removeProject("deleted-project"), 2);
  assert.deepEqual((await store.list()).map((state) => state.projectId), ["active-project"]);
  await rm(dir, { recursive: true, force: true });
});

test("GitHub commit feed skips a stale project after waiting for project deletion", async () => {
  const file = "data/projects.json";
  let previous: Buffer | null = null;
  try { previous = await readFile(file); } catch { /* test creates the file */ }

  const project: StoredProject = {
    id: "github-commit-feed-lifecycle-lock",
    name: "GitHub commit feed lifecycle lock",
    guildId: "github-commit-feed-lifecycle-lock-guild",
    categoryId: "github-commit-feed-lifecycle-lock-category",
    organization: "iseol",
    frontend: { owner: "iseol", repo: "frontend" },
    backend: { owner: "iseol", repo: "backend" },
  };
  let syncCalls = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });

  try {
    await writeFile(file, JSON.stringify([project], null, 2), "utf8");
    const deletion = withProjectDeleteLock(project.guildId, project.id, async () => {
      await held;
      assert.equal(await deleteProject(project.id), true);
    });

    await delay(30);
    const sync = withProjectCommitFeedLifecycleLock(project, async () => {
      syncCalls += 1;
    });
    await delay(80);
    release();

    await Promise.all([deletion, sync]);
    assert.equal(syncCalls, 0);
  } finally {
    if (previous) await writeFile(file, previous);
    else await rm(file, { force: true });
  }
});
