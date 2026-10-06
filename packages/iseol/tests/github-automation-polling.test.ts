import assert from "node:assert/strict";
import test from "node:test";
import { milestonePollSignature, syncMilestonesFromPoll } from "../src/services/github-automation-polling-domain.js";
import { GitHubAutomationPollStateStore } from "../src/services/github-automation-poll-state.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const m1 = {
  number: 1,
  title: "Alpha",
  dueOn: "2026-09-10T00:00:00Z",
  state: "open" as const,
  htmlUrl: "https://github.com/a/b/milestone/1",
  updatedAt: "2026-09-01T00:00:00Z",
};
const m2 = {
  number: 2,
  title: "Beta",
  dueOn: "2026-09-11T00:00:00Z",
  state: "open" as const,
  htmlUrl: "https://github.com/a/b/milestone/2",
  updatedAt: "2026-09-01T00:00:00Z",
};
const m3 = {
  number: 3,
  title: "Gamma",
  dueOn: "2026-09-12T00:00:00Z",
  state: "open" as const,
  htmlUrl: "https://github.com/a/b/milestone/3",
  updatedAt: "2026-09-01T00:00:00Z",
};

test("poll syncs only changed or new milestones and removes stale mappings", async () => {
  const previous = {
    "1": milestonePollSignature(m1),
    "2": "old-signature",
    "4": "deleted-signature",
  };
  const calls: Array<{ number: number; state: string }> = [];

  const next = await syncMilestonesFromPoll({
    milestones: [m1, m2, m3],
    previous,
    syncMilestone: async (milestone) => {
      calls.push({ number: milestone.number, state: milestone.state });
    },
  });

  assert.deepEqual(calls, [
    { number: 2, state: "open" },
    { number: 3, state: "open" },
    { number: 4, state: "closed" },
  ]);
  assert.deepEqual(Object.keys(next).sort(), ["1", "2", "3"]);
  assert.equal(next["2"], milestonePollSignature(m2));
});

test("GitHub automation polling removes all durable states for a deleted project", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-github-automation-delete-"));
  const store = new GitHubAutomationPollStateStore(join(dir, "state.json"));
  await store.setMilestones("deleted-project", "owner/frontend", { "1": "one" });
  await store.setMilestones("deleted-project", "owner/backend", { "2": "two" });
  await store.setMilestones("active-project", "owner/frontend", { "3": "three" });

  assert.equal(await store.removeProject("deleted-project"), 2);
  assert.deepEqual(await store.getMilestones("deleted-project", "owner/frontend"), {});
  assert.deepEqual(await store.getMilestones("active-project", "owner/frontend"), { "3": "three" });
  await rm(dir, { recursive: true, force: true });
});
