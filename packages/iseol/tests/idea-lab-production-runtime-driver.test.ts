import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createIdeaLabProductionRuntimeDriver } from "../src/idea-lab/production-runtime-driver.js";
import type { IdeaProposal } from "../src/idea-lab/contracts.js";
import { saveHarnessRun } from "../src/harness/run-store.js";
import { listPrototypeCandidates } from "../src/project-model/prototype-store.js";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import { saveIdeaProposal } from "../src/idea-lab/proposal-store.js";
import { createFakePrototypeDeployAdapter } from "../src/idea-lab/test-support/fake-deploy-adapter.js";
import { loadPrototypeCandidate } from "../src/project-model/prototype-store.js";
import { loadPrototypeProduction, savePrototypeProduction } from "../src/idea-lab/production-store.js";
import { withDurableIdeaLabProductionLock } from "../src/idea-lab/production-lock.js";
import { createFakeChatGptWebBrowserAdapter } from "../src/chatgpt-web/test-support/fake-browser-adapter.js";
import { loadDesktopIntent, recordDesktopIntent } from "../src/chatgpt-web/intent-store.js";
import { saveIdeaLabCampaign } from "../src/idea-lab/campaign-store.js";
import { buildIdeaLabView } from "../src/web-control-plane/view-model.js";
import { findDesktopJobByIdempotencyKey } from "../src/desktop-agent/job-store.js";
import { createPlaywrightChatGptBrowserDriver } from "../src/chatgpt-web/playwright-browser-driver.js";
import { createProductionChatGptWebAdapter } from "../src/chatgpt-web/production-browser-adapter.js";

test("createProduction is durable and reconciles the same Run and sandbox", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-"));
  const calls: string[] = [];
  const proposal: IdeaProposal = {
    version: 1, id: "proposal-1", campaignId: "camp-1", title: "Focus Garden", concept: "Focus",
    problemDomain: "study", targetUser: "students", jobToBeDone: "focus", coreInteractionLoop: "plan-review",
    dataModel: "sessions", primaryDifferentiator: "feedback", whyMateriallyDifferent: "loop", status: "accepted",
    createdAt: "2026-09-11T00:00:00.000Z",
  };
  const sandbox = {
    inspect: async () => null,
    allocate: async (input: { run: { request: { targetRoot: string } } }) => {
      calls.push(input.run.request.targetRoot);
      return { repositoryUrl: "https://github.com/acme/proto", branch: "idea/camp-1/camp-1-prod-1", worktreeRoot: input.run.request.targetRoot, baseRef: "main" };
    },
  };
  const driver = createIdeaLabProductionRuntimeDriver({
    roots: { iseolRoot: root, modelRoot: root, runRoot: root, webRoot: root, browserProfileRoot: root },
    repositoryRoot: root, repositoryUrl: "https://github.com/acme/proto", baseRef: "main", sandboxRoot: root,
    agentId: "agent-1", sandboxAdapter: sandbox, desktopTransport: {} as never, browserAdapter: {} as never,
    desktopStateRoot: root,
    desktopTaskCompiler: async () => null,
    deployAdapter: {} as never,
  });
  const first = await driver.createProduction(proposal, 1);
  const second = await driver.createProduction(proposal, 1);
  assert.equal(first.id, "camp-1-prod-1");
  assert.equal(first.runId, "run-camp-1-prod-1");
  assert.deepEqual(second, first);
  assert.equal(calls.length, 1);
  assert.equal(resolve(root, "camp-1", first.id), resolve(root, "camp-1", first.id));
});

test("advanceProduction waits for the durable cross-service production lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-lock-"));
  const proposal = baseProposal("camp-driver-lock");
  const driver = makeDriver(root, { proposal });
  const production = await driver.createProduction(proposal, 1);
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurableIdeaLabProductionLock(root, production.id, async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;
  let settled = false;
  const advancement = driver.advanceProduction(production);
  void advancement.then(() => { settled = true; }, () => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  releaseHolder();
  await assert.rejects(advancement, /production dependency is missing/);
});

test("createProduction waits for the durable cross-service production lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-create-lock-"));
  const proposal = baseProposal("camp-driver-create-lock");
  const driver = makeDriver(root, { proposal });
  const productionId = `${proposal.campaignId}-prod-1`;
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurableIdeaLabProductionLock(root, productionId, async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;
  let settled = false;
  const creation = driver.createProduction(proposal, 1);
  void creation.then(() => { settled = true; }, () => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  releaseHolder();
  assert.equal((await creation).id, productionId);
});

test("uses configured target identity and desktop state root", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-target-"));
  const seen: unknown[] = [];
  const proposal = { ...baseProposal("camp-target"), id: "proposal-target" };
  const driver = makeDriver(root, {
    proposal,
    repositoryRoot: root + "-repo", repositoryUrl: "https://github.com/acme/target", baseRef: "develop", desktopStateRoot: join(root, "desktop-state"),
    sandbox: { inspect: async (input: any) => { seen.push(input); return null; }, allocate: async (input: any) => ({ repositoryUrl: input.repositoryUrl, branch: "idea/camp-target/camp-target-prod-1", worktreeRoot: input.run.request.targetRoot, baseRef: input.baseRef }) },
  });
  await driver.createProduction(proposal, 1);
  assert.equal((seen[0] as any).repositoryRoot, root + "-repo");
  assert.equal((seen[0] as any).repositoryUrl, "https://github.com/acme/target");
  assert.equal((seen[0] as any).baseRef, "develop");
  assert.equal((seen[0] as any).agentId, "agent-1");
  assert.equal((seen[0] as any).run.request.targetRoot, resolve(root, "camp-target", "camp-target-prod-1"));
});

test("createProduction preserves an advanced canonical Run without reallocating", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-advanced-"));
  const proposal = baseProposal("camp-advanced"); let allocations = 0;
  const driver = makeDriver(root, { proposal, sandbox: { inspect: async () => null, allocate: async (input: any) => { allocations++; return { repositoryUrl: input.repositoryUrl, branch: "idea/camp-advanced/camp-advanced-prod-1", worktreeRoot: input.run.request.targetRoot, baseRef: input.baseRef }; } } });
  const first = await driver.createProduction(proposal, 1); const { loadHarnessRun } = await import("../src/harness/run-store.js");
  const run = await loadHarnessRun(root, first.runId); await saveHarnessRun(root, { ...run!, state: { ...run!.state, stage: "TEST", status: "READY", completedStages: ["CONTEXT", "ANALYZE", "PLAN", "IMPLEMENT", "TEST"] } });
  const second = await driver.createProduction(proposal, 1); const saved = await loadHarnessRun(root, first.runId);
  assert.equal(second.runId, first.runId); assert.equal(saved?.state.status, "READY"); assert.equal(allocations, 1);
});

test("rejects a mismatched canonical Run before allocation", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-run-mismatch-")); const proposal = baseProposal("camp-run-mismatch"); let allocations = 0;
  const driver = makeDriver(root, { proposal, sandbox: { inspect: async () => null, allocate: async (input: any) => { allocations++; return { repositoryUrl: input.repositoryUrl, branch: "idea/camp-run-mismatch/camp-run-mismatch-prod-1", worktreeRoot: input.run.request.targetRoot, baseRef: input.baseRef }; } } });
  const first = await driver.createProduction(proposal, 1); const { loadHarnessRun, saveHarnessRun } = await import("../src/harness/run-store.js"); const original = await loadHarnessRun(root, first.runId); await saveHarnessRun(root, { ...original!, request: { ...original!.request, objective: "wrong", targetRoot: join(root, "wrong") } });
  await assert.rejects(() => driver.createProduction(proposal, 1), /Run identity mismatch/i); assert.equal(allocations, 1);
});

