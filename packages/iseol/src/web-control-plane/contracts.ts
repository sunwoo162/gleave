import type { EvaluationRunStatus } from "../evaluation/contracts.js";
import type {
  ProjectGenesis,
  ProjectHistoryEvent,
  ProjectTreeNode,
  PrototypeCandidateStatus,
} from "../project-model/contracts.js";
import type { ExecutionProfile, ProjectPurpose } from "../project-model/execution-profile.js";

export type WebPrototypeCard = {
  id: string;
  title: string;
  concept: string;
  status: PrototypeCandidateStatus;
  repository: {
    url?: string;
    branch: string;
    commitSha: string;
  };
  deployment: {
    url?: string;
    provider?: string;
  };
  promotedProjectId?: string;
  createdAt: string;
  updatedAt: string;
};

export type WebIdeaLabCampaignSummary = {
  id: string;
  seed: string;
  status: string;
  targetReadyCount: number;
  readyCount: number;
  productionCount: number;
  productionConcurrency: number;
  blockerSummary?: string;
  createdAt: string;
  updatedAt: string;
};

export type WebIdeaLabProductionSummary = {
  id: string;
  campaignId: string;
  proposalId: string;
  runId: string;
  status: string;
  branch: string;
  commitSha?: string;
  deploymentUrl?: string;
  blockerSummary?: string;
  updatedAt: string;
  run?: WebRunSummary;
};

export type IdeaLabView = {
  prototypes: WebPrototypeCard[];
  campaigns: WebIdeaLabCampaignSummary[];
  productions: WebIdeaLabProductionSummary[];
};

export type ProjectWorkspaceListView = {
  projects: Array<{ id: string; name: string; status: "active" | "archived"; createdAt: string; updatedAt: string }>;
};

export type WebIdeaLabCampaignDetail = {
  campaign: WebIdeaLabCampaignSummary;
  productions: WebIdeaLabProductionSummary[];
  prototypes: WebPrototypeCard[];
};

export type WebPrototypeDetail = {
  prototype: WebPrototypeCard;
  runs: WebRunSummary[];
  origin?: {
    campaignId: string;
    proposalId: string;
    productionId: string;
  };
};

export type WebRunSummary = {
  runId: string;
  objective: string;
  stage: string;
  status: string;
  updatedAt: string;
  policySha256?: string;
  evidenceCount: number;
  reason?: string;
  evidence: Array<{
    id: string;
    kind: string;
    stage: string;
    recordedAt: string;
    summary: string;
  }>;
  agentPlan: Array<{
    role: string;
    status: "executable" | "planned";
  }>;
};

export type ProjectWorkspaceView = {
  project: {
    id: string;
    name: string;
    status: "active" | "archived";
    createdAt: string;
    updatedAt: string;
  };
  genesis: WebProjectGenesis;
  tree: ProjectTreeNode[];
  history: ProjectHistoryEvent[];
  runs: WebRunSummary[];
  purposeSelection?: {
    purpose: ProjectPurpose;
    selectedAt: string;
    source: "user" | "default";
    profile: ExecutionProfile;
  };
  executionPlan?: {
    purpose: ProjectPurpose;
    executableRoles: string[];
    plannedRoles: string[];
    verificationStages: string[];
    documentationRequired: boolean;
  };
};

export type WebProjectGenesis = Omit<ProjectGenesis, "repository" | "deployment"> & {
  repository: Omit<ProjectGenesis["repository"], "url"> & { url?: string };
  deployment: Omit<ProjectGenesis["deployment"], "url"> & { url?: string };
};
export type WebEvaluationFailedScenario = {
  scenarioId: string;
  evaluationId: string;
  seed: string;
  status: EvaluationRunStatus;
};

export type WebEvaluationReportSummary = {
  evaluationId: string;
  suiteId: string;
  status: "passed" | "failed" | "blocked-external";
  completedAt: string;
  counts: { passed: number; failed: number; blocked: number };
  duplicateSideEffectCount: number;
  unexpectedMutationCount: number;
  recoveryLatencyMs: number;
  failedInvariantIds: string[];
  failedScenarios: WebEvaluationFailedScenario[];
  liveBlockers: string[];
};

export type EvaluationView = {
  quick: WebEvaluationReportSummary | null;
  soak: WebEvaluationReportSummary | null;
};
