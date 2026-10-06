import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DesktopJobResult } from "../src/desktop-agent/contracts.js";
import { withDurableDesktopJobLock } from "../src/desktop-agent/job-lock.js";
import { loadCompletedDesktopResults, persistCompletedDesktopResult } from "../src/desktop-agent/result-store.js";

function result(jobId: string): DesktopJobResult {
  return {
    version: 1,
    jobId,
    runId: `run-${jobId}`,
    agentId: "agent-result-read-001",
    status: "completed",
    completedAt: "2026-09-30T02:00:00.000Z",
    operations: [{ operationId: "op-1", ok: true, summary: "done" }],
  };
}

async function root(): Promise<string> {
  return mkdtemp(join(tmpdir(), "iseol-desktop-result-lock-read-"));
}

test("completed Desktop result reads wait for the durable Job lock", async () => {
  const store = await root();
  const jobId = "job-result-lock-read-001";
  await persistCompletedDesktopResult(store, result(jobId));

  let settled = false;
  let readPromise: Promise<Map<string, DesktopJobResult>> | undefined;
  const lockPromise = withDurableDesktopJobLock(
    store,
    jobId,
    async () => {
      readPromise = loadCompletedDesktopResults(store);
      readPromise.finally(() => { settled = true; }).catch(() => undefined);
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      assert.equal(settled, false);
    },
    { waitForMs: 2_000 },
  );
  await lockPromise;

  const loaded = await readPromise!;
  assert.equal(loaded.get(jobId)?.jobId, jobId);
});
