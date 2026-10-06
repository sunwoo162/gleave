import assert from "node:assert/strict";
import test from "node:test";
import { ClaimLatch } from "../src/gate.js";
import type { Claim, ClaimExtractor, ClaimVerifier, EvidenceProvider } from "../src/types.js";

const claims: Claim[] = [
  { id: "claim_1", text: "Alpha is true.", kind: "fact", importance: "critical" },
  { id: "claim_2", text: "Beta is true.", kind: "fact", importance: "normal" },
];

const extractor: ClaimExtractor = {
  async extract() {
    return claims;
  },
};

const evidenceProvider: EvidenceProvider = {
  async search(claim) {
    return [
      {
        id: `${claim.id}_e1`,
        claimId: claim.id,
        title: "Fixture",
        url: "https://example.test/evidence",
        snippet: claim.id === "claim_1" ? "supports" : "contradicts",
        sourceType: "primary",
        retrievedAt: "2026-09-28T00:00:00.000Z",
        provider: "fixture",
      },
    ];
  },
};

const verifier: ClaimVerifier = {
  async verify({ claim, evidence }) {
    const status = claim.id === "claim_1" ? "SUPPORTED" : "CONTRADICTED";
    return {
      claim,
      status,
      reason: "fixture",
      evidenceIds: [evidence[0]?.id ?? ""],
      evidence,
    };
  },
};

test("ClaimLatch blocks a contradicted answer", async () => {
  const gate = new ClaimLatch({ extractor, evidenceProvider, verifier, concurrency: 2 });
  const report = await gate.verify({ question: "q", answer: "a" });

  assert.equal(report.passed, false);
  assert.equal(report.coverage, 1);
  assert.equal(report.counts.contradicted, 1);
  assert.ok(report.violations.some((violation) => violation.code === "CONTRADICTION"));
});

test("policy can allow a non-critical contradiction only when contradiction blocking is disabled", async () => {
  const gate = new ClaimLatch({ extractor, evidenceProvider, verifier });
  const report = await gate.verify({
    question: "q",
    answer: "a",
    policy: { blockOnContradiction: false },
  });

  assert.equal(report.passed, true);
});

test("core gate downgrades a custom verifier that invents evidence bindings", async () => {
  const badVerifier: ClaimVerifier = {
    async verify({ claim, evidence }) {
      return {
        claim,
        status: "SUPPORTED",
        reason: "trust me",
        evidenceIds: ["invented"],
        evidence,
      };
    },
  };
  const gate = new ClaimLatch({ extractor, evidenceProvider, verifier: badVerifier });
  const report = await gate.verify({ question: "q", answer: "a" });
  assert.equal(report.claims[0]?.status, "UNVERIFIABLE");
  assert.equal(report.passed, false);
});

test("core gate rejects duplicate claim IDs from custom extractors", async () => {
  const duplicateExtractor: ClaimExtractor = {
    async extract() {
      return [claims[0]!, { ...claims[1]!, id: claims[0]!.id }];
    },
  };
  const gate = new ClaimLatch({ extractor: duplicateExtractor, evidenceProvider, verifier });
  let message = "";
  try {
    await gate.verify({ question: "q", answer: "a" });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert.ok(message.includes("duplicate claim id"));
});

test("core gate preserves evidence relations for cross-source contradiction detection", async () => {
  const relationEvidenceProvider: EvidenceProvider = {
    async search(claim) {
      return [
        {
          id: "support",
          claimId: claim.id,
          title: "Source A",
          url: "https://source-a.example/release",
          snippet: "support",
          sourceType: "primary",
          retrievedAt: "2026-09-29T00:00:00.000Z",
          provider: "fixture",
        },
        {
          id: "contradiction",
          claimId: claim.id,
          title: "Source B",
          url: "https://source-b.example/release",
          snippet: "contradiction",
          sourceType: "secondary",
          retrievedAt: "2026-09-29T00:00:00.000Z",
          provider: "fixture",
        },
      ];
    },
  };
  const relationVerifier: ClaimVerifier = {
    async verify({ claim, evidence }) {
      return {
        claim,
        status: "SUPPORTED",
        reason: "Sources disagree.",
        evidenceIds: evidence.map((item) => item.id),
        supportingEvidenceIds: ["support"],
        contradictingEvidenceIds: ["contradiction"],
        evidence,
      };
    },
  };

  const gate = new ClaimLatch({ extractor, evidenceProvider: relationEvidenceProvider, verifier: relationVerifier });
  const report = await gate.verify({ question: "q", answer: "a" });

  assert.deepEqual(report.claims[0]?.supportingEvidenceIds, ["support"]);
  assert.deepEqual(report.claims[0]?.contradictingEvidenceIds, ["contradiction"]);
  assert.ok(report.violations.some((violation) => violation.code === "CROSS_SOURCE_CONTRADICTION"));
  assert.equal(report.passed, false);
});
