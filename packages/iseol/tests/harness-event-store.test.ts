import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessCheckpoint, HarnessRunEvent, HarnessRunState } from "../src/harness/contracts.js";
import {
  appendHarnessRunEvent,
  appendHarnessRunEventIfAbsent,
  loadHarnessRunEvents,
  loadLatestHarnessCheckpoint,
  saveHarnessCheckpoint,
} from "../src/harness/event-store.js";
import { withDurableHarnessRunEventLock } from "../src/harness/event-lock.js";

const state: HarnessRunState = {
  version: 1,
  stage: "CONTEXT",
  status: "RUNNING",
  completedStages: ["PREFLIGHT"],
  skippedStages: [],
  updatedAt: "2026-09-07T00:00:01.000Z",
};

function event(id: string, at: string): HarnessRunEvent {
  return {
    version: 1,
    id,
    runId: "run-001",
    type: "status-changed",
    at,
    stage: "CONTEXT",
    status: "RUNNING",
    summary: id,
  };
}test("run events reload in append order", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-events-"));
  await appendHarnessRunEvent(root, event("event-1", "2026-09-07T00:00:01.000Z"));
  await appendHarnessRunEvent(root, event("event-2", "2026-09-07T00:00:02.000Z"));

  const events = await loadHarnessRunEvents(root, "run-001");
  assert.deepEqual(events.map((item) => item.id), ["event-1", "event-2"]);
});

test("latest checkpoint is selected by recorded time", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-checkpoints-"));
  const first: HarnessCheckpoint = {
    version: 1,
    id: "checkpoint-1",
    runId: "run-001",
    recordedAt: "2026-09-07T00:00:01.000Z",
    state,
    evidence: [],
  };
  const second: HarnessCheckpoint = {
    ...first,
    id: "checkpoint-2",
    recordedAt: "2026-09-07T00:00:02.000Z",
    state: { ...state, stage: "ANALYZE", updatedAt: "2026-09-07T00:00:02.000Z" },
  };

  await saveHarnessCheckpoint(root, first);
  await saveHarnessCheckpoint(root, second);
  assert.deepEqual(await loadLatestHarnessCheckpoint(root, "run-001"), second);
});

test("missing event and checkpoint stores are empty", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-events-empty-"));
  assert.deepEqual(await loadHarnessRunEvents(root, "run-001"), []);
  assert.equal(await loadLatestHarnessCheckpoint(root, "run-001"), null);
});

test("append-once keeps one event identity across independent event-store instances", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-events-append-once-"));
  const instances = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      import(`../src/harness/event-store.ts?append-once-instance=${index}-${Date.now()}`),
    ),
  );
  const outcomes = await Promise.allSettled(
    instances.map((instance) => instance.appendHarnessRunEventIfAbsent(root, event("event-shared", "2026-09-07T00:00:01.000Z"))),
  );

  assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 0);
  const values = outcomes
    .filter((outcome): outcome is PromiseFulfilledResult<boolean> => outcome.status === "fulfilled")
    .map((outcome) => outcome.value);
  assert.equal(values.filter(Boolean).length, 1);
  assert.equal(values.filter((value) => !value).length, 7);
  assert.deepEqual((await loadHarnessRunEvents(root, "run-001")).map((item) => item.id), ["event-shared"]);
});

test("checkpoint persistence waits for the durable Run event lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-checkpoints-lock-"));
  const checkpoint: HarnessCheckpoint = {
    version: 1,
    id: "checkpoint-lock",
    runId: "run-001",
    recordedAt: "2026-09-07T00:00:03.000Z",
    state,
    evidence: [],
  };
  let settled = false;
  let savePromise: Promise<void> | undefined;
  const pending = withDurableHarnessRunEventLock(
    root,
    "run-001",
    async () => {
      const store = await import("../src/harness/event-store.js?checkpoint-lock");
      savePromise = store.saveHarnessCheckpoint(root, checkpoint);
      savePromise.finally(() => { settled = true; }).catch(() => undefined);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
      assert.equal(settled, false);
    },
    { waitForMs: 2_000 },
  );
  await pending;
  await savePromise;
  assert.deepEqual(await loadLatestHarnessCheckpoint(root, "run-001"), checkpoint);
});
