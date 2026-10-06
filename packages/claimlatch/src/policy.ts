import type {
  ClaimVerification,
  GatePolicy,
  PolicyViolation,
  VerificationCounts,
} from "./types.js";

export const DEFAULT_POLICY: GatePolicy = {
  blockOnContradiction: true,
  blockOnCrossSourceContradiction: true,
  maxUnsupportedClaims: 0,
  maxUnverifiableClaims: 0,
  minimumCoverage: 1,
  requireAllCriticalClaimsSupported: true,
  requireAtLeastOneClaim: true,
  requireDatedEvidenceForCurrentClaims: false,
  requireRetrievedDocumentForDecisiveClaims: false,
};

export function mergePolicy(overrides?: Partial<GatePolicy>): GatePolicy {
  return { ...DEFAULT_POLICY, ...overrides };
}

export function summarizeClaims(claims: ClaimVerification[]): VerificationCounts {
  const counts: VerificationCounts = {
    total: claims.length,
    supported: 0,
    contradicted: 0,
    unsupported: 0,
    unverifiable: 0,
  };

  for (const claim of claims) {
    switch (claim.status) {
      case "SUPPORTED":
        counts.supported += 1;
        break;
      case "CONTRADICTED":
        counts.contradicted += 1;
        break;
      case "UNSUPPORTED":
        counts.unsupported += 1;
        break;
      case "UNVERIFIABLE":
        counts.unverifiable += 1;
        break;
    }
  }

  return counts;
}

export function calculateCoverage(counts: VerificationCounts): number {
  if (counts.total === 0) return 1;
  return (counts.supported + counts.contradicted) / counts.total;
}

