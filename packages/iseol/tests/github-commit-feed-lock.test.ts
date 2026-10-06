import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GitHubCommitFeedStore, type CommitFeedState } from "../src/services/github-commit-feed.js";

function state(key: string, guildId = key): CommitFeedState {
  return {
    key,
    guildId,
    projectId: `project-${key}`,
    side: "frontend",
    seenEventIds: [],
    seenCommitShas: [],
    initializedAt: new Date(0).toISOString(),
  };
}

test("GitHub commit feed state preserves concurrent saves from independent stores", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-github-commit-feed-lock-"));
  const file = join(dir, "github-commit-feed.json");
  const first = new GitHubCommitFeedStore(file);
  const second = new GitHubCommitFeedStore(file);

  await Promise.all([
    first.save(state("project-a:frontend")),
    second.save(state("project-b:backend")),
  ]);

  const result = await new GitHubCommitFeedStore(file).list();
  assert.deepEqual(result.map((item) => item.key).sort(), ["project-a:frontend", "project-b:backend"]);
  await rm(dir, { recursive: true, force: true });
});

test("GitHub commit feed state updates are serialized across independent stores", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-github-commit-feed-update-lock-"));
  const file = join(dir, "github-commit-feed.json");
  const first = new GitHubCommitFeedStore(file);
  const second = new GitHubCommitFeedStore(file);
  await first.save(state("project-a:frontend"));
  await first.save(state("project-b:backend"));

  await Promise.all([
    first.update("project-a:frontend", (current) => ({ ...current, seenCommitShas: ["sha-a"] })),
    second.update("project-b:backend", (current) => ({ ...current, seenCommitShas: ["sha-b"] })),
  ]);

  const result = await new GitHubCommitFeedStore(file).list();
  assert.deepEqual(result.map((item) => [item.key, item.seenCommitShas]).sort(), [
    ["project-a:frontend", ["sha-a"]],
    ["project-b:backend", ["sha-b"]],
  ]);
  await rm(dir, { recursive: true, force: true });
});

test("GitHub commit feed sync lock serializes external publication runs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-github-commit-feed-sync-lock-"));
  const store = new GitHubCommitFeedStore(join(dir, "github-commit-feed.json"));
  let release!: () => void;
  const entered = new Promise<void>((resolve) => { release = resolve; });
  let active = 0;
  let maximumActive = 0;

  const first = store.withSyncLock(async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await entered;
    active -= 1;
  });
  while (active === 0) await new Promise((resolve) => setImmediate(resolve));

  let secondFinished = false;
  const second = store.withSyncLock(async () => {
    secondFinished = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(secondFinished, false);

  release();
  await Promise.all([first, second]);
  assert.equal(maximumActive, 1);
  assert.equal(secondFinished, true);
  await rm(dir, { recursive: true, force: true });
});