test("rejects a Run whose internal runId disagrees with its canonical path", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-run-id-mismatch-"));
  const proposal = baseProposal("camp-run-id-mismatch");
  const driver = makeDriver(root, { proposal });
  const production = await driver.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);
  const { loadHarnessRun } = await import("../src/harness/run-store.js");
  const run = await loadHarnessRun(root, production.runId);
  assert.ok(run);
  const corrupted = { ...run, request: { ...run.request, runId: "run-other" } };
  await import("node:fs/promises").then(({ writeFile }) => writeFile(join(root, production.runId, "run.json"), JSON.stringify(corrupted, null, 2), "utf8"));
  await assert.rejects(() => driver.createProduction(proposal, 1), /Run identity mismatch/i);
  await assert.rejects(() => driver.advanceProduction(production), /Run identity mismatch/i);
});
test("missing proposal and missing Run fail closed independently", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-missing-")); const proposal = baseProposal("camp-missing"); const driver = makeDriver(root, { proposal });
  const production = await driver.createProduction(proposal, 1); await assert.rejects(() => driver.advanceProduction({ ...production, proposalId: "missing-proposal" }), /dependency is missing/);
  await saveIdeaProposal(root, proposal); const { loadHarnessRun } = await import("../src/harness/run-store.js"); const run = await loadHarnessRun(root, production.runId); await import("node:fs/promises").then(({ rm }) => rm(join(root, production.runId, "run.json"), { force: true }));
  assert.ok(run); await assert.rejects(() => driver.advanceProduction(production), /dependency is missing/);
});

test("FAILED_FINAL is persisted and sanitized", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-failed-")); const proposal = baseProposal("camp-failed"); const driver = makeDriver(root, { proposal }); const production = await driver.createProduction(proposal, 1); await saveIdeaProposal(root, proposal);
  const { loadHarnessRun } = await import("../src/harness/run-store.js"); const run = await loadHarnessRun(root, production.runId); await saveHarnessRun(root, { ...run!, state: { ...run!.state, status: "FAILED_FINAL", reason: "SECRET_TOKEN failure" } });
  const result = await driver.advanceProduction(production); const loaded = await loadPrototypeProduction(root, production.id); assert.equal(result.status, "failed"); assert.equal(loaded?.status, "failed"); assert.ok(result.failureSummary && result.failureSummary.length < 120); assert.ok(!JSON.stringify(result).includes("SECRET_TOKEN"));
});

test("lost deploy response recovers once and materializes persisted candidate", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-lost-")); const proposal = baseProposal("camp-lost"); const fake = createFakePrototypeDeployAdapter({ loseFirstResponse: true, now: () => "2026-09-11T00:00:00.000Z" }); const driver = makeDriver(root, { proposal, deployAdapter: fake }); const production = await driver.createProduction(proposal, 1); await saveIdeaProposal(root, proposal);
  const { loadHarnessRun } = await import("../src/harness/run-store.js"); const run = await loadHarnessRun(root, production.runId); const sha = "c".repeat(40); await saveHarnessRun(root, { ...run!, preflight: { version: 1, runId: run!.request.runId, status: "ready", policy: { version: 1, loadedAt: "now", sources: [], effectiveSha256: "policy" } }, state: { ...run!.state, stage: "DEPLOY", status: "READY", completedStages: ["CONTEXT", "ANALYZE", "PLAN", "IMPLEMENT", "TEST", "SELF_REVIEW", "COMMIT"] }, evidence: [{ version: 1, id: "test", kind: "test", stage: "TEST", recordedAt: "now", summary: "tested" }, { version: 1, id: "review", kind: "review", stage: "SELF_REVIEW", recordedAt: "now", summary: "reviewed" }, { version: 1, id: "commit", kind: "commit", stage: "COMMIT", recordedAt: "now", summary: "committed", reference: sha }] });
  await assert.rejects(
    () => driver.advanceProduction(production),
    /Idea Lab Harness retryable failure; yield campaign supervision for recovery/,
  );
  const result = await driver.advanceProduction(production); const saved = await loadPrototypeProduction(root, production.id); assert.equal(result.status, "ready"); assert.equal(fake.deployCalls.length, 1); assert.equal(saved?.id, production.id); assert.equal((await loadPrototypeCandidate(root, production.id))?.ideaLabOrigin?.productionId, production.id);
});

test("existing Production with missing canonical Run fails closed without recreating Run", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-missing-run-reuse-"));
  const proposal = baseProposal("camp-missing-run-reuse");
  let allocations = 0;
  const driver = makeDriver(root, { proposal, sandbox: {
    inspect: async () => null,
    allocate: async (input: any) => {
      allocations += 1;
      return { repositoryUrl: input.repositoryUrl, branch: "idea/camp-missing-run-reuse/camp-missing-run-reuse-prod-1", worktreeRoot: input.run.request.targetRoot, baseRef: input.baseRef };
    },
  } });
  const production = await driver.createProduction(proposal, 1);
  await import("node:fs/promises").then(({ rm }) => rm(join(root, production.runId, "run.json"), { force: true }));
  await assert.rejects(() => driver.createProduction(proposal, 1), /Run.*missing|dependency is missing/i);
  const { loadHarnessRun } = await import("../src/harness/run-store.js");
  assert.equal(await loadHarnessRun(root, production.runId), null);
  assert.equal(allocations, 1);
});
test("rejects a mismatched existing production identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-mismatch-"));
  const proposal = baseProposal("camp-mismatch");
  const driver = makeDriver(root, { proposal });
  const first = await driver.createProduction(proposal, 1);
  await (await import("../src/idea-lab/production-store.js")).savePrototypeProduction(root, { ...first, branch: "wrong" });
  await assert.rejects(() => driver.createProduction(proposal, 1), /identity mismatch/i);
});

test("pre-completed DONE Run deploys once, materializes one candidate, and is ready", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-done-"));
  const proposal = baseProposal("camp-done");
  let deploys = 0;
  const sha = "a".repeat(40);
  const driver = makeDriver(root, { proposal, deployAdapter: {
    reconcile: async () => null,
    deploy: async (request: any) => { deploys += 1; return { provider: "test", deploymentId: "d1", url: "https://preview", commitSha: request.commitSha, deployedAt: "2026-09-11T00:00:00.000Z" }; },
    verify: async (request: any) => ({ ...request.deployment, verifiedAt: "2026-09-11T00:00:00.000Z" }),
  }});
  const production = await driver.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);
  const run = await import("../src/harness/run-store.js").then(({ loadHarnessRun }) => loadHarnessRun(root, production.runId));
  assert.ok(run);
  const done: HarnessRuntimeRunEnvelope = { ...run!, state: { ...run!.state, stage: "DONE", status: "DONE", completedStages: ["CONTEXT", "ANALYZE", "PLAN", "IMPLEMENT", "TEST", "SELF_REVIEW", "COMMIT", "DEPLOY", "PRODUCTION_VERIFY"], updatedAt: "now" }, evidence: [
    { version: 1, id: "commit", kind: "commit", stage: "COMMIT", recordedAt: "now", summary: "committed", reference: sha },
    { version: 1, id: "test", kind: "test", stage: "TEST", recordedAt: "now", summary: "tested" },
    { version: 1, id: "review", kind: "review", stage: "SELF_REVIEW", recordedAt: "now", summary: "reviewed" },
    { version: 1, id: "deploy", kind: "deployment", stage: "DEPLOY", recordedAt: "now", summary: "deployed", reference: "https://preview" },
    { version: 1, id: "verify", kind: "production-verification", stage: "PRODUCTION_VERIFY", recordedAt: "now", summary: "verified", reference: "https://preview" },
  ] };
  await saveHarnessRun(root, { ...done, preflight: { version: 1, runId: done.request.runId, status: "ready", policy: { version: 1, loadedAt: "now", sources: [], effectiveSha256: "policy" } } });
  const ready = await driver.advanceProduction(production);
  assert.equal(ready.status, "ready");
  assert.equal(ready.commitSha, sha);
  assert.equal(deploys, 1);
  assert.equal((await listPrototypeCandidates(root)).length, 1);
});

