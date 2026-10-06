import assert from "node:assert/strict";
import test from "node:test";
import {
  applyConfidenceCalibrationProfile,
  createClaimConfidence,
  validateConfidenceCalibrationProfile,
} from "../src/confidence.js";
import type {
  Claim,
  ClaimConfidence,
  ClaimConfidenceScorer,
  ClaimVerificationForConfidence,
  ConfidenceCalibrationProfile,
} from "../src/types.js";

const calibrationManifestSha256 = "a".repeat(64);
const evaluationManifestSha256 = "b".repeat(64);

const claim: Claim = {
  id: "claim-1",
  text: "The fixture claim is supported.",
  kind: "fact",
  importance: "normal",
};

const verification: ClaimVerificationForConfidence = {
  claim,
  status: "SUPPORTED",
  reason: "Fixture evidence supports the claim.",
  evidenceIds: ["evidence-1"],
  evidence: [],
};

function validProfile(overrides: Partial<ConfidenceCalibrationProfile> = {}): ConfidenceCalibrationProfile {
  return {
    version: 1,
    id: "fixture-profile-v1",
    target: "verification-status-correctness",
    scorerId: "fixture-scorer-v1",
    method: "isotonic",
    datasetManifestSha256: calibrationManifestSha256,
    observationCount: 4,
    mapping: [
      { maxRawScore: 0.5, calibratedProbability: 0.25 },
      { maxRawScore: 1, calibratedProbability: 0.875 },
    ],
    validation: {
      datasetManifestSha256: evaluationManifestSha256,
      observationCount: 4,
      brierScore: 0.125,
      expectedCalibrationError: 0.1,
    },
    createdAt: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

test("confidence profile accepts a valid monotonic step mapping", () => {
  validateConfidenceCalibrationProfile(validProfile());
});

test("confidence profile rejects malformed hashes and metadata", () => {
  assert.throws(
    () => validateConfidenceCalibrationProfile(validProfile({ datasetManifestSha256: "A".repeat(64) })),
    /datasetManifestSha256/,
  );
  assert.throws(
    () => validateConfidenceCalibrationProfile(validProfile({ observationCount: 0 })),
    /observationCount/,
  );
  assert.throws(
    () => validateConfidenceCalibrationProfile(validProfile({ version: 2 as 1 })),
    /version/,
  );
  assert.throws(
    () => validateConfidenceCalibrationProfile(validProfile({
      validation: {
        ...validProfile().validation,
        datasetManifestSha256: calibrationManifestSha256,
      },
    })),
    /distinct/,
  );
});

test("confidence profile requires an ISO-8601 createdAt timestamp", () => {
  assert.throws(
    () => validateConfidenceCalibrationProfile(validProfile({ createdAt: "not-a-date" })),
    /createdAt/,
  );
  validateConfidenceCalibrationProfile(validProfile({
    createdAt: "2026-09-30T09:00:00+09:00",
  }));
});

test("confidence profile rejects unsorted or non-monotonic mappings", () => {
  assert.throws(
    () => validateConfidenceCalibrationProfile(validProfile({
      mapping: [
        { maxRawScore: 0.75, calibratedProbability: 0.5 },
        { maxRawScore: 0.5, calibratedProbability: 0.75 },
        { maxRawScore: 1, calibratedProbability: 0.9 },
      ],
    })),
    /strictly increasing/,
  );
  assert.throws(
    () => validateConfidenceCalibrationProfile(validProfile({
      mapping: [
        { maxRawScore: 0.5, calibratedProbability: 0.75 },
        { maxRawScore: 1, calibratedProbability: 0.25 },
      ],
    })),
    /non-decreasing/,
  );
});

test("confidence mapping uses the first threshold at exact boundaries", () => {
  const profile = validProfile();

  assert.equal(applyConfidenceCalibrationProfile(profile, 0), 0.25);
  assert.equal(applyConfidenceCalibrationProfile(profile, 0.5), 0.25);
  assert.equal(applyConfidenceCalibrationProfile(profile, 0.500001), 0.875);
});

test("confidence mapping covers raw score one with the final threshold", () => {
  assert.equal(applyConfidenceCalibrationProfile(validProfile(), 1), 0.875);
});

test("confidence mapping rejects non-finite and out-of-range raw scores", () => {
  const profile = validProfile();

  assert.throws(() => applyConfidenceCalibrationProfile(profile, Number.NaN), /raw score/);
  assert.throws(() => applyConfidenceCalibrationProfile(profile, -0.01), /raw score/);
  assert.throws(() => applyConfidenceCalibrationProfile(profile, 1.01), /raw score/);
});

test("createClaimConfidence calibrates the scorer output", async () => {
  const scorer: ClaimConfidenceScorer = {
    id: "fixture-scorer-v1",
    score: () => 0.5,
  };

  const result: ClaimConfidence = await createClaimConfidence({
    scorer,
    profile: validProfile(),
    verification,
  });

  assert.deepEqual(result, {
    value: 0.25,
    meaning: "verification-status-correctness",
    scorerId: "fixture-scorer-v1",
    calibrationProfileId: "fixture-profile-v1",
  });
});
