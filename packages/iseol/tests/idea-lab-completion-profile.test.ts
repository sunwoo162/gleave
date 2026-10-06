import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  DevelopmentRunMode,
  HarnessEvidenceRecord,
  HarnessRuntimeRunEnvelope,
  HarnessRunStage,
} from "../src/harness/contracts.js";
import { assertRunCompletionEvidence } from "../src/harness/completion-gates.js";
import { loadHarnessRunEvents } from "../src/harness/event-store.js";
import { saveHarnessRun } from "../src/harness/run-store.js";
import { superviseHarnessRun, type HarnessStageExecutor } from "../src/harness/run-supervisor.js";
import { completionProfileForMode } from "../src/idea-lab/completion-profile.js";
import { assertPrototypeProduction } from "../src/idea-lab/contracts.js";

const NOW = "2026-09-08T12:00:00.000Z";

function evidence(kind: HarnessEvidenceRecord["kind"], stage: HarnessRunStage): HarnessEvidenceRecord {
  return { version: 1, id: `${stage}-${kind}`, kind, stage, recordedAt: NOW, summary: `${kind} evidence` };
}

const IDEA_LAB_EVIDENCE: HarnessEvidenceRecord[] = [
  evidence("test", "TEST"),
  evidence("review", "SELF_REVIEW"),
  evidence("commit", "COMMIT"),
  evidence("deployment", "DEPLOY"),
  evidence("production-verification", "PRODUCTION_VERIFY"),
];
function runtimeRun(mode: DevelopmentRunMode, stage: HarnessRunStage): HarnessRuntimeRunEnvelope {
  return {
    version: 1,
    request: { version: 1, runId: `run-${mode}`, mode, objective: "preview candidate", targetRoot: "C:/repo" },
    preflight: {
      version: 1,
      runId: `run-${mode}`,
      status: "ready",
      policy: { version: 1, loadedAt: NOW, sources: [], effectiveSha256: "a".repeat(64) },
    },
    state: {
      version: 1,
      stage,
      status: "READY",
      completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN", "IMPLEMENT", "TEST", "SELF_REVIEW", "COMMIT"],
      skippedStages: [],
      updatedAt: NOW,
    },
    evidence: [...IDEA_LAB_EVIDENCE.filter((item) => item.stage !== "DEPLOY" && item.stage !== "PRODUCTION_VERIFY")],
    updatedAt: NOW,
  };
}

function clock() {
  let tick = 0;
  return () => `2026-09-08T12:00:${String(++tick).padStart(2, "0")}.000Z`;
}

test("completion profiles keep Project Workspace full delivery gates", () => {
  assert.deepEqual(completionProfileForMode("idea-lab").skippableStages, ["PR", "CI", "MERGE"]);
  assert.deepEqual(completionProfileForMode("project-workspace").skippableStages, []);
  assert.doesNotThrow(() => assertRunCompletionEvidence(IDEA_LAB_EVIDENCE, "idea-lab"));
  assert.throws(() => assertRunCompletionEvidence(IDEA_LAB_EVIDENCE, "project-workspace"), /pull-request|ci/i);
});
test("Idea Lab supervisor checkpoints PR CI and MERGE skips before DEPLOY", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-idea-profile-"));
  try {
    const run = runtimeRun("idea-lab", "PR");
    await saveHarnessRun(root, run);
    const calls: HarnessRunStage[] = [];
    const executor: HarnessStageExecutor = {
      execute: async (current) => {
        calls.push(current.state.stage);
        if (current.state.stage === "DEPLOY") {
          return { type: "waiting-external", reason: "preview provider" };
        }
        throw new Error(`Unexpected executor stage: ${current.state.stage}`);
      },
    };

    const result = await superviseHarnessRun({
      storeRoot: root,
      runId: run.request.runId,
      executor,
      maxSteps: 8,
      now: clock(),
    });

    assert.deepEqual(calls, ["DEPLOY"]);
    assert.equal(result.state.stage, "DEPLOY");
    assert.equal(result.state.status, "WAITING_EXTERNAL");
    assert.deepEqual(result.state.skippedStages.map((item) => item.stage), ["PR", "CI", "MERGE"]);
    assert.equal(result.state.skippedStages.every((item) => item.reason.trim().length > 0), true);
    const events = await loadHarnessRunEvents(root, run.request.runId);
    assert.deepEqual(events.filter((item) => item.type === "stage-skipped").map((item) => item.stage), ["PR", "CI", "MERGE"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Project Workspace supervisor does not auto-skip PR", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-profile-"));
  try {
    const run = runtimeRun("project-workspace", "PR");
    await saveHarnessRun(root, run);
    const calls: HarnessRunStage[] = [];
    const executor: HarnessStageExecutor = {
      execute: async (current) => {
        calls.push(current.state.stage);
        return { type: "waiting-external", reason: "PR provider" };
      },
    };
    const result = await superviseHarnessRun({ storeRoot: root, runId: run.request.runId, executor, maxSteps: 2, now: clock() });
    assert.deepEqual(calls, ["PR"]);
    assert.deepEqual(result.state.skippedStages, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("local preview acceptance stays separate from HTTP completion and old production records remain valid", () => {
  const production = {
    version: 1, id: "prod-1", campaignId: "camp-1", proposalId: "proposal-1", runId: "run-prod-1",
    repositoryUrl: "https://github.com/example/repo.git", sandboxRoot: "C:/sandbox", worktreeRoot: "C:/sandbox/camp/prod-1",
    branch: "idea/camp-1/prod-1", baseRef: "main", status: "ready", createdAt: NOW, updatedAt: NOW,
    deployment: { provider: "local-preview", deploymentId: "local-preview:run-prod-1:prod-1:19091", url: "http://127.0.0.1:19091/", commitSha: "a".repeat(40), deployedAt: NOW, verifiedAt: NOW },
  };
  assert.doesNotThrow(() => assertPrototypeProduction(production));
  assert.equal((production as any).acceptance, undefined);
  assert.doesNotThrow(() => assertPrototypeProduction({ ...production, acceptance: { status: "unverified" } }));
  assert.deepEqual(completionProfileForMode("idea-lab").requiredEvidenceStages, ["TEST", "SELF_REVIEW", "COMMIT", "DEPLOY", "PRODUCTION_VERIFY"]);
});
