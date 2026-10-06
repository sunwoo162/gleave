import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { inspectProjectRunReconciliation, reconcileProjectRunAsOperator } from "../src/harness/operator-reconciliation.js";
import { loadHarnessRun, saveHarnessRun } from "../src/harness/run-store.js";
import { loadHarnessRunEvents } from "../src/harness/event-store.js";
import { consumeOperatorApproval, issueOperatorApproval } from "../src/harness/operator-approval-store.js";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "iseol-operator-reconcile-"));
  const run: HarnessRuntimeRunEnvelope = {
    version: 1,
    request: { version: 1, mode: "project-workspace", runId: "run-3", projectId: "project-a", objective: "objective", targetRoot: root },
    preflight: { version: 1, runId: "run-3", status: "ready" },
    state: { version: 1, stage: "ANALYZE", status: "RUNNING", completedStages: ["PREFLIGHT", "CONTEXT"], skippedStages: [], updatedAt: "2026-09-19T00:00:00.000Z" },
    evidence: [],
    updatedAt: "2026-09-19T00:00:00.000Z",
  };
  await saveHarnessRun(root, run);
  return { root, run };
}

const quietObservation = async () => ({
  activeRuntimeOwner: false,
  activeWorker: false,
  desktopJobs: [],
  completedResultsReconciled: true,
});

test("operator reconciliation inspection is read-only and exposes bounded blockers", async () => {
  const f = await fixture();
  const expectedRevision = "2026-09-19T00:00:00.000Z:2026-09-19T00:00:00.000Z:ANALYZE:RUNNING";
  const inspection = await inspectProjectRunReconciliation({ storeRoot: f.root, projectId: "project-a", runId: "run-3", expectedRevision, observe: async () => ({ ...await quietObservation(), activeWorker: true }) });
  assert.equal(inspection.canReconcile, false);
  assert.deepEqual(inspection.blockers, ["active-web-worker"]);
  assert.equal((await loadHarnessRun(f.root, "run-3"))?.state.status, "RUNNING");
});

test("active or indeterminate Desktop work blocks reconciliation", async () => {
  const f = await fixture();
  const expectedRevision = "2026-09-19T00:00:00.000Z:2026-09-19T00:00:00.000Z:ANALYZE:RUNNING";
  const blocked = await reconcileProjectRunAsOperator({
    storeRoot: f.root, projectId: "project-a", runId: "run-3", expectedRevision, operationId: "op-blocked",
    reason: "stale-runtime-after-shutdown", actor: "operator", approvalId: "approval-1", at: "2026-09-19T00:01:00.000Z",
    observe: async () => ({ ...await quietObservation(), desktopJobs: [{ status: "indeterminate", runId: "run-3" } as never] }),
  });
  assert.equal(blocked.status, "rejected");
  assert.match((blocked as { reason: string }).reason, /indeterminate-desktop-job/);
});

test("reconciliation requires approval, pauses stale Run, records operation, and is idempotent", async () => {
  const f = await fixture();
  const expectedRevision = "2026-09-19T00:00:00.000Z:2026-09-19T00:00:00.000Z:ANALYZE:RUNNING";
  const base = { storeRoot: f.root, projectId: "project-a", runId: "run-3", expectedRevision, operationId: "op-1", reason: "operator-confirmed-no-active-work" as const, actor: "operator" as const, approvalId: "approval-1", at: "2026-09-19T00:01:00.000Z", observe: quietObservation };
  await issueOperatorApproval({ root: f.root, requestId: "request-1", projectId: "project-a", runId: "run-3", stage: "ANALYZE", status: "RUNNING", revision: expectedRevision, reason: base.reason, issuedAt: "2026-09-19T00:00:30.000Z", expiresAt: "2026-09-19T01:00:00.000Z", issuedBy: "test-operator" }).then(async (approval) => { base.approvalId = approval.approvalId; });
  const first = await reconcileProjectRunAsOperator(base);
  assert.equal(first.status, "reconciled");
  assert.equal((await loadHarnessRun(f.root, "run-3"))?.state.status, "PAUSED");
  const events = await loadHarnessRunEvents(f.root, "run-3");
  assert.equal(events.filter((event) => event.type === "operator-reconciled").length, 1);
  const second = await reconcileProjectRunAsOperator(base);
  assert.equal(second.status, "already-reconciled");
  assert.equal((await loadHarnessRunEvents(f.root, "run-3")).filter((event) => event.type === "operator-reconciled").length, 1);
});

test("revision changes reject reconciliation without changing the Run", async () => {
  const f = await fixture();
  const result = await reconcileProjectRunAsOperator({
    storeRoot: f.root, projectId: "project-a", runId: "run-3", expectedRevision: "old", operationId: "op-revision",
    reason: "stale-runtime-after-shutdown", actor: "operator", approvalId: "approval-1", at: "2026-09-19T00:01:00.000Z", observe: quietObservation,
  });
  assert.equal(result.status, "rejected");
  assert.match((result as { reason: string }).reason, /revision-mismatch/);
  assert.equal((await loadHarnessRun(f.root, "run-3"))?.state.status, "RUNNING");
});

test("mismatched project identity is rejected", async () => {
  const f = await fixture();
  const result = await inspectProjectRunReconciliation({ storeRoot: f.root, projectId: "project-b", runId: "run-3", expectedRevision: "x", observe: quietObservation });
  assert.equal(result.canReconcile, false);
  assert.deepEqual(result.blockers, ["run-not-found-or-project-mismatch"]);
});

