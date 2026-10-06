import type {
  DevelopmentRunMode,
  HarnessEvidenceKind,
  HarnessEvidenceRecord,
  HarnessRunStage,
} from "./contracts.js";
import { completionProfileForMode } from "../idea-lab/completion-profile.js";

const STAGE_EVIDENCE: Partial<Record<HarnessRunStage, HarnessEvidenceKind[]>> = {
  TEST: ["test"],
  SELF_REVIEW: ["review"],
  COMMIT: ["commit"],
  PR: ["pull-request"],
  CI: ["ci"],
  DEPLOY: ["deployment"],
  PRODUCTION_VERIFY: ["production-verification"],
};

export function requiredEvidenceForStage(stage: HarnessRunStage): HarnessEvidenceKind[] {
  return [...(STAGE_EVIDENCE[stage] ?? [])];
}

function hasEvidence(
  evidence: HarnessEvidenceRecord[],
  stage: HarnessRunStage,
  kind: HarnessEvidenceKind,
): boolean {
  return evidence.some((item) => item.stage === stage && item.kind === kind);
}

export function assertStageCompletionEvidence(
  stage: HarnessRunStage,
  evidence: HarnessEvidenceRecord[],
): void {
  const required = requiredEvidenceForStage(stage);
  const missing = required.filter((kind) => !hasEvidence(evidence, stage, kind));
  if (missing.length > 0) {
    throw new Error(`Stage ${stage} is missing required evidence: ${missing.join(", ")}`);
  }
}
export function assertRunCompletionEvidence(
  evidence: HarnessEvidenceRecord[],
  mode: DevelopmentRunMode = "project-workspace",
  identity: {
    verificationStages?: string[];
    runId?: string;
    projectId?: string;
  } = {},
): void {
  const missing: string[] = [];
  for (const stage of completionProfileForMode(mode).requiredEvidenceStages) {
    for (const kind of requiredEvidenceForStage(stage)) {
      if (!hasEvidence(evidence, stage, kind)) missing.push(kind);
    }
  }
  if (identity.verificationStages?.includes("BUILD")) {
    const buildEvidence = evidence.some((item) =>
      item.kind === "build"
      && (identity.runId === undefined || item.runId === identity.runId)
      && (identity.projectId === undefined || item.projectId === identity.projectId),
    );
    if (!buildEvidence) missing.push("build");
  }
  if (missing.length > 0) {
    throw new Error(`Run completion is missing required evidence: ${missing.join(", ")}`);
  }
}