test("missing COMMIT evidence fails closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-commit-"));
  const proposal = baseProposal("camp-commit");
  const driver = makeDriver(root, { proposal });
  const production = await driver.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);
  const { loadHarnessRun } = await import("../src/harness/run-store.js");
  const run = await loadHarnessRun(root, production.runId);
  await saveHarnessRun(root, { ...run!, preflight: { version: 1, runId: run!.request.runId, status: "ready", policy: { version: 1, loadedAt: "now", sources: [], effectiveSha256: "policy" } }, state: { ...run!.state, stage: "DONE", status: "DONE", completedStages: ["COMMIT", "DEPLOY", "PRODUCTION_VERIFY"] }, evidence: [] });
  const failed = await driver.advanceProduction(production);
  assert.equal(failed.status, "failed");
  assert.equal(failed.failureSummary, "Harness production failed");
});

test("unknown provider failure fails closed with bounded generic text", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-safe-"));
  const proposal = baseProposal("camp-safe");
  const driver = makeDriver(root, { proposal, deployAdapter: { reconcile: async () => null, deploy: async () => { throw new Error("SECRET_PROVIDER_TOKEN"); }, verify: async () => { throw new Error("SECRET_PROVIDER_TOKEN"); } } });
  const production = await driver.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);
  const { loadHarnessRun } = await import("../src/harness/run-store.js");
  const run = await loadHarnessRun(root, production.runId);
  const sha = "b".repeat(40);
  await saveHarnessRun(root, { ...run!, preflight: { version: 1, runId: run!.request.runId, status: "ready", policy: { version: 1, loadedAt: "now", sources: [], effectiveSha256: "policy" } }, state: { ...run!.state, stage: "DEPLOY", status: "READY", completedStages: ["CONTEXT", "ANALYZE", "PLAN", "IMPLEMENT", "TEST", "SELF_REVIEW", "COMMIT"] }, evidence: [{ version: 1, id: "test", kind: "test", stage: "TEST", recordedAt: "now", summary: "tested" }, { version: 1, id: "review", kind: "review", stage: "SELF_REVIEW", recordedAt: "now", summary: "reviewed" }, { version: 1, id: "commit", kind: "commit", stage: "COMMIT", recordedAt: "now", summary: "committed", reference: sha }] });
  const result = await driver.advanceProduction(production);
  assert.equal(result.status, "failed");
  assert.ok(!JSON.stringify(result).includes("SECRET_PROVIDER_TOKEN"));
});

test("PRODUCTION_VERIFY reuses the persisted deployment without a second deploy", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-verify-reuse-"));
  const proposal = baseProposal("camp-verify-reuse");
  let deploys = 0;
  const driver = makeDriver(root, { proposal, deployAdapter: {
    reconcile: async () => null,
    deploy: async (request: any) => {
      deploys += 1;
      return { provider: "test", deploymentId: `d${deploys}`, url: "https://preview", commitSha: request.commitSha, deployedAt: "2026-09-12T00:00:00.000Z" };
    },
    verify: async (request: any) => ({ ...request.deployment, verifiedAt: "2026-09-12T00:00:01.000Z" }),
  }});
  const production = await driver.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);
  const { loadHarnessRun } = await import("../src/harness/run-store.js");
  const run = await loadHarnessRun(root, production.runId);
  const sha = "d".repeat(40);
  await saveHarnessRun(root, runnableAtDeploy(run!, sha));
  const ready = await driver.advanceProduction(production);
  assert.equal(ready.status, "ready");
  assert.equal(deploys, 1);
});

test("deployment identity mismatch fails final instead of retrying", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-provider-identity-"));
  const proposal = baseProposal("camp-provider-identity");
  let reconciles = 0;
  const driver = makeDriver(root, { proposal, deployAdapter: {
    reconcile: async (request: any) => {
      reconciles += 1;
      return { provider: "test", deploymentId: "foreign", url: "https://preview", commitSha: "e".repeat(40), deployedAt: "2026-09-12T00:00:00.000Z" };
    },
    deploy: async () => { throw new Error("must not deploy"); },
    verify: async () => { throw new Error("must not verify"); },
  }});
  const production = await driver.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);
  const { loadHarnessRun } = await import("../src/harness/run-store.js");
  const run = await loadHarnessRun(root, production.runId);
  await saveHarnessRun(root, runnableAtDeploy(run!, "f".repeat(40)));
  const failed = await driver.advanceProduction(production);
  assert.equal(failed.status, "failed");
  assert.equal(reconciles, 1);
});

test("provider stage missing canonical commit fails the Production final", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-provider-commit-"));
  const proposal = baseProposal("camp-provider-commit");
  const driver = makeDriver(root, { proposal });
  const production = await driver.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);
  const { loadHarnessRun } = await import("../src/harness/run-store.js");
  const run = await loadHarnessRun(root, production.runId);
  const broken = runnableAtDeploy(run!, "a".repeat(40));
  broken.evidence = broken.evidence.filter((item) => item.kind !== "commit");
  await saveHarnessRun(root, broken);
  const failed = await driver.advanceProduction(production);
  assert.equal(failed.status, "failed");
});

test("DONE finalization fails closed on deployment commit mismatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-finalize-mismatch-"));
  const proposal = baseProposal("camp-finalize-mismatch");
  const driver = makeDriver(root, { proposal, deployAdapter: {
    reconcile: async () => null,
    deploy: async () => ({ provider: "test", deploymentId: "bad", url: "https://preview", commitSha: "0".repeat(40), deployedAt: "2026-09-12T00:00:00.000Z" }),
    verify: async (request: any) => ({ ...request.deployment, verifiedAt: "2026-09-12T00:00:01.000Z" }),
  }});
  const production = await driver.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);
  const { loadHarnessRun } = await import("../src/harness/run-store.js");
  const run = await loadHarnessRun(root, production.runId);
  await saveHarnessRun(root, completedRun(run!, "9".repeat(40)));
  const failed = await driver.advanceProduction(production);
  assert.equal(failed.status, "failed");
});

test("DONE finalization rejects persisted deployment for a different commit without redeploying", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-persisted-deploy-mismatch-"));
  const proposal = baseProposal("camp-persisted-deploy-mismatch");
  let deploys = 0;
  const driver = makeDriver(root, { proposal, deployAdapter: {
    reconcile: async () => null,
    deploy: async (request: any) => {
      deploys += 1;
      return { provider: "test", deploymentId: "new", url: "https://new-preview", commitSha: request.commitSha, deployedAt: "2026-09-12T00:00:00.000Z" };
    },
    verify: async (request: any) => ({ ...request.deployment, verifiedAt: "2026-09-12T00:00:01.000Z" }),
  }});
  const production = await driver.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);
  await savePrototypeProduction(root, {
    ...production,
    commitSha: "8".repeat(40),
    deployment: { provider: "test", deploymentId: "old", url: "https://old-preview", commitSha: "8".repeat(40), deployedAt: "2026-09-11T00:00:00.000Z" },
    status: "verifying",
  });
  const { loadHarnessRun } = await import("../src/harness/run-store.js");
  const run = await loadHarnessRun(root, production.runId);
  await saveHarnessRun(root, completedRun(run!, "9".repeat(40)));
  const failed = await driver.advanceProduction(production);
  assert.equal(failed.status, "failed");
  assert.equal(deploys, 0);
});

