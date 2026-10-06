import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import { saveHarnessRun } from "../src/harness/run-store.js";
import { saveIdeaLabCampaign } from "../src/idea-lab/campaign-store.js";
import type { PrototypeProduction } from "../src/idea-lab/contracts.js";
import { savePrototypeProduction } from "../src/idea-lab/production-store.js";
import type { ProjectWorkspace, PrototypeCandidate } from "../src/project-model/contracts.js";
import { appendProjectHistoryEvent } from "../src/project-model/history-store.js";
import { savePrototypeCandidate } from "../src/project-model/prototype-store.js";
import { saveProjectWorkspace } from "../src/project-model/workspace-store.js";
import {
  buildIdeaLabView,
  buildIdeaLabCampaignDetail,
  buildPrototypeDetail,
  buildProjectWorkspaceView,
} from "../src/web-control-plane/view-model.js";

function candidate(): PrototypeCandidate {
  return {
    version: 1,
    id: "prototype-001",
    title: "Study Race",
    concept: "Compete on study time",
    repository: { url: "https://github.com/example/repo", branch: "main", commitSha: "abc123" },
    deployment: { url: "https://study.example.com", provider: "vercel", deploymentId: "dpl_1" },
    runIds: ["run-genesis"],
    status: "candidate",
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
  };
}

function workspace(): ProjectWorkspace {
  return {
    version: 1,
    id: "project-prototype-001",
    name: "Study Race",
    status: "active",
    genesis: {
      prototypeId: "prototype-001",
      repository: candidate().repository,
      deployment: candidate().deployment,
      runs: [{
        runId: "run-genesis",
        objective: "Build prototype",
        stage: "DONE",
        status: "DONE",
        policySha256: "a".repeat(64),
        evidence: [],
        events: [],
      }],
      promotedAt: "2026-09-07T01:00:00.000Z",
    },
    tree: [{
      id: "root",
      kind: "root",
      title: "Study Race",
      status: "in-progress",
      runIds: [],
      createdAt: "2026-09-07T01:00:00.000Z",
      updatedAt: "2026-09-07T01:00:00.000Z",
    }, {
      id: "profile",
      parentId: "root",
      kind: "feature",
      title: "Profile",
      status: "in-progress",
      runIds: ["run-active"],
      createdAt: "2026-09-07T01:10:00.000Z",
      updatedAt: "2026-09-07T01:10:00.000Z",
    }],
    createdAt: "2026-09-07T01:00:00.000Z",
    updatedAt: "2026-09-07T01:10:00.000Z",
  };
}

function activeRun(): HarnessRuntimeRunEnvelope {
  return {
    version: 1,
    request: {
      version: 1,
      runId: "run-active",
      mode: "project-workspace",
      purposeProfile: {
        version: 1,
        purpose: "portfolio",
        executableRoles: ["orchestrator", "frontend"],
        plannedRoles: ["documentation"],
        verificationStages: ["TEST", "BUILD"],
        documentationRequired: true,
      },
      objective: "Implement profile editing",
      targetRoot: "C:/repo",
    },
    preflight: {
      version: 1,
      runId: "run-active",
      status: "ready",
      policy: {
        version: 1,
        loadedAt: "2026-09-07T01:10:00.000Z",
        sources: [{
          kind: "iseol-global",
          path: "C:/secret/HARNESS_ENGINEERING.md",
          sha256: "b".repeat(64),
          content: "SECRET_POLICY_TEXT",
        }],
        effectiveSha256: "c".repeat(64),
      },
    },
    state: {
      version: 1,
      stage: "IMPLEMENT",
      status: "RUNNING",
      completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN"],
      skippedStages: [],
      updatedAt: "2026-09-07T01:20:00.000Z",
    },
    evidence: [{
      version: 1,
      id: "evidence-1",
      kind: "file-change",
      stage: "IMPLEMENT",
      recordedAt: "2026-09-07T01:20:00.000Z",
      summary: "Applied profile update",
    }],
    updatedAt: "2026-09-07T01:20:00.000Z",
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "iseol-web-view-"));
  const modelRoot = join(root, "model");
  const harnessRoot = join(root, "runs");
  await savePrototypeCandidate(modelRoot, candidate());
  await saveProjectWorkspace(modelRoot, workspace());
  await saveHarnessRun(harnessRoot, activeRun());
  await appendProjectHistoryEvent(modelRoot, {
    version: 1,
    id: "history-001",
    projectId: "project-prototype-001",
    type: "run-attached",
    at: "2026-09-07T01:10:00.000Z",
    summary: "Attached profile run",
    nodeId: "profile",
    runId: "run-active",
  });
  return { modelRoot, harnessRoot };
}

