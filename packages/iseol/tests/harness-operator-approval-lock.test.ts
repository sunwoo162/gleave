import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  issueOperatorApproval,
  loadOperatorApproval,
} from "../src/harness/operator-approval-store.js";
import { withDurableOperatorApprovalLock } from "../src/harness/operator-approval-lock.js";

test("operator approval reads wait for the durable approval lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-operator-approval-lock-read-"));
  const approval = await issueOperatorApproval({
    root,
    requestId: "request-lock-read",
    projectId: "project-lock-read",
    runId: "run-lock-read",
    stage: "ANALYZE",
    status: "RUNNING",
    revision: "revision-lock-read",
    reason: "operator-confirmed-no-active-work",
    issuedAt: "2026-09-30T07:00:00.000Z",
    expiresAt: "2026-09-30T08:00:00.000Z",
    issuedBy: "test-operator",
  });

  let settled = false;
  let readPromise: Promise<Awaited<ReturnType<typeof loadOperatorApproval>>> | undefined;
  const lockPromise = withDurableOperatorApprovalLock(
    root,
    approval.approvalId,
    async () => {
      readPromise = loadOperatorApproval(root, approval.approvalId);
      readPromise.finally(() => { settled = true; }).catch(() => undefined);
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      assert.equal(settled, false);
    },
    { waitForMs: 2_000 },
    "approval",
  );
  await lockPromise;

  assert.deepEqual(await readPromise!, approval);
});
