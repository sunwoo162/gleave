import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DesktopTaskPack } from "../src/desktop-agent/contracts.js";
import {
  acquireDesktopJobLease,
  completeDesktopJob,
  createDesktopJob,
  findDesktopJobByIdempotencyKey,
  listDesktopJobs,
  listRecoverableDesktopJobs,
  loadDesktopJob,
  containDesktopJob,
  loadDesktopJobContainment,
  desktopJobRevision,
  requeueDesktopJob,
  renewDesktopJobLease,
} from "../src/desktop-agent/job-store.js";
import { withDurableDesktopJobLock } from "../src/desktop-agent/job-lock.js";

function pack(overrides: Partial<DesktopTaskPack> = {}): DesktopTaskPack {
  return {
    version: 1,
    jobId: "job-001",
    runId: "run-001",
    stage: "TEST",
    attempt: 1,
    agentId: "agent-001",
    workspaceRoot: "C:/repo",
    idempotencyKey: "test:run-001",
    leaseUntil: "2026-09-08T01:10:00.000Z",
    operations: [{ id: "op-1", type: "READ_FILE", path: "README.md" }],
    ...overrides,
  };
}

async function root() {
  return mkdtemp(join(tmpdir(), "iseol-desktop-job-"));
}

test("job creation is idempotent by semantic idempotency key", async () => {
  const store = await root();
  const first = await createDesktopJob(store, pack(), "2026-09-08T01:00:00.000Z");
  const second = await createDesktopJob(
    store,
    pack({ jobId: "job-retry", leaseUntil: "2026-09-08T01:20:00.000Z" }),
    "2026-09-08T01:01:00.000Z",
  );
  assert.equal(second.jobId, first.jobId);
  assert.equal((await findDesktopJobByIdempotencyKey(store, "test:run-001"))?.jobId, first.jobId);
  assert.deepEqual(await loadDesktopJob(store, first.jobId), first);
});

test("idempotency key rejects a conflicting payload", async () => {
  const store = await root();
  await createDesktopJob(store, pack(), "2026-09-08T01:00:00.000Z");
  await assert.rejects(
    createDesktopJob(
      store,
      pack({ operations: [{ id: "op-1", type: "READ_FILE", path: "OTHER.md" }] }),
      "2026-09-08T01:01:00.000Z",
    ),
    /idempotency.*conflict/i,
  );
});

test("concurrent Job creation converges on one idempotent record across instances", async () => {
  const store = await root();
  const instances = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      import(`../src/desktop-agent/job-store.ts?create-instance=${index}-${Date.now()}`),
    ),
  );
  const outcomes = await Promise.allSettled(instances.map((instance, index) => instance.createDesktopJob(
    store,
    pack({ jobId: `job-${String(index + 1).padStart(3, "0")}` }),
    "2026-09-08T01:00:00.000Z",
  )));

  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 8);
  assert.equal(new Set(outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value.jobId] : [])).size, 1);
  assert.equal((await listDesktopJobs(store)).length, 1);
});

test("concurrent operator containment accepts only one decision across instances", async () => {
  const store = await root();
  await createDesktopJob(store, pack(), "2026-09-08T01:00:00.000Z");
  const expectedRevision = desktopJobRevision({ updatedAt: "2026-09-08T01:00:00.000Z", status: "pending", attempts: 0 });
  const instances = await Promise.all(
    Array.from({ length: 2 }, (_, index) =>
      import(`../src/desktop-agent/job-store.ts?contain-instance=${index}-${Date.now()}`),
    ),
  );
  const outcomes = await Promise.allSettled(instances.map((instance, index) => instance.containDesktopJob(store, "job-001", {
    operationId: `contain-${index + 1}`,
    expectedRevision,
    at: `2026-09-08T01:01:0${index}.000Z`,
    actor: "operator",
    reason: "execution-uncertain",
  })));

  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
  assert.ok((await loadDesktopJobContainment(store, "job-001"))?.operationId);
});

test("leases are exclusive, renewable by owner, and transferable only after expiry", async () => {
  const store = await root();
  await createDesktopJob(store, pack(), "2026-09-08T01:00:00.000Z");
  const leased = await acquireDesktopJobLease(
    store, "job-001", "session-a", "2026-09-08T01:00:10.000Z", 60_000,
  );
  assert.equal(leased.lease?.owner, "session-a");
  assert.equal(leased.attempts, 1);

  await assert.rejects(
    acquireDesktopJobLease(store, "job-001", "session-b", "2026-09-08T01:00:20.000Z", 60_000),
    /active lease/i,
  );
  const renewed = await renewDesktopJobLease(
    store, "job-001", "session-a", "2026-09-08T01:00:30.000Z", 60_000,
  );
  assert.equal(renewed.lease?.owner, "session-a");

  await assert.rejects(
    renewDesktopJobLease(store, "job-001", "session-b", "2026-09-08T01:00:40.000Z", 60_000),
    /lease owner/i,
  );
  const takeover = await acquireDesktopJobLease(
    store, "job-001", "session-b", "2026-09-08T01:01:31.000Z", 60_000,
  );
  assert.equal(takeover.lease?.owner, "session-b");
  assert.equal(takeover.attempts, 2);
});