test("ambiguous canonical COMMIT evidence fails final before deployment", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-ambiguous-commit-"));
  const proposal = baseProposal("camp-ambiguous-commit");
  let deploys = 0;
  const driver = makeDriver(root, { proposal, deployAdapter: {
    reconcile: async () => null,
    deploy: async (request: any) => {
      deploys += 1;
      return { provider: "test", deploymentId: "d", url: "https://preview", commitSha: request.commitSha, deployedAt: "2026-09-12T00:00:00.000Z" };
    },
    verify: async (request: any) => ({ ...request.deployment, verifiedAt: "2026-09-12T00:00:01.000Z" }),
  }});
  const production = await driver.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);
  const { loadHarnessRun } = await import("../src/harness/run-store.js");
  const run = await loadHarnessRun(root, production.runId);
  const ambiguous = runnableAtDeploy(run!, "1".repeat(40));
  ambiguous.evidence.push({ version: 1, id: "commit-ambiguous", kind: "commit", stage: "COMMIT", recordedAt: "later", summary: "other commit", reference: "2".repeat(40) });
  await saveHarnessRun(root, ambiguous);
  const failed = await driver.advanceProduction(production);
  assert.equal(failed.status, "failed");
  assert.equal(deploys, 0);
});


test("Idea Lab Web reasoning rejects commit intents before the canonical COMMIT stage", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-web-commit-"));
  const proposal = baseProposal("camp-web-commit");
  const bootstrap = makeDriver(root, { proposal });
  const production = await bootstrap.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);
  const { loadHarnessRun } = await import("../src/harness/run-store.js");
  const run = await loadHarnessRun(root, production.runId);
  assert.ok(run);

  const runId = production.runId;
  const intentId = "web-commit-intent";
  const policySha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const browser = createFakeChatGptWebBrowserAdapter([
    {
      version: 1, runId, stage: "IMPLEMENT", generation: 1, summary: "Commit too early", decisions: [], outcome: "continue",
      intents: [{
        version: 1, intentId, runId, stage: "IMPLEMENT", workspaceRoot: production.worktreeRoot, policySha256,
        kind: "REQUEST_COMMIT", cwd: ".", message: "feat: premature web commit",
      }],
    },
    {
      version: 1, runId, stage: "IMPLEMENT", generation: 1, summary: "Controlled stop", decisions: [], intents: [],
      outcome: "blocked-user", blockerReason: "stop after commit rejection",
    },
  ]);
  const driver = makeDriver(root, { proposal, browserAdapter: browser.adapter });
  await saveHarnessRun(root, {
    ...run,
    preflight: { version: 1, runId, status: "ready", policy: { version: 1, loadedAt: "now", sources: [], effectiveSha256: policySha256 } },
    state: { ...run.state, stage: "IMPLEMENT", status: "READY", completedStages: ["CONTEXT", "ANALYZE", "PLAN"] },
  });

  await driver.advanceProduction(production);

  const record = await loadDesktopIntent(root, runId, intentId);
  assert.equal(record?.status, "rejected");
  assert.match(record?.reason ?? "", /commit is not explicitly authorized/i);
});

test("Idea Lab restart hydrates completed Desktop output without rerunning the intent", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-web-recovery-feedback-"));
  const proposal = baseProposal("camp-web-recovery-feedback");
  const bootstrap = makeDriver(root, { proposal });
  const production = await bootstrap.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);
  const { loadHarnessRun } = await import("../src/harness/run-store.js");
  const run = await loadHarnessRun(root, production.runId);
  assert.ok(run);
  const runId = production.runId;
  const intentId = "analyze-read-package";
  const policySha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const at = "2026-09-14T11:00:00.000Z";
  const intent = { version: 1 as const, intentId, runId, stage: "ANALYZE" as const, workspaceRoot: production.worktreeRoot, policySha256, kind: "READ_CONTEXT" as const, path: "package.json" };
  const { appendReasoningTurn } = await import("../src/chatgpt-web/turn-store.js");
  const { recordDesktopIntent } = await import("../src/chatgpt-web/intent-store.js");
  const { createDesktopJob, acquireDesktopJobLease, completeDesktopJob, loadDesktopJob } = await import("../src/desktop-agent/job-store.js");
  await appendReasoningTurn(root, { version: 1, turnId: "turn-analyze-read", sessionId: "session-analyze-old", runId, stage: "ANALYZE", generation: 1, promptSha256: "a".repeat(64), responseSha256: "b".repeat(64), summary: "Read repository context", decisions: [], desktopIntentIds: [intentId], outcome: "continue", recordedAt: at });
  await recordDesktopIntent(root, { intent, status: "accepted", recordedAt: at });
  const jobId = "web-recovery-feedback-job";
  await createDesktopJob(root, { version: 1, jobId, runId, stage: "ANALYZE", attempt: 0, agentId: "agent-1", workspaceRoot: production.worktreeRoot, policyDigest: policySha256, policySources: [], idempotencyKey: `web-intent:${runId}:${intentId}`, leaseUntil: "2026-09-14T11:10:00.000Z", operations: [{ id: intentId, type: "READ_FILE", path: "package.json" }] }, at);
  await acquireDesktopJobLease(root, jobId, "test-owner", at, 60_000);
  await completeDesktopJob(root, jobId, "test-owner", { version: 1, jobId, runId, agentId: "agent-1", status: "completed", completedAt: "2026-09-14T11:00:01.000Z", operations: [{ operationId: intentId, ok: true, summary: "Read package.json", stdout: "{\"scripts\":{\"test\":\"node --test\"}}" }] });
  await saveHarnessRun(root, { ...run, preflight: { version: 1, runId, status: "ready", policy: { version: 1, loadedAt: at, sources: [], effectiveSha256: policySha256 } }, state: { ...run.state, stage: "ANALYZE", status: "READY", completedStages: ["CONTEXT"] } });
  const browser = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId, stage: "ANALYZE", generation: 1, summary: "Analysis complete", decisions: [], intents: [], outcome: "stage-complete" },
    { version: 1, runId, stage: "PLAN", generation: 1, summary: "Controlled stop", decisions: [], intents: [], outcome: "blocked-user", blockerReason: "stop after recovery verification" },
  ]);
  const driver = makeDriver(root, { proposal, browserAdapter: browser.adapter });
  await driver.advanceProduction(production);
  assert.equal(browser.submittedPrompts[0]?.kind, "feedback");
  assert.match(browser.submittedPrompts[0]!.body, /node --test/);
  assert.equal((await loadDesktopJob(root, jobId))?.attempts, 1);
});

