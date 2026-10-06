import assert from "node:assert/strict";
import test from "node:test";
import type { HarnessPreflightRecord } from "../src/harness/contracts.js";
import {
  HARNESS_STAGE_ORDER,
  createInitialRunState,
  nextHarnessStage,
  transitionRunState,
} from "../src/harness/state-machine.js";

const readyPreflight: HarnessPreflightRecord = {
  version: 1,
  runId: "run-ready",
  status: "ready",
  policy: {
    version: 1,
    loadedAt: "2026-09-07T00:00:00.000Z",
    sources: [],
    effectiveSha256: "a".repeat(64),
  },
};

const blockedPreflight: HarnessPreflightRecord = {
  version: 1,
  runId: "run-blocked",
  status: "blocked",
  reason: "missing policy",
};test("successful preflight starts ready at context", () => {
  const state = createInitialRunState(readyPreflight, "2026-09-07T00:00:01.000Z");
  assert.equal(state.stage, "CONTEXT");
  assert.equal(state.status, "READY");
  assert.deepEqual(state.completedStages, ["PREFLIGHT"]);
});

test("blocked preflight remains blocked at preflight", () => {
  const state = createInitialRunState(blockedPreflight, "2026-09-07T00:00:01.000Z");
  assert.equal(state.stage, "PREFLIGHT");
  assert.equal(state.status, "BLOCKED_USER");
  assert.equal(state.reason, "missing policy");
});

test("run starts and completes stages in deterministic order", () => {
  let state = createInitialRunState(readyPreflight, "2026-09-07T00:00:01.000Z");
  state = transitionRunState(state, { type: "start", at: "2026-09-07T00:00:02.000Z" });
  assert.equal(state.status, "RUNNING");
  state = transitionRunState(state, { type: "complete-stage", at: "2026-09-07T00:00:03.000Z" });
  assert.equal(state.stage, "ANALYZE");
  assert.deepEqual(state.completedStages, ["PREFLIGHT", "CONTEXT"]);
  assert.equal(nextHarnessStage("ANALYZE"), "PLAN");
  assert.equal(HARNESS_STAGE_ORDER.at(-1), "DONE");
});test("pause and resume preserve the current stage", () => {
  let state = createInitialRunState(readyPreflight, "2026-09-07T00:00:01.000Z");
  state = transitionRunState(state, { type: "start", at: "2026-09-07T00:00:02.000Z" });
  state = transitionRunState(state, { type: "pause", at: "2026-09-07T00:00:03.000Z", reason: "manual" });
  assert.equal(state.stage, "CONTEXT");
  assert.equal(state.status, "PAUSED");
  state = transitionRunState(state, { type: "resume", at: "2026-09-07T00:00:04.000Z" });
  assert.equal(state.stage, "CONTEXT");
  assert.equal(state.status, "READY");
});

test("skipping a stage requires a reason", () => {
  let state = createInitialRunState(readyPreflight, "2026-09-07T00:00:01.000Z");
  state = transitionRunState(state, { type: "start", at: "2026-09-07T00:00:02.000Z" });
  assert.throws(
    () => transitionRunState(state, { type: "skip-stage", at: "2026-09-07T00:00:03.000Z", reason: "" }),
    /skip reason/i,
  );
});

test("illegal transitions and done mutations are rejected", () => {
  const ready = createInitialRunState(readyPreflight, "2026-09-07T00:00:01.000Z");
  assert.throws(
    () => transitionRunState(ready, { type: "complete-stage", at: "2026-09-07T00:00:02.000Z" }),
    /RUNNING/,
  );

  const done = { ...ready, stage: "DONE" as const, status: "DONE" as const };
  assert.throws(
    () => transitionRunState(done, { type: "start", at: "2026-09-07T00:00:03.000Z" }),
    /terminal/i,
  );
});