import type { HarnessEvidenceKind, HarnessEvidenceRecord } from "../harness/contracts.js";

export type ProjectLifecycleItemBase = {
  version: 1;
  id: string;
  projectId: string;
  runId: string;
  evidenceId: string;
  kind: HarnessEvidenceKind;
  stage: string;
  summary: string;
  recordedAt: string;
  provider?: string;
  reference?: string;
};

export type ProjectArtifact = ProjectLifecycleItemBase & { kind: "build" | "test" | "file-change" };
export type ProjectRevision = ProjectLifecycleItemBase & { kind: "commit" | "pull-request" | "ci" };
export type ProjectDeployment = ProjectLifecycleItemBase & { kind: "deployment" | "production-verification" };

export type ProjectLifecycleView = {
  artifacts: ProjectArtifact[];
  revisions: ProjectRevision[];
  deployments: ProjectDeployment[];
};

const ARTIFACT_KINDS = new Set<HarnessEvidenceKind>(["build", "test", "file-change"]);
const REVISION_KINDS = new Set<HarnessEvidenceKind>(["commit", "pull-request", "ci"]);
const DEPLOYMENT_KINDS = new Set<HarnessEvidenceKind>(["deployment", "production-verification"]);

function lifecycleItemId(group: "artifact" | "revision" | "deployment", evidence: HarnessEvidenceRecord, projectId: string, runId: string): string {
  return `${group}:${projectId}:${runId}:${evidence.id}`;
}

function matchingEvidence(input: { projectId: string; runId?: string; evidence: HarnessEvidenceRecord[] }): HarnessEvidenceRecord[] {
  return input.evidence.filter((item) =>
    item.projectId === input.projectId &&
    typeof item.runId === "string" &&
    item.runId.length > 0 &&
    (input.runId === undefined || item.runId === input.runId),
  );
}

function baseItem(evidence: HarnessEvidenceRecord, projectId: string, runId: string, group: "artifact" | "revision" | "deployment"): ProjectLifecycleItemBase {
  return {
    version: 1,
    id: lifecycleItemId(group, evidence, projectId, runId),
    projectId,
    runId,
    evidenceId: evidence.id,
    kind: evidence.kind,
    stage: evidence.stage,
    summary: evidence.summary,
    recordedAt: evidence.recordedAt,
    ...(evidence.provider ? { provider: evidence.provider } : {}),
    ...(evidence.reference ? { reference: evidence.reference } : {}),
  };
}

function compareLifecycleItems(a: ProjectLifecycleItemBase, b: ProjectLifecycleItemBase): number {
  return a.recordedAt.localeCompare(b.recordedAt) || a.evidenceId.localeCompare(b.evidenceId);
}

/**
 * Projects only durable, identity-bound Harness evidence into the user-facing
 * Project -> Artifact -> Revision -> Deployment read model. No pending or
 * placeholder lifecycle item is inferred when the Runtime did not record it.
 */
export function projectLifecycleFromEvidence(input: { projectId: string; evidence: HarnessEvidenceRecord[]; runId?: string }): ProjectLifecycleView {
  const artifacts: ProjectArtifact[] = [];
  const revisions: ProjectRevision[] = [];
  const deployments: ProjectDeployment[] = [];
  for (const item of matchingEvidence(input)) {
    const runId = item.runId as string;
    if (ARTIFACT_KINDS.has(item.kind)) artifacts.push(baseItem(item, input.projectId, runId, "artifact") as ProjectArtifact);
    else if (REVISION_KINDS.has(item.kind)) revisions.push(baseItem(item, input.projectId, runId, "revision") as ProjectRevision);
    else if (DEPLOYMENT_KINDS.has(item.kind)) deployments.push(baseItem(item, input.projectId, runId, "deployment") as ProjectDeployment);
  }
  artifacts.sort(compareLifecycleItems);
  revisions.sort(compareLifecycleItems);
  deployments.sort(compareLifecycleItems);
  return { artifacts, revisions, deployments };
}
