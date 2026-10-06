import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DesktopTaskPack } from "../src/desktop-agent/contracts.js";
import {
  createDesktopJob,
  isDesktopJobContained,
  listDesktopJobs,
  loadDesktopJob,
  loadDesktopJobContainment,
} from "../src/desktop-agent/job-store.js";
import { withDurableDesktopJobLock } from "../src/desktop-agent/job-lock.js";

function pack(): DesktopTaskPack {
  return {
    version: 1,
    jobId: "job-lock-read-001",
    runId: "run-lock-read-001",
    stage: "TEST",
    attempt: 1,
    agentId: "agent-lock-read-001",
    workspaceRoot: "C:/repo",
    idempotencyKey: "test:lock-read-001",
    leaseUntil: "2026-09-30T01:10:00.000Z",
    operations: [{ id: "op-1", type: "READ_FILE", path: "README.md" }],
  };
}

async function root(): Promise<string> {
  return mkdtemp(join(tmpdir(), "iseol-desktop-job-lock-read-"));
}

async function assertReadWaitsForJobLock<T>(
  store: string,
  read: () => Promise<T>,
): Promise<T> {
  let settled = false;
  let readPromise: Promise<T> | undefined;
  const lockPromise = withDurableDesktopJobLock(
    store,
    "job-lock-read-001",
    async () => {
      readPromise = read();
      readPromise.finally(() => { settled = true; }).catch(() => undefined);
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      assert.equal(settled, false);
    },
    { waitForMs: 2_000 },
  );
  await lockPromise;
  return readPromise!;
}

test("Desktop Job reads wait for the durable Job lock", async () => {
  const store = await root();
  const created = await createDesktopJob(store, pack(), "2026-09-30T01:00:00.000Z");

  const loaded = await assertReadWaitsForJobLock(store, () => loadDesktopJob(store, created.jobId));
  assert.equal(loaded?.jobId, created.jobId);

  const jobs = await assertReadWaitsForJobLock(store, () => listDesktopJobs(store));
  assert.deepEqual(jobs.map((job) => job.jobId), [created.jobId]);

  const containment = await assertReadWaitsForJobLock(store, () => loadDesktopJobContainment(store, created.jobId));
  assert.equal(containment, null);

  const contained = await assertReadWaitsForJobLock(store, () => isDesktopJobContained(store, created.jobId));
  assert.equal(contained, false);
});
