import type { ExecutionProfile, ProjectPurpose } from "./execution-profile.js";

export const ISEOL_PROJECT_MODEL_VERSION = 1 as const;

export type PrototypeRepositorySnapshot = {
  url: string;
  branch: string;
  commitSha: string;
};

export type PrototypeDeploymentSnapshot = {
  url: string;
  provider?: string;
  deploymentId?: string;
};

export type PrototypeCandidateStatus = "candidate" | "promoted" | "archived";

export const PROTOTYPE_BROWSER_ACCEPTANCE_CHECKS = [
  "add", "edit", "complete", "delete", "persistence", "empty-state", "empty-input", "responsive",
] as const;
export type PrototypeBrowserAcceptanceCheck = typeof PROTOTYPE_BROWSER_ACCEPTANCE_CHECKS[number];
export type PrototypeBrowserAcceptance = {
  status: "unverified" | "verified";
  checkedAt: string;
  checks: Record<PrototypeBrowserAcceptanceCheck, "pass" | "fail" | "unverified">;
};

export type IdeaLabPrototypeOrigin = {
  campaignId: string;
  proposalId: string;
  productionId: string;
};

export type PrototypeCandidate = {
  version: 1;
  id: string;
  title: string;
  concept: string;
  repository: PrototypeRepositorySnapshot;
  deployment: PrototypeDeploymentSnapshot;
  browserAcceptance?: PrototypeBrowserAcceptance;
  runIds: string[];
  status: PrototypeCandidateStatus;
  promotedProjectId?: string;
  ideaLabOrigin?: IdeaLabPrototypeOrigin;
  createdAt: string;
  updatedAt: string;
};

export type GenesisRunSnapshot = {
  runId: string;
  objective: string;
  stage: string;
  status: string;
  policySha256?: string;
  evidence: unknown[];
  events: unknown[];
};

export type ProjectGenesis = {
  prototypeId: string;
  repository: PrototypeRepositorySnapshot;
  deployment: PrototypeDeploymentSnapshot;
  ideaLabOrigin?: IdeaLabPrototypeOrigin;
  runs: GenesisRunSnapshot[];
  promotedAt: string;
};

export type ProjectTreeNodeKind = "root" | "area" | "feature" | "task";
export type ProjectTreeNodeStatus = "planned" | "in-progress" | "blocked" | "done";

export type ProjectTreeNode = {
  id: string;
  parentId?: string;
  kind: ProjectTreeNodeKind;
  title: string;
  status: ProjectTreeNodeStatus;
  runIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectWorkspace = {
  version: 1;
  id: string;
  /** Optional platform-user owner; legacy operator workspaces omit this field. */
  ownerUserId?: string;
  teamId?: string;
  name: string;
  status: "active" | "archived";
  genesis: ProjectGenesis;
  tree: ProjectTreeNode[];
  /** Optional least-privilege filesystem root owned by this Project Workspace. */
  workspaceRoot?: string;
  purposeSelection?: {
    version: 1;
    purpose: ProjectPurpose;
    selectedAt: string;
    source: "user" | "default";
    profile: ExecutionProfile;
  };
  createdAt: string;
  updatedAt: string;
};

export type ProjectHistoryEventType =
  | "project-promoted"
  | "genesis-run-imported"
  | "tree-node-added"
  | "tree-node-status-changed"
  | "run-attached"
  | "discord-project-bound"
  | "discord-action-recorded"
  | "integration-action-recorded"
  | "review-recorded"
  | "purpose-selected";

export type ProjectHistorySource = "discord" | "github" | "figma" | "notion" | "calendar";

export type ProjectHistoryLifecycle =
  | "commit-recorded"
  | "pull-request-opened"
  | "pull-request-merged"
  | "deployment-created"
  | "production-verified";

export type ProjectHistoryEvent = {
  version: 1;
  id: string;
  projectId: string;
  type: ProjectHistoryEventType;
  at: string;
  occurredAt?: string;
  lifecycle?: ProjectHistoryLifecycle;
  summary: string;
  prototypeId?: string;
  runId?: string;
  nodeId?: string;
  source?: ProjectHistorySource;
  action?: string;
  reference?: string;
};

export type ProjectWorkContext = {
  projectId: string;
  nodeId?: string;
  runId?: string;
};

const PROJECT_MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function assertProjectModelId(id: string): void {
  if (!PROJECT_MODEL_ID_PATTERN.test(id)) {
    throw new Error(`Invalid Iseol Project Model id: ${id}`);
  }
}

function assertRequired(value: string, label: string): void {
  if (!value.trim()) throw new Error(`Prototype ${label} is required`);
}

export function assertPromotionReadyPrototype(candidate: PrototypeCandidate): void {
  if (candidate.version !== ISEOL_PROJECT_MODEL_VERSION) {
    throw new Error(`Unsupported Iseol Project Model version: ${candidate.version}`);
  }
  assertProjectModelId(candidate.id);
  if (candidate.status === "archived") throw new Error(`Archived prototype cannot be promoted: ${candidate.id}`);
  assertRequired(candidate.repository.url, "repository url");
  assertRequired(candidate.repository.branch, "repository branch");
  assertRequired(candidate.repository.commitSha, "repository commit");
  assertRequired(candidate.deployment.url, "deployment url");
  if (candidate.deployment.provider === "local-preview" && candidate.browserAcceptance?.status !== "verified") {
    throw new Error(`Local preview browser acceptance is required before promotion: ${candidate.id}`);
  }
}
