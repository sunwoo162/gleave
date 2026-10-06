import assert from "node:assert/strict";
import test from "node:test";
import type { HarnessEvidenceRecord } from "../src/harness/contracts.js";
import { projectLifecycleFromEvidence } from "../src/project-model/lifecycle.js";

function evidence(overrides: Partial<HarnessEvidenceRecord> & Pick<HarnessEvidenceRecord, "id" | "kind">): HarnessEvidenceRecord {
  return {
    version: 1,
    stage: "TEST",
    recordedAt: "2026-09-25T12:00:00.000Z",
    summary: overrides.id,
    projectId: "project-a",
    runId: "run-a",
    ...overrides,
  };
}

test("project lifecycle projects only explicitly verified evidence into artifact, revision, and deployment groups", () => {
  const view = projectLifecycleFromEvidence({
    projectId: "project-a",
    evidence: [
      evidence({ id: "build-1", kind: "build", summary: "build passed", provider: "local", reference: "build://1" }),
      evidence({ id: "test-1", kind: "test", summary: "tests passed" }),
      evidence({ id: "commit-1", kind: "commit", stage: "COMMIT", summary: "commit recorded" }),
      evidence({ id: "pr-1", kind: "pull-request", stage: "PR", summary: "pull request opened" }),
      evidence({ id: "ci-1", kind: "ci", stage: "CI", summary: "CI passed" }),
      evidence({ id: "deploy-1", kind: "deployment", stage: "DEPLOY", summary: "deployment recorded" }),
      evidence({ id: "verify-1", kind: "production-verification", stage: "PRODUCTION_VERIFY", summary: "production verified" }),
      evidence({ id: "command-1", kind: "command", summary: "not a lifecycle item" }),
      evidence({ id: "review-1", kind: "review", stage: "SELF_REVIEW", summary: "not a lifecycle item" }),
    ],
  });

  assert.deepEqual(view.artifacts.map((item) => item.kind), ["build", "test"]);
  assert.deepEqual(view.revisions.map((item) => item.kind), ["ci", "commit", "pull-request"]);
  assert.deepEqual(view.deployments.map((item) => item.kind), ["deployment", "production-verification"]);
  assert.equal(view.artifacts[0]?.evidenceId, "build-1");
  assert.equal(view.artifacts[0]?.provider, "local");
  assert.equal(view.artifacts[0]?.reference, "build://1");
});

test("project lifecycle excludes foreign, unbound, and non-selected Run evidence", () => {
  const view = projectLifecycleFromEvidence({
    projectId: "project-a",
    runId: "run-a",
    evidence: [
      evidence({ id: "owned", kind: "deployment" }),
      evidence({ id: "foreign-project", kind: "deployment", projectId: "project-b" }),
      evidence({ id: "foreign-run", kind: "deployment", runId: "run-b" }),
      evidence({ id: "unbound", kind: "deployment", projectId: undefined, runId: undefined }),
    ],
  });

  assert.deepEqual(view.deployments.map((item) => item.evidenceId), ["owned"]);
});

test("project lifecycle has truthful empty groups and deterministic provenance", () => {
  const input = [
    evidence({ id: "b", kind: "build", recordedAt: "2026-09-25T12:01:00.000Z" }),
    evidence({ id: "a", kind: "build", recordedAt: "2026-09-25T12:01:00.000Z" }),
  ];
  const first = projectLifecycleFromEvidence({ projectId: "project-a", evidence: input });
  const second = projectLifecycleFromEvidence({ projectId: "project-a", evidence: input });

  assert.deepEqual(first, second);
  assert.deepEqual(first.artifacts.map((item) => item.id), ["artifact:project-a:run-a:a", "artifact:project-a:run-a:b"]);
  assert.equal(first.revisions.length, 0);
  assert.equal(first.deployments.length, 0);
});