test("recovered completed Desktop intent without a persisted turn feeds the same IMPLEMENT continuation", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-web-recovery-intent-"));
  const proposal = baseProposal("camp-web-recovery-intent");
  const bootstrap = makeDriver(root, { proposal });
  const production = await bootstrap.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);
  const { loadHarnessRun } = await import("../src/harness/run-store.js");
  const run = await loadHarnessRun(root, production.runId);
  assert.ok(run);
  const runId = production.runId;
  const intentId = "implement-recovered-patch";
  const policySha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const at = "2026-09-14T11:00:00.000Z";
  const intent = { version: 1 as const, intentId, runId, stage: "IMPLEMENT" as const, workspaceRoot: production.worktreeRoot, policySha256, kind: "PROPOSE_PATCH" as const, path: "tracker.js", patch: "diff --git a/tracker.js b/tracker.js\n--- a/tracker.js\n+++ b/tracker.js\n@@ -1 +1 @@\n-old\n+new\n" };
  await recordDesktopIntent(root, { intent, status: "accepted", recordedAt: at });
  const { createDesktopJob, acquireDesktopJobLease, completeDesktopJob, loadDesktopJob } = await import("../src/desktop-agent/job-store.js");
  const jobId = "web-recovered-intent-job";
  await createDesktopJob(root, { version: 1, jobId, runId, stage: "IMPLEMENT", attempt: 0, agentId: "agent-1", workspaceRoot: production.worktreeRoot, policyDigest: policySha256, policySources: [{ kind: "test", path: "policy", sha256: policySha256 }], idempotencyKey: `web-intent:${runId}:${intentId}`, leaseUntil: "2026-09-14T11:10:00.000Z", operations: [{ id: intentId, type: "APPLY_PATCH", path: "tracker.js", patch: intent.patch }] }, at);
  await acquireDesktopJobLease(root, jobId, "test-owner", at, 60_000);
  await completeDesktopJob(root, jobId, "test-owner", { version: 1, jobId, runId, agentId: "agent-1", status: "completed", completedAt: "2026-09-14T11:00:01.000Z", operations: [{ operationId: intentId, ok: true, summary: "Applied patch to tracker.js" }] });
  await saveHarnessRun(root, { ...run, preflight: { version: 1, runId, status: "ready", policy: { version: 1, loadedAt: at, sources: [], effectiveSha256: policySha256 } }, state: { ...run.state, stage: "IMPLEMENT", status: "READY", completedStages: ["CONTEXT", "ANALYZE", "PLAN"] } });
  const browser = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId, stage: "IMPLEMENT", generation: 1, summary: "Continue after recovered patch", decisions: [], intents: [], outcome: "blocked-user", blockerReason: "stop after recovery verification" },
  ]);
  const driver = makeDriver(root, { proposal, browserAdapter: browser.adapter });
  await driver.advanceProduction(production);
  assert.equal(browser.submittedPrompts[0]?.kind, "initial");
  assert.match(browser.submittedPrompts[0]!.body, /Applied patch to tracker\.js/);
  assert.equal((await loadDesktopJob(root, jobId))?.attempts, 1);
});
function runnableAtDeploy(run: HarnessRuntimeRunEnvelope, sha: string): HarnessRuntimeRunEnvelope {
  return {
    ...run,
    preflight: {
      version: 1,
      runId: run.request.runId,
      status: "ready",
      policy: { version: 1, loadedAt: "now", sources: [], effectiveSha256: "policy" },
    },
    state: {
      ...run.state,
      stage: "DEPLOY",
      status: "READY",
      completedStages: ["CONTEXT", "ANALYZE", "PLAN", "IMPLEMENT", "TEST", "SELF_REVIEW", "COMMIT"],
    },
    evidence: [
      { version: 1, id: "test-red", kind: "test", stage: "TEST", recordedAt: "now", summary: "tested" },
      { version: 1, id: "review-red", kind: "review", stage: "SELF_REVIEW", recordedAt: "now", summary: "reviewed" },
      { version: 1, id: "commit-red", kind: "commit", stage: "COMMIT", recordedAt: "now", summary: "committed", reference: sha },
    ],
  };
}

function completedRun(run: HarnessRuntimeRunEnvelope, sha: string): HarnessRuntimeRunEnvelope {
  const atDeploy = runnableAtDeploy(run, sha);
  return {
    ...atDeploy,
    state: {
      ...atDeploy.state,
      stage: "DONE",
      status: "DONE",
      completedStages: [...atDeploy.state.completedStages, "DEPLOY", "PRODUCTION_VERIFY"],
    },
    evidence: [
      ...atDeploy.evidence,
      { version: 1, id: "deploy-done", kind: "deployment", stage: "DEPLOY", recordedAt: "now", summary: "deployed", reference: "https://preview" },
      { version: 1, id: "verify-done", kind: "production-verification", stage: "PRODUCTION_VERIFY", recordedAt: "now", summary: "verified", reference: "https://preview" },
    ],
  };
}

function baseProposal(campaignId: string): IdeaProposal {
  return { version: 1, id: `proposal-${campaignId}`, campaignId, title: "Focus", concept: "Focus", problemDomain: "study", targetUser: "students", jobToBeDone: "focus", coreInteractionLoop: "plan", dataModel: "sessions", primaryDifferentiator: "feedback", whyMateriallyDifferent: "loop", status: "accepted", createdAt: "2026-09-11T00:00:00.000Z" };
}

function makeDriver(root: string, options: any = {}) {
  const proposal = options.proposal ?? baseProposal("camp-1");
  const repositoryRoot = options.repositoryRoot ?? root;
  return createIdeaLabProductionRuntimeDriver({
    roots: { iseolRoot: root, modelRoot: root, runRoot: root, webRoot: root, browserProfileRoot: root },
    repositoryRoot, repositoryUrl: options.repositoryUrl ?? "https://github.com/acme/proto", baseRef: options.baseRef ?? "main", sandboxRoot: root,
    agentId: "agent-1", desktopStateRoot: options.desktopStateRoot ?? root, sandboxAdapter: options.sandbox ?? { inspect: async () => null, allocate: async (input: any) => ({ repositoryUrl: input.repositoryUrl, branch: `idea/${input.campaignId}/${input.productionId}`, worktreeRoot: input.run.request.targetRoot, baseRef: input.baseRef }) }, desktopTransport: options.desktopTransport ?? {} as never, browserAdapter: options.browserAdapter ?? {} as never,
    desktopTaskCompiler: async () => null, deployAdapter: options.deployAdapter ?? {} as never,
  });
}


test("Idea Lab Desktop compiler emits a job id accepted by the durable job store", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-jobid-"));
  const { createIdeaLabProductionDesktopTaskCompiler } = await import("../src/idea-lab/production-desktop-compiler.js");
  const { createDesktopJob } = await import("../src/desktop-agent/job-store.js");
  const at = "2026-09-14T06:00:00.000Z";
  const runId = "run-camp-job-prod-1";
  const run: HarnessRuntimeRunEnvelope = {
    version: 1,
    request: { version: 1, runId, mode: "idea-lab", objective: "prototype", targetRoot: root },
    preflight: { version: 1, runId, status: "ready", policy: { version: 1, loadedAt: at, sources: [{ kind: "iseol-global", path: join(root, "HARNESS_ENGINEERING.md"), sha256: "a".repeat(64), content: "policy" }], effectiveSha256: "b".repeat(64) } },
    state: { version: 1, stage: "CONTEXT", status: "READY", completedStages: ["PREFLIGHT"], skippedStages: [], updatedAt: at },
    evidence: [], updatedAt: at,
  };
  const compiler = createIdeaLabProductionDesktopTaskCompiler({
    enabled: true, repositoryRoot: root, repositoryUrl: "https://github.com/acme/proto", baseRef: "main",
    sandboxRoot: root, agentId: "agent-1", testExecutable: "npm.cmd", testArgs: ["test"], testTimeoutMs: 120000,
  }, { now: () => at });
  const pack = await compiler(run, "agent-1");
  assert.ok(pack);
  await assert.doesNotReject(() => createDesktopJob(root, pack, at));
});

