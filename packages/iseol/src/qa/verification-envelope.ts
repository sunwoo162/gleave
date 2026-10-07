import { createHash } from "node:crypto";

export type VerificationEnvelopeInput = {
  requestId: string;
  projectId: string;
  projectRevision: string;
  subjectId: string;
  subjectType: string;
  claims: Record<string, unknown>[];
  evidence: Record<string, unknown>[];
  deterministicChecks: Record<string, unknown>[];
  decision: "PASS" | "WARN" | "BLOCK";
  claimLatchReportId: string;
  receiptId: string | null;
  createdAt: string;
};

export function buildVerificationEnvelope(input: VerificationEnvelopeInput) {
  if (!input.requestId || !input.projectId || !input.projectRevision || !input.subjectId || !input.subjectType) {
    throw new Error("verification identity is required");
  }
  if (input.evidence.length === 0 && input.decision === "PASS") throw new Error("PASS verification requires evidence");
  if (input.decision === "PASS" && !input.receiptId) throw new Error("PASS verification requires receiptId");
  const payloadHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return { schemaVersion: 1 as const, ...input, payloadHash };
}