test("lease acquisition is exclusive across independent job-store instances", async () => {
  const store = await root();
  await createDesktopJob(store, pack(), "2026-09-08T01:00:00.000Z");
  const instances = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      import(`../src/desktop-agent/job-store.ts?lease-instance=${index}-${Date.now()}`),
    ),
  );
  const outcomes = await Promise.allSettled(instances.map((instance, index) => instance.acquireDesktopJobLease(
    store,
    "job-001",
    `session-${index}`,
    "2026-09-08T01:00:10.000Z",
    60_000,
  )));

  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 7);
  assert.equal((await loadDesktopJob(store, "job-001"))?.attempts, 1);
  assert.equal((await loadDesktopJob(store, "job-001"))?.status, "leased");
});

test("completed jobs are immutable", async () => {
  const store = await root();
  await createDesktopJob(store, pack(), "2026-09-08T01:00:00.000Z");
  await acquireDesktopJobLease(store, "job-001", "session-a", "2026-09-08T01:00:10.000Z", 60_000);
  const result = {
    version: 1 as const,
    jobId: "job-001",
    runId: "run-001",
    agentId: "agent-001",
    status: "completed" as const,
    completedAt: "2026-09-08T01:00:20.000Z",
    operations: [{ operationId: "op-1", ok: true, summary: "read" }],
  };
  const completed = await completeDesktopJob(store, "job-001", "session-a", result);
  assert.equal(completed.status, "completed");
  assert.deepEqual(await completeDesktopJob(store, "job-001", "session-a", result), completed);
  await assert.rejects(
    completeDesktopJob(store, "job-001", "session-a", { ...result, status: "final-failure" }),
    /completed job.*immutable/i,
  );
});

test("completion accepts only one terminal result across independent job-store instances", async () => {
  const store = await root();
  await createDesktopJob(store, pack(), "2026-09-08T01:00:00.000Z");
  await acquireDesktopJobLease(store, "job-001", "session-a", "2026-09-08T01:00:10.000Z", 60_000);
  const instances = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      import(`../src/desktop-agent/job-store.ts?complete-instance=${index}-${Date.now()}`),
    ),
  );
  const outcomes = await Promise.allSettled(instances.map((instance, index) => instance.completeDesktopJob(store, "job-001", "session-a", {
    version: 1,
    jobId: "job-001",
    runId: "run-001",
    agentId: "agent-001",
    status: "completed",
    completedAt: `2026-09-08T01:00:${String(20 + index).padStart(2, "0")}.000Z`,
    operations: [{ operationId: "op-1", ok: true, summary: `result-${index}` }],
  })));

  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 7);
  assert.equal((await loadDesktopJob(store, "job-001"))?.status, "completed");
});

test("completion and requeue serialize one Job transition across independent instances", async () => {
  const store = await root();
  await createDesktopJob(store, pack(), "2026-09-08T01:00:00.000Z");
  await acquireDesktopJobLease(store, "job-001", "session-a", "2026-09-08T01:00:10.000Z", 60_000);
  const instances = await Promise.all(
    Array.from({ length: 2 }, (_, index) =>
      import(`../src/desktop-agent/job-store.ts?transition-instance=${index}-${Date.now()}`),
    ),
  );
  const result = {
    version: 1 as const,
    jobId: "job-001",
    runId: "run-001",
    agentId: "agent-001",
    status: "completed" as const,
    completedAt: "2026-09-08T01:00:20.000Z",
    operations: [{ operationId: "op-1", ok: true, summary: "read" }],
  };
  const outcomes = await Promise.allSettled([
    instances[0]!.completeDesktopJob(store, "job-001", "session-a", result),
    instances[1]!.requeueDesktopJob(store, "job-001", "session-a", "2026-09-08T01:00:21.000Z"),
  ]);

  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
  assert.ok(["completed", "pending"].includes((await loadDesktopJob(store, "job-001"))?.status ?? ""));
});

test("indeterminate marking waits for the durable Job mutation lock", async () => {
  const store = await root();
  await createDesktopJob(store, pack(), "2026-09-08T01:00:00.000Z");
  await acquireDesktopJobLease(store, "job-001", "session-a", "2026-09-08T01:00:10.000Z", 60_000);
  let settled = false;
  let mutationPromise: Promise<unknown> | undefined;
  const pending = withDurableDesktopJobLock(
    store,
    "job-001",
    async () => {
      const result = await import("../src/desktop-agent/job-store.js?indeterminate-lock");
      const mutation = result.markDesktopJobIndeterminate(store, "job-001", "session-a", "2026-09-08T01:00:20.000Z");
      mutationPromise = mutation;
      mutation.finally(() => { settled = true; }).catch(() => undefined);
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      assert.equal(settled, false);
    },
    { waitForMs: 2_000 },
  );
  await pending;
  await mutationPromise;
  assert.equal((await loadDesktopJob(store, "job-001"))?.status, "indeterminate");
});

