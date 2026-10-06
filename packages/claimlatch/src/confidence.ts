import type {
  ClaimConfidence,
  ClaimConfidenceScorer,
  ClaimVerificationForConfidence,
  ConfidenceCalibrationProfile,
} from "./types.js";
import { isIso8601Timestamp } from "./iso8601.js";

export class ConfidenceEvaluationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConfidenceEvaluationError";
  }
}

export function validateConfidenceCalibrationProfile(profile: ConfidenceCalibrationProfile): void {
  if (!profile || typeof profile !== "object") throw new TypeError("Confidence calibration profile is required.");
  if (profile.version !== 1) throw new TypeError("Confidence calibration profile version must be 1.");
  if (profile.target !== "verification-status-correctness") {
    throw new TypeError("Confidence calibration profile target is invalid.");
  }
  if (profile.method !== "isotonic") throw new TypeError("Confidence calibration profile method is invalid.");
  if (!isNonEmptyString(profile.id)) throw new TypeError("Confidence calibration profile id is required.");
  if (!isNonEmptyString(profile.scorerId)) throw new TypeError("Confidence calibration profile scorerId is required.");
  if (!isSha256(profile.datasetManifestSha256)) {
    throw new TypeError("Confidence calibration profile datasetManifestSha256 is invalid.");
  }
  if (!isPositiveInteger(profile.observationCount)) {
    throw new TypeError("Confidence calibration profile observationCount is invalid.");
  }
  if (!Array.isArray(profile.mapping) || profile.mapping.length === 0) {
    throw new TypeError("Confidence calibration profile mapping is required.");
  }

  let previousMaxRawScore = -1;
  let previousProbability = -1;
  for (const point of profile.mapping) {
    if (
      !point
      || !Number.isFinite(point.maxRawScore)
      || point.maxRawScore < 0
      || point.maxRawScore > 1
      || !Number.isFinite(point.calibratedProbability)
      || point.calibratedProbability < 0
      || point.calibratedProbability > 1
    ) {
      throw new TypeError("Confidence calibration mapping values must be finite numbers in [0, 1].");
    }
    if (point.maxRawScore <= previousMaxRawScore) {
      throw new TypeError("Confidence calibration mapping thresholds must be strictly increasing.");
    }
    if (point.calibratedProbability < previousProbability) {
      throw new TypeError("Confidence calibration mapping probabilities must be non-decreasing.");
    }
    previousMaxRawScore = point.maxRawScore;
    previousProbability = point.calibratedProbability;
  }
  if (previousMaxRawScore !== 1) {
    throw new TypeError("Confidence calibration mapping must end at raw score 1.");
  }

  const validation = profile.validation;
  if (!validation || typeof validation !== "object") {
    throw new TypeError("Confidence calibration profile validation is required.");
  }
  if (!isSha256(validation.datasetManifestSha256)) {
    throw new TypeError("Confidence calibration validation datasetManifestSha256 is invalid.");
  }
  if (validation.datasetManifestSha256 === profile.datasetManifestSha256) {
    throw new TypeError("Confidence calibration manifests must be distinct.");
  }
  if (!isPositiveInteger(validation.observationCount)) {
    throw new TypeError("Confidence calibration validation observationCount is invalid.");
  }
  if (!isProbability(validation.brierScore) || !isProbability(validation.expectedCalibrationError)) {
    throw new TypeError("Confidence calibration validation metrics must be finite numbers in [0, 1].");
  }
  if (!isIso8601Timestamp(profile.createdAt)) {
    throw new TypeError("Confidence calibration profile createdAt must be a valid ISO-8601 timestamp.");
  }
}

export function applyConfidenceCalibrationProfile(
  profile: ConfidenceCalibrationProfile,
  rawScore: number,
): number {
  validateConfidenceCalibrationProfile(profile);
  if (!isProbability(rawScore)) {
    throw new ConfidenceEvaluationError("Confidence scorer returned an invalid raw score.");
  }
  const point = profile.mapping.find((entry) => rawScore <= entry.maxRawScore);
  if (!point) throw new ConfidenceEvaluationError("Confidence calibration mapping did not cover the raw score.");
  return point.calibratedProbability;
}

export async function createClaimConfidence(input: {
  scorer: ClaimConfidenceScorer;
  profile: ConfidenceCalibrationProfile;
  verification: ClaimVerificationForConfidence;
}): Promise<ClaimConfidence> {
  validateConfidenceCalibrationProfile(input.profile);
  if (input.scorer.id !== input.profile.scorerId) {
    throw new ConfidenceEvaluationError("Confidence scorer does not match the calibration profile.");
  }

  let rawScore: number;
  try {
    rawScore = await input.scorer.score({
      claim: input.verification.claim,
      verification: input.verification,
    });
  } catch (error) {
    throw new ConfidenceEvaluationError("Confidence scorer failed.", { cause: error });
  }

  return {
    value: applyConfidenceCalibrationProfile(input.profile, rawScore),
    meaning: "verification-status-correctness",
    scorerId: input.scorer.id,
    calibrationProfileId: input.profile.id,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f\d]{64}$/u.test(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isProbability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
