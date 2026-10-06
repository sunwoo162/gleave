import assert from "node:assert/strict";
import test from "node:test";
import type { HarnessEvidenceRecord } from "../src/harness/contracts.js";
import {
  assertRunCompletionEvidence,
  assertStageCompletionEvidence,
  requiredEvidenceForStage,
} from "../src/harness/completion-gates.js";

function evidence(
  id: string,
  kind: HarnessEvidenceRecord["kind"],
  stage: HarnessEvidenceRecord["stage"],
): HarnessEvidenceRecord {
  return {
    version: 1,
    id,
    kind,
    stage,
    recordedAt: "2026-09-07T00:00:00.000Z",
    summary: `${kind} evidence`,
  };
}

test("delivery stages declare deterministic evidence requirements", () => {
  assert.deepEqual(requiredEvidenceForStage("TEST"), ["test"]);
  assert.deepEqual(requiredEvidenceForStage("SELF_REVIEW"), ["review"]);
  assert.deepEqual(requiredEvidenceForStage("COMMIT"), ["commit"]);
  assert.deepEqual(requiredEvidenceForStage("PR"), ["pull-request"]);
  assert.deepEqual(requiredEvidenceForStage("CI"), ["ci"]);
  assert.deepEqual(requiredEvidenceForStage("DEPLOY"), ["deployment"]);
  assert.deepEqual(requiredEvidenceForStage("PRODUCTION_VERIFY"), ["production-verification"]);
});test("stage completion rejects missing evidence", () => {
  assert.throws(
    () => assertStageCompletionEvidence("TEST", []),
    /TEST.*test/i,
  );

  assert.doesNotThrow(() => assertStageCompletionEvidence(
    "TEST",
    [evidence("test-1", "test", "TEST")],
  ));
});

test("evidence from another stage does not satisfy the gate", () => {
  assert.throws(
    () => assertStageCompletionEvidence(
      "CI",
      [evidence("ci-1", "ci", "TEST")],
    ),
    /CI.*ci/i,
  );
});

test("run completion requires the full default delivery evidence set", () => {
  const all: HarnessEvidenceRecord[] = [
    evidence("t", "test", "TEST"),
    evidence("r", "review", "SELF_REVIEW"),
    evidence("c", "commit", "COMMIT"),
    evidence("p", "pull-request", "PR"),
    evidence("ci", "ci", "CI"),
    evidence("d", "deployment", "DEPLOY"),
    evidence("v", "production-verification", "PRODUCTION_VERIFY"),
  ];

  assert.doesNotThrow(() => assertRunCompletionEvidence(all));
  assert.throws(
    () => assertRunCompletionEvidence(all.filter((item) => item.kind !== "production-verification")),
    /production-verification/i,
  );
});