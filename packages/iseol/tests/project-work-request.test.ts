import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claimProjectWorkRequest,
  createProjectWorkRequest,
  executeProjectWorkRequest,
  inspectProjectWorkRequest,
  loadProjectWorkRequest,
  reconcileProjectWorkRequest,
  scheduleProjectWorkRequests,
  listProjectWorkRequests,
  updateProjectWorkRequest,
} from "../src/project-model/work-request.js";
import { withDurableProjectWorkRequestLock } from "../src/project-model/work-request-lock.js";

const at = "2026-09-20T12:00:00.000Z";

test("work request creation is idempotent and durable", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-request-"));
  const first = await createProjectWorkRequest({ root, projectId: "project-1", title: "Build profile", objective: "Implement profile", idempotencyKey: "profile-1", at, id: "work-1" });
  const second = await createProjectWorkRequest({ root, projectId: "project-1", title: "Build profile", objective: "Implement profile", idempotencyKey: "profile-1", at: "2026-09-20T12:01:00.000Z", id: "work-other" });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.request.id, "work-1");
  assert.equal((await listProjectWorkRequests(root, "project-1")).length, 1);
  await assert.rejects(() => createProjectWorkRequest({ root, projectId: "project-1", title: "Different", objective: "Different", idempotencyKey: "profile-1", at }));
});

test("work request creation waits for the shared idempotency lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-request-lock-"));
  let settled = false;
  let creation!: ReturnType<typeof createProjectWorkRequest>;
  await withDurableProjectWorkRequestLock(root, "project-1", "profile-locked", async () => {
    creation = createProjectWorkRequest({ root, projectId: "project-1", title: "Build profile", objective: "Implement profile", idempotencyKey: "profile-locked", at }).then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(settled, false);
    assert.equal((await listProjectWorkRequests(root, "project-1")).length, 0);
  });
  const result = await creation;
  assert.equal(result.created, true);
  assert.equal(settled, true);
});

test("work request listing waits for the canonical record lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-request-record-lock-"));
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Build profile", objective: "Implement profile", idempotencyKey: "profile-record", at, id: "work-record" });
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurableProjectWorkRequestLock(root, "project-1", "record:work-record", async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;

  let settled = false;
  const listing = listProjectWorkRequests(root, "project-1").then((value) => {
    settled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  releaseHolder();
  assert.deepEqual((await listing).map((item) => item.id), ["work-record"]);
});

test("work request reads wait for the canonical record lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-request-read-lock-"));
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Build profile", objective: "Implement profile", idempotencyKey: "profile-read", at, id: "work-read" });
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurableProjectWorkRequestLock(root, "project-1", "record:work-read", async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;

  let settled = false;
  const reading = loadProjectWorkRequest(root, "project-1", "work-read").then((value) => {
    settled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  releaseHolder();
  assert.equal((await reading)?.id, "work-read");
});

test("concurrent work request creation converges on one identity across service boundaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-request-cross-instance-"));
  const [first, second] = await Promise.all([
    createProjectWorkRequest({ root, projectId: "project-1", title: "Build profile", objective: "Implement profile", idempotencyKey: "profile-cross-instance", at, id: "work-first" }),
    createProjectWorkRequest({ root, projectId: "project-1", title: "Build profile", objective: "Implement profile", idempotencyKey: "profile-cross-instance", at, id: "work-second" }),
  ]);
  assert.equal([first, second].filter((result) => result.created).length, 1);
  assert.equal(first.request.id, second.request.id);
  assert.equal((await listProjectWorkRequests(root, "project-1")).length, 1);
  await assert.rejects(() => createProjectWorkRequest({ root, projectId: "project-1", title: "Different", objective: "Different", idempotencyKey: "profile-cross-instance", at }), /idempotency conflict/);
});

test("only one worker can claim a queued request and cancellation is durable", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-claim-"));
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Build profile", objective: "Implement profile", idempotencyKey: "profile-1", at, id: "work-1" });
  const [first, second] = await Promise.all([
    claimProjectWorkRequest(root, "project-1", "work-1", at),
    claimProjectWorkRequest(root, "project-1", "work-1", at),
  ]);
  assert.equal([first, second].filter(Boolean).length, 1);
  const cancelled = await updateProjectWorkRequest(root, "project-1", "work-1", { status: "cancelled", blocker: "operator stopped" }, at);
  assert.equal(cancelled?.status, "cancelled");
  assert.equal((await listProjectWorkRequests(root, "project-1"))[0]?.attempts, 1);
});

