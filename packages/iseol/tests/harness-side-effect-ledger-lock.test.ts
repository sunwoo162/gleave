import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadHarnessSideEffect, reserveHarnessSideEffect } from "../src/harness/side-effect-ledger.js";
import { withDurableHarnessRunEventLock } from "../src/harness/event-lock.js";

test("Harness side-effect receipt reads wait for the durable Run event lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-side-effect-lock-read-"));
  const input = {
    runId: "run-side-effect-lock-read-001",
    key: "deployment:lock-read",
    kind: "deployment" as const,
    at: "2026-09-30T07:00:00.000Z",
  };
  const reserved = await reserveHarnessSideEffect(root, input);

  let settled = false;
  let readPromise: Promise<Awaited<ReturnType<typeof loadHarnessSideEffect>>> | undefined;
  const lockPromise = withDurableHarnessRunEventLock(
    root,
    input.runId,
    async () => {
      readPromise = loadHarnessSideEffect(root, input.runId, input.key);
      readPromise.finally(() => { settled = true; }).catch(() => undefined);
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      assert.equal(settled, false);
    },
    { waitForMs: 2_000 },
  );
  await lockPromise;

  assert.deepEqual(await readPromise!, reserved.receipt);
});
