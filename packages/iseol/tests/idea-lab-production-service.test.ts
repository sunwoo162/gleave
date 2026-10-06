import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessEvidenceRecord, HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import type { IdeaProposal, PrototypeProduction } from "../src/idea-lab/contracts.js";
import { createFakePrototypeDeployAdapter } from "../src/idea-lab/test-support/fake-deploy-adapter.js";
import {
  deployPrototypeProduction,
  materializePrototypeCandidate,
  prototypeDeploymentKey,
  verifyPrototypeProductionDeployment,
} from "../src/idea-lab/production-service.js";
import { loadPrototypeCandidate, savePrototypeCandidate } from "../src/project-model/prototype-store.js";
import { withDurablePrototypeLock } from "../src/project-model/prototype-lock.js";

const NOW = "2026-09-08T04:00:00.000Z";
const COMMIT = "a".repeat(40);

function evidence(kind: HarnessEvidenceRecord["kind"], stage: HarnessEvidenceRecord["stage"]): HarnessEvidenceRecord {
  return { version: 1, id: `${stage}-${kind}`, kind, stage, recordedAt: NOW, summary: `${kind} ok` };
}
function production(overrides: Partial<PrototypeProduction> = {}): PrototypeProduction {
  return {
    version: 1, id: "prod-1", campaignId: "camp-1", proposalId: "proposal-1", runId: "run-1",
    repositoryUrl: "https://example.invalid/sandbox.git", sandboxRoot: "C:/sandbox",
    worktreeRoot: "C:/sandbox/worktrees/camp-1/prod-1", branch: "idea/camp-1/prod-1", baseRef: "main",
    commitSha: COMMIT, status: "deploying", createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

function proposal(): IdeaProposal {
  return {
    version: 1, id: "proposal-1", campaignId: "camp-1", title: "Focus Garden", concept: "Grow focus sessions",
    problemDomain: "study", targetUser: "students", jobToBeDone: "focus", coreInteractionLoop: "plan-focus-review",
    dataModel: "sessions", primaryDifferentiator: "garden feedback", whyMateriallyDifferent: "behavior loop",
    status: "accepted", createdAt: NOW,
  };
}

function completedRun(mode: "idea-lab" | "project-workspace" = "idea-lab"): HarnessRuntimeRunEnvelope {
  const evidenceSet = [
    evidence("test", "TEST"), evidence("review", "SELF_REVIEW"), evidence("commit", "COMMIT"),
    evidence("deployment", "DEPLOY"), evidence("production-verification", "PRODUCTION_VERIFY"),
  ];
  return {
    version: 1, request: { version: 1, runId: "run-1", mode, objective: "build prototype", targetRoot: "C:/sandbox/worktree" },
    preflight: { version: 1, runId: "run-1", status: "ready", policy: { version: 1, loadedAt: NOW, sources: [], effectiveSha256: "f".repeat(64) } },
    state: { version: 1, stage: "DONE", status: "DONE", completedStages: ["PREFLIGHT","CONTEXT","ANALYZE","PLAN","IMPLEMENT","TEST","SELF_REVIEW","COMMIT","DEPLOY","PRODUCTION_VERIFY"], skippedStages: [{ stage: "PR", reason: "preview", at: NOW }, { stage: "CI", reason: "preview", at: NOW }, { stage: "MERGE", reason: "preview", at: NOW }], updatedAt: NOW },
    evidence: evidenceSet, updatedAt: NOW,
  };
}
test("deployment identity is stable and lost response reconciles without duplicate deploy", async () => {
  const fake = createFakePrototypeDeployAdapter({ loseFirstResponse: true, now: () => NOW });
  const item = production();
  assert.equal(prototypeDeploymentKey(item), `prototype:camp-1:prod-1:${COMMIT}`);
  await assert.rejects(() => deployPrototypeProduction(item, fake), /response lost/i);
  const recovered = await deployPrototypeProduction(item, fake);
  assert.equal(fake.deployCalls.length, 1);
  assert.equal(recovered.commitSha, COMMIT);
  assert.equal(recovered.url, "https://preview.invalid/prod-1");
});

test("verified deployment must match the captured commit", async () => {
  const fake = createFakePrototypeDeployAdapter({ now: () => NOW });
  const item = production();
  const deployed = await deployPrototypeProduction(item, fake);
  const verified = await verifyPrototypeProductionDeployment(item, deployed, fake);
  assert.equal(verified.verifiedAt, NOW);
  await assert.rejects(
    () => verifyPrototypeProductionDeployment(item, { ...deployed, commitSha: "b".repeat(40) }, fake),
    /commit mismatch/i,
  );
});

test("candidate materialization requires completed Idea Lab evidence and exact deployment commit", async () => {
  const modelRoot = await mkdtemp(join(tmpdir(), "iseol-idea-materialize-"));
  const verified = { provider: "fake-preview", deploymentId: "dep-prod-1", url: "https://preview.invalid/prod-1", commitSha: COMMIT, deployedAt: NOW, verifiedAt: NOW };
  await assert.rejects(() => materializePrototypeCandidate({ modelRoot, production: production(), proposal: proposal(), run: completedRun("project-workspace"), deployment: verified, at: NOW }), /idea-lab/i);
  await assert.rejects(() => materializePrototypeCandidate({ modelRoot, production: production(), proposal: proposal(), run: completedRun(), deployment: { ...verified, commitSha: "b".repeat(40) }, at: NOW }), /commit mismatch/i);
  const candidate = await materializePrototypeCandidate({ modelRoot, production: production(), proposal: proposal(), run: completedRun(), deployment: verified, at: NOW });
  assert.equal(candidate.id, "prod-1");
  assert.deepEqual(candidate.ideaLabOrigin, { campaignId: "camp-1", proposalId: "proposal-1", productionId: "prod-1" });
  assert.deepEqual(await loadPrototypeCandidate(modelRoot, "prod-1"), candidate);
});

test("candidate materialization rejects unsafe verified deployment URLs", async () => {
  const modelRoot = await mkdtemp(join(tmpdir(), "iseol-idea-materialize-url-"));
  const verified = { provider: "fake-preview", deploymentId: "dep-prod-1", url: "https://preview.invalid/prod-1", commitSha: COMMIT, deployedAt: NOW, verifiedAt: NOW };
  for (const url of [
    "https://preview.invalid/prod-1?access_token=secret-value",
    "https://preview.invalid/prod-1#oauth_token=secret-value",
    "javascript:alert(1)",
    "//attacker.example/preview",
  ]) {
    await assert.rejects(
      () => materializePrototypeCandidate({ modelRoot, production: production(), proposal: proposal(), run: completedRun(), deployment: { ...verified, url }, at: NOW }),
      /URL|credential|preview/i,
      url,
    );
  }
});
test("candidate materialization is idempotent and rejects conflicting immutable identity", async () => {
  const modelRoot = await mkdtemp(join(tmpdir(), "iseol-idea-materialize-idempotent-"));
  const verified = { provider: "fake-preview", deploymentId: "dep-prod-1", url: "https://preview.invalid/prod-1", commitSha: COMMIT, deployedAt: NOW, verifiedAt: NOW };
  const input = { modelRoot, production: production(), proposal: proposal(), run: completedRun(), deployment: verified, at: NOW };
  const first = await materializePrototypeCandidate(input);
  const second = await materializePrototypeCandidate(input);
  assert.deepEqual(second, first);
  await savePrototypeCandidate(modelRoot, {
    ...first,
    repository: { ...first.repository, commitSha: "c".repeat(40) },
  });
  await assert.rejects(() => materializePrototypeCandidate(input), /identity conflict/i);
});

test("candidate materialization waits for the durable prototype lock", async () => {
  const modelRoot = await mkdtemp(join(tmpdir(), "iseol-idea-materialize-lock-"));
  const verified = { provider: "fake-preview", deploymentId: "dep-prod-1", url: "https://preview.invalid/prod-1", commitSha: COMMIT, deployedAt: NOW, verifiedAt: NOW };
  const input = { modelRoot, production: production(), proposal: proposal(), run: completedRun(), deployment: verified, at: NOW };
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurablePrototypeLock(modelRoot, "prod-1", async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;
  let settled = false;
  const materialization = materializePrototypeCandidate(input);
  void materialization.then(() => { settled = true; }, () => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  releaseHolder();
  assert.equal((await materialization).id, "prod-1");
});
