import type { QaReportV1 } from "../integrations/eeee-contracts.js";

export type ClaimLatchReleaseResult = {
  decision: "PASS" | "WARN" | "BLOCK";
  receiptId: string | null;
  claimLatchReportId: string;
};

export type ReleaseGateInput = {
  projectId: string;
  projectRevision: string;
  qaReport: QaReportV1;
  claimLatch: ClaimLatchReleaseResult;
  requiredArtifactIds: string[];
  artifactEvidence: Record<string, string[]>;
};

export type ReleaseGateResult = {
  decision: "PASS" | "BLOCK";
  reasons: string[];
  projectId: string;
  projectRevision: string;
  evidenceIds: string[];
  receiptId: string | null;
};

export function evaluateReleaseGate(input: ReleaseGateInput): ReleaseGateResult {
  const reasons: string[] = [];
  if (input.qaReport.projectId !== input.projectId || input.qaReport.projectRevision !== input.projectRevision) {
    reasons.push("QA report revision does not match the release revision");
  }
  if (input.qaReport.independent !== true) reasons.push("QA report is not independent");
  if (input.qaReport.status === "FAIL" || input.qaReport.findings.some((finding) => finding.severity === "FAIL")) {
    reasons.push("independent QA contains blocking findings");
  }
  if (input.qaReport.evidenceIds.length === 0) reasons.push("QA report has no evidence");
  if (input.claimLatch.decision !== "PASS" || !input.claimLatch.receiptId) reasons.push("ClaimLatch release verification did not PASS");
  for (const artifactId of input.requiredArtifactIds) {
    if (!(input.artifactEvidence[artifactId] ?? []).length) reasons.push(`artifact has no evidence: ${artifactId}`);
  }
  const evidenceIds = [...new Set([...input.qaReport.evidenceIds, ...Object.values(input.artifactEvidence).flat()])];
  return {
    decision: reasons.length === 0 ? "PASS" : "BLOCK",
    reasons,
    projectId: input.projectId,
    projectRevision: input.projectRevision,
    evidenceIds,
    receiptId: input.claimLatch.receiptId,
  };
}
