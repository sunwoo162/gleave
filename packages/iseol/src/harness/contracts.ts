export const ISEOL_HARNESS_CONTRACT_VERSION = 1 as const;

import type { AgentRoleId, ProjectPurpose } from "../project-model/execution-profile.js";

export type DevelopmentRunMode = "idea-lab" | "project-workspace";

export type DevelopmentRunRequest = {
  version: 1;
  runId: string;
  mode: DevelopmentRunMode;
  objective: string;
  targetRoot: string;
  projectId?: string;
  purposeProfile?: {
    version: 1;
    purpose: ProjectPurpose;
    executableRoles: AgentRoleId[];
    plannedRoles: AgentRoleId[];
    verificationStages: string[];
    documentationRequired: boolean;
  };
  projectContext?: {
    name: string;
    purposeSummary: string;
    requirements: string;
  };
};

export type HarnessPolicySource = {
  kind: "iseol-global" | "project-harness" | "project-agents";
  path: string;
  sha256: string;
  content: string;
};

export type HarnessPolicySnapshot = {
  version: 1;
  loadedAt: string;
  sources: HarnessPolicySource[];
  effectiveSha256: string;
};
export type HarnessPreflightRecord = {
  version: 1;
  runId: string;
  status: "ready" | "blocked";
  /** Project Workspace CONTEXT performs the bounded Git bootstrap before inspection. */
  gitPreparation?: "bootstrap-if-empty";
  policy?: HarnessPolicySnapshot;
  reason?: string;
};

export type HarnessRunStage =
  | "PREFLIGHT" | "CONTEXT" | "ANALYZE" | "PLAN" | "IMPLEMENT"
  | "TEST" | "SELF_REVIEW" | "COMMIT" | "PR" | "CI" | "MERGE"
  | "DEPLOY" | "PRODUCTION_VERIFY" | "DONE";

export type HarnessRunStatus =
  | "READY" | "RUNNING" | "WAITING_EXTERNAL" | "WAITING_AGENT"
  | "RECOVERING" | "BLOCKED_USER" | "FAILED_RETRYABLE" | "FAILED_FINAL"
  | "PAUSED" | "CANCELLED" | "DONE";

export type HarnessSkippedStage = {
  stage: HarnessRunStage;
  reason: string;
  at: string;
};

export type HarnessRunState = {
  version: 1;
  stage: HarnessRunStage;
  status: HarnessRunStatus;
  completedStages: HarnessRunStage[];
  skippedStages: HarnessSkippedStage[];
  updatedAt: string;
  reason?: string;
};

export type HarnessEvidenceKind =
  | "command" | "build" | "file-change" | "test" | "review"
  | "commit" | "pull-request" | "ci" | "deployment" | "production-verification";

export type HarnessEvidenceRecord = {
  version: 1;
  id: string;
  kind: HarnessEvidenceKind;
  stage: HarnessRunStage;
  recordedAt: string;
  summary: string;
  provider?: string;
  reference?: string;
  /** Optional identity binding for evidence produced by an external executor. */
  projectId?: string;
  runId?: string;
  jobId?: string;
  executionIdentity?: string;
};

export type HarnessRunEventType =
  | "run-created" | "stage-started" | "stage-completed" | "stage-skipped"
  | "status-changed" | "evidence-recorded" | "side-effect" | "recovered" | "retry-requested" | "operator-approval-issued" | "operator-reconciled";

export type HarnessRetryReason = "operator-request" | "user-request";
export type HarnessRetryRecord = {
  version: 1;
  cycle: number;
  requestedFromState: "FAILED_FINAL";
  requestedStage: HarnessRunStage;
  retryReason: HarnessRetryReason;
  requestedAt: string;
  actor: "operator" | "user";
  status: "active" | "completed";
};

export type HarnessRunEvent = {
  version: 1;
  id: string;
  runId: string;
  type: HarnessRunEventType;
  at: string;
  stage: HarnessRunStage;
  status: HarnessRunStatus;
  summary: string;
  evidenceIds?: string[];
  operationId?: string;
  metadata?: Record<string, string | number | boolean>;
};

export type HarnessCheckpoint = {
  version: 1;
  id: string;
  runId: string;
  recordedAt: string;
  state: HarnessRunState;
  evidence: HarnessEvidenceRecord[];
  summary?: string;
};

export type HarnessRunEnvelope = {
  version: 1;
  request: DevelopmentRunRequest;
  preflight: HarnessPreflightRecord;
  state?: HarnessRunState;
  evidence?: HarnessEvidenceRecord[];
  retry?: HarnessRetryRecord;
  updatedAt: string;
};

export type HarnessRuntimeRunEnvelope = HarnessRunEnvelope & {
  state: HarnessRunState;
  evidence: HarnessEvidenceRecord[];
};

export type HarnessSideEffectKind = "commit" | "pull-request" | "merge" | "deployment";

export type HarnessSideEffectReceipt = {
  version: 1;
  runId: string;
  key: string;
  kind: HarnessSideEffectKind;
  status: "reserved" | "completed";
  reservedAt: string;
  completedAt?: string;
  externalReference?: string;
  summary?: string;
};

export function assertHarnessContractVersion(version: number): asserts version is 1 {
  if (version !== ISEOL_HARNESS_CONTRACT_VERSION) {
    throw new Error(`Unsupported Iseol Harness contract version: ${version}`);
  }
}
