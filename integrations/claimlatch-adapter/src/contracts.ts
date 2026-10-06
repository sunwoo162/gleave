export type VerificationDecision = "PASS" | "WARN" | "BLOCK";

export type ClaimLatchReport = {
  passed: boolean;
  coverage: number;
  counts: {
    total: number;
    supported: number;
    contradicted: number;
    unsupported: number;
    unverifiable: number;
  };
  claims: unknown[];
  violations: Array<{ code: string; message: string; claimId?: string }>;
  generatedAt: string;
};

export type TextVerificationInput = {
  subjectId: string;
  projectId: string;
  projectRevision: string;
  subjectType: string;
  question: string;
  draft: string;
  policy?: Record<string, unknown>;
};

export type TextVerificationResult = {
  answer: string;
  report: ClaimLatchReport;
  claimLatchReportId: string;
  receiptId: string | null;
};

export type StructuredAction = {
  tool: string;
  path?: string;
  [key: string]: unknown;
};

export type StructuredCheck = {
  name: string;
  status: "PASS" | "BLOCK";
  reason: string;
};

export type StructuredVerificationResult = {
  decision: VerificationDecision;
  checks: StructuredCheck[];
  blockingReasons: string[];
};