test("operator approvals are target-bound, expiring, and single-use", async () => {
  const f = await fixture();
  const revision = "2026-09-19T00:00:00.000Z:2026-09-19T00:00:00.000Z:ANALYZE:RUNNING";
  const approval = await issueOperatorApproval({ root: f.root, requestId: "request-bound", projectId: "project-a", runId: "run-3", stage: "ANALYZE", status: "RUNNING", revision, reason: "stale-runtime-after-shutdown", issuedAt: "2026-09-19T00:00:00.000Z", expiresAt: "2026-09-19T00:10:00.000Z", issuedBy: "operator" });
  const wrongRun = await consumeOperatorApproval({ root: f.root, approvalId: approval.approvalId, projectId: "project-a", runId: "run-4", stage: "ANALYZE", status: "RUNNING", revision, at: "2026-09-19T00:01:00.000Z" });
  assert.equal(wrongRun.ok, false);
  const consumed = await consumeOperatorApproval({ root: f.root, approvalId: approval.approvalId, projectId: "project-a", runId: "run-3", stage: "ANALYZE", status: "RUNNING", revision, at: "2026-09-19T00:01:00.000Z" });
  assert.equal(consumed.ok, true);
  const duplicate = await consumeOperatorApproval({ root: f.root, approvalId: approval.approvalId, projectId: "project-a", runId: "run-3", stage: "ANALYZE", status: "RUNNING", revision, at: "2026-09-19T00:02:00.000Z" });
  assert.deepEqual(duplicate, { ok: false, reason: "approval-already-consumed" });
  const expired = await issueOperatorApproval({ root: f.root, requestId: "request-expired", projectId: "project-a", runId: "run-3", stage: "ANALYZE", status: "RUNNING", revision, reason: "stale-runtime-after-shutdown", issuedAt: "2026-09-19T00:00:00.000Z", expiresAt: "2026-09-19T00:01:00.000Z", issuedBy: "operator" });
  assert.deepEqual(await consumeOperatorApproval({ root: f.root, approvalId: expired.approvalId, projectId: "project-a", runId: "run-3", stage: "ANALYZE", status: "RUNNING", revision, at: "2026-09-19T00:02:00.000Z" }), { ok: false, reason: "approval-expired" });
});

test("operator approval issuance is serialized across independent service instances", async () => {
  const f = await fixture();
  const revision = "2026-09-19T00:00:00.000Z:2026-09-19T00:00:00.000Z:ANALYZE:RUNNING";
  const instances = await Promise.all(
    Array.from({ length: 8 }, (_, index) => import(`../src/harness/operator-approval-store.ts?operator-approval-instance=${index}`)),
  );
  const attempts = await Promise.allSettled(instances.map((store, index) => store.issueOperatorApproval({
      root: f.root,
      requestId: "cross-service-request",
      projectId: "project-a",
      runId: "run-3",
      stage: "ANALYZE",
      status: "RUNNING",
      revision,
      reason: "operator-confirmed-no-active-work",
      issuedAt: "2026-09-19T00:00:30.000Z",
      expiresAt: "2026-09-19T01:00:00.000Z",
      issuedBy: `operator-${index}`,
    })));
  const fulfilled = attempts.filter((attempt): attempt is PromiseFulfilledResult<unknown> => attempt.status === "fulfilled");
  assert.equal(fulfilled.length, 1);
  assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 7);
  const approval = fulfilled[0]?.value as { approvalId: string; issuedBy: string };
  assert.match(approval.approvalId, /^approval-/);
  assert.match(approval.issuedBy, /^operator-\d+$/);
});

test("operator approval consumption is single-use across independent service instances", async () => {
  const f = await fixture();
  const revision = "2026-09-19T00:00:00.000Z:2026-09-19T00:00:00.000Z:ANALYZE:RUNNING";
  const approval = await issueOperatorApproval({
    root: f.root,
    requestId: "cross-service-consume-request",
    projectId: "project-a",
    runId: "run-3",
    stage: "ANALYZE",
    status: "RUNNING",
    revision,
    reason: "operator-confirmed-no-active-work",
    issuedAt: "2026-09-19T00:00:30.000Z",
    expiresAt: "2026-09-19T01:00:00.000Z",
    issuedBy: "operator",
  });
  const instances = await Promise.all(
    Array.from({ length: 8 }, (_, index) => import(`../src/harness/operator-approval-store.ts?operator-approval-consume-instance=${index}`)),
  );
  const attempts = await Promise.allSettled(instances.map((store) => store.consumeOperatorApproval({
    root: f.root,
    approvalId: approval.approvalId,
    projectId: "project-a",
    runId: "run-3",
    stage: "ANALYZE",
    status: "RUNNING",
    revision,
    at: "2026-09-19T00:01:00.000Z",
  })));
  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 8);
  assert.equal(attempts.filter((attempt): attempt is PromiseFulfilledResult<{ ok: true }> => attempt.status === "fulfilled" && attempt.value.ok).length, 1);
  assert.equal(attempts.filter((attempt): attempt is PromiseFulfilledResult<{ ok: false; reason: string }> => attempt.status === "fulfilled" && !attempt.value.ok && attempt.value.reason === "approval-already-consumed").length, 7);
});
