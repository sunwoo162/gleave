import assert from "node:assert/strict";
import test from "node:test";
import { aggregateCiFindings } from "../src/services/review/ci-review-aggregate.js";
import { ciReviewArtifactSchema } from "../src/services/review/ci-review-types.js";

const baseArtifact = {
  schemaVersion: 1 as const,
  repository: "org/repo",
  pullNumber: 12,
  headSha: "abc123",
  generatedAt: new Date().toISOString(),
  checks: [{ name: "eslint", status: "passed" as const }],
  findings: [],
};

test("ci review artifact schema rejects invalid contracts", () => {
  assert.equal(ciReviewArtifactSchema.safeParse(baseArtifact).success, true);
  assert.equal(ciReviewArtifactSchema.safeParse({ ...baseArtifact, schemaVersion: 2 }).success, false);
  assert.equal(ciReviewArtifactSchema.safeParse({ ...baseArtifact, pullNumber: 0 }).success, false);
});

test("aggregate keeps changed lines, removes style noise, and collapses cross-tool duplicates", () => {
  const artifact = {
    ...baseArtifact,
    findings: [
      {
        tool: "eslint",
        filePath: "src/auth.ts",
        line: 10,
        severity: "major" as const,
        category: "correctness" as const,
        confidence: 0.86,
        explanation: "이 Promise가 처리되지 않았습니다.",
        suggestion: "await fetchUser();",
        ruleId: "@typescript-eslint/no-floating-promises",
      },
      {
        tool: "typescript",
        filePath: "src/auth.ts",
        line: 10,
        severity: "major" as const,
        category: "correctness" as const,
        confidence: 0.9,
        explanation: "Promise 반환값이 처리되지 않아 실행 순서가 보장되지 않습니다.",
        ruleId: "ts-promise",
      },
      {
        tool: "eslint",
        filePath: "src/auth.ts",
        line: 11,
        severity: "minor" as const,
        category: "maintainability" as const,
        confidence: 0.99,
        explanation: "Missing semicolon.",
        ruleId: "semi",
      },
      {
        tool: "eslint",
        filePath: "src/old.ts",
        line: 50,
        severity: "major" as const,
        category: "correctness" as const,
        confidence: 0.95,
        explanation: "이번 diff 밖의 문제입니다.",
      },
    ],
  };

  const result = aggregateCiFindings(artifact, new Set(["src/auth.ts:10", "src/auth.ts:11"]));
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.filePath, "src/auth.ts");
  assert.equal(result.findings[0]?.line, 10);
  assert.ok((result.findings[0]?.confidence ?? 0) > 0.9);
});

test("aggregate preserves high-confidence security findings and caps ordinary comments at five", () => {
  const findings = Array.from({ length: 7 }, (_, index) => ({
    tool: "eslint",
    filePath: "src/file.ts",
    line: index + 1,
    severity: "major" as const,
    category: "correctness" as const,
    confidence: 0.95,
    explanation: `실제 오류 ${index + 1}`,
  }));
  findings.push({
    tool: "gitleaks",
    filePath: "src/secret.ts",
    line: 20,
    severity: "critical" as const,
    category: "security" as const,
    confidence: 0.99,
    explanation: "민감정보로 보이는 값이 소스에 직접 포함되어 있습니다.",
  });

  const changed = new Set([
    ...Array.from({ length: 7 }, (_, index) => `src/file.ts:${index + 1}`),
    "src/secret.ts:20",
  ]);
  const result = aggregateCiFindings({ ...baseArtifact, findings }, changed);
  assert.equal(result.findings.length, 5);
  assert.equal(result.findings[0]?.category, "security");
  assert.equal(result.findings[0]?.severity, "critical");
});
