import { calculateCoverage, evaluatePolicy, mergePolicy, summarizeClaims } from "./policy.js";
import { createClaimConfidence, validateConfidenceCalibrationProfile } from "./confidence.js";
import type {
  ClaimExtractor,
  ClaimVerifier,
  ConfidenceCalibrationOptions,
  EvidenceProvider,
  VerificationInput,
  VerificationReport,
} from "./types.js";

export interface ClaimLatchOptions {
  extractor: ClaimExtractor;
  evidenceProvider: EvidenceProvider;
  verifier: ClaimVerifier;
  concurrency?: number;
  confidence?: ConfidenceCalibrationOptions;
}

export class ClaimLatch {
  readonly #extractor: ClaimExtractor;
  readonly #evidenceProvider: EvidenceProvider;
  readonly #verifier: ClaimVerifier;
  readonly #concurrency: number;
  readonly #confidence: ConfidenceCalibrationOptions | undefined;

  constructor(options: ClaimLatchOptions) {
    this.#extractor = options.extractor;
    this.#evidenceProvider = options.evidenceProvider;
    this.#verifier = options.verifier;
    this.#concurrency = Math.max(1, Math.floor(options.concurrency ?? 4));
    this.#confidence = options.confidence;
    if (this.#confidence) {
      validateConfidenceCalibrationProfile(this.#confidence.profile);
      if (this.#confidence.scorer.id !== this.#confidence.profile.scorerId) {
        throw new Error("Confidence scorer does not match the calibration profile.");
      }
    }
  }

  async verify(input: VerificationInput): Promise<VerificationReport> {
    const claims = validateClaims(await this.#extractor.extract({
      question: input.question,
      answer: input.answer,
    }));

    const verifiedClaims = await mapWithConcurrency(
      claims,
      this.#concurrency,
      async (claim) => {
        const rawEvidence = await this.#evidenceProvider.search(claim);
        const evidence = sanitizeEvidence(claim.id, rawEvidence);
        const rawVerification = await this.#verifier.verify({ claim, evidence });
        const verification = sanitizeVerification(claim, evidence, rawVerification);
        if (!this.#confidence) return verification;
        return {
          ...verification,
          confidence: await createClaimConfidence({
            scorer: this.#confidence.scorer,
            profile: this.#confidence.profile,
            verification,
          }),
        };
      },
    );

    const policy = mergePolicy(input.policy);
    const counts = summarizeClaims(verifiedClaims);
    const coverage = calculateCoverage(counts);
    const violations = evaluatePolicy(verifiedClaims, policy);

    return {
      passed: violations.length === 0,
      coverage,
      counts,
      claims: verifiedClaims,
      violations,
      generatedAt: new Date().toISOString(),
    };
  }
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await worker(item, index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => runWorker()),
  );

  return results;
}

function sanitizeEvidence(claimId: string, evidence: import("./types.js").Evidence[]): import("./types.js").Evidence[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    if (item.claimId !== claimId || !item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function validateClaims(claims: import("./types.js").Claim[]): import("./types.js").Claim[] {
  const seen = new Set<string>();
  for (const claim of claims) {
    if (!claim.id?.trim()) throw new Error("Claim extractor returned a claim without an id.");
    if (!claim.text?.trim()) throw new Error(`Claim extractor returned an empty claim (${claim.id}).`);
    if (seen.has(claim.id)) throw new Error(`Claim extractor returned duplicate claim id: ${claim.id}`);
    seen.add(claim.id);
  }
  return claims;
}

function sanitizeVerification(
  claim: import("./types.js").Claim,
  evidence: import("./types.js").Evidence[],
  raw: import("./types.js").ClaimVerification,
): import("./types.js").ClaimVerification {
  const validIds = new Set(evidence.map((item) => item.id));
  const evidenceIds = sanitizeEvidenceIds(raw.evidenceIds, validIds);
  const supportingEvidenceIds = sanitizeEvidenceIds(raw.supportingEvidenceIds, validIds);
  const contradictingEvidenceIds = sanitizeEvidenceIds(raw.contradictingEvidenceIds, validIds);
  const boundEvidenceIds = uniqueStrings([
    ...evidenceIds,
    ...supportingEvidenceIds,
    ...contradictingEvidenceIds,
  ]);
  const requestedStatus = normalizeVerificationStatus(raw.status);
  const decisiveWithoutEvidence =
    (requestedStatus === "SUPPORTED" || requestedStatus === "CONTRADICTED") && boundEvidenceIds.length === 0;

  return {
    claim,
    status: decisiveWithoutEvidence ? "UNVERIFIABLE" : requestedStatus,
    reason: decisiveWithoutEvidence
      ? "Verifier returned a decisive status without binding it to retrieved evidence."
      : typeof raw.reason === "string" && raw.reason.trim()
        ? raw.reason.trim()
        : "Verifier did not provide a reason.",
    evidenceIds: boundEvidenceIds,
    supportingEvidenceIds,
    contradictingEvidenceIds,
    evidence,
  };
}

function sanitizeEvidenceIds(value: unknown, validIds: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.filter((id): id is string => typeof id === "string" && validIds.has(id)));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeVerificationStatus(value: unknown): import("./types.js").VerificationStatus {
  return value === "SUPPORTED" ||
    value === "CONTRADICTED" ||
    value === "UNSUPPORTED" ||
    value === "UNVERIFIABLE"
    ? value
    : "UNVERIFIABLE";
}
