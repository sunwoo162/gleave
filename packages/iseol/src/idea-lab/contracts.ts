export const ISEOL_IDEA_LAB_VERSION = 1 as const;

export type IdeaLabCampaignStatus = "generating" | "producing" | "complete" | "blocked" | "cancelled";
export type IdeaProposalStatus = "proposed" | "accepted" | "rejected";
export type PrototypeProductionStatus =
  | "queued" | "running" | "testing" | "deploying" | "verifying"
  | "ready" | "failed" | "blocked" | "cancelled";

export type IdeaLabCampaign = {
  version: 1;
  id: string;
  seed: string;
  constraints: string[];
  targetReadyCount: number;
  productionConcurrency: number;
  proposalIds: string[];
  productionIds: string[];
  status: IdeaLabCampaignStatus;
  blockerSummary?: string;
  createdAt: string;
  updatedAt: string;
};

export type IdeaProposal = {
  version: 1;
  id: string;
  campaignId: string;
  title: string;
  concept: string;
  problemDomain: string;
  targetUser: string;
  jobToBeDone: string;
  coreInteractionLoop: string;
  dataModel: string;
  primaryDifferentiator: string;
  whyMateriallyDifferent: string;
  status: IdeaProposalStatus;
  createdAt: string;
};export type PrototypeDeploymentProgress = {
  provider?: string;
  deploymentId?: string;
  url?: string;
  commitSha?: string;
  deployedAt?: string;
  verifiedAt?: string;
};

export type PrototypeBrowserAcceptance = {
  status: "unverified" | "verified";
  checkedAt?: string;
  checks?: Record<string, "pass" | "fail" | "unverified">;
};

export type PrototypeProduction = {
  version: 1;
  id: string;
  campaignId: string;
  proposalId: string;
  runId: string;
  repositoryUrl: string;
  sandboxRoot: string;
  worktreeRoot: string;
  branch: string;
  baseRef: string;
  commitSha?: string;
  deployment?: PrototypeDeploymentProgress;
  acceptance?: PrototypeBrowserAcceptance;
  status: PrototypeProductionStatus;
  failureSummary?: string;
  blockerSummary?: string;
  createdAt: string;
  updatedAt: string;
};

export type IdeaLabCampaignEventType =
  | "campaign-created" | "proposal-generated" | "proposal-rejected"
  | "production-created" | "run-attached" | "production-status-changed"
  | "prototype-ready" | "campaign-blocked" | "campaign-completed" | "campaign-cancelled";

export type IdeaLabCampaignEvent = {
  version: 1;
  id: string;
  campaignId: string;
  type: IdeaLabCampaignEventType;
  at: string;
  summary: string;
  proposalId?: string;
  productionId?: string;
  runId?: string;
  reference?: string;
};const IDEA_LAB_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const CAMPAIGN_STATUSES = new Set<IdeaLabCampaignStatus>(["generating", "producing", "complete", "blocked", "cancelled"]);
const PROPOSAL_STATUSES = new Set<IdeaProposalStatus>(["proposed", "accepted", "rejected"]);
const PRODUCTION_STATUSES = new Set<PrototypeProductionStatus>([
  "queued", "running", "testing", "deploying", "verifying", "ready", "failed", "blocked", "cancelled",
]);

export function assertIdeaLabId(id: string): void {
  if (!IDEA_LAB_ID_PATTERN.test(id)) throw new Error(`Invalid Iseol Idea Lab id: ${id}`);
}

function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Idea Lab ${label} is required`);
}

function requireTimestamp(value: unknown, label: string): asserts value is string {
  requireText(value, label);
  if (Number.isNaN(Date.parse(value))) throw new Error(`Idea Lab ${label} must be an ISO timestamp`);
}

function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new Error(`Idea Lab ${label} contains unknown field: ${key}`);
  }
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Idea Lab ${label} must be a string array`);
  }
}

function assertVersion(value: unknown): asserts value is 1 {
  if (value !== ISEOL_IDEA_LAB_VERSION) throw new Error(`Unsupported Iseol Idea Lab version: ${String(value)}`);
}export function assertIdeaLabCampaign(value: unknown): asserts value is IdeaLabCampaign {
  if (!value || typeof value !== "object") throw new Error("Idea Lab campaign must be an object");
  const item = value as Record<string, unknown>;
  assertExactKeys(item, [
    "version", "id", "seed", "constraints", "targetReadyCount", "productionConcurrency",
    "proposalIds", "productionIds", "status", "blockerSummary", "createdAt", "updatedAt",
  ], "campaign");
  assertVersion(item.version);
  requireText(item.id, "campaign id");
  assertIdeaLabId(item.id);
  requireText(item.seed, "campaign seed");
  assertStringArray(item.constraints, "campaign constraints");
  if (!Number.isInteger(item.targetReadyCount) || Number(item.targetReadyCount) <= 0) {
    throw new Error("Idea Lab targetReadyCount must be a positive integer");
  }
  if (!Number.isInteger(item.productionConcurrency) || Number(item.productionConcurrency) <= 0) {
    throw new Error("Idea Lab productionConcurrency must be a positive integer");
  }
  assertStringArray(item.proposalIds, "campaign proposalIds");
  assertStringArray(item.productionIds, "campaign productionIds");
  item.proposalIds.forEach(assertIdeaLabId);
  item.productionIds.forEach(assertIdeaLabId);
  if (!CAMPAIGN_STATUSES.has(item.status as IdeaLabCampaignStatus)) throw new Error(`Invalid Idea Lab campaign status: ${String(item.status)}`);
  if (item.blockerSummary !== undefined) requireText(item.blockerSummary, "campaign blockerSummary");
  requireTimestamp(item.createdAt, "campaign createdAt");
  requireTimestamp(item.updatedAt, "campaign updatedAt");
}