export function evaluatePolicy(
  claims: ClaimVerification[],
  policy: GatePolicy,
  now = new Date(),
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const counts = summarizeClaims(claims);
  const coverage = calculateCoverage(counts);

  if (policy.requireAtLeastOneClaim && counts.total === 0) {
    violations.push({
      code: "NO_CLAIMS_EXTRACTED",
      message: "No verifiable factual claims were extracted; strict mode fails closed.",
    });
  }

  if (policy.blockOnContradiction) {
    for (const item of claims.filter((claim) => claim.status === "CONTRADICTED")) {
      violations.push({
        code: "CONTRADICTION",
        claimId: item.claim.id,
        message: `Contradicted claim: ${item.claim.text}`,
      });
    }
  }

  if (policy.blockOnCrossSourceContradiction ?? true) {
    for (const item of claims.filter(hasCrossSourceContradiction)) {
      const sourceCount = new Set(
        [...(item.supportingEvidenceIds ?? []), ...(item.contradictingEvidenceIds ?? [])]
          .map((id) => item.evidence.find((evidence) => evidence.id === id))
          .filter((evidence): evidence is NonNullable<typeof evidence> => evidence !== undefined)
          .map(sourceKey),
      ).size;
      violations.push({
        code: "CROSS_SOURCE_CONTRADICTION",
        claimId: item.claim.id,
        message: `Evidence from ${sourceCount} sources directly disagrees about claim: ${item.claim.text}`,
      });
    }
  }

  if (counts.unsupported > policy.maxUnsupportedClaims) {
    violations.push({
      code: "UNSUPPORTED_LIMIT",
      message: `Unsupported claims ${counts.unsupported} exceed allowed maximum ${policy.maxUnsupportedClaims}.`,
    });
  }

  if (counts.unverifiable > policy.maxUnverifiableClaims) {
    violations.push({
      code: "UNVERIFIABLE_LIMIT",
      message: `Unverifiable claims ${counts.unverifiable} exceed allowed maximum ${policy.maxUnverifiableClaims}.`,
    });
  }

  if (coverage < policy.minimumCoverage) {
    violations.push({
      code: "COVERAGE_BELOW_MINIMUM",
      message: `Evidence coverage ${coverage.toFixed(3)} is below required minimum ${policy.minimumCoverage.toFixed(3)}.`,
    });
  }

  if (policy.requireAllCriticalClaimsSupported) {
    for (const item of claims.filter(
      (claim) => claim.claim.importance === "critical" && claim.status !== "SUPPORTED",
    )) {
      violations.push({
        code: "CRITICAL_CLAIM_NOT_SUPPORTED",
        claimId: item.claim.id,
        message: `Critical claim is not supported: ${item.claim.text}`,
      });
    }
  }

  if (policy.requireRetrievedDocumentForDecisiveClaims) {
    for (const item of claims.filter(
      (claim) => claim.status === "SUPPORTED" || claim.status === "CONTRADICTED",
    )) {
      const selectedEvidence = item.evidence.filter((evidence) => item.evidenceIds.includes(evidence.id));
      const hasRetrievedDocument = selectedEvidence.some(
        (evidence) => evidence.provenance?.kind === "retrieved-document",
      );
      if (!hasRetrievedDocument) {
        violations.push({
          code: "DECISIVE_CLAIM_MISSING_DOCUMENT_PROVENANCE",
          claimId: item.claim.id,
          message: `Decisive claim is not bound to retrieved-document provenance: ${item.claim.text}`,
        });
      }
    }
  }

  if (policy.maxEvidenceAgeDaysForCurrentClaims !== undefined) {
    const cutoffMs =
      now.getTime() - policy.maxEvidenceAgeDaysForCurrentClaims * 24 * 60 * 60 * 1000;

    for (const item of claims.filter((claim) => claim.claim.kind === "current")) {
      const selectedEvidence = item.evidence.filter((evidence) => item.evidenceIds.includes(evidence.id));
      const datedEvidence = selectedEvidence
        .map((evidence) => evidence.publishedAt)
        .filter((value): value is string => Boolean(value))
        .map((value) => Date.parse(value))
        .filter((value) => Number.isFinite(value));

      const hasFreshEvidence = datedEvidence.some((time) => time >= cutoffMs);
      const hasAnyDatedEvidence = datedEvidence.length > 0;
      const shouldRequire = policy.requireDatedEvidenceForCurrentClaims || hasAnyDatedEvidence;

      if (shouldRequire && !hasFreshEvidence) {
        violations.push({
          code: "CURRENT_CLAIM_MISSING_FRESH_EVIDENCE",
          claimId: item.claim.id,
          message: `Current claim lacks evidence newer than ${policy.maxEvidenceAgeDaysForCurrentClaims} days: ${item.claim.text}`,
        });
      }
    }
  }

  return deduplicateViolations(violations);
}

function hasCrossSourceContradiction(item: ClaimVerification): boolean {
  const supportingSources = sourceKeysFor(item, item.supportingEvidenceIds ?? []);
  const contradictingSources = sourceKeysFor(item, item.contradictingEvidenceIds ?? []);

  for (const supportingSource of supportingSources) {
    for (const contradictingSource of contradictingSources) {
      if (supportingSource !== contradictingSource) return true;
    }
  }
  return false;
}

function sourceKeysFor(item: ClaimVerification, evidenceIds: string[]): Set<string> {
  return new Set(
    evidenceIds
      .map((id) => item.evidence.find((evidence) => evidence.id === id))
      .filter((evidence): evidence is NonNullable<typeof evidence> => evidence !== undefined)
      .map(sourceKey),
  );
}

function sourceKey(evidence: NonNullable<ClaimVerification["evidence"][number]>): string {
  const sourceUrl = evidence.provenance?.sourceUrl ?? evidence.url;
  try {
    const normalized = new URL(sourceUrl);
    normalized.hash = "";
    normalized.hostname = normalized.hostname.replace(/\.+$/u, "");
    return normalized.toString();
  } catch {
    return sourceUrl;
  }
}

function deduplicateViolations(violations: PolicyViolation[]): PolicyViolation[] {
  const seen = new Set<string>();
  return violations.filter((violation) => {
    const key = `${violation.code}:${violation.claimId ?? ""}:${violation.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
