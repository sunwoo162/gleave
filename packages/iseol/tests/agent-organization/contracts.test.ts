import assert from "node:assert/strict";
import test from "node:test";
import {
  validateAgentDefinition,
  validateTaskArtifact,
  validateVerificationEnvelope,
  validateWorkTask,
  type AgentDefinition,
  type TaskArtifact,
  type VerificationEnvelopeV1,
  type WorkTask,
} from "../../src/agent-organization/contracts.js";

const agent: AgentDefinition = {
  schemaVersion: 1,
  id: "project-1:frontend:specialist",
  projectId: "project-1",
  workstreamId: "frontend",
  role: "specialist",
  capabilities: ["ui"],
  permissions: ["workspace.read", "workspace.write:src/features"],
  ownedPaths: ["src/features"],
  dependencies: [],
  runtimeProfile: "implementation",
  completionCriteria: ["feature tests pass"],
};

const artifact: TaskArtifact = {
  schemaVersion: 1,
  id: "artifact-1",
  kind: "source",
  path: "src/features/todo",
  verificationIds: ["verification-1"],
};

const task: WorkTask = {
  schemaVersion: 1,
  id: "project-1:task-1",
  projectId: "project-1",
  projectRevision: "rev-2",
  objective: "Implement todo creation",
  dependencies: [],
  assignedAgentId: agent.id,
  reviewerAgentId: "project-1:frontend:reviewer",
  ownedPaths: ["src/features/todo"],
  acceptanceCriteria: ["a todo can be created"],
  status: "planned",
  artifacts: [artifact],
};

const envelope: VerificationEnvelopeV1 = {
  schemaVersion: 1,
  requestId: "request-1",
  projectId: "project-1",
  projectRevision: "rev-2",
  artifactId: artifact.id,
  claim: "Todo creation is implemented",
  evidenceIds: ["evidence-1"],
  verificationStatus: "PASS",
  receiptId: "receipt-1",
  policyVersion: "eeee-release-v1",
  adapterVersion: "claimlatch-adapter-v1",
  claimLatchVersion: "claimlatch-v0.2.0",
  payloadHash: "sha256:abc",
  createdAt: "2026-10-07T00:00:00Z",
};

test("validates a versioned agent definition", () => {
  assert.deepEqual(validateAgentDefinition(agent), agent);
});

test("rejects overlapping owned paths between an agent and its reviewer", () => {
  assert.throws(
    () => validateAgentDefinition({ ...agent, ownedPaths: ["src"] }),
    /owned paths must be scoped/,
  );
});

test("validates a task with explicit revision, ownership, and artifacts", () => {
  assert.deepEqual(validateWorkTask(task), task);
  assert.deepEqual(validateTaskArtifact(artifact), artifact);
});

test("rejects completed tasks without verification evidence", () => {
  assert.throws(
    () => validateWorkTask({ ...task, status: "completed", artifacts: [] }),
    /completed task requires artifacts/,
  );
});

test("rejects a verification envelope that has no evidence or receipt", () => {
  assert.deepEqual(validateVerificationEnvelope(envelope), envelope);
  assert.throws(
    () => validateVerificationEnvelope({ ...envelope, evidenceIds: [] }),
    /evidenceIds/,
  );
  assert.throws(
    () => validateVerificationEnvelope({ ...envelope, receiptId: "" }),
    /receiptId/,
  );
});