test("concurrent Work Request patches preserve disjoint fields across service boundaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-request-update-race-"));
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Patch race", objective: "Preserve concurrent fields", idempotencyKey: "patch-race", at, id: "patch-race" });
  await Promise.all([
    updateProjectWorkRequest(root, "project-1", "patch-race", { status: "running", runId: "run-a" }, at),
    updateProjectWorkRequest(root, "project-1", "patch-race", { nodeId: "node-b", executionRequestId: "project-1:patch-race:run-b" }, at),
  ]);
  const updated = (await listProjectWorkRequests(root, "project-1"))[0];
  assert.equal(updated?.status, "running");
  assert.equal(updated?.runId, "run-a");
  assert.equal(updated?.nodeId, "node-b");
  assert.equal(updated?.executionRequestId, "project-1:patch-race:run-b");
});

test("execution waits for dependencies and connects exactly one durable Run", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-execute-"));
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Base", objective: "Base work", idempotencyKey: "base", at, id: "base" });
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Follow up", objective: "Follow-up work", idempotencyKey: "follow", dependencies: ["base"], at, id: "follow" });
  const waiting = await executeProjectWorkRequest({ root, projectId: "project-1", id: "follow", runId: "run-never", at, execute: async () => ({ runId: "run-never", status: "created" }) });
  assert.equal(waiting.status, "waiting");
  assert.match(waiting.blocker ?? "", /dependencies incomplete/);
  await updateProjectWorkRequest(root, "project-1", "base", { status: "completed" }, at);
  let executions = 0;
  const started = await executeProjectWorkRequest({ root, projectId: "project-1", id: "follow", runId: "run-follow", at, execute: async () => {
    executions += 1;
    return { runId: "run-follow", status: "created" as const };
  } });
  assert.equal(started.status, "started");
  assert.equal(started.runId, "run-follow");
  assert.equal(executions, 1);
  const duplicate = await executeProjectWorkRequest({ root, projectId: "project-1", id: "follow", runId: "run-duplicate", at, execute: async () => {
    executions += 1;
    return { runId: "run-duplicate", status: "created" as const };
  } });
  assert.equal(duplicate.status, "in-progress");
  assert.equal(executions, 1);
});

test("execution failure blockers redact credential-shaped worker errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-error-safety-"));
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Failure", objective: "Redact worker failure", idempotencyKey: "failure", at, id: "failure" });
  const secret = "worker failed token=work-secret api_key=work-api-secret https://preview.example/?access_token=work-url-secret";
  const result = await executeProjectWorkRequest({
    root,
    projectId: "project-1",
    id: "failure",
    runId: "run-failure",
    at,
    execute: async () => { throw new Error(secret); },
  });
  assert.equal(result.status, "failed");
  for (const value of ["work-secret", "work-api-secret", "work-url-secret"]) assert.equal(result.blocker?.includes(value), false);
  assert.match(result.blocker ?? "", /\[redacted\]|\[redacted-url\]/i);
  assert.equal((await loadProjectWorkRequest(root, "project-1", "failure"))?.blocker?.includes("work-secret"), false);
});

test("a claim without a Run remains non-retryable after a worker crash", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-crash-"));
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Crash", objective: "Crash boundary", idempotencyKey: "crash", at, id: "crash" });
  const claimed = await claimProjectWorkRequest(root, "project-1", "crash", at);
  assert.equal(claimed?.status, "running");
  const recovered = await executeProjectWorkRequest({ root, projectId: "project-1", id: "crash", at, execute: async () => ({ runId: "run-unsafe", status: "created" as const }) });
  assert.equal(recovered.status, "not-claimable");
  assert.match(recovered.blocker ?? "", /running/);
});

test("dependency creation rejects unknown work requests", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-dependency-"));
  await assert.rejects(() => createProjectWorkRequest({ root, projectId: "project-1", title: "Follow up", objective: "Follow-up", idempotencyKey: "follow", dependencies: ["missing"], at, id: "follow" }), /unknown work request dependency/);
});

