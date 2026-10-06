import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessEvidenceRecord, HarnessRuntimeRunEnvelope } from "../../harness/contracts.js";
import { loadLatestHarnessCheckpoint } from "../../harness/event-store.js";
import { recoverHarnessRun } from "../../harness/recovery.js";
import { loadHarnessRun, saveHarnessRun } from "../../harness/run-store.js";
import { superviseHarnessRun, type HarnessStageExecutor } from "../../harness/run-supervisor.js";
import { loadHarnessSideEffect } from "../../harness/side-effect-ledger.js";
import type { EvaluationScenarioDefinition } from "../scenario-runner.js";
import { passingExecution, requireScenario } from "../test-support/evaluation-fixtures.js";

const T1 = "2026-09-08T07:00:01.000Z";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function runtimeRun(): HarnessRuntimeRunEnvelope {
  return {
    version: 1,
    request: { version: 1, runId: "run-race", mode: "project-workspace", objective: "Concurrent recovery evaluation", targetRoot: "C:/repo" },
    preflight: { version: 1, runId: "run-race", status: "ready", policy: { version: 1, loadedAt: T1, sources: [], effectiveSha256: "a".repeat(64) } },
    state: { version: 1, stage: "COMMIT", status: "RUNNING", completedStages: ["PREFLIGHT"], skippedStages: [], updatedAt: T1 },
    evidence: [],
    updatedAt: T1,
  };
}

function commitReality() {
  return {
    agentAvailable: true,
    currentCommit: "abc123",
    desktopCommit: { key: "commit:run-race", reference: "abc123", jobId: "job-commit" },
  };
}

function prEvidence(): HarnessEvidenceRecord {
  return {
    version: 1,
    id: "PR-pull-request",
    kind: "pull-request",
    stage: "PR",
    recordedAt: "2026-09-08T07:00:04.000Z",
    summary: "PR recovered",
  };
}

const concurrentRecoveryScenario: EvaluationScenarioDefinition = {
  scenario: {
    version: 1,
    scenarioId: "concurrent-recovery-stale-write",
    category: "core",
    name: "Concurrent recovery cannot overwrite newer supervisor state",
    targetMode: "project-workspace",
    maxDurationMs: 30_000,
    faultPlan: [],
    expectedInvariants: ["canonical-run-stable", "no-duplicate-side-effects"],
    requiredCapabilities: ["harness-recovery"],
  },
  execute: async () => {
    const root = await mkdtemp(join(tmpdir(), "iseol-eval-concurrent-recovery-"));
    await saveHarnessRun(root, runtimeRun());
    const entered = deferred();
    const release = deferred();
    const slow = recoverHarnessRun({
      storeRoot: root,
      runId: "run-race",
      at: "2026-09-08T07:00:02.000Z",
      inspector: { inspect: async () => { entered.resolve(); await release.promise; return commitReality(); } },
    });
    await entered.promise;
    await recoverHarnessRun({
      storeRoot: root,
      runId: "run-race",
      at: "2026-09-08T07:00:03.000Z",
      inspector: { inspect: async () => commitReality() },
    });
    const executor: HarnessStageExecutor = {
      execute: async (run) => run.state.stage === "PR"
        ? { type: "completed", evidence: [prEvidence()] }
        : { type: "waiting-external", reason: "CI pending" },
    };
    const times = [
      "2026-09-08T07:00:04.000Z",
      "2026-09-08T07:00:05.000Z",
      "2026-09-08T07:00:06.000Z",
    ];
    const supervised = await superviseHarnessRun({
      storeRoot: root,
      runId: "run-race",
      executor,
      maxSteps: 2,
      now: () => times.shift() ?? "2026-09-08T07:00:06.000Z",
    });
    requireScenario(supervised.state.stage === "CI", `supervisor stopped at ${supervised.state.stage}`);
    requireScenario(supervised.state.status === "WAITING_EXTERNAL", `supervisor status ${supervised.state.status}`);
    release.resolve();
    await slow;

    const final = await loadHarnessRun(root, "run-race");
    const checkpoint = await loadLatestHarnessCheckpoint(root, "run-race");
    const receipt = await loadHarnessSideEffect(root, "run-race", "commit:run-race");
    requireScenario(final?.state.stage === "CI", `late recovery rewound Run to ${final?.state.stage}`);
    requireScenario(final.state.status === "WAITING_EXTERNAL", `late recovery changed status to ${final.state.status}`);
    requireScenario(checkpoint?.state.stage === "CI", `latest checkpoint regressed to ${checkpoint?.state.stage}`);
    requireScenario(receipt?.status === "completed", "canonical commit receipt was not completed");

    return passingExecution("Concurrent recovery preserved the newer canonical supervisor state", {
      targetRunId: "run-race",
      sideEffects: [{ kind: "commit", semanticKey: "commit:run-race" }],
      recoveries: [
        { runId: "run-race", startedAt: T1, recoveredAt: "2026-09-08T07:00:03.000Z", succeeded: true },
        { runId: "run-race", startedAt: T1, recoveredAt: "2026-09-08T07:00:06.000Z", succeeded: true },
      ],
      runs: [{
        runId: "run-race",
        startedAt: T1,
        completedAt: "2026-09-08T07:00:06.000Z",
        completed: true,
        verificationPassed: true,
        stageRetryCount: 0,
        staleSessionResultCount: 0,
        toolInvocationCount: 0,
        humanInterventionCount: 0,
      }],
    });
  },
};

export const CONCURRENT_RECOVERY_SCENARIOS: EvaluationScenarioDefinition[] = [concurrentRecoveryScenario];
