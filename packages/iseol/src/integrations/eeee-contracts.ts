import { z } from "zod";

const isoTimestamp = z.string().datetime({ offset: true });
const nonEmptyString = z.string().trim().min(1);
const looseObject = z.record(z.string(), z.unknown());

export const ProjectBriefV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: nonEmptyString,
    requestId: nonEmptyString,
    userGoal: nonEmptyString,
    scope: z.array(z.string()),
    constraints: z.array(z.string()),
    preferences: looseObject,
    schedule: looseObject,
    retrievedMemoryIds: z.array(z.string()),
    qaBaselineIds: z.array(z.string()),
    createdAt: isoTimestamp,
  })
  .strict();

export const ProjectOutcomeReportV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: nonEmptyString,
    requestId: nonEmptyString,
    projectRevision: nonEmptyString,
    status: z.enum(["planned", "running", "completed", "blocked", "failed", "cancelled"]),
    artifacts: z.array(looseObject),
    agentTeams: z.array(looseObject),
    handoffs: z.array(looseObject),
    deterministicVerification: looseObject,
    qaReport: looseObject,
    claimLatchReports: z.array(looseObject),
    receipts: z.array(looseObject),
    risks: z.array(looseObject),
    memoryCandidates: z.array(looseObject),
    createdAt: isoTimestamp,
  })
  .strict();

export const VerificationEnvelopeV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    subjectId: nonEmptyString,
    projectId: nonEmptyString,
    projectRevision: nonEmptyString,
    subjectType: nonEmptyString,
    claims: z.array(looseObject),
    evidence: z.array(looseObject),
    deterministicChecks: z.array(looseObject),
    decision: z.enum(["PASS", "WARN", "BLOCK"]),
    claimLatchReportId: nonEmptyString,
    receiptId: z.string().nullable(),
    createdAt: isoTimestamp,
  })
  .strict();

export const MemoryCandidateV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    candidateId: nonEmptyString,
    kind: z.enum([
      "success_pattern",
      "failure_pattern",
      "qa_rule",
      "regression_rule",
      "agent_routing_hint",
      "playbook",
    ]),
    content: nonEmptyString,
    scope: looseObject,
    sourceProjectId: nonEmptyString,
    sourceArtifactIds: z.array(nonEmptyString).min(1),
    evidenceIds: z.array(nonEmptyString).min(1),
    verificationIds: z.array(nonEmptyString).min(1),
    confidence: z.number().min(0).max(1),
    promotionState: z.enum(["candidate", "active", "superseded", "revoked"]),
    createdAt: isoTimestamp,
  })
  .strict();

export type ProjectBriefV1 = z.infer<typeof ProjectBriefV1Schema>;
export type ProjectOutcomeReportV1 = z.infer<typeof ProjectOutcomeReportV1Schema>;
export type VerificationEnvelopeV1 = z.infer<typeof VerificationEnvelopeV1Schema>;
export type MemoryCandidateV1 = z.infer<typeof MemoryCandidateV1Schema>;

export function parseProjectBriefV1(value: unknown): ProjectBriefV1 {
  return ProjectBriefV1Schema.parse(value);
}

export function parseProjectOutcomeReportV1(value: unknown): ProjectOutcomeReportV1 {
  return ProjectOutcomeReportV1Schema.parse(value);
}

export function parseVerificationEnvelopeV1(value: unknown): VerificationEnvelopeV1 {
  return VerificationEnvelopeV1Schema.parse(value);
}

export function parseMemoryCandidateV1(value: unknown): MemoryCandidateV1 {
  return MemoryCandidateV1Schema.parse(value);
}