test("reconciliation reports unknown execution without inventing a Run", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-reconcile-"));
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Inspect", objective: "Inspect", idempotencyKey: "inspect", at, id: "inspect" });
  await claimProjectWorkRequest(root, "project-1", "inspect", at);
  const inspection = await inspectProjectWorkRequest(root, "project-1", "inspect", async () => null);
  assert.equal(inspection?.execution, "unknown");
  assert.match(inspection?.blocker ?? "", /no durable Run identity/);
});

test("explicit scheduler selects only dependency-ready requests within its concurrency limit", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-scheduler-"));
  await createProjectWorkRequest({ root, projectId: "project-1", title: "First", objective: "First", idempotencyKey: "first", at, id: "first" });
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Second", objective: "Second", idempotencyKey: "second", at, id: "second" });
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Blocked", objective: "Blocked", idempotencyKey: "blocked", dependencies: ["first"], at, id: "blocked" });
  const executed: string[] = [];
  const results = await scheduleProjectWorkRequests({ root, projectId: "project-1", at, maxConcurrent: 1, execute: async (request) => { executed.push(request.id); return { runId: `run-${request.id}`, status: "created" as const }; } });
  assert.equal(results.length, 1);
  assert.deepEqual(executed, ["first"]);
  const blocked = await inspectProjectWorkRequest(root, "project-1", "blocked");
  assert.equal(blocked?.execution, "not-started");
});

test("terminal Run projection completes the linked work request idempotently", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-terminal-"));
  await createProjectWorkRequest({
    root,
    projectId: "project-1",
    title: "Build",
    objective: "Build",
    idempotencyKey: "build",
    id: "work-1",
    at,
  });
  await updateProjectWorkRequest(root, "project-1", "work-1", {
    status: "running",
    requestedRunId: "run-1",
    runId: "run-1",
  }, at);
  const findRun = async () => ({
    runId: "run-1",
    state: { stage: "DONE", status: "DONE" },
    updatedAt: at,
  });
  const first = await reconcileProjectWorkRequest({
    root,
    projectId: "project-1",
    workId: "work-1",
    findRun,
    at: "2026-09-20T12:01:00.000Z",
  });
  const second = await reconcileProjectWorkRequest({
    root,
    projectId: "project-1",
    workId: "work-1",
    findRun,
    at: "2026-09-20T12:02:00.000Z",
  });
  assert.equal(first.request.status, "completed");
  assert.equal(second.request.status, "completed");
  assert.equal(second.transition, "already-completed");
});

test("concurrent Run reconciliation cannot let a stale observation overwrite a terminal projection", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-reconcile-race-"));
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Reconcile race", objective: "Keep terminal projection authoritative", idempotencyKey: "reconcile-race", at, id: "reconcile-race" });
  await updateProjectWorkRequest(root, "project-1", "reconcile-race", { status: "running", requestedRunId: "run-reconcile-race", runId: "run-reconcile-race" }, at);
  let waitingFindStarted!: () => void;
  const waitingFindStartedPromise = new Promise<void>((resolve) => { waitingFindStarted = resolve; });
  let releaseWaitingFind!: () => void;
  const waitingFindHeld = new Promise<void>((resolve) => { releaseWaitingFind = resolve; });

  const waiting = reconcileProjectWorkRequest({
    root,
    projectId: "project-1",
    workId: "reconcile-race",
    at: "2026-09-20T12:01:00.000Z",
    findRun: async () => {
      waitingFindStarted();
      await waitingFindHeld;
      return { runId: "run-reconcile-race", state: { stage: "IMPLEMENT", status: "WAITING_EXTERNAL" }, updatedAt: at };
    },
  });
  await waitingFindStartedPromise;
  const completed = reconcileProjectWorkRequest({
    root,
    projectId: "project-1",
    workId: "reconcile-race",
    at: "2026-09-20T12:02:00.000Z",
    findRun: async () => ({ runId: "run-reconcile-race", state: { stage: "DONE", status: "DONE" }, updatedAt: "2026-09-20T12:01:30.000Z" }),
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  releaseWaitingFind();
  await Promise.all([waiting, completed]);
  assert.equal((await listProjectWorkRequests(root, "project-1"))[0]?.status, "completed");
});

test("Run waiting and final failure statuses map without inventing completion", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-status-map-"));
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Wait", objective: "Wait", idempotencyKey: "wait", id: "wait", at });
  await updateProjectWorkRequest(root, "project-1", "wait", { status: "running", requestedRunId: "run-wait", runId: "run-wait" }, at);
  const waiting = await reconcileProjectWorkRequest({
    root, projectId: "project-1", workId: "wait", at: "2026-09-20T12:01:00.000Z",
    findRun: async () => ({ runId: "run-wait", state: { stage: "IMPLEMENT", status: "WAITING_EXTERNAL" }, updatedAt: at }),
  });
  assert.equal(waiting?.request.status, "waiting");
  assert.match(waiting?.blocker ?? "", /WAITING_EXTERNAL/);

  await createProjectWorkRequest({ root, projectId: "project-1", title: "Fail", objective: "Fail", idempotencyKey: "fail", id: "fail", at });
  await updateProjectWorkRequest(root, "project-1", "fail", { status: "running", requestedRunId: "run-fail", runId: "run-fail" }, at);
  const failed = await reconcileProjectWorkRequest({
    root, projectId: "project-1", workId: "fail", at: "2026-09-20T12:01:00.000Z",
    findRun: async () => ({ runId: "run-fail", state: { stage: "IMPLEMENT", status: "FAILED_FINAL" }, updatedAt: at }),
  });
  assert.equal(failed?.request.status, "failed");
  assert.equal(failed?.execution, "terminal");
});

