import assert from "node:assert/strict";
import test from "node:test";
import type { CodingAttempt, CodingExercise, Principal } from "../src/learning/contracts.js";
import { createLocalCodingSyntaxVerifier } from "../src/learning/local-coding-verifier.js";

const principal: Principal = { userId: "coding-verifier-owner", sessionId: "coding-verifier-session", roles: ["user"] };
const exercise: CodingExercise = {
  version: 1,
  id: "coding-exercise-local-verifier",
  userId: principal.userId,
  title: "JavaScript syntax",
  prompt: "Write valid JavaScript.",
  language: "javascript",
  estimatedMinutes: 5,
  verifier: { kind: "runtime-required", spec: "local-runtime-executor" },
  createdAt: "2026-09-27T00:00:00.000Z",
};
function attempt(response: string): CodingAttempt {
  return {
    version: 1,
    id: "coding-attempt-local-verifier",
    userId: principal.userId,
    exerciseId: exercise.id,
    clientRequestId: "local-verifier-request",
    response,
    submittedAt: "2026-09-27T00:00:00.000Z",
    revealedBeforeSubmit: false,
    practiceResult: { status: "environment-required", artifactRefs: [], executorId: "none", policyRef: "local-runtime-executor" },
  };
}

test("local coding syntax verifier emits a durable receipt for valid JavaScript without claiming correctness", async () => {
  const verifier = createLocalCodingSyntaxVerifier({ timeoutMs: 5_000 });
  const initial = attempt("const answer = 1;");
  const result = await verifier({
    principal,
    exercise,
    attempt: initial,
    complete: async (practiceResult) => ({ ...initial, practiceResult }),
  });

  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.equal(result.attempt.practiceResult.status, "syntax-verified");
  assert.equal(result.attempt.practiceResult.receipt.checkKind, "syntax-only");
  assert.equal(result.attempt.practiceResult.receipt.passed, true);
  assert.deepEqual(result.attempt.practiceResult.artifactRefs, [`coding-syntax:${initial.id}`]);
});

test("local coding syntax verifier reports invalid JavaScript and leaves unsupported languages waiting", async () => {
  const verifier = createLocalCodingSyntaxVerifier({ timeoutMs: 5_000 });
  const invalid = await verifier({
    principal,
    exercise,
    attempt: attempt("const = ;"),
    complete: async (practiceResult) => ({ ...attempt("const = ;"), practiceResult }),
  });
  assert.equal(invalid.status, "completed");
  if (invalid.status === "completed") assert.equal(invalid.attempt.practiceResult.status, "syntax-invalid");

  const unsupported = await verifier({
    principal,
    exercise: { ...exercise, language: "typescript" },
    attempt: attempt("const answer: number = 1;"),
    complete: async (practiceResult) => ({ ...attempt("const answer: number = 1;"), practiceResult }),
  });
  assert.equal(unsupported.status, "waiting");
});
