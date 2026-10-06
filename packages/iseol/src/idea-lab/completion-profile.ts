import type { DevelopmentRunMode, HarnessRunStage } from "../harness/contracts.js";

export type HarnessCompletionProfile = {
  requiredEvidenceStages: HarnessRunStage[];
  skippableStages: HarnessRunStage[];
};

const PROJECT_WORKSPACE_PROFILE: HarnessCompletionProfile = {
  requiredEvidenceStages: ["TEST", "SELF_REVIEW", "COMMIT", "PR", "CI", "DEPLOY", "PRODUCTION_VERIFY"],
  skippableStages: [],
};

const IDEA_LAB_PROFILE: HarnessCompletionProfile = {
  requiredEvidenceStages: ["TEST", "SELF_REVIEW", "COMMIT", "DEPLOY", "PRODUCTION_VERIFY"],
  skippableStages: ["PR", "CI", "MERGE"],
};

export function completionProfileForMode(mode: DevelopmentRunMode): HarnessCompletionProfile {
  const profile = mode === "idea-lab" ? IDEA_LAB_PROFILE : PROJECT_WORKSPACE_PROFILE;
  return {
    requiredEvidenceStages: [...profile.requiredEvidenceStages],
    skippableStages: [...profile.skippableStages],
  };
}

export function ideaLabSkipReason(stage: HarnessRunStage): string | null {
  if (!IDEA_LAB_PROFILE.skippableStages.includes(stage)) return null;
  return `Idea Lab preview profile skips ${stage} because permanent PR/CI/merge delivery is deferred until promotion`;
}
