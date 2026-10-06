import type { IndependentQaReportV1 } from "./independent-runner.js";

export type ReleaseDecision = "PASS" | "WARN" | "BLOCKED";

export type ReleaseIdentity = {
  projectId: string;
  projectRevision: string;
};

export type DeterministicVerification = {
  projectId?: string;
  projectRevision?: string;
  status?: unknown;
};

export type VerificationEnvelope = {
  projectId: string;
  projectRevision: string;
  decision: "PASS" | "WARN" | "BLOCK";
};

export class ReleaseGate {
  static evaluate(
    qaReport: IndependentQaReportV1,
    deterministicReport: DeterministicVerification,
    verificationEnvelope: VerificationEnvelope,
    current?: ReleaseIdentity,
  ): ReleaseDecision {
    if (!sameIdentity(qaReport, deterministicReport, verificationEnvelope, current)) return "BLOCKED";
    if (qaReport.independent !== true || qaReport.status === "FAIL") return "BLOCKED";
    if (!Array.isArray(qaReport.evidenceIds) || qaReport.evidenceIds.length === 0) return "BLOCKED";
    if (qaReport.checks.some((check) => check.evidenceIds.length === 0)) return "BLOCKED";
    if (qaReport.checks.some((check) => check.status === "FAIL")) return "BLOCKED";
    if (!isPass(deterministicReport.status)) return "BLOCKED";
    if (verificationEnvelope.decision === "BLOCK") return "BLOCKED";
    if (
      qaReport.status === "WARN"
      || qaReport.checks.some((check) => check.status === "WARN")
      || verificationEnvelope.decision === "WARN"
    ) return "WARN";
    return "PASS";
  }
}

function sameIdentity(
  qaReport: IndependentQaReportV1,
  deterministicReport: DeterministicVerification,
  verificationEnvelope: VerificationEnvelope,
  current?: ReleaseIdentity,
): boolean {
  const identities = [
    { projectId: qaReport.projectId, projectRevision: qaReport.projectRevision },
    deterministicReport,
    verificationEnvelope,
  ];
  if (identities.some((item) => item.projectId !== undefined && item.projectId !== qaReport.projectId)) return false;
  if (identities.some((item) => item.projectRevision !== undefined && item.projectRevision !== qaReport.projectRevision)) return false;
  return !current || (current.projectId === qaReport.projectId && current.projectRevision === qaReport.projectRevision);
}

function isPass(value: unknown): boolean {
  return String(value ?? "").toUpperCase() === "PASS" || String(value ?? "").toUpperCase() === "PASSED";
}
