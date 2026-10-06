import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessCheckpoint, HarnessRunEvent } from "../src/harness/contracts.js";
import {
  appendHarnessRunEvent,
  loadHarnessRunEvents,
  loadLatestHarnessCheckpoint,
  saveHarnessCheckpoint,
} from "../src/harness/event-store.js";
import { withDurableHarnessRunEventLock } from "../src/harness/event-lock.js";

const event: HarnessRunEvent = {
  version: 1,
  id: "event-lock-read-001",
  runId: "run-lock-read-001",
  type: "status-changed",
  at: "2026-09-30T05:00:00.000Z",
  stage: "CONTEXT",
  status: "RUNNING",
  summary: "lock-read",
};

const checkpoint: HarnessCheckpoint = {
  version: 1,
  id: "checkpoint-lock-read-001",
  runId: event.runId,
  recordedAt: "2026-09-30T05:00:01.000Z",
  state: {
    version: 1,
    stage: "CONTEXT",
    status: "RUNNING",
    completedStages: [],
    skippedStages: [],
    updatedAt: "2026-09-30T05:00:01.000Z",
  },
  evidence: [],
};

async function root(): Promise<string> {
  return mkdtemp(join(tmpdir(), "iseol-harness-event-lock-read-"));
}

async function assertReadWaitsForEventLock<T>(
  store: string,
  read: () => Promise<T>,
): Promise<T> {
  let settled = false;
  let readPromise: Promise<T> | undefined;
  const lockPromise = withDurableHarnessRunEventLock(
    store,
    event.runId,
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

test("Harness event and checkpoint reads wait for the durable Run event lock", async () => {
  const store = await root();
  await appendHarnessRunEvent(store, event);
  await saveHarnessCheckpoint(store, checkpoint);

  const events = await assertReadWaitsForEventLock(store, () => loadHarnessRunEvents(store, event.runId));
  assert.deepEqual(events.map((item) => item.id), [event.id]);

  const latest = await assertReadWaitsForEventLock(store, () => loadLatestHarnessCheckpoint(store, event.runId));
  assert.deepEqual(latest, checkpoint);
});