test("detail view models expose prototype runs and campaign productions", async () => {
  const { modelRoot, harnessRoot } = await fixture();
  await savePrototypeCandidate(modelRoot, {
    ...candidate(),
    runIds: ["run-active"],
    ideaLabOrigin: {
      campaignId: "campaign-001",
      proposalId: "proposal-001",
      productionId: "production-001",
    },
  });
  await saveIdeaLabCampaign(modelRoot, {
    version: 1,
    id: "campaign-001",
    seed: "Build a useful study tool",
    constraints: [],
    targetReadyCount: 1,
    productionConcurrency: 1,
    proposalIds: [],
    productionIds: [],
    status: "producing",
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
  });
  const production: PrototypeProduction = {
    version: 1,
    id: "production-001",
    campaignId: "campaign-001",
    proposalId: "proposal-001",
    runId: "run-active",
    repositoryUrl: "https://github.com/example/repo",
    sandboxRoot: "C:/sandbox",
    worktreeRoot: "C:/sandbox/production-001",
    branch: "idea/campaign-001/production-001",
    baseRef: "main",
    status: "running",
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
  };
  await savePrototypeProduction(modelRoot, production);
  const prototype = await buildPrototypeDetail(modelRoot, harnessRoot, "prototype-001");
  assert.ok(prototype);
  assert.equal(prototype.prototype.id, "prototype-001");
  assert.equal(prototype.origin?.campaignId, "campaign-001");
  assert.equal(prototype.runs[0]?.runId, "run-active");
  const campaign = await buildIdeaLabCampaignDetail(modelRoot, harnessRoot, "campaign-001");
  assert.ok(campaign);
  assert.equal(campaign.campaign.id, "campaign-001");
  assert.equal(campaign.productions[0]?.id, "production-001");
  assert.equal(campaign.productions[0]?.run?.stage, "IMPLEMENT");
  assert.equal(campaign.prototypes[0]?.id, "prototype-001");
});

test("Idea Lab view exposes prototype experience metadata", async () => {
  const { modelRoot } = await fixture();
  const view = await buildIdeaLabView(modelRoot);
  assert.equal(view.prototypes.length, 1);
  assert.equal(view.prototypes[0]?.title, "Study Race");
  assert.equal(view.prototypes[0]?.deployment.url, "https://study.example.com");
  assert.equal(view.prototypes[0]?.status, "candidate");
});

test("Idea Lab web views omit unsafe deployment URLs", async () => {
  const { modelRoot, harnessRoot } = await fixture();
  const sourceRun = activeRun();
  await saveHarnessRun(harnessRoot, {
    ...sourceRun,
    evidence: [...sourceRun.evidence, ...[
      "preview https://preview.example/?%61ccess_token=secret",
      "preview https://preview.example/?access_token%3Dsecret",
      "preview https://preview.example/#oauth_token%3Dsecret",
      "provider error (access_token=secret)",
      "{\"access_token\":\"secret value\"}",
      "{\"access_token\":\"secret\\\"suffix\"}",
      "{\"access_token\":\"secret\nsuffix\"}",
    ].map((summary, index) => ({
      version: 1 as const,
      id: `credential-evidence-${index}`,
      kind: "deployment",
      stage: "DEPLOY",
      recordedAt: `2026-09-07T01:3${index}:00.000Z`,
      summary,
    }))],
  });
  await saveIdeaLabCampaign(modelRoot, {
    version: 1,
    id: "campaign-unsafe",
    seed: "Build a safe study tool",
    constraints: [],
    targetReadyCount: 1,
    productionConcurrency: 1,
    proposalIds: [],
    productionIds: ["production-unsafe"],
    status: "producing",
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
  });
  await savePrototypeCandidate(modelRoot, {
    ...candidate(),
    id: "prototype-unsafe",
    ideaLabOrigin: {
      campaignId: "campaign-unsafe",
      proposalId: "proposal-unsafe",
      productionId: "production-unsafe",
    },
    deployment: {
      ...candidate().deployment,
      url: "https://preview.example.com/?token=secret",
    },
    repository: {
      ...candidate().repository,
      url: "https://user:password@example.com/repo?token=secret",
    },
  });
  await savePrototypeProduction(modelRoot, {
    version: 1,
    id: "production-unsafe",
    campaignId: "campaign-unsafe",
    proposalId: "proposal-unsafe",
    runId: "run-active",
    repositoryUrl: "https://github.com/example/repo",
    sandboxRoot: "C:/sandbox",
    worktreeRoot: "C:/sandbox/production-unsafe",
    branch: "idea/campaign-unsafe/production-unsafe",
    baseRef: "main",
    status: "ready",
    blockerSummary: "provider error (access_token=secret)",
    deployment: {
      provider: "vercel",
      url: "javascript:alert(1)",
    },
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
  });

  const view = await buildIdeaLabView(modelRoot, harnessRoot);
  const unsafePrototype = view.prototypes.find((item) => item.id === "prototype-unsafe");
  assert.deepEqual(unsafePrototype?.repository, { branch: "main", commitSha: "abc123" });
  assert.deepEqual(unsafePrototype?.deployment, { provider: "vercel" });
  const unsafeProduction = view.productions.find((item) => item.id === "production-unsafe");
  assert.equal(unsafeProduction?.deploymentUrl, undefined);
  assert.equal(unsafeProduction?.blockerSummary, "provider error (access_token=[redacted])");
  assert.deepEqual(unsafeProduction?.run?.evidence.slice(-7).map((item) => item.summary), [
    "preview [redacted-url]",
    "preview [redacted-url]",
    "preview [redacted-url]",
    "provider error (access_token=[redacted])",
    "{\"access_token\":\"[redacted]\"}",
    "{\"access_token\":\"[redacted]\"}",
    "{\"access_token\":\"[redacted]\"}",
  ]);

  const detail = await buildIdeaLabCampaignDetail(modelRoot, harnessRoot, "campaign-unsafe");
  assert.deepEqual(detail?.prototypes[0]?.repository, { branch: "main", commitSha: "abc123" });
  assert.deepEqual(detail?.prototypes[0]?.deployment, { provider: "vercel" });
  assert.equal(detail?.productions[0]?.deploymentUrl, undefined);
  assert.equal(detail?.productions[0]?.blockerSummary, "provider error (access_token=[redacted])");
  assert.deepEqual(detail?.productions[0]?.run?.evidence.slice(-7).map((item) => item.summary), [
    "preview [redacted-url]",
    "preview [redacted-url]",
    "preview [redacted-url]",
    "provider error (access_token=[redacted])",
    "{\"access_token\":\"[redacted]\"}",
    "{\"access_token\":\"[redacted]\"}",
    "{\"access_token\":\"[redacted]\"}",
  ]);
});

