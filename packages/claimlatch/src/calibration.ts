import { createHash } from "node:crypto";
import {
  applyConfidenceCalibrationProfile,
  validateConfidenceCalibrationProfile,
} from "./confidence.js";
import type {
  CalibrationEvaluation,
  CalibrationObservation,
  CalibrationStatusEvaluation,
  ConfidenceCalibrationProfile,
  VerificationStatus,
} from "./types.js";

const VERIFICATION_STATUSES: readonly VerificationStatus[] = [
  "SUPPORTED",
  "CONTRADICTED",
  "UNSUPPORTED",
  "UNVERIFIABLE",
];

export function parseCalibrationJsonl(input: string): CalibrationObservation[] {
  const observations: CalibrationObservation[] = [];
  const ids = new Set<string>();

  for (const [index, line] of input.split(/\r?\n/u).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`Invalid calibration JSON on line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`Calibration line ${index + 1} must be a JSON object.`);
    }

    const value = parsed as Record<string, unknown>;
    const observation = parseObservation(value, index + 1);
    if (ids.has(observation.id)) throw new Error(`Duplicate calibration observation id: ${observation.id}`);
    ids.add(observation.id);
    observations.push(observation);
  }

  if (observations.length === 0) throw new Error("Calibration dataset contains no observations.");
  return observations;
}

export function hashCalibrationDataset(input: string): string {
  return createHash("sha256").update(input.replace(/\r\n?/gu, "\n")).digest("hex");
}

export interface CalibrationDatasetValidation {
  calibrationManifestSha256: string;
  calibrationObservationCount: number;
  evaluationManifestSha256: string;
  evaluationObservationCount: number;
}

export function validateCalibrationDatasets(input: {
  calibration: {
    manifestSha256: string;
    observations: CalibrationObservation[];
  };
  evaluation: {
    manifestSha256: string;
    observations: CalibrationObservation[];
  };
}): CalibrationDatasetValidation {
  validateManifestHash(input.calibration.manifestSha256, "calibration");
  validateManifestHash(input.evaluation.manifestSha256, "evaluation");
  if (input.calibration.manifestSha256 === input.evaluation.manifestSha256) {
    throw new Error("Calibration and evaluation manifests must be distinct.");
  }

  validateObservations(input.calibration.observations, "calibration");
  validateObservations(input.evaluation.observations, "evaluation");
  const calibrationPairs = new Set(input.calibration.observations.map(sourcePair));
  for (const observation of input.evaluation.observations) {
    if (calibrationPairs.has(sourcePair(observation))) {
      throw new Error("Calibration and evaluation datasets must not share a source case/claim pair.");
    }
  }

  return {
    calibrationManifestSha256: input.calibration.manifestSha256,
    calibrationObservationCount: input.calibration.observations.length,
    evaluationManifestSha256: input.evaluation.manifestSha256,
    evaluationObservationCount: input.evaluation.observations.length,
  };
}

export function createConfidenceCalibrationProfile(input: {
  id: string;
  scorerId: string;
  calibration: {
    manifestSha256: string;
    observations: CalibrationObservation[];
  };
  evaluation: {
    manifestSha256: string;
    observations: CalibrationObservation[];
  };
  createdAt: string;
}): { profile: ConfidenceCalibrationProfile; evaluation: CalibrationEvaluation } {
  if (!input.id.trim()) throw new Error("Calibration profile id is required.");
  if (!input.scorerId.trim()) throw new Error("Calibration scorer id is required.");
  if (!input.createdAt.trim()) throw new Error("Calibration profile createdAt is required.");
  validateCalibrationDatasets(input);

  const mapping = fitIsotonicMapping(input.calibration.observations);
  const provisionalProfile: ConfidenceCalibrationProfile = {
    version: 1,
    id: input.id,
    target: "verification-status-correctness",
    scorerId: input.scorerId,
    method: "isotonic",
    datasetManifestSha256: input.calibration.manifestSha256,
    observationCount: input.calibration.observations.length,
    mapping,
    validation: {
      datasetManifestSha256: input.evaluation.manifestSha256,
      observationCount: input.evaluation.observations.length,
      brierScore: 0,
      expectedCalibrationError: 0,
    },
    createdAt: input.createdAt,
  };
  const evaluation = evaluateCalibration(input.evaluation.observations, provisionalProfile);
  const profile: ConfidenceCalibrationProfile = {
    ...provisionalProfile,
    validation: {
      datasetManifestSha256: input.evaluation.manifestSha256,
      observationCount: evaluation.observationCount,
      brierScore: evaluation.brierScore,
      expectedCalibrationError: evaluation.expectedCalibrationError,
    },
  };
  validateConfidenceCalibrationProfile(profile);
  return { profile, evaluation };
}

export function evaluateCalibration(
  observations: readonly CalibrationObservation[],
  profile: ConfidenceCalibrationProfile,
): CalibrationEvaluation {
  validateConfidenceCalibrationProfile(profile);
  validateObservations(observations, "evaluation");

  const predictions = observations.map((observation) => ({
    probability: applyConfidenceCalibrationProfile(profile, observation.rawScore),
    correct: observation.predictedStatus === observation.expectedStatus,
    status: observation.predictedStatus,
  }));
  const metrics = calculateMetrics(predictions);
  if (metrics.brierScore === undefined || metrics.expectedCalibrationError === undefined) {
    throw new Error("Calibration evaluation requires at least one observation.");
  }
  const byStatus = Object.fromEntries(
    VERIFICATION_STATUSES.map((status) => {
      const statusMetrics = calculateMetrics(predictions.filter((prediction) => prediction.status === status));
      return [status, statusMetrics];
    }),
  ) as Record<VerificationStatus, CalibrationStatusEvaluation>;

  return {
    observationCount: predictions.length,
    brierScore: metrics.brierScore,
    expectedCalibrationError: metrics.expectedCalibrationError,
    byStatus,
  };
}

function fitIsotonicMapping(observations: readonly CalibrationObservation[]): ConfidenceCalibrationProfile["mapping"] {
  const grouped = new Map<number, { correct: number; count: number }>();
  for (const observation of observations) {
    const current = grouped.get(observation.rawScore) ?? { correct: 0, count: 0 };
    current.correct += observation.predictedStatus === observation.expectedStatus ? 1 : 0;
    current.count += 1;
    grouped.set(observation.rawScore, current);
  }

  const blocks: Array<{ maxRawScore: number; correct: number; count: number }> = [];
  for (const [rawScore, group] of [...grouped.entries()].sort(([left], [right]) => left - right)) {
    blocks.push({ maxRawScore: rawScore, ...group });
    while (blocks.length >= 2) {
      const current = blocks[blocks.length - 1];
      const previous = blocks[blocks.length - 2];
      if (!current || !previous || previous.correct / previous.count <= current.correct / current.count) break;
      blocks.splice(blocks.length - 2, 2, {
        maxRawScore: current.maxRawScore,
        correct: previous.correct + current.correct,
        count: previous.count + current.count,
      });
    }
  }

  const mapping = blocks.map((block) => ({
    maxRawScore: block.maxRawScore,
    calibratedProbability: block.correct / block.count,
  }));
  const last = mapping[mapping.length - 1];
  if (!last) throw new Error("Calibration dataset contains no observations.");
  if (last.maxRawScore < 1) mapping.push({ maxRawScore: 1, calibratedProbability: last.calibratedProbability });
  return mapping;
}

function calculateMetrics(
  predictions: ReadonlyArray<{ probability: number; correct: boolean; status: VerificationStatus }>,
): CalibrationStatusEvaluation {
  if (predictions.length === 0) return { count: 0 };

  const brierScore = predictions.reduce(
    (sum, prediction) => sum + (prediction.probability - (prediction.correct ? 1 : 0)) ** 2,
    0,
  ) / predictions.length;
  const bins = Array.from({ length: 10 }, () => ({ count: 0, probability: 0, correct: 0 }));
  for (const prediction of predictions) {
    const index = Math.min(9, Math.floor(prediction.probability * 10));
    const bin = bins[index];
    if (!bin) throw new Error("Calibration probability bin was not found.");
    bin.count += 1;
    bin.probability += prediction.probability;
    bin.correct += prediction.correct ? 1 : 0;
  }
  const expectedCalibrationError = bins.reduce((sum, bin) => {
    if (bin.count === 0) return sum;
    return sum + (bin.count / predictions.length) * Math.abs(
      bin.probability / bin.count - bin.correct / bin.count,
    );
  }, 0);

  return { count: predictions.length, brierScore, expectedCalibrationError };
}

function parseObservation(value: Record<string, unknown>, line: number): CalibrationObservation {
  const id = requiredString(value.id, `Calibration line ${line} is missing id.`);
  const predictedStatus = parseStatus(value.predictedStatus, `Calibration ${id} has invalid predictedStatus.`);
  const expectedStatus = parseStatus(value.expectedStatus, `Calibration ${id} has invalid expectedStatus.`);
  const rawScore = value.rawScore;
  if (typeof rawScore !== "number" || !Number.isFinite(rawScore) || rawScore < 0 || rawScore > 1) {
    throw new Error(`Calibration ${id} has invalid rawScore.`);
  }
  const sourceCaseId = requiredString(value.sourceCaseId, `Calibration ${id} is missing sourceCaseId.`);
  const sourceClaimId = requiredString(value.sourceClaimId, `Calibration ${id} is missing sourceClaimId.`);
  const labelSourceUrls = value.labelSourceUrls;
  if (
    !Array.isArray(labelSourceUrls)
    || labelSourceUrls.length === 0
    || labelSourceUrls.some((url) => !isHttpUrl(url))
  ) {
    throw new Error(`Calibration ${id} has invalid labelSourceUrls.`);
  }

  return {
    id,
    predictedStatus,
    expectedStatus,
    rawScore,
    sourceCaseId,
    sourceClaimId,
    labelSourceUrls: [...labelSourceUrls] as string[],
  };
}

function validateObservations(observations: readonly CalibrationObservation[], kind: string): void {
  if (observations.length === 0) throw new Error(`${kind} calibration dataset contains no observations.`);
  const ids = new Set<string>();
  for (const observation of observations) {
    if (!observation || typeof observation !== "object") throw new Error(`Invalid ${kind} calibration observation.`);
    if (!isNonEmptyString(observation.id) || ids.has(observation.id)) {
      throw new Error(`Duplicate ${kind} calibration observation id: ${observation.id}`);
    }
    ids.add(observation.id);
    if (!isStatus(observation.predictedStatus) || !isStatus(observation.expectedStatus)) {
      throw new Error(`Invalid ${kind} calibration status.`);
    }
    if (!isProbability(observation.rawScore)) throw new Error(`Invalid ${kind} calibration rawScore.`);
    if (!isNonEmptyString(observation.sourceCaseId) || !isNonEmptyString(observation.sourceClaimId)) {
      throw new Error(`Invalid ${kind} calibration source case/claim pair.`);
    }
    if (
      !Array.isArray(observation.labelSourceUrls)
      || observation.labelSourceUrls.length === 0
      || observation.labelSourceUrls.some((url) => !isHttpUrl(url))
    ) {
      throw new Error(`Invalid ${kind} calibration labelSourceUrls.`);
    }
  }
}

function validateManifestHash(value: string, kind: string): void {
  if (!/^[a-f\d]{64}$/u.test(value)) throw new Error(`Invalid ${kind} manifest SHA-256.`);
}

function sourcePair(observation: CalibrationObservation): string {
  return `${observation.sourceCaseId}\u0000${observation.sourceClaimId}`;
}

function requiredString(value: unknown, message: string): string {
  if (!isNonEmptyString(value)) throw new Error(message);
  return value;
}

function parseStatus(value: unknown, message: string): VerificationStatus {
  if (!isStatus(value)) throw new Error(message);
  return value;
}

function isStatus(value: unknown): value is VerificationStatus {
  return typeof value === "string" && VERIFICATION_STATUSES.includes(value as VerificationStatus);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isProbability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}
