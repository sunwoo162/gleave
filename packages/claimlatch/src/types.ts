export type ClaimKind = "fact" | "number" | "date" | "current";
export type ClaimImportance = "critical" | "normal" | "minor";
export type VerificationStatus =
  | "SUPPORTED"
  | "CONTRADICTED"
  | "UNSUPPORTED"
  | "UNVERIFIABLE";

export type SourceType = "primary" | "secondary" | "unknown";
export type EvidenceProvenanceKind = "search-snippet" | "retrieved-document";

export interface Claim {
  id: string;
  text: string;
  kind: ClaimKind;
  importance: ClaimImportance;
}

export interface EvidenceProvenance {
  kind: EvidenceProvenanceKind;
  sourceUrl: string;
  retrievedAt: string;
  quote: string;
  page?: number;
  quoteStart?: number;
  quoteEnd?: number;
  contentSha256?: string;
  contentType?: string;
}

export interface Evidence {
  id: string;
  claimId: string;
  title: string;
  url: string;
  snippet: string;
  sourceType: SourceType;
  publishedAt?: string;
  retrievedAt: string;
  provider: string;
  provenance?: EvidenceProvenance;
}

export interface ClaimVerification {
  claim: Claim;
  status: VerificationStatus;
  reason: string;
  evidenceIds: string[];
  supportingEvidenceIds?: string[];
  contradictingEvidenceIds?: string[];
  evidence: Evidence[];
  confidence?: ClaimConfidence;
}

export interface ClaimConfidence {
  value: number;
  meaning: "verification-status-correctness";
  scorerId: string;
  calibrationProfileId: string;
}

export type ClaimVerificationForConfidence = Omit<ClaimVerification, "confidence">;

export interface ClaimConfidenceScorer {
  id: string;
  score(input: {
    claim: Claim;
    verification: ClaimVerificationForConfidence;
  }): number | Promise<number>;
}

export interface ConfidenceCalibrationProfile {
  version: 1;
  id: string;
  target: "verification-status-correctness";
  scorerId: string;
  method: "isotonic";
  datasetManifestSha256: string;
  observationCount: number;
  mapping: Array<{
    maxRawScore: number;
    calibratedProbability: number;
  }>;
  validation: {
    datasetManifestSha256: string;
    observationCount: number;
    brierScore: number;
    expectedCalibrationError: number;
  };
  createdAt: string;
}

export interface ConfidenceCalibrationOptions {
  scorer: ClaimConfidenceScorer;
  profile: ConfidenceCalibrationProfile;
}

export interface CalibrationObservation {
  id: string;
  predictedStatus: VerificationStatus;
  expectedStatus: VerificationStatus;
  rawScore: number;
  sourceCaseId: string;
  sourceClaimId: string;
  labelSourceUrls: string[];
}

export interface CalibrationStatusEvaluation {
  count: number;
  brierScore?: number;
  expectedCalibrationError?: number;
}

export interface CalibrationEvaluation {
  observationCount: number;
  brierScore: number;
  expectedCalibrationError: number;
  byStatus: Record<VerificationStatus, CalibrationStatusEvaluation>;
}

export interface GatePolicy {
  blockOnContradiction: boolean;
  blockOnCrossSourceContradiction?: boolean;
  maxUnsupportedClaims: number;
  maxUnverifiableClaims: number;
  minimumCoverage: number;
  requireAllCriticalClaimsSupported: boolean;
  requireAtLeastOneClaim: boolean;
  maxEvidenceAgeDaysForCurrentClaims?: number;
  requireDatedEvidenceForCurrentClaims: boolean;
  requireRetrievedDocumentForDecisiveClaims: boolean;
}

export type ViolationCode =
  | "CONTRADICTION"
  | "CROSS_SOURCE_CONTRADICTION"
  | "UNSUPPORTED_LIMIT"
  | "UNVERIFIABLE_LIMIT"
  | "COVERAGE_BELOW_MINIMUM"
  | "CRITICAL_CLAIM_NOT_SUPPORTED"
  | "CURRENT_CLAIM_MISSING_FRESH_EVIDENCE"
  | "DECISIVE_CLAIM_MISSING_DOCUMENT_PROVENANCE"
  | "NO_CLAIMS_EXTRACTED";

export interface PolicyViolation {
  code: ViolationCode;
  message: string;
  claimId?: string;
}

export interface VerificationCounts {
  total: number;
  supported: number;
  contradicted: number;
  unsupported: number;
  unverifiable: number;
}

export interface VerificationReport {
  passed: boolean;
  coverage: number;
  counts: VerificationCounts;
  claims: ClaimVerification[];
  violations: PolicyViolation[];
  generatedAt: string;
}

export interface VerificationReceiptPayload {
  report: VerificationReport;
  publicKeyPem: string;
  keyId?: string;
}

export interface SignedVerificationReceipt {
  version: 1;
  algorithm: "Ed25519";
  payload: VerificationReceiptPayload;
  signature: string;
}

export interface VerificationInput {
  question: string;
  answer: string;
  policy?: Partial<GatePolicy>;
}

export interface ClaimExtractor {
  extract(input: { question: string; answer: string }): Promise<Claim[]>;
}

export interface EvidenceProvider {
  search(claim: Claim): Promise<Evidence[]>;
}

export interface ClaimVerifier {
  verify(input: { claim: Claim; evidence: Evidence[] }): Promise<ClaimVerification>;
}
