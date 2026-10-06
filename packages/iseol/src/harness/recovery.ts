import { randomUUID } from "node:crypto";
import type {
  HarnessEvidenceKind,
  HarnessEvidenceRecord,
  HarnessRuntimeRunEnvelope,
  HarnessSideEffectKind,
} from "./contracts.js";
import { assertStageCompletionEvidence } from "./completion-gates.js";
import { appendHarnessRunEvent, saveHarnessCheckpoint } from "./event-store.js";
import { loadHarnessRun, saveHarnessRunIfUnchanged } from "./run-store.js";
import {
  completeHarnessSideEffect,
  reserveHarnessSideEffect,
} from "./side-effect-ledger.js";
import { transitionRunState } from "./state-machine.js";

export type HarnessRealitySnapshot = {
  agentAvailable: boolean;
  currentBranch?: string;
  currentCommit?: string;
  desktopCommit?: { key: string; reference: string; jobId: string };
  pullRequest?: { key: string; reference: string };
  deployment?: { key: string; reference: string; commit: string };
  desktopPatch?: { key: string; jobId: string; path: string };
};

export interface HarnessRealityInspector {
  inspect(run: HarnessRuntimeRunEnvelope): Promise<HarnessRealitySnapshot>;
}
export type RecoverHarnessRunInput = {
  storeRoot: string;
  runId: string;
  at: string;
  inspector: HarnessRealityInspector;
};

function addEvidence(
  evidence: HarnessEvidenceRecord[],
  input: {
    kind: HarnessEvidenceKind;
    stage: HarnessEvidenceRecord["stage"];
    at: string;
    summary: string;
    provider?: string;
    reference?: string;
  },
): HarnessEvidenceRecord[] {
  const duplicate = evidence.some((item) =>
    item.kind === input.kind
    && item.stage === input.stage
    && item.reference === input.reference,
  );
  if (duplicate) return evidence;
  return [
    ...evidence,
    {
      version: 1,
      id: randomUUID(),
      kind: input.kind,
      stage: input.stage,
      recordedAt: input.at,
      summary: input.summary,
      ...(input.provider === undefined ? {} : { provider: input.provider }),
      ...(input.reference === undefined ? {} : { reference: input.reference }),
    },
  ];
}

async function reconcileSideEffect(input: {
  storeRoot: string;
  runId: string;
  key: string;
  kind: HarnessSideEffectKind;
  at: string;
  reference: string;
  summary: string;
}): Promise<void> {
  await reserveHarnessSideEffect(input.storeRoot, {
    runId: input.runId,
    key: input.key,
    kind: input.kind,
    at: input.at,
  });
  await completeHarnessSideEffect(input.storeRoot, {
    runId: input.runId,
    key: input.key,
    at: input.at,
    externalReference: input.reference,
    summary: input.summary,
  });
}
async function persistRecovery(
  storeRoot: string,
  expected: HarnessRuntimeRunEnvelope,
  run: HarnessRuntimeRunEnvelope,
  at: string,
  summary: string,
): Promise<HarnessRuntimeRunEnvelope> {
  const saved = await saveHarnessRunIfUnchanged(storeRoot, expected, run);
  if (!saved) {
    const current = await loadHarnessRun(storeRoot, run.request.runId);
    if (!current) throw new Error(`Harness Run disappeared during recovery: ${run.request.runId}`);
    return current;
  }
  await appendHarnessRunEvent(storeRoot, {
    version: 1,
    id: randomUUID(),
    runId: run.request.runId,
    type: "recovered",
    at,
    stage: run.state.stage,
    status: run.state.status,
    summary,
    evidenceIds: run.evidence.map((item) => item.id),
  });
  await saveHarnessCheckpoint(storeRoot, {
    version: 1,
    id: randomUUID(),
    runId: run.request.runId,
    recordedAt: at,
    state: run.state,
    evidence: run.evidence,
    summary,
  });
  return run;
}

