import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessRunEnvelope } from "../src/harness/contracts.js";
import { withDurableHarnessRunLock } from "../src/harness/run-lock.js";
import { loadHarnessRun, saveHarnessRun } from "../src/harness/run-store.js";

function envelope(updatedAt = "2026-09-30T06:00:00.000Z"): HarnessRunEnvelope {
  return {
    version: 1,
    request: {
      version: 1,
      runId: "run-store-lock-read-001",
      mode: "project-workspace",
      objective: "Lock read test",
      targetRoot: "C:/repo",
    },
    preflight: {
      version: 1,
      runId: "run-store-lock-read-001",
      status: "blocked",
      reason: "fixture",
    },
    state: {
      version: 1,
      stage: "PREFLIGHT",
      status: "BLOCKED_USER",
      completedStages: [],
      skippedStages: [],
      updatedAt,
      reason: "fixture",
    },
    evidence: [],
    updatedAt,
  };
}

async function root(): Promise<string> {
  return mkdtemp(join(tmpdir(), "iseol-harness-run-lock-read-"));
}

async function assertRunReadOrWriteWaitsForLock<T>(
  store: string,
  action: () => Promise<T>,
): Promise<T> {
  let settled = false;
  let actionPromise: Promise<T> | undefined;
  const lockPromise = withDurableHarnessRunLock(
    store,
    "run-store-lock-read-001",
    async () => {
      actionPromise = action();
      actionPromise.finally(() => { settled = true; }).catch(() => undefined);
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      assert.equal(settled, false);
    },
    { waitForMs: 2_000 },
  );
  await lockPromise;
  return actionPromise!;
}

test("Harness Run public load and save wait for the durable Run lock", async () => {
  const store = await root();
  const initial = envelope();
  await saveHarnessRun(store, initial);

  const loaded = await assertRunReadOrWriteWaitsForLock(
    store,
    () => loadHarnessRun(store, initial.request.runId),
  );
  assert.deepEqual(loaded, initial);

  const updated = envelope("2026-09-30T06:00:01.000Z");
  await assertRunReadOrWriteWaitsForLock(store, () => saveHarnessRun(store, updated));
  assert.deepEqual(await loadHarnessRun(store, initial.request.runId), updated);
});