test("Idea Lab Web reasoning consumes an executed RED test failure as Desktop feedback", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-red-feedback-"));
  const proposal = baseProposal("camp-red-feedback");
  const bootstrap = makeDriver(root, { proposal });
  const production = await bootstrap.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);
  const { loadHarnessRun } = await import("../src/harness/run-store.js");
  const { registerDesktopAgent } = await import("../src/desktop-agent/agent-registry.js");
  const run = await loadHarnessRun(root, production.runId);
  assert.ok(run);
  const { createHash } = await import("node:crypto");
  const { writeFile } = await import("node:fs/promises");
  const policyPath = join(root, "HARNESS_ENGINEERING.md");
  const policyContent = "policy\n";
  await writeFile(policyPath, policyContent, "utf8");
  const policySourceSha256 = createHash("sha256").update(policyContent, "utf8").digest("hex");
  const policySha256 = createHash("sha256").update(`iseol-global\n${policyPath}\n${policySourceSha256}`, "utf8").digest("hex");
  await saveHarnessRun(root, { ...run, preflight: { version: 1, runId: production.runId, status: "ready", policy: { version: 1, loadedAt: new Date().toISOString(), sources: [{ kind: "iseol-global", path: policyPath, sha256: policySourceSha256, content: policyContent }], effectiveSha256: policySha256 } }, state: { ...run.state, stage: "IMPLEMENT", status: "READY", completedStages: ["CONTEXT", "ANALYZE", "PLAN"] } });
  await registerDesktopAgent(root, { version: 1, agentId: "agent-1", agentVersion: "test", os: "win32", capabilities: ["process"], workspaceRoots: [production.worktreeRoot], token: "not-persisted" }, new Date().toISOString());
  const intentId = "implement-run-red-test";
  const browser = createFakeChatGptWebBrowserAdapter([
    { version: 1, runId: production.runId, stage: "IMPLEMENT", generation: 1, summary: "Run RED", decisions: [], outcome: "continue", intents: [{ version: 1, intentId, runId: production.runId, stage: "IMPLEMENT", workspaceRoot: production.worktreeRoot, policySha256, kind: "RUN_TEST", cwd: ".", executable: "npm", args: ["test"], timeoutMs: 120000 }] },
    { version: 1, runId: production.runId, stage: "IMPLEMENT", generation: 1, summary: "Stop after RED feedback", decisions: [], intents: [], outcome: "blocked-user", blockerReason: "verified RED feedback" },
  ]);
  const transport = { isAgentConnected: () => true, getAgentSessionId: () => "session-red", sendTask: () => undefined, awaitResult: async (jobId: string) => ({ version: 1, jobId, runId: production.runId, agentId: "agent-1", status: "retryable-failure" as const, completedAt: new Date().toISOString(), operations: [{ operationId: intentId, ok: false, summary: "Ran npm exited with code 1", stdout: "RED test failed" }] }) };
  const driver = makeDriver(root, { proposal, browserAdapter: browser.adapter, desktopTransport: transport });
  await driver.advanceProduction(production);
  assert.equal(browser.submittedPrompts.length, 2);
  assert.equal(browser.submittedPrompts[1]?.kind, "feedback");
  assert.match(browser.submittedPrompts[1]?.body ?? "", /RED test failed/);
});


test("Idea Lab fails one production after the Web reasoning retry budget is exhausted", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-web-retry-budget-"));
  const proposal = baseProposal("camp-web-retry-budget");
  const bootstrap = makeDriver(root, { proposal });
  const production = await bootstrap.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);
  const { loadHarnessRun } = await import("../src/harness/run-store.js");
  const run = await loadHarnessRun(root, production.runId);
  assert.ok(run);
  await saveHarnessRun(root, {
    ...run,
    preflight: { version: 1, runId: production.runId, status: "ready", policy: { version: 1, loadedAt: "now", sources: [], effectiveSha256: "policy" }},
    state: { ...run.state, stage: "IMPLEMENT", status: "READY", completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN"] },
  });
  const { ChatGptWebStructuredResultError } = await import("../src/chatgpt-web/browser-adapter.js");
  const fake = createFakeChatGptWebBrowserAdapter(Array.from({ length: 60 }, () =>
    new ChatGptWebStructuredResultError("ChatGPT patch appendix end marker is missing"),
  ));
  const driver = makeDriver(root, { proposal, browserAdapter: fake.adapter });

  const result = await driver.advanceProduction(production);

  assert.equal(result.status, "failed");
  assert.equal(fake.submittedPrompts.length, 3);
  assert.equal((await loadPrototypeProduction(root, production.id))?.status, "failed");
});

test("Idea Lab validates a patch frame before runtime-owned PROPOSE_PATCH dispatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-patch-frame-dispatch-"));
  const proposal = baseProposal("camp-patch-frame-dispatch");
  const bootstrap = makeDriver(root, { proposal });
  const production = await bootstrap.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);
  const { loadHarnessRun } = await import("../src/harness/run-store.js");
  const { registerDesktopAgent } = await import("../src/desktop-agent/agent-registry.js");
  const run = await loadHarnessRun(root, production.runId);
  assert.ok(run);
  const policyPath = join(root, "HARNESS_ENGINEERING.md");
  const policyContent = "policy";
  await writeFile(policyPath, policyContent, "utf8");
  const policySourceSha256 = createHash("sha256").update(policyContent).digest("hex");
  const policySha256 = createHash("sha256").update(`project-harness\n${policyPath}\n${policySourceSha256}`).digest("hex");
  await saveHarnessRun(root, {
    ...run,
    preflight: { version: 1, runId: production.runId, status: "ready", policy: { version: 1, loadedAt: "now", sources: [{ kind: "project-harness", path: policyPath, sha256: policySourceSha256, content: policyContent }], effectiveSha256: policySha256 } },
    state: { ...run.state, stage: "IMPLEMENT", status: "READY", completedStages: ["CONTEXT", "ANALYZE", "PLAN"] },
  });
  await registerDesktopAgent(root, {
    version: 1, agentId: "agent-1", agentVersion: "test", os: "win32", capabilities: ["process"],
    workspaceRoots: [production.worktreeRoot], token: "not-persisted",
  }, new Date().toISOString());
  const rawPatch = [
    "diff --git a/app.js b/app.js", "--- a/app.js", "+++ b/app.js", "@@ -1 +1 @@", "-old", "+new", "",
  ].join("\r\n");
  const malformedPatch = rawPatch.replace("+new\r\n", "+new\r\n+unexpected\r\n");
  const browser = createFakeChatGptWebBrowserAdapter([
    malformedPatch,
    rawPatch,
    "ISEOL_IMPLEMENT_DONE",
  ]);
  const dispatched: any[] = [];
  const transport = {
    isAgentConnected: () => true,
    getAgentSessionId: () => "patch-frame-session",
    sendTask: (_agentId: string, pack: any) => { dispatched.push(pack); },
    awaitResult: async (jobId: string) => ({
      version: 1 as const, jobId, runId: production.runId, agentId: "agent-1", status: "completed" as const,
      completedAt: new Date().toISOString(), operations: [{ operationId: dispatched[0].operations[0].id, ok: true, summary: "Applied app.js" }],
    }),
  };
  const driver = makeDriver(root, { proposal, browserAdapter: browser.adapter, desktopTransport: transport });

  await driver.advanceProduction(production);

  assert.equal(dispatched.length, 1);
  const patchPromptContracts = browser.submittedPrompts.map((prompt) => JSON.parse(prompt.body).outputContract.contract);
  assert.deepEqual(
    patchPromptContracts,
    ["patch-frame-v1", "patch-frame-v1", "patch-frame-v1"],
  );
  assert.equal(browser.submittedPrompts.length, 3);
  assert.match(browser.submittedPrompts[1]?.body ?? "", /hunk line counts/i);
  assert.deepEqual(dispatched[0].operations[0], {
    id: dispatched[0].operations[0].id,
    type: "APPLY_PATCH",
    path: "app.js",
    patch: rawPatch.replaceAll("\r\n", "\n"),
  });
  assert.match(dispatched[0].operations[0].id, /^implement-patch-[0-9a-f]{24}$/);
  assert.equal((await loadDesktopIntent(root, production.runId, dispatched[0].operations[0].id))?.status, "accepted");
});

