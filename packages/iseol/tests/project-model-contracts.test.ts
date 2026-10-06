import assert from "node:assert/strict";
import test from "node:test";
import type { PrototypeCandidate } from "../src/project-model/contracts.js";
import {
  ISEOL_PROJECT_MODEL_VERSION,
  assertProjectModelId,
  assertPromotionReadyPrototype,
} from "../src/project-model/contracts.js";

test("project model ids reject unsafe path-like values", () => {
  assert.equal(ISEOL_PROJECT_MODEL_VERSION, 1);
  for (const valid of ["prototype-001", "project-abc_123", "root"]) {
    assert.doesNotThrow(() => assertProjectModelId(valid));
  }
  for (const invalid of ["", " ", "../escape", "a/b", "a\\b", ".hidden"]) {
    assert.throws(() => assertProjectModelId(invalid), /Invalid Iseol Project Model id/);
  }
});

test("promotion-ready prototype preserves exact repository and deployment identity", () => {
  const candidate: PrototypeCandidate = {
    version: 1,
    id: "prototype-001",
    title: "Study Race",
    concept: "Compete on focused study time",
    repository: {
      url: "https://github.com/example/study-race",
      branch: "main",
      commitSha: "abc123def456",
    },
    deployment: {
      url: "https://study-race.example.com",
      provider: "vercel",
      deploymentId: "dpl_123",
    },
    runIds: ["run-001"],
    status: "candidate",
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
  };

  assert.doesNotThrow(() => assertPromotionReadyPrototype(candidate));
  assert.equal(candidate.repository.branch, "main");
  assert.equal(candidate.repository.commitSha, "abc123def456");
  assert.equal(candidate.deployment.url, "https://study-race.example.com");
});

test("promotion-ready prototype rejects incomplete immutable identity", () => {
  const invalid = {
    version: 1,
    id: "prototype-001",
    title: "Broken",
    concept: "fixture",
    repository: { url: "https://github.com/example/repo", branch: "", commitSha: "" },
    deployment: { url: "" },
    runIds: [],
    status: "candidate",
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
  } as PrototypeCandidate;

  assert.throws(
    () => assertPromotionReadyPrototype(invalid),
    /repository branch|repository commit|deployment url/i,
  );
});