test("Project Workspace view exposes Genesis tree history and active Run summary", async () => {
  const { modelRoot, harnessRoot } = await fixture();
  const view = await buildProjectWorkspaceView(modelRoot, harnessRoot, "project-prototype-001");
  assert.ok(view);
  assert.equal(view.project.name, "Study Race");
  assert.equal(view.genesis.prototypeId, "prototype-001");
  assert.equal(view.genesis.repository.url, "https://github.com/example/repo");
  assert.equal(view.genesis.deployment.url, "https://study.example.com");
  assert.equal(view.tree.find((node) => node.id === "profile")?.runIds[0], "run-active");
  assert.equal(view.history[0]?.id, "history-001");
  assert.equal(view.runs[0]?.runId, "run-active");
  assert.equal(view.runs[0]?.stage, "IMPLEMENT");
  assert.equal(view.runs[0]?.policySha256, "c".repeat(64));
  assert.deepEqual(view.runs[0]?.agentPlan, [
    { role: "orchestrator", status: "executable" },
    { role: "frontend", status: "executable" },
    { role: "documentation", status: "planned" },
  ]);
  assert.deepEqual(view.runs[0]?.evidence, [{
    id: "evidence-1",
    kind: "file-change",
    stage: "IMPLEMENT",
    recordedAt: "2026-09-07T01:20:00.000Z",
    summary: "Applied profile update",
  }]);
});

test("Project Workspace view omits unsafe Genesis URLs", async () => {
  const { modelRoot, harnessRoot } = await fixture();
  const source = workspace();
  await saveProjectWorkspace(modelRoot, {
    ...source,
    genesis: {
      ...source.genesis,
      repository: {
        ...source.genesis.repository,
        url: "https://user:password@example.com/repo?token=secret",
      },
      deployment: {
        ...source.genesis.deployment,
        url: "javascript:alert(1)",
      },
    },
  });

  const view = await buildProjectWorkspaceView(modelRoot, harnessRoot, "project-prototype-001");
  assert.deepEqual(view?.genesis.repository, { branch: "main", commitSha: "abc123" });
  assert.deepEqual(view?.genesis.deployment, { provider: "vercel", deploymentId: "dpl_1" });
});

test("Web view model does not expose policy source contents or environment values", async () => {
  const { modelRoot, harnessRoot } = await fixture();
  process.env.ISEOL_TEST_SECRET = "SECRET_ENV_VALUE";
  const view = await buildProjectWorkspaceView(modelRoot, harnessRoot, "project-prototype-001");
  const serialized = JSON.stringify(view);
  assert.equal(serialized.includes("SECRET_POLICY_TEXT"), false);
  assert.equal(serialized.includes("C:/secret/HARNESS_ENGINEERING.md"), false);
  assert.equal(serialized.includes("SECRET_ENV_VALUE"), false);
  delete process.env.ISEOL_TEST_SECRET;
});

test("missing Project Workspace returns null", async () => {
  const { modelRoot, harnessRoot } = await fixture();
  assert.equal(
    await buildProjectWorkspaceView(modelRoot, harnessRoot, "project-missing"),
    null,
  );
});
