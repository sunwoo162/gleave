import assert from "node:assert/strict";
import test from "node:test";
import { calculateCoverage, evaluatePolicy, mergePolicy, summarizeClaims } from "../src/policy.js";
import type { ClaimVerification, VerificationStatus } from "../src/types.js";

function verification(status: VerificationStatus, importance: "critical" | "normal" = "normal"): ClaimVerification {
  return {
    claim: { id: `c_${status}_${importance}`, text: `${status} claim`, kind: "fact", importance },
    status,
    reason: "fixture",
    evidenceIds: status === "SUPPORTED" || status === "CONTRADICTED" ? ["e1"] : [],
    evidence: [],
  };
}

test("coverage measures evidence-decided claims, not accuracy", () => {
  const counts = summarizeClaims([
    verification("SUPPORTED"),
    verification("CONTRADICTED"),
    verification("UNSUPPORTED"),
    verification("UNVERIFIABLE"),
  ]);

  assert.equal(calculateCoverage(counts), 0.5);
});

test("default policy blocks contradictions and unsupported claims", () => {
  const violations = evaluatePolicy(
    [verification("SUPPORTED"), verification("CONTRADICTED"), verification("UNSUPPORTED")],
    mergePolicy(),
  );

  assert.ok(violations.some((violation) => violation.code === "CONTRADICTION"));
  assert.ok(violations.some((violation) => violation.code === "UNSUPPORTED_LIMIT"));
  assert.ok(violations.some((violation) => violation.code === "COVERAGE_BELOW_MINIMUM"));
});

test("critical claims must be supported by default", () => {
  const violations = evaluatePolicy([verification("UNVERIFIABLE", "critical")], mergePolicy());
  assert.ok(violations.some((violation) => violation.code === "CRITICAL_CLAIM_NOT_SUPPORTED"));
});


test("strict policy fails closed when no claims are extracted", () => {
  const violations = evaluatePolicy([], mergePolicy());
  assert.ok(violations.some((violation) => violation.code === "NO_CLAIMS_EXTRACTED"));
});

test("document provenance policy rejects decisive verdicts backed only by search snippets", () => {
  const item = verification("SUPPORTED");
  item.evidence = [{
    id: "e1",
    claimId: item.claim.id,
    title: "Search result",
    url: "https://example.test/source",
    snippet: "support",
    sourceType: "primary",
    retrievedAt: "2026-09-28T00:00:00.000Z",
    provider: "fixture",
    provenance: {
      kind: "search-snippet",
      sourceUrl: "https://example.test/source",
      retrievedAt: "2026-09-28T00:00:00.000Z",
      quote: "support",
    },
  }];
  const violations = evaluatePolicy([item], mergePolicy({ requireRetrievedDocumentForDecisiveClaims: true }));
  assert.ok(violations.some((violation) => violation.code === "DECISIVE_CLAIM_MISSING_DOCUMENT_PROVENANCE"));
});

test("default policy blocks a contradiction reported across distinct sources", () => {
  const item: ClaimVerification = {
    claim: { id: "cross_source", text: "The release is stable.", kind: "fact", importance: "normal" },
    status: "SUPPORTED",
    reason: "Sources disagree.",
    evidenceIds: ["support", "contradiction"],
    supportingEvidenceIds: ["support"],
    contradictingEvidenceIds: ["contradiction"],
    evidence: [
      {
        id: "support",
        claimId: "cross_source",
        title: "Source A",
        url: "https://source-a.example/release",
        snippet: "The release is stable.",
        sourceType: "primary",
        retrievedAt: "2026-09-29T00:00:00.000Z",
        provider: "fixture",
      },
      {
        id: "contradiction",
        claimId: "cross_source",
        title: "Source B",
        url: "https://source-b.example/release",
        snippet: "The release is not stable.",
        sourceType: "secondary",
        retrievedAt: "2026-09-29T00:00:00.000Z",
        provider: "fixture",
      },
    ],
  } as ClaimVerification;

  const violations = evaluatePolicy([item], mergePolicy());
  assert.ok(violations.some((violation) => violation.code === "CROSS_SOURCE_CONTRADICTION"));
});

test("same-source supporting and contradicting evidence is not a cross-source contradiction", () => {
  const item: ClaimVerification = {
    claim: { id: "same_source", text: "The release is stable.", kind: "fact", importance: "normal" },
    status: "SUPPORTED",
    reason: "The same source contains qualifying context.",
    evidenceIds: ["support", "qualification"],
    supportingEvidenceIds: ["support"],
    contradictingEvidenceIds: ["qualification"],
    evidence: [
      {
        id: "support",
        claimId: "same_source",
        title: "Source",
        url: "https://source.example./release#summary",
        snippet: "The release is stable.",
        sourceType: "primary",
        retrievedAt: "2026-09-29T00:00:00.000Z",
        provider: "fixture",
      },
      {
        id: "qualification",
        claimId: "same_source",
        title: "Source",
        url: "https://source.example/release#details",
        snippet: "The release is not stable under load.",
        sourceType: "primary",
        retrievedAt: "2026-09-29T00:00:00.000Z",
        provider: "fixture",
      },
    ],
  } as ClaimVerification;

  const violations = evaluatePolicy([item], mergePolicy());
  assert.equal(violations.some((violation) => violation.code === "CROSS_SOURCE_CONTRADICTION"), false);
});