test("terminal patch-result rejection keeps a safe diagnostic on the canonical Run", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-patch-diagnostic-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "HARNESS_ENGINEERING.md"), "# Test Harness\n", "utf8");
  const proposal = baseProposal("camp-patch-diagnostic");
  const bootstrap = makeDriver(root, { proposal });
  const production = await bootstrap.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);
  const { loadHarnessRun } = await import("../src/harness/run-store.js");
  const run = await loadHarnessRun(root, production.runId);
  assert.ok(run);
  await saveHarnessRun(root, {
    ...run,
    state: { ...run.state, stage: "IMPLEMENT", status: "READY", completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN"] },
  });

  const intentId = "implement-read-app-js-001";
  const validFirstTurn = "invalid patch frame";
  const invalidPatchResult = validFirstTurn;
  let currentUrl = "https://chatgpt.com/";
  let assistantCount = 0;
  let assistantText: string | null = null;
  let responseIndex = 0;
  let clockMs = 0;
  const backend = {
    navigate: async (url: string) => { currentUrl = url; },
    currentUrl: async () => currentUrl,
    composerCount: async () => 1,
    authenticationRequiredCount: async () => 0,
    temporaryRestrictionCount: async () => 0,
    conversationLimitCount: async () => 0,
    usageLimitCount: async () => 0,
    fillComposer: async () => undefined,
    sendPrompt: async () => {
      responseIndex += 1;
      if (currentUrl === "https://chatgpt.com/") currentUrl = "https://chatgpt.com/c/diagnostic-conversation";
      assistantCount += 1;
      assistantText = responseIndex === 1 ? validFirstTurn : invalidPatchResult;
    },
    assistantMessageCount: async () => assistantCount,
    latestAssistantText: async () => assistantText,
    latestAssistantRawText: async () => assistantText,
    generationControlCount: async () => 0,
    closeOwnedPage: async () => undefined,
    dispose: async () => undefined,
  };
  const browserDriver = await createPlaywrightChatGptBrowserDriver(
    { enabled: true, profileRoot: join(root, "browser-profile"), headless: true },
    { backend, now: () => clockMs, sleep: async (ms: number) => { clockMs += ms; } } as any,
  );
  const browserAdapter = createProductionChatGptWebAdapter(browserDriver);
  const desktopTransport = {
    isAgentConnected: () => true,
    getAgentSessionId: () => "agent-session",
    sendTask: () => undefined,
    awaitResult: async (jobId: string) => ({
      version: 1 as const, jobId, runId: production.runId, agentId: "agent-1", status: "completed" as const,
      completedAt: "2026-09-16T00:00:01.000Z",
      operations: [{ operationId: intentId, ok: true, summary: "Read app.js", stdout: "export default {};" }],
    }),
  };
  await (await import("../src/desktop-agent/agent-registry.js")).registerDesktopAgent(root, {
    version: 1, agentId: "agent-1", agentVersion: "test", os: "win32", capabilities: ["process"],
    workspaceRoots: [production.worktreeRoot], token: "fixture-only-token",
  }, new Date().toISOString());
  await saveIdeaLabCampaign(root, {
    version: 1, id: proposal.campaignId, seed: proposal.concept, constraints: [], targetReadyCount: 1,
    productionConcurrency: 1, proposalIds: [proposal.id], productionIds: [production.id], status: "producing",
    createdAt: proposal.createdAt, updatedAt: proposal.createdAt,
  });
  const driver = makeDriver(root, { proposal, browserAdapter, desktopTransport });

  const result = await driver.advanceProduction(production);
  const finalRun = await loadHarnessRun(root, production.runId);
  const publicView = await buildIdeaLabView(root, root);

  assert.equal(result.status, "failed");
  assert.equal(finalRun?.state.status, "FAILED_FINAL");
  assert.match(finalRun?.state.reason ?? "", /rejected structured-result budget exhausted.*patch frame invalid: header missing or invalid/i);
  assert.ok((finalRun?.state.reason?.length ?? Infinity) <= 160);
  assert.equal(result.failureSummary, "Harness production failed");
  assert.equal(await findDesktopJobByIdempotencyKey(root, `web-intent:${production.runId}:${intentId}`), null);
  assert.equal(responseIndex, 3);
  assert.doesNotMatch(JSON.stringify(publicView), /patch appendix|end marker|rejected structured-result/i);
  assert.doesNotMatch(JSON.stringify(finalRun?.state.reason), /app\.js|fixture-only-token|@@ISEOL_PATCH|secret/i);
});

test("WAITING_AGENT production resumes the same Run after Desktop Agent reconnects", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-waiting-agent-recovery-"));
  const proposal = baseProposal("camp-waiting-agent-recovery");
  const expectedRunId = "run-camp-waiting-agent-recovery-prod-1";
  const at = "2026-09-17T10:00:00.000Z";
  const policySha256 = createHash("sha256").update("").digest("hex");

  const browser = createFakeChatGptWebBrowserAdapter([
    {
      version: 1,
      runId: expectedRunId,
      stage: "ANALYZE",
      generation: 1,
      summary: "Recovery reached reasoning again",
      decisions: [],
      intents: [],
      outcome: "blocked-user",
      blockerReason: "stop after WAITING_AGENT recovery verification",
    },
  ]);

  const desktopTransport = {
    isAgentConnected: (agentId: string) => agentId === "agent-1",
    getAgentSessionId: (agentId: string) => agentId === "agent-1" ? "session-reconnected" : null,
    sendTask: () => {
      throw new Error("unexpected Desktop dispatch");
    },
    awaitResult: async () => {
      throw new Error("unexpected Desktop result wait");
    },
  };

  const sandbox = {
    inspect: async () => null,
    allocate: async (input: any) => ({
      repositoryUrl: input.repositoryUrl,
      branch: `idea/${proposal.campaignId}/${proposal.campaignId}-prod-1`,
      worktreeRoot: input.run.request.targetRoot,
      baseRef: input.baseRef,
    }),
  };

  const driver = createIdeaLabProductionRuntimeDriver({
    roots: {
      iseolRoot: root,
      modelRoot: root,
      runRoot: root,
      webRoot: root,
      browserProfileRoot: root,
    },
    repositoryRoot: root,
    repositoryUrl: "https://github.com/acme/proto",
    baseRef: "main",
    sandboxRoot: root,
    agentId: "agent-1",
    sandboxAdapter: sandbox,
    desktopTransport,
    browserAdapter: browser.adapter,
    desktopStateRoot: root,
    desktopTaskCompiler: async () => null,
    deployAdapter: {} as never,
    now: () => at,
  });

  const production = await driver.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);

  const { loadHarnessRun } = await import("../src/harness/run-store.js");
  const run = await loadHarnessRun(root, production.runId);
  assert.ok(run);

  await mkdir(join(root, "agents"), { recursive: true });
  await writeFile(
    join(root, "agents", "agent-1.json"),
    JSON.stringify({
      version: 1,
      agentId: "agent-1",
      agentVersion: "0.1.0",
      os: "win32",
      capabilities: ["files", "test", "build", "git", "http"],
      workspaceRoots: [root],
      registeredAt: at,
      lastHeartbeatAt: at,
    }, null, 2),
    "utf8",
  );

  await saveHarnessRun(root, {
    ...run,
    preflight: {
      version: 1,
      runId: production.runId,
      status: "ready",
      policy: {
        version: 1,
        loadedAt: at,
        sources: [],
        effectiveSha256: policySha256,
      },
    },
    state: {
      ...run.state,
      stage: "ANALYZE",
      status: "WAITING_AGENT",
      completedStages: ["CONTEXT"],
      reason: "Desktop Agent session is unavailable",
    },
  });

  await driver.advanceProduction(production);

  const recovered = await loadHarnessRun(root, production.runId);
  assert.ok(recovered);

  assert.equal(
    browser.submittedPrompts.length,
    1,
    "reconnected Agent should resume the WAITING_AGENT Run",
  );
  assert.equal(recovered.state.status, "BLOCKED_USER");
  assert.equal(recovered.state.stage, "ANALYZE");
});

