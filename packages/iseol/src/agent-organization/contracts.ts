export type AgentRole =
  | "lead"
  | "specialist"
  | "reviewer"
  | "ux"
  | "implementation"
  | "qa-owner";

export type AgentStatus = "planned" | "queued" | "running" | "blocked" | "completed";
export type TaskStatus =
  | "planned"
  | "ready"
  | "running"
  | "waiting_handoff"
  | "reviewing"
  | "qa_blocked"
  | "failed"
  | "retrying"
  | "completed"
  | "cancelled"
  | "stale";

export type AgentDefinition = {
  schemaVersion: 1;
  id: string;
  projectId: string;
  workstreamId: string;
  role: AgentRole;
  capabilities: string[];
  permissions: string[];
  ownedPaths: string[];
  dependencies: string[];
  runtimeProfile: string;
  completionCriteria: string[];
};

export type TaskArtifact = {
  schemaVersion: 1;
  id: string;
  kind: string;
  path: string;
  sha256?: string;
  verificationIds: string[];
};

export type WorkTask = {
  schemaVersion: 1;
  id: string;
  projectId: string;
  projectRevision: string;
  objective: string;
  dependencies: string[];
  assignedAgentId: string;
  reviewerAgentId?: string;
  ownedPaths: string[];
  acceptanceCriteria: string[];
  status: TaskStatus;
  artifacts: TaskArtifact[];
};

export type VerificationStatus = "PASS" | "WARN" | "BLOCKED" | "FAIL";

export type VerificationEnvelopeV1 = {
  schemaVersion: 1;
  requestId: string;
  projectId: string;
  projectRevision: string;
  artifactId: string;
  claim: string;
  evidenceIds: string[];
  verificationStatus: VerificationStatus;
  receiptId: string;
  policyVersion: string;
  adapterVersion: string;
  claimLatchVersion: string;
  payloadHash: string;
  createdAt: string;
};

function requireString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${name} is required`);
}

function requireArray(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
}

function validateScopedPath(path: string): void {
  requireString(path, "owned path");
  if (path === "." || path === "src" || path === "app" || path.includes("..")) {
    throw new Error("owned paths must be scoped");
  }
}

export function validateAgentDefinition(input: AgentDefinition): AgentDefinition {
  if (input.schemaVersion !== 1) throw new Error("unsupported agent schemaVersion");
  requireString(input.id, "agent id");
  requireString(input.projectId, "projectId");
  requireString(input.workstreamId, "workstreamId");
  requireArray(input.capabilities, "capabilities");
  requireArray(input.permissions, "permissions");
  requireArray(input.ownedPaths, "ownedPaths");
  input.ownedPaths.forEach((path) => validateScopedPath(String(path)));
  requireArray(input.dependencies, "dependencies");
  requireString(input.runtimeProfile, "runtimeProfile");
  requireArray(input.completionCriteria, "completionCriteria");
  if (input.completionCriteria.length === 0) throw new Error("completionCriteria is required");
  return input;
}

export function validateTaskArtifact(input: TaskArtifact): TaskArtifact {
  if (input.schemaVersion !== 1) throw new Error("unsupported artifact schemaVersion");
  requireString(input.id, "artifact id");
  requireString(input.kind, "artifact kind");
  requireString(input.path, "artifact path");
  requireArray(input.verificationIds, "verificationIds");
  return input;
}

export function validateWorkTask(input: WorkTask): WorkTask {
  if (input.schemaVersion !== 1) throw new Error("unsupported task schemaVersion");
  requireString(input.id, "task id");
  requireString(input.projectId, "projectId");
  requireString(input.projectRevision, "projectRevision");
  requireString(input.objective, "objective");
  requireArray(input.dependencies, "dependencies");
  requireString(input.assignedAgentId, "assignedAgentId");
  requireArray(input.ownedPaths, "ownedPaths");
  input.ownedPaths.forEach((path) => validateScopedPath(String(path)));
  requireArray(input.acceptanceCriteria, "acceptanceCriteria");
  if (input.acceptanceCriteria.length === 0) throw new Error("acceptanceCriteria is required");
  requireArray(input.artifacts, "artifacts");
  input.artifacts.forEach((artifact) => validateTaskArtifact(artifact as TaskArtifact));
  if (input.status === "completed" && input.artifacts.length === 0) throw new Error("completed task requires artifacts");
  return input;
}

export function validateVerificationEnvelope(input: VerificationEnvelopeV1): VerificationEnvelopeV1 {
  if (input.schemaVersion !== 1) throw new Error("unsupported verification schemaVersion");
  requireString(input.requestId, "requestId");
  requireString(input.projectId, "projectId");
  requireString(input.projectRevision, "projectRevision");
  requireString(input.artifactId, "artifactId");
  requireString(input.claim, "claim");
  requireArray(input.evidenceIds, "evidenceIds");
  if (input.evidenceIds.length === 0) throw new Error("evidenceIds is required");
  requireString(input.receiptId, "receiptId");
  requireString(input.policyVersion, "policyVersion");
  requireString(input.adapterVersion, "adapterVersion");
  requireString(input.claimLatchVersion, "claimLatchVersion");
  requireString(input.payloadHash, "payloadHash");
  requireString(input.createdAt, "createdAt");
  return input;
}
