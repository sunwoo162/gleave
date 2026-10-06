import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createConfidenceCalibrationProfile,
  evaluateCalibration,
  hashCalibrationDataset,
  parseCalibrationJsonl,
  validateCalibrationDatasets,
} from "../src/calibration.js";
import type {
  CalibrationObservation,
  ConfidenceCalibrationProfile,
  VerificationStatus,
} from "../src/types.js";

const labelSourceUrls = ["https://example.test/label"];

function observation(
  id: string,
  predictedStatus: VerificationStatus,
  expectedStatus: VerificationStatus,
  rawScore: number,
  sourceCaseId = id,
  sourceClaimId = `${id}-claim`,
): CalibrationObservation {
  return {
    id,
    predictedStatus,
    expectedStatus,
    rawScore,
    sourceCaseId,
    sourceClaimId,
    labelSourceUrls,
  };
}

function profile(overrides: Partial<ConfidenceCalibrationProfile> = {}): ConfidenceCalibrationProfile {
  return {
    version: 1,
    id: "fixture-profile-v1",
    target: "verification-status-correctness",
    scorerId: "fixture-scorer-v1",
    method: "isotonic",
    datasetManifestSha256: "a".repeat(64),
    observationCount: 4,
    mapping: [
      { maxRawScore: 0.5, calibratedProbability: 0.25 },
      { maxRawScore: 1, calibratedProbability: 0.75 },
    ],
    validation: {
      datasetManifestSha256: "b".repeat(64),
      observationCount: 2,
      brierScore: 0.5625,
      expectedCalibrationError: 0.75,
    },
    createdAt: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

test("calibration JSONL parser preserves valid observations", () => {
  const input = JSON.stringify(observation(
    "observation-1",
    "SUPPORTED",
    "SUPPORTED",
    0.75,
    "case-1",
    "claim-1",
  ));

  assert.deepEqual(parseCalibrationJsonl(input), [observation(
    "observation-1",
    "SUPPORTED",
    "SUPPORTED",
    0.75,
    "case-1",
    "claim-1",
  )]);
});

test("calibration parser rejects duplicate IDs and invalid label URLs", () => {
  const first = JSON.stringify(observation("duplicate", "SUPPORTED", "SUPPORTED", 0.5));
  const second = JSON.stringify(observation("duplicate", "CONTRADICTED", "CONTRADICTED", 0.5));
  assert.throws(() => parseCalibrationJsonl(`${first}\n${second}`), /Duplicate calibration observation id/);

  assert.throws(
    () => parseCalibrationJsonl(JSON.stringify({
      ...observation("invalid-url", "SUPPORTED", "SUPPORTED", 0.5),
      labelSourceUrls: ["ftp://example.test/label"],
    })),
    /labelSourceUrls/,
  );
});

test("calibration manifest canonicalizes CRLF", () => {
  const lf = `${JSON.stringify(observation("one", "SUPPORTED", "SUPPORTED", 0.5))}\n`;
  const crlf = lf.replace(/\n/gu, "\r\n");
  const expected = createHash("sha256").update(lf).digest("hex");

  assert.equal(hashCalibrationDataset(crlf), expected);
  assert.equal(hashCalibrationDataset(crlf), hashCalibrationDataset(lf));
});

test("calibration dataset validation returns hashes and counts without fitting", () => {
  const result = validateCalibrationDatasets({
    calibration: {
      manifestSha256: "1".repeat(64),
      observations: [observation("cal-1", "SUPPORTED", "SUPPORTED", 0.5)],
    },
    evaluation: {
      manifestSha256: "2".repeat(64),
      observations: [observation("eval-1", "SUPPORTED", "CONTRADICTED", 0.25)],
    },
  });

  assert.deepEqual(result, {
    calibrationManifestSha256: "1".repeat(64),
    calibrationObservationCount: 1,
    evaluationManifestSha256: "2".repeat(64),
    evaluationObservationCount: 1,
  });
});

test("calibration dataset validation rejects malformed or shared manifests", () => {
  const validInput = {
    calibration: {
      manifestSha256: "1".repeat(64),
      observations: [observation("cal-1", "SUPPORTED", "SUPPORTED", 0.5)],
    },
    evaluation: {
      manifestSha256: "2".repeat(64),
      observations: [observation("eval-1", "SUPPORTED", "CONTRADICTED", 0.25)],
    },
  };

  assert.throws(
    () => validateCalibrationDatasets({
      ...validInput,
      calibration: { ...validInput.calibration, manifestSha256: "not-a-hash" },
    }),
    /Invalid calibration manifest SHA-256/,
  );
  assert.throws(
    () => validateCalibrationDatasets({
      ...validInput,
      evaluation: { ...validInput.evaluation, manifestSha256: validInput.calibration.manifestSha256 },
    }),
    /manifests must be distinct/,
  );
});

test("profile fitting produces a monotonic step mapping", () => {
  const result = createConfidenceCalibrationProfile({
    id: "fitted-profile-v1",
    scorerId: "fixture-scorer-v1",
    calibration: {
      manifestSha256: "1".repeat(64),
      observations: [
        observation("cal-1", "SUPPORTED", "SUPPORTED", 0.2),
        observation("cal-2", "SUPPORTED", "CONTRADICTED", 0.3),
        observation("cal-3", "SUPPORTED", "SUPPORTED", 0.8),
        observation("cal-4", "SUPPORTED", "SUPPORTED", 0.9),
      ],
    },
    evaluation: {
      manifestSha256: "2".repeat(64),
      observations: [observation("eval-1", "SUPPORTED", "SUPPORTED", 0.8)],
    },
    createdAt: "2026-09-30T00:00:00.000Z",
  });

  assert.equal(result.profile.mapping.at(-1)?.maxRawScore, 1);
  const mapping: ConfidenceCalibrationProfile["mapping"] = result.profile.mapping;
  assert.ok(mapping.every((point, index, mapping) => {
    const previous = mapping[index - 1];
    return !previous
      || (point.maxRawScore > previous.maxRawScore
        && point.calibratedProbability >= previous.calibratedProbability);
  }));
});

test("profile creation rejects shared manifests and source case claim pairs", () => {
  const calibration = [observation("cal-1", "SUPPORTED", "SUPPORTED", 0.5, "shared-case", "shared-claim")];
  const evaluation = [observation("eval-1", "SUPPORTED", "SUPPORTED", 0.5, "shared-case", "shared-claim")];
  const input = {
    id: "fixture-profile-v1",
    scorerId: "fixture-scorer-v1",
    calibration: { manifestSha256: "1".repeat(64), observations: calibration },
    evaluation: { manifestSha256: "2".repeat(64), observations: evaluation },
    createdAt: "2026-09-30T00:00:00.000Z",
  };

  assert.throws(
    () => createConfidenceCalibrationProfile({
      ...input,
      calibration: { ...input.calibration, manifestSha256: input.evaluation.manifestSha256 },
    }),
    /distinct/,
  );
  assert.throws(() => createConfidenceCalibrationProfile(input), /source case\/claim pair/);
});

test("Brier score matches the hand-computed fixture", () => {
  const result = evaluateCalibration([
    observation("brier-1", "SUPPORTED", "SUPPORTED", 0.25),
    observation("brier-2", "SUPPORTED", "CONTRADICTED", 0.75),
  ], profile());

  assert.equal(result.brierScore, 0.5625);
  assert.equal(result.byStatus.SUPPORTED.count, 2);
  assert.equal(result.byStatus.CONTRADICTED.count, 0);
  assert.equal(result.byStatus.CONTRADICTED.brierScore, undefined);
});

test("ECE uses ten fixed equal-width bins", () => {
  const result = evaluateCalibration([
    observation("ece-1", "SUPPORTED", "SUPPORTED", 0.25),
    observation("ece-2", "SUPPORTED", "CONTRADICTED", 0.75),
  ], profile());

  assert.equal(result.expectedCalibrationError, 0.75);
  assert.equal(result.observationCount, 2);
});