export async function recoverHarnessRun(
  input: RecoverHarnessRunInput,
): Promise<HarnessRuntimeRunEnvelope> {
  const existing = await loadHarnessRun(input.storeRoot, input.runId);
  if (!existing) throw new Error(`Harness Run not found: ${input.runId}`);

  const recoveringState = transitionRunState(existing.state, {
    type: "recover",
    at: input.at,
    reason: "Reconciling interrupted Run with current external reality",
  });
  let run: HarnessRuntimeRunEnvelope = {
    ...existing,
    state: recoveringState,
    updatedAt: input.at,
  };
  const recoveryStarted = await saveHarnessRunIfUnchanged(input.storeRoot, existing, run);
  if (!recoveryStarted) {
    const current = await loadHarnessRun(input.storeRoot, input.runId);
    if (!current) throw new Error(`Harness Run disappeared during recovery: ${input.runId}`);
    return current;
  }
  const recoveryBase = run;
  await appendHarnessRunEvent(input.storeRoot, {
    version: 1,
    id: randomUUID(),
    runId: input.runId,
    type: "status-changed",
    at: input.at,
    stage: run.state.stage,
    status: "RECOVERING",
    summary: "Recovery started",
  });

  const reality = await input.inspector.inspect(run);
  if (!reality.agentAvailable) {
    run = {
      ...run,
      state: transitionRunState(run.state, {
        type: "wait-agent",
        at: input.at,
        reason: "Desktop Agent is unavailable",
      }),
      updatedAt: input.at,
    };
    return persistRecovery(input.storeRoot, recoveryBase, run, input.at, "Recovery is waiting for Desktop Agent");
  }

  let evidence = [...run.evidence];
  let reconciledCurrentStage = false;

  if (run.state.stage === "COMMIT" && reality.desktopCommit) {
    await reconcileSideEffect({
      storeRoot: input.storeRoot,
      runId: input.runId,
      key: reality.desktopCommit.key,
      kind: "commit",
      at: input.at,
      reference: reality.desktopCommit.reference,
      summary: "Recovered existing desktop Git commit",
    });
    evidence = addEvidence(evidence, {
      kind: "commit",
      stage: "COMMIT",
      at: input.at,
      summary: "Existing Git commit reconciled during Desktop Agent recovery",
      provider: "git",
      reference: reality.desktopCommit.reference,
    });
    reconciledCurrentStage = true;
  }

  if (run.state.stage === "PR" && reality.pullRequest) {
    await reconcileSideEffect({
      storeRoot: input.storeRoot,
      runId: input.runId,
      key: reality.pullRequest.key,
      kind: "pull-request",
      at: input.at,
      reference: reality.pullRequest.reference,
      summary: "Recovered existing pull request",
    });
    evidence = addEvidence(evidence, {
      kind: "pull-request",
      stage: "PR",
      at: input.at,
      summary: "Existing pull request reconciled during recovery",
      provider: "github",
      reference: reality.pullRequest.reference,
    });
    reconciledCurrentStage = true;
  }
  if (
    run.state.stage === "DEPLOY"
    && reality.deployment
    && reality.currentCommit
    && reality.deployment.commit === reality.currentCommit
  ) {
    await reconcileSideEffect({
      storeRoot: input.storeRoot,
      runId: input.runId,
      key: reality.deployment.key,
      kind: "deployment",
      at: input.at,
      reference: reality.deployment.reference,
      summary: "Recovered existing deployment for current commit",
    });
    evidence = addEvidence(evidence, {
      kind: "deployment",
      stage: "DEPLOY",
      at: input.at,
      summary: "Current commit was already deployed",
      reference: reality.deployment.reference,
    });
    reconciledCurrentStage = true;
  }

  let resumedState = transitionRunState(run.state, { type: "resume", at: input.at });
  resumedState = transitionRunState(resumedState, { type: "start", at: input.at });
  if (reconciledCurrentStage) {
    assertStageCompletionEvidence(resumedState.stage, evidence);
    resumedState = transitionRunState(resumedState, { type: "complete-stage", at: input.at });
  }
  run = {
    ...run,
    state: resumedState,
    evidence,
    updatedAt: input.at,
  };
  return persistRecovery(
    input.storeRoot,
    recoveryBase,
    run,
    input.at,
    reconciledCurrentStage
      ? "Recovery reconciled completed external work and advanced the Run"
      : "Recovery resumed the unfinished stage",
  );
}
