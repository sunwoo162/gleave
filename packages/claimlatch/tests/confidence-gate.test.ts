import assert from "node:assert/strict";
import test from "node:test";
import { ClaimLatch } from "../src/gate.js";
import type {
  Claim,
  ClaimConfidenceScorer,
  ClaimExtractor,
  ClaimVerification,
  ConfidenceCalibrationProfile,
  EvidenceProvider,
  VerificationReport,
} from "../src/types.js";

const profile: ConfidenceCalibrationProfile = {
  version: 1,
  id: "fixture-profile-v1",
  target: "verification-status-correctness",
  scorerId: "fixture-scorer-v1",
  method: "isotonic",
  datasetManifestSha256: "a".repeat(64),
  observationCount: 4,
  mapping: [
    { maxRawScore: 0.5, calibratedProbability: 0.25 },
    { maxRawScore: 1, calibratedProbability: 0.875 },
  ],
  validation: {
    datasetManifestSha256: "b".repeat(64),
    observationCount: 4,
    brierScore: 0.125,
    expectedCalibrationError: 0.1,
  },
  createdAt: "2026-09-30T00:00:00.000Z",
};

const extractor: ClaimExtractor = {
  async extract({ answer }) {
    return [{ id: "claim-1", text: answer, kind: "fact", importance: "normal" }];
  },
};

const evidenceProvider: EvidenceProvider = {
  async search(claim) {
    return [{
      id: "evidence-1",
      claimId: claim.id,
      title: "Fixture source",
      url: "https://example.test/source",
      snippet: claim.text,
      sourceType: "primary",
      retrievedAt: "2026-09-30T00:00:00.000Z",
      provider: "fixture",
    }];
  },
};

const verifier = {
  async verify({ claim, evidence }: { claim: Claim; evidence: ClaimVerification["evidence"] }): Promise<ClaimVerification> {
    return {
      claim,
      status: claim.text === "supported" ? "SUPPORTED" : "CONTRADICTED",
      reason: "Fixture verifier result.",
      evidenceIds: ["evidence-1"],
      evidence,
    };
  },
};

const scorer: ClaimConfidenceScorer = {
  id: "fixture-scorer-v1",
  score: () => 0.5,
};

function createGate(confidence?: { scorer: ClaimConfidenceScorer; profile: ConfidenceCalibrationProfile }): ClaimLatch {
  return new ClaimLatch({
    extractor,
    evidenceProvider,
    verifier,
    ...(confidence ? { confidence } : {}),
  });
}

async function verifyAnswer(gate: ClaimLatch, answer: string): Promise<VerificationReport> {
  return gate.verify({ question: "Is the fixture answer supported?", answer });
}

test("ClaimLatch attaches calibrated confidence when configured", async () => {
  const report = await verifyAnswer(createGate({ scorer, profile }), "supported");

  assert.deepEqual(report.claims[0]?.confidence, {
    value: 0.25,
    meaning: "verification-status-correctness",
    scorerId: "fixture-scorer-v1",
    calibrationProfileId: "fixture-profile-v1",
  });
});

test("ClaimLatch leaves reports unchanged without confidence configuration", async () => {
  const report = await verifyAnswer(createGate(), "supported");

  assert.equal("confidence" in (report.claims[0] ?? {}), false);
});

test("ClaimLatch rejects a scorer that does not match the profile", () => {
  assert.throws(
    () => createGate({ scorer: { ...scorer, id: "other-scorer-v1" }, profile }),
    /does not match/,
  );
});

test("ClaimLatch fails when the scorer returns an invalid raw score", async () => {
  const invalidScorer: ClaimConfidenceScorer = {
    ...scorer,
    score: () => Number.NaN,
  };

  await assert.rejects(
    verifyAnswer(createGate({ scorer: invalidScorer, profile }), "supported"),
    /Confidence scorer returned an invalid raw score/,
  );
});

test("ClaimLatch propagates scorer failures", async () => {
  const failingScorer: ClaimConfidenceScorer = {
    ...scorer,
    score: () => {
      throw new Error("fixture scorer unavailable");
    },
  };

  await assert.rejects(
    verifyAnswer(createGate({ scorer: failingScorer, profile }), "supported"),
    /Confidence scorer failed/,
  );
});

test("confidence does not change policy PASS or BLOCK", async () => {
  const withoutConfidence = createGate();
  const withConfidence = createGate({ scorer, profile });

  const passWithout = await verifyAnswer(withoutConfidence, "supported");
  const passWith = await verifyAnswer(withConfidence, "supported");
  const blockWithout = await verifyAnswer(withoutConfidence, "contradicted");
  const blockWith = await verifyAnswer(withConfidence, "contradicted");

  assert.equal(passWith.passed, passWithout.passed);
  assert.equal(blockWith.passed, blockWithout.passed);
  assert.equal(blockWith.passed, false);
});

test("confidence does not change coverage or counts", async () => {
  const withoutConfidence = await verifyAnswer(createGate(), "supported");
  const withConfidence = await verifyAnswer(createGate({ scorer, profile }), "supported");

  assert.deepEqual(withConfidence.counts, withoutConfidence.counts);
  assert.equal(withConfidence.coverage, withoutConfidence.coverage);
});