test("FAILED_RETRYABLE production resumes the same Run through runtime recovery ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-driver-waiting-agent-recovery-"));
  const proposal = baseProposal("camp-waiting-agent-recovery");
  const expectedRunId = "run-camp-waiting-agent-recovery-prod-1";
  const at = "2026-09-17T10:00:00.000Z";
  const policySha256 = createHash("sha256").update("").digest("hex");

  const browser = createFakeChatGptWebBrowserAdapter([
    {
      version: 1,
      runId: expectedRunId,
      stage: "ANALYZE",
      generation: 1,
      summary: "Recovery reached reasoning again",
      decisions: [],
      intents: [],
      outcome: "blocked-user",
      blockerReason: "stop after WAITING_AGENT recovery verification",
    },
  ]);

  const desktopTransport = {
    isAgentConnected: (agentId: string) => agentId === "agent-1",
    getAgentSessionId: (agentId: string) => agentId === "agent-1" ? "session-reconnected" : null,
    sendTask: () => {
      throw new Error("unexpected Desktop dispatch");
    },
    awaitResult: async () => {
      throw new Error("unexpected Desktop result wait");
    },
  };

  const sandbox = {
    inspect: async () => null,
    allocate: async (input: any) => ({
      repositoryUrl: input.repositoryUrl,
      branch: `idea/${proposal.campaignId}/${proposal.campaignId}-prod-1`,
      worktreeRoot: input.run.request.targetRoot,
      baseRef: input.baseRef,
    }),
  };

  const driver = createIdeaLabProductionRuntimeDriver({
    roots: {
      iseolRoot: root,
      modelRoot: root,
      runRoot: root,
      webRoot: root,
      browserProfileRoot: root,
    },
    repositoryRoot: root,
    repositoryUrl: "https://github.com/acme/proto",
    baseRef: "main",
    sandboxRoot: root,
    agentId: "agent-1",
    sandboxAdapter: sandbox,
    desktopTransport,
    browserAdapter: browser.adapter,
    desktopStateRoot: root,
    desktopTaskCompiler: async () => null,
    deployAdapter: {} as never,
    now: () => at,
  });

  const production = await driver.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);

  const { loadHarnessRun } = await import("../src/harness/run-store.js");
  const run = await loadHarnessRun(root, production.runId);
  assert.ok(run);

  await mkdir(join(root, "agents"), { recursive: true });
  await writeFile(
    join(root, "agents", "agent-1.json"),
    JSON.stringify({
      version: 1,
      agentId: "agent-1",
      agentVersion: "0.1.0",
      os: "win32",
      capabilities: ["files", "test", "build", "git", "http"],
      workspaceRoots: [root],
      registeredAt: at,
      lastHeartbeatAt: at,
    }, null, 2),
    "utf8",
  );

  await saveHarnessRun(root, {
    ...run,
    preflight: {
      version: 1,
      runId: production.runId,
      status: "ready",
      policy: {
        version: 1,
        loadedAt: at,
        sources: [],
        effectiveSha256: policySha256,
      },
    },
    state: {
      ...run.state,
      stage: "ANALYZE",
      status: "FAILED_RETRYABLE",
      completedStages: ["CONTEXT"],
      reason: "ChatGPT Web recovery budget exhausted: unknown-session-loss",
    },
  });

  await driver.advanceProduction(production);

  const recovered = await loadHarnessRun(root, production.runId);
  assert.ok(recovered);

  assert.equal(
    browser.submittedPrompts.length,
    1,
    "runtime recovery should resume the FAILED_RETRYABLE Run",
  );
  assert.equal(recovered.state.status, "BLOCKED_USER");
  assert.equal(recovered.state.stage, "ANALYZE");
});


test("WAITING_AGENT production explicitly yields while Desktop Agent remains unavailable", async () => {
  const root = await mkdtemp(
    join(tmpdir(), "iseol-driver-waiting-agent-yield-"),
  );

  const proposal = baseProposal("camp-waiting-agent-yield");
  const at = "2026-09-17T14:50:00.000Z";

  const browser = createFakeChatGptWebBrowserAdapter([]);

  const desktopTransport = {
    isAgentConnected: () => false,
    getAgentSessionId: () => null,
    sendTask: () => {
      throw new Error("unexpected Desktop dispatch");
    },
    awaitResult: async () => {
      throw new Error("unexpected Desktop result wait");
    },
  };

  const sandbox = {
    inspect: async () => null,
    allocate: async (input: any) => ({
      repositoryUrl: input.repositoryUrl,
      branch: `idea/${proposal.campaignId}/${proposal.campaignId}-prod-1`,
      worktreeRoot: input.run.request.targetRoot,
      baseRef: input.baseRef,
    }),
  };

  const driver = createIdeaLabProductionRuntimeDriver({
    roots: {
      iseolRoot: root,
      modelRoot: root,
      runRoot: root,
      webRoot: root,
      browserProfileRoot: root,
    },
    repositoryRoot: root,
    repositoryUrl: "https://github.com/acme/proto",
    baseRef: "main",
    sandboxRoot: root,
    agentId: "agent-1",
    sandboxAdapter: sandbox,
    desktopTransport,
    browserAdapter: browser.adapter,
    desktopStateRoot: root,
    desktopTaskCompiler: async () => null,
    deployAdapter: {} as never,
    now: () => at,
  });

  const production = await driver.createProduction(proposal, 1);
  await saveIdeaProposal(root, proposal);

  const { loadHarnessRun } =
    await import("../src/harness/run-store.js");

  const run = await loadHarnessRun(root, production.runId);
  assert.ok(run);

  await saveHarnessRun(root, {
    ...run,
    preflight: {
      version: 1,
      runId: production.runId,
      status: "ready",
      policy: {
        version: 1,
        loadedAt: at,
        sources: [],
        effectiveSha256: "policy",
      },
    },
    state: {
      ...run.state,
      stage: "ANALYZE",
      status: "WAITING_AGENT",
      completedStages: ["CONTEXT"],
      reason: "Desktop Agent session is unavailable",
    },
  });

  const result = await driver.advanceProduction(production);

  assert.equal(
    (result as any).directive,
    "yield",
    "WAITING_AGENT must explicitly yield campaign supervision",
  );

  assert.equal(
    (result as any).production?.id,
    production.id,
  );

  const recovered =
    await loadHarnessRun(root, production.runId);

  assert.ok(recovered);
  assert.equal(recovered.state.status, "WAITING_AGENT");
  assert.equal(browser.submittedPrompts.length, 0);
});
