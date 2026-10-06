import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ReviewStateStore } from "../src/services/review/review-state.js";

test("review state preserves concurrent marks across independent store instances", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-review-state-lock-"));
  const file = join(dir, "state.json");
  const first = new ReviewStateStore(file);
  const second = new ReviewStateStore(file);
  await Promise.all([
    first.markReviewed("owner/repo-a", 1, "sha-a"),
    second.markReviewed("owner/repo-b", 2, "sha-b"),
  ]);

  const result = new ReviewStateStore(file);
  assert.equal(await result.hasReviewed("owner/repo-a", 1, "sha-a"), true);
  assert.equal(await result.hasReviewed("owner/repo-b", 2, "sha-b"), true);
  await rm(dir, { recursive: true, force: true });
});

test("review side effect lock serializes the same pull request head across store instances", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-review-side-effect-lock-"));
  const file = join(dir, "state.json");
  const first = new ReviewStateStore(file);
  const second = new ReviewStateStore(file);
  let release!: () => void;
  const firstStarted = new Promise<void>((resolveStarted) => {
    void first.withReviewLock("owner/repo", 7, "sha-7", async () => {
      resolveStarted();
      await new Promise<void>((resolveRelease) => { release = resolveRelease; });
    });
  });
  await firstStarted;

  let secondSettled = false;
  const secondRun = second.withReviewLock("owner/repo", 7, "sha-7", async () => {
    secondSettled = true;
  });
  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  assert.equal(secondSettled, false);
  release();
  await secondRun;
  assert.equal(secondSettled, true);
  await rm(dir, { recursive: true, force: true });
});