test("Run reconciliation failure blockers redact credential-shaped reasons", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-reconcile-error-safety-"));
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Reconcile failure", objective: "Redact Run failure", idempotencyKey: "reconcile-failure", id: "reconcile-failure", at });
  await updateProjectWorkRequest(root, "project-1", "reconcile-failure", { status: "running", requestedRunId: "run-reconcile-failure", runId: "run-reconcile-failure" }, at);
  const secret = "Harness failed token=reconcile-secret api_key=reconcile-api-secret https://preview.example/?access_token=reconcile-url-secret";
  const failed = await reconcileProjectWorkRequest({
    root,
    projectId: "project-1",
    workId: "reconcile-failure",
    at: "2026-09-20T12:01:00.000Z",
    findRun: async () => ({ runId: "run-reconcile-failure", state: { stage: "IMPLEMENT", status: "FAILED_FINAL", reason: secret }, updatedAt: at }),
  });
  assert.equal(failed?.request.status, "failed");
  for (const value of ["reconcile-secret", "reconcile-api-secret", "reconcile-url-secret"]) assert.equal(failed?.blocker?.includes(value), false);
  assert.match(failed?.blocker ?? "", /\[redacted\]|\[redacted-url\]/i);
  assert.equal((await loadProjectWorkRequest(root, "project-1", "reconcile-failure"))?.blocker?.includes("reconcile-secret"), false);
});

test("already failed Work Requests sanitize legacy blockers during reconciliation", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-reconcile-legacy-error-safety-"));
  const secret = "legacy failure token=legacy-reconcile-secret api_key=legacy-reconcile-api-secret";
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Legacy failure", objective: "Redact legacy blocker", idempotencyKey: "legacy-reconcile-failure", id: "legacy-reconcile-failure", at });
  await updateProjectWorkRequest(root, "project-1", "legacy-reconcile-failure", {
    status: "failed",
    requestedRunId: "run-legacy-reconcile-failure",
    runId: "run-legacy-reconcile-failure",
    blocker: secret,
  }, at);
  const reconciled = await reconcileProjectWorkRequest({
    root,
    projectId: "project-1",
    workId: "legacy-reconcile-failure",
    at: "2026-09-20T12:01:00.000Z",
    findRun: async () => ({ runId: "run-legacy-reconcile-failure", state: { stage: "IMPLEMENT", status: "FAILED_FINAL", reason: secret }, updatedAt: at }),
  });
  assert.equal(reconciled?.transition, "already-failed");
  assert.equal(reconciled?.request.blocker?.includes("legacy-reconcile-secret"), false);
  assert.match(reconciled?.request.blocker ?? "", /\[redacted\]/i);
  assert.equal((await loadProjectWorkRequest(root, "project-1", "legacy-reconcile-failure"))?.blocker?.includes("legacy-reconcile-secret"), false);
});