export function assertIdeaProposal(value: unknown): asserts value is IdeaProposal {
  if (!value || typeof value !== "object") throw new Error("Idea Lab proposal must be an object");
  const item = value as Record<string, unknown>;
  assertExactKeys(item, [
    "version", "id", "campaignId", "title", "concept", "problemDomain", "targetUser",
    "jobToBeDone", "coreInteractionLoop", "dataModel", "primaryDifferentiator",
    "whyMateriallyDifferent", "status", "createdAt",
  ], "proposal");
  assertVersion(item.version);
  requireText(item.id, "proposal id");
  requireText(item.campaignId, "proposal campaignId");
  assertIdeaLabId(item.id);
  assertIdeaLabId(item.campaignId);
  for (const key of ["title", "concept", "problemDomain", "targetUser", "jobToBeDone", "coreInteractionLoop", "dataModel", "primaryDifferentiator", "whyMateriallyDifferent"] as const) requireText(item[key], `proposal ${key}`);
  if (!PROPOSAL_STATUSES.has(item.status as IdeaProposalStatus)) throw new Error(`Invalid Idea Lab proposal status: ${String(item.status)}`);
  requireTimestamp(item.createdAt, "proposal createdAt");
}export function assertPrototypeProduction(value: unknown): asserts value is PrototypeProduction {
  if (!value || typeof value !== "object") throw new Error("Idea Lab production must be an object");
  const item = value as Record<string, unknown>;
  assertExactKeys(item, [
    "version", "id", "campaignId", "proposalId", "runId", "repositoryUrl", "sandboxRoot",
    "worktreeRoot", "branch", "baseRef", "commitSha", "deployment", "acceptance", "status", "failureSummary",
    "blockerSummary", "createdAt", "updatedAt",
  ], "production");
  assertVersion(item.version);
  for (const key of ["id", "campaignId", "proposalId"] as const) {
    requireText(item[key], `production ${key}`);
    assertIdeaLabId(item[key]);
  }
  for (const key of ["runId", "repositoryUrl", "sandboxRoot", "worktreeRoot", "branch", "baseRef"] as const) {
    requireText(item[key], `production ${key}`);
  }
  if (item.commitSha !== undefined) requireText(item.commitSha, "production commitSha");
  if (item.failureSummary !== undefined) requireText(item.failureSummary, "production failureSummary");
  if (item.blockerSummary !== undefined) requireText(item.blockerSummary, "production blockerSummary");
  if (!PRODUCTION_STATUSES.has(item.status as PrototypeProductionStatus)) throw new Error(`Invalid Idea Lab production status: ${String(item.status)}`);
  requireTimestamp(item.createdAt, "production createdAt");
  requireTimestamp(item.updatedAt, "production updatedAt");
  if (item.deployment !== undefined) {
    if (!item.deployment || typeof item.deployment !== "object") throw new Error("Idea Lab production deployment must be an object");
    const deployment = item.deployment as Record<string, unknown>;
    assertExactKeys(deployment, ["provider", "deploymentId", "url", "commitSha", "deployedAt", "verifiedAt"], "deployment");
    for (const key of ["provider", "deploymentId", "url", "commitSha"] as const) {
      if (deployment[key] !== undefined) requireText(deployment[key], `deployment ${key}`);
    }
    for (const key of ["deployedAt", "verifiedAt"] as const) {
      if (deployment[key] !== undefined) requireTimestamp(deployment[key], `deployment ${key}`);
    }
  }
  if (item.acceptance !== undefined) {
    if (!item.acceptance || typeof item.acceptance !== "object") throw new Error("Idea Lab production acceptance must be an object");
    const acceptance = item.acceptance as Record<string, unknown>;
    assertExactKeys(acceptance, ["status", "checkedAt", "checks"], "acceptance");
    if (acceptance.status !== "unverified" && acceptance.status !== "verified") throw new Error("Invalid Idea Lab browser acceptance status");
    if (acceptance.checkedAt !== undefined) requireTimestamp(acceptance.checkedAt, "acceptance checkedAt");
    if (acceptance.checks !== undefined) {
      if (!acceptance.checks || typeof acceptance.checks !== "object") throw new Error("Idea Lab acceptance checks must be an object");
      for (const value of Object.values(acceptance.checks as Record<string, unknown>)) {
        if (value !== "pass" && value !== "fail" && value !== "unverified") throw new Error("Invalid Idea Lab acceptance check status");
      }
    }
  }
}

export function assertIdeaLabCampaignEvent(value: unknown): asserts value is IdeaLabCampaignEvent {
  if (!value || typeof value !== "object") throw new Error("Idea Lab campaign event must be an object");
  const item = value as Record<string, unknown>;
  assertExactKeys(item, ["version", "id", "campaignId", "type", "at", "summary", "proposalId", "productionId", "runId", "reference"], "campaign event");
  assertVersion(item.version);
  requireText(item.id, "campaign event id");
  requireText(item.campaignId, "campaign event campaignId");
  assertIdeaLabId(item.id);
  assertIdeaLabId(item.campaignId);
  requireText(item.type, "campaign event type");
  requireText(item.summary, "campaign event summary");
  requireTimestamp(item.at, "campaign event at");
  for (const key of ["proposalId", "productionId"] as const) {
    if (item[key] !== undefined) { requireText(item[key], `campaign event ${key}`); assertIdeaLabId(item[key]); }
  }
  for (const key of ["runId", "reference"] as const) if (item[key] !== undefined) requireText(item[key], `campaign event ${key}`);
}