test("lease renewal waits for the durable Job mutation lock", async () => {
  const store = await root();
  await createDesktopJob(store, pack(), "2026-09-08T01:00:00.000Z");
  await acquireDesktopJobLease(store, "job-001", "session-a", "2026-09-08T01:00:10.000Z", 60_000);
  let settled = false;
  let mutationPromise: Promise<unknown> | undefined;
  const pending = withDurableDesktopJobLock(
    store,
    "job-001",
    async () => {
      const result = await import("../src/desktop-agent/job-store.js?renew-lock");
      const mutation = result.renewDesktopJobLease(store, "job-001", "session-a", "2026-09-08T01:00:20.000Z", 60_000);
      mutationPromise = mutation;
      mutation.finally(() => { settled = true; }).catch(() => undefined);
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      assert.equal(settled, false);
    },
    { waitForMs: 2_000 },
  );
  await pending;
  await mutationPromise;
  assert.equal((await loadDesktopJob(store, "job-001"))?.lease?.expiresAt, "2026-09-08T01:01:20.000Z");
});

test("only unfinished jobs without a live lease are recoverable", async () => {
  const store = await root();
  await createDesktopJob(store, pack(), "2026-09-08T01:00:00.000Z");
  await acquireDesktopJobLease(store, "job-001", "session-a", "2026-09-08T01:00:00.000Z", 30_000);
  assert.deepEqual(
    (await listRecoverableDesktopJobs(store, "2026-09-08T01:01:00.000Z")).map((job) => job.jobId),
    ["job-001"],
  );
});

test("completed Desktop Job results must match job run and agent identity", async () => {
  const store = await root();
  await createDesktopJob(store, pack(), "2026-09-08T01:00:00.000Z");
  await acquireDesktopJobLease(store, "job-001", "session-a", "2026-09-08T01:00:10.000Z", 60_000);
  const baseResult = {
    version: 1 as const,
    jobId: "job-001",
    runId: "run-001",
    agentId: "agent-001",
    status: "completed" as const,
    completedAt: "2026-09-08T01:00:20.000Z",
    operations: [{ operationId: "op-1", ok: true, summary: "read" }],
  };
  await assert.rejects(
    completeDesktopJob(store, "job-001", "session-a", { ...baseResult, runId: "run-other" }),
    /runId mismatch/i,
  );
  await assert.rejects(
    completeDesktopJob(store, "job-001", "session-a", { ...baseResult, agentId: "agent-other" }),
    /agentId mismatch/i,
  );
});

test("operator containment preserves an uncertain pending job and blocks redispatch", async () => {
  const store = await root();
  await createDesktopJob(store, pack({
    operations: [{ id: "init", type: "GIT_INIT", cwd: "." }],
    policyDigest: "a".repeat(64),
    policySources: [{ kind: "policy", path: "policy.json", sha256: "b".repeat(64), required: true }],
  }), "2026-09-08T01:00:00.000Z");
  const first = await containDesktopJob(store, "job-001", {
    operationId: "contain-1", expectedRevision: desktopJobRevision({ updatedAt: "2026-09-08T01:00:00.000Z", status: "pending", attempts: 0 }), at: "2026-09-08T01:01:00.000Z", actor: "operator",
    reason: "execution-uncertain",
  });
  assert.equal(first.status, "contained");
  assert.equal(first.record.mutationRisk, "mutation-uncertain");
  assert.equal((await loadDesktopJob(store, "job-001"))?.status, "pending");
  assert.equal((await loadDesktopJobContainment(store, "job-001"))?.operationId, "contain-1");
  assert.deepEqual(await listRecoverableDesktopJobs(store, "2026-09-08T02:00:00.000Z"), []);
  await assert.rejects(
    acquireDesktopJobLease(store, "job-001", "session-a", "2026-09-08T02:00:00.000Z", 60_000),
    /contained.*operator/i,
  );
  const duplicate = await containDesktopJob(store, "job-001", {
    operationId: "contain-1", expectedRevision: desktopJobRevision({ updatedAt: "2026-09-08T01:00:00.000Z", status: "pending", attempts: 0 }), at: "2026-09-08T01:02:00.000Z", actor: "operator",
    reason: "execution-uncertain",
  });
  assert.equal(duplicate.status, "already-contained");
  assert.equal((await loadDesktopJob(store, "job-001"))?.status, "pending");
});

test("operator containment rejects leased or indeterminate jobs", async () => {
  const store = await root();
  await createDesktopJob(store, pack(), "2026-09-08T01:00:00.000Z");
  await acquireDesktopJobLease(store, "job-001", "session-a", "2026-09-08T01:00:10.000Z", 60_000);
  await assert.rejects(
    containDesktopJob(store, "job-001", { operationId: "contain-2", expectedRevision: "x", at: "2026-09-08T01:00:20.000Z", actor: "operator", reason: "execution-uncertain" }),
    /active lease/i,
  );
});
