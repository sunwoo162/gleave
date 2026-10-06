import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  HarnessRealityInspector,
  HarnessRealitySnapshot,
} from "../src/harness/recovery.js";
import type { HarnessRuntimeRunEnvelope, HarnessRunStage } from "../src/harness/contracts.js";
import { loadHarnessRun, saveHarnessRun } from "../src/harness/run-store.js";
import { loadHarnessRunEvents } from "../src/harness/event-store.js";
import { loadHarnessSideEffect } from "../src/harness/side-effect-ledger.js";
import { recoverHarnessRun } from "../src/harness/recovery.js";

function runtimeRun(stage: HarnessRunStage): HarnessRuntimeRunEnvelope {
  return {
    version: 1,
    request: {
      version: 1,
      runId: "run-001",
      mode: "project-workspace",
      objective: "Recover interrupted work",
      targetRoot: "C:/repo",
    },
    preflight: {
      version: 1,
      runId: "run-001",
      status: "ready",
      policy: {
        version: 1,
        loadedAt: "2026-09-07T00:00:00.000Z",
        sources: [],
        effectiveSha256: "a".repeat(64),
      },
    },
    state: {
      version: 1,
      stage,
      status: "RUNNING",
      completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN", "IMPLEMENT"],
      skippedStages: [],
      updatedAt: "2026-09-07T00:00:01.000Z",
    },
    evidence: [],
    updatedAt: "2026-09-07T00:00:01.000Z",
  };
}

function inspector(snapshot: HarnessRealitySnapshot): HarnessRealityInspector {
  return { inspect: async () => snapshot };
}
test("interrupted PR stage reuses existing pull request reality", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-recovery-pr-"));
  await saveHarnessRun(root, runtimeRun("PR"));

  const recovered = await recoverHarnessRun({
    storeRoot: root,
    runId: "run-001",
    at: "2026-09-07T00:00:10.000Z",
    inspector: inspector({
      agentAvailable: true,
      currentCommit: "abc123",
      pullRequest: {
        key: "pull-request:owner/repo:feat/recovery",
        reference: "https://github.com/owner/repo/pull/42",
      },
    }),
  });

  assert.equal(recovered.state.stage, "CI");
  assert.equal(recovered.state.status, "RUNNING");
  assert.equal(recovered.evidence.some((item) => item.kind === "pull-request"), true);
  const receipt = await loadHarnessSideEffect(
    root,
    "run-001",
    "pull-request:owner/repo:feat/recovery",
  );
  assert.equal(receipt?.status, "completed");
  assert.equal(receipt?.externalReference, "https://github.com/owner/repo/pull/42");
});

test("deployment stage skips deployment when current commit is already deployed", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-recovery-deploy-"));
  await saveHarnessRun(root, runtimeRun("DEPLOY"));

  const recovered = await recoverHarnessRun({
    storeRoot: root,
    runId: "run-001",
    at: "2026-09-07T00:00:20.000Z",
    inspector: inspector({
      agentAvailable: true,
      currentCommit: "abc123",
      deployment: {
        key: "deployment:production:abc123",
        reference: "deploy-42",
        commit: "abc123",
      },
    }),
  });
  assert.equal(recovered.state.stage, "PRODUCTION_VERIFY");
  assert.equal(recovered.state.status, "RUNNING");
  assert.equal(recovered.evidence.some((item) => item.kind === "deployment"), true);
  const receipt = await loadHarnessSideEffect(root, "run-001", "deployment:production:abc123");
  assert.equal(receipt?.status, "completed");
  assert.equal(receipt?.externalReference, "deploy-42");
});

test("unavailable desktop agent leaves the run waiting for agent", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-recovery-agent-"));
  await saveHarnessRun(root, runtimeRun("IMPLEMENT"));

  const recovered = await recoverHarnessRun({
    storeRoot: root,
    runId: "run-001",
    at: "2026-09-07T00:00:30.000Z",
    inspector: inspector({ agentAvailable: false }),
  });

  assert.equal(recovered.state.stage, "IMPLEMENT");
  assert.equal(recovered.state.status, "WAITING_AGENT");
  assert.match(recovered.state.reason ?? "", /agent/i);
});
test("recoverable session loss resumes the same unfinished stage", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-recovery-session-"));
  await saveHarnessRun(root, runtimeRun("TEST"));

  const recovered = await recoverHarnessRun({
    storeRoot: root,
    runId: "run-001",
    at: "2026-09-07T00:00:40.000Z",
    inspector: inspector({
      agentAvailable: true,
      currentCommit: "abc123",
    }),
  });

  assert.equal(recovered.state.stage, "TEST");
  assert.equal(recovered.state.status, "RUNNING");
  assert.deepEqual(await loadHarnessRun(root, "run-001"), recovered);
  const events = await loadHarnessRunEvents(root, "run-001");
  assert.equal(events.some((event) => event.status === "RECOVERING"), true);
  assert.equal(events.at(-1)?.type, "recovered");
});

test("missing run cannot be recovered", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-recovery-missing-"));
  await assert.rejects(
    recoverHarnessRun({
      storeRoot: root,
      runId: "run-missing",
      at: "2026-09-07T00:00:50.000Z",
      inspector: inspector({ agentAvailable: true }),
    }),
    /not found/i,
  );
});