test("reconciliation does not overwrite a concurrent retry with a stale blocker", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-reconcile-retry-race-"));
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Retry race", objective: "Preserve retry state", idempotencyKey: "reconcile-retry-race", id: "reconcile-retry-race", at });
  await updateProjectWorkRequest(root, "project-1", "reconcile-retry-race", {
    status: "failed",
    requestedRunId: "run-reconcile-retry-race",
    runId: "run-reconcile-retry-race",
    blocker: "token=stale-reconcile-secret",
  }, at);
  let findRunStarted!: () => void;
  const findRunStartedPromise = new Promise<void>((resolve) => { findRunStarted = resolve; });
  let releaseFindRun!: () => void;
  const releaseFindRunPromise = new Promise<void>((resolve) => { releaseFindRun = resolve; });
  const reconciliation = reconcileProjectWorkRequest({
    root,
    projectId: "project-1",
    workId: "reconcile-retry-race",
    at: "2026-09-20T12:01:00.000Z",
    findRun: async () => {
      findRunStarted();
      await releaseFindRunPromise;
      return { runId: "run-reconcile-retry-race", state: { stage: "IMPLEMENT", status: "FAILED_FINAL", reason: "token=stale-run-secret" }, updatedAt: at };
    },
  });
  await findRunStartedPromise;
  await updateProjectWorkRequest(root, "project-1", "reconcile-retry-race", { status: "running", blocker: undefined }, "2026-09-20T12:00:30.000Z");
  releaseFindRun();
  const result = await reconciliation;
  const persisted = await loadProjectWorkRequest(root, "project-1", "reconcile-retry-race");
  assert.equal(result?.request.status, "running");
  assert.equal(result?.request.blocker, undefined);
  assert.equal(persisted?.status, "running");
  assert.equal(persisted?.blocker, undefined);
});

test("an explicit retry lets the authoritative terminal Run reproject a failed request", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-retry-projection-"));
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Retry", objective: "Retry", idempotencyKey: "retry", id: "retry", at });
  await updateProjectWorkRequest(root, "project-1", "retry", {
    status: "failed",
    requestedRunId: "run-retry",
    runId: "run-retry",
    blocker: "previous Runtime failure",
  }, at);
  const recovered = await reconcileProjectWorkRequest({
    root,
    projectId: "project-1",
    workId: "retry",
    at: "2026-09-20T12:02:00.000Z",
    findRun: async () => ({ runId: "run-retry", state: { stage: "DONE", status: "DONE" }, updatedAt: at }),
  });
  assert.equal(recovered?.request.status, "completed");
  assert.equal(recovered?.transition, "updated");
  assert.equal(recovered?.request.blocker, undefined);
});

test("late or mismatched Run observations cannot overwrite a terminal request", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-late-run-"));
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Late", objective: "Late", idempotencyKey: "late", id: "late", at });
  await updateProjectWorkRequest(root, "project-1", "late", { status: "completed", requestedRunId: "run-late", runId: "run-late" }, at);
  const late = await reconcileProjectWorkRequest({
    root, projectId: "project-1", workId: "late", at: "2026-09-20T12:01:00.000Z",
    findRun: async () => ({ runId: "run-late", state: { stage: "IMPLEMENT", status: "FAILED_FINAL" }, updatedAt: at }),
  });
  assert.equal(late?.request.status, "completed");
  assert.equal(late?.transition, "already-completed");

  const mismatched = await reconcileProjectWorkRequest({
    root, projectId: "project-1", workId: "late", at: "2026-09-20T12:02:00.000Z",
    findRun: async () => ({ runId: "another-run", state: { stage: "DONE", status: "DONE" }, updatedAt: at }),
  });
  assert.equal(mismatched?.request.status, "completed");
  assert.equal(mismatched?.transition, "unknown");
  assert.match(mismatched?.blocker ?? "", /identity mismatch/);
});

test("Run observations from another project are rejected before queue projection", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-project-boundary-"));
  await createProjectWorkRequest({ root, projectId: "project-1", title: "Boundary", objective: "Boundary", idempotencyKey: "boundary", id: "boundary", at });
  await updateProjectWorkRequest(root, "project-1", "boundary", { status: "running", requestedRunId: "run-other", runId: "run-other" }, at);
  const result = await reconcileProjectWorkRequest({
    root, projectId: "project-1", workId: "boundary", at: "2026-09-20T12:03:00.000Z",
    findRun: async () => ({ runId: "run-other", projectId: "project-2", state: { stage: "DONE", status: "DONE" }, updatedAt: at }),
  });
  assert.equal(result?.request.status, "running");
  assert.equal(result?.transition, "unknown");
  assert.match(result?.blocker ?? "", /project identity mismatch/);
});
