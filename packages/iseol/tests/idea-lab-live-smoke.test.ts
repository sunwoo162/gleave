import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IdeaLabCampaign, PrototypeProduction } from "../src/idea-lab/contracts.js";
import type { PrototypeCandidate } from "../src/project-model/contracts.js";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import { runIdeaLabLiveSmokeCli } from "../scripts/idea-lab-live-smoke.js";

function configuredEnv(): Record<string, string> {
  return {
    ISEOL_IDEA_LAB_RUNTIME_ENABLED: "true",
    ISEOL_IDEA_LAB_REPOSITORY_ROOT: "C:/sandbox/source",
    ISEOL_IDEA_LAB_REPOSITORY_URL: "https://github.com/example/prototype.git",
    ISEOL_IDEA_LAB_BASE_REF: "main",
    ISEOL_IDEA_LAB_SANDBOX_ROOT: "C:/sandbox",
    ISEOL_IDEA_LAB_AGENT_ID: "agent-smoke",
    ISEOL_IDEA_LAB_TEST_EXECUTABLE: "npm.cmd",
    ISEOL_IDEA_LAB_TEST_ARGS_JSON: "[\"test\"]",
    ISEOL_IDEA_LAB_TEST_TIMEOUT_MS: "30000",
    ISEOL_CHATGPT_BROWSER_ENABLED: "true",
    ISEOL_CHATGPT_BROWSER_PROFILE_ROOT: "C:/chatgpt-profile",
    ISEOL_DESKTOP_AGENT_TOKEN: "desktop-token",
    ISEOL_VERCEL_TOKEN: "vercel-token",
    ISEOL_VERCEL_PROJECT_ID: "project-id",
  };
}
const campaign: IdeaLabCampaign = {
  version: 1,
  id: "campaign-smoke",
  seed: "smoke",
  constraints: [],
  targetReadyCount: 1,
  productionConcurrency: 1,
  proposalIds: ["proposal-smoke"],
  productionIds: ["campaign-smoke-prod-1"],
  status: "complete",
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:01.000Z",
};

const production: PrototypeProduction = {
  version: 1,
  id: "campaign-smoke-prod-1",
  campaignId: campaign.id,
  proposalId: "proposal-smoke",
  runId: "run-campaign-smoke-prod-1",
  repositoryUrl: "https://github.com/example/prototype.git",
  sandboxRoot: "C:/sandbox",
  worktreeRoot: "C:/sandbox/campaign-smoke/campaign-smoke-prod-1",
  branch: "idea/campaign-smoke/campaign-smoke-prod-1",
  baseRef: "main",
  commitSha: "a".repeat(40),
  deployment: {
    provider: "vercel",
    deploymentId: "dep-smoke",
    url: "https://smoke.example",
    commitSha: "a".repeat(40),
    deployedAt: "2026-09-12T00:00:00.500Z",
    verifiedAt: campaign.updatedAt,
  },
  status: "ready",
  createdAt: campaign.createdAt,
  updatedAt: campaign.updatedAt,
};
const candidate: PrototypeCandidate = {
  version: 1,
  id: production.id,
  title: "Smoke prototype",
  concept: "Smoke concept",
  repository: { url: production.repositoryUrl, branch: production.branch, commitSha: "a".repeat(40) },
  deployment: { url: "https://smoke.example", provider: "vercel", deploymentId: "dep-smoke" },
  runIds: [production.runId],
  status: "candidate",
  ideaLabOrigin: { campaignId: campaign.id, proposalId: production.proposalId, productionId: production.id },
  createdAt: campaign.createdAt,
  updatedAt: campaign.updatedAt,
};

const run = {
  request: { runId: production.runId, targetRoot: production.worktreeRoot },
  state: { status: "DONE", stage: "DONE" },
  evidence: [
    {
      version: 1,
      id: "commit-smoke",
      kind: "commit",
      stage: "COMMIT",
      recordedAt: "2026-09-12T00:00:00.250Z",
      summary: "committed",
      reference: production.commitSha,
    },
    {
      version: 1,
      id: "verify-smoke",
      kind: "production-verification",
      stage: "PRODUCTION_VERIFY",
      recordedAt: campaign.updatedAt,
      summary: "verified",
      reference: production.deployment?.url,
    },
  ],
} as unknown as HarnessRuntimeRunEnvelope;

function successDeps(onDispose: () => void = () => undefined) {
  return {
    startServices: async () => ({
      webServer: {} as any,
      desktopCore: { transport: { isAgentConnected: () => true } } as any,
      ideaLabRuntime: { idle: async () => undefined },
      ideaLabCapability: { state: "ready" as const },
      dispose: async () => onDispose(),
    }),
    postCampaign: async () => campaign,
    loadCampaign: async () => campaign,
    listProductions: async () => [production],
    listCandidates: async () => [candidate],
    loadRun: async () => run,
    stdout: () => undefined,
    stderr: () => undefined,
  };
}

test("live smoke returns 2 blocked-external before startup when required settings are absent", async () => {
  let starts = 0;
  const lines: string[] = [];
  const code = await runIdeaLabLiveSmokeCli({}, {
    ...successDeps(),
    startServices: async () => { starts += 1; throw new Error("must not start"); },
    stderr: (line) => lines.push(line),
  });
  assert.equal(code, 2);
  assert.equal(starts, 0);
  assert.ok(lines.some((line) => line.includes("blocked-external")));
});
test("live smoke returns zero only for one verified READY prototype", async () => {
  let disposes = 0;
  const output: string[] = [];
  const code = await runIdeaLabLiveSmokeCli(configuredEnv(), {
    ...successDeps(() => { disposes += 1; }),
    stdout: (line) => output.push(line),
  });
  assert.equal(code, 0);
  assert.equal(disposes, 2);
  assert.ok(output.some((line) => /passed/i.test(line)));
});

test("live smoke passes the configured Web token to Campaign creation", async () => {
  const env = { ...configuredEnv(), ISEOL_WEB_TOKEN: "web-token" };
  const code = await runIdeaLabLiveSmokeCli(env, {
    ...successDeps(),
    postCampaign: async (_server: any, token?: string) => {
      assert.equal(token, "web-token");
      return campaign;
    },
  } as any);
  assert.equal(code, 0);
});

test("live smoke accepts omitted optional test timeout", async () => {
  const env = configuredEnv();
  delete env.ISEOL_IDEA_LAB_TEST_TIMEOUT_MS;
  const code = await runIdeaLabLiveSmokeCli(env, successDeps());
  assert.equal(code, 0);
});

test("live smoke restarts composition and re-verifies the same durable identities", async () => {
  let starts = 0;
  let disposes = 0;
  const code = await runIdeaLabLiveSmokeCli(configuredEnv(), {
    ...successDeps(),
    startServices: async () => {
      starts += 1;
      return {
        webServer: {} as any,
        desktopCore: { transport: { isAgentConnected: () => true } } as any,
        ideaLabRuntime: { idle: async () => undefined },
        ideaLabCapability: { state: "ready" as const },
        dispose: async () => { disposes += 1; },
      };
    },
  });
  assert.equal(code, 0);
  assert.equal(starts, 2);
  assert.equal(disposes, 2);
});

test("live smoke fails when immutable deployment identity changes across restart", async () => {
  const nextSha = "b".repeat(40);
  const restartedProduction: PrototypeProduction = {
    ...production,
    commitSha: nextSha,
    deployment: { ...production.deployment!, deploymentId: "dep-restarted", commitSha: nextSha },
  };
  const restartedCandidate: PrototypeCandidate = {
    ...candidate,
    repository: { ...candidate.repository, commitSha: nextSha },
    deployment: { ...candidate.deployment, deploymentId: "dep-restarted" },
  };
  const restartedRun = {
    ...run,
    evidence: run.evidence.map((item) => item.kind === "commit" ? { ...item, reference: nextSha } : item),
  } as HarnessRuntimeRunEnvelope;
  let reads = 0;
  const code = await runIdeaLabLiveSmokeCli(configuredEnv(), {
    ...successDeps(),
    listProductions: async () => [reads++ === 0 ? production : restartedProduction],
    listCandidates: async () => [reads <= 1 ? candidate : restartedCandidate],
    loadRun: async () => reads <= 1 ? run : restartedRun,
  });
  assert.equal(code, 1);
});

test("live smoke returns one for domain verification failure and still disposes composition", async () => {
  let disposes = 0;
  const lines: string[] = [];
  const code = await runIdeaLabLiveSmokeCli(configuredEnv(), {
    ...successDeps(() => { disposes += 1; }),
    listCandidates: async () => [],
    stdout: (line) => lines.push(line),
    stderr: (line) => lines.push(line),
  });
  assert.equal(code, 1);
  assert.equal(disposes, 1);
  assert.equal(lines.some((line) => /passed/i.test(line)), false);
});


test("live smoke bounds final disposal after an external timeout", async () => {
  const never = new Promise<void>(() => undefined);
  const result = await Promise.race([
    runIdeaLabLiveSmokeCli(configuredEnv(), {
      ...successDeps(),
      startServices: async () => ({
        webServer: {} as any,
        desktopCore: null,
        ideaLabRuntime: { idle: async () => undefined },
        ideaLabCapability: { state: "ready" as const },
        dispose: async () => { await never; },
      }),
      timeoutMs: 5,
    }),
    // Keep the watchdog above the bounded cleanup budget under concurrent
    // Windows test-worker load.
    new Promise<"did-not-settle">((resolve) => setTimeout(() => resolve("did-not-settle"), 500)),
  ]);
  assert.equal(result, 2);
});

test("live smoke reports the stage that timed out", async () => {
  const lines: string[] = [];
  const never = new Promise<void>(() => undefined);
  const code = await runIdeaLabLiveSmokeCli(configuredEnv(), {
    ...successDeps(),
    startServices: async () => ({
      webServer: {} as any,
      desktopCore: { transport: { isAgentConnected: () => true } } as any,
      ideaLabRuntime: { idle: async () => { await never; } },
      ideaLabCapability: { state: "ready" as const },
      dispose: async () => undefined,
    }),
    timeoutMs: 5,
    stderr: (line) => lines.push(line),
  });
  assert.equal(code, 2);
  assert.ok(lines.some((line) => line.includes("runtime-idle")));
});

test("live smoke does not create a campaign before same-Core Desktop Agent readiness", async () => {
  let posted = false;
  const code = await runIdeaLabLiveSmokeCli(configuredEnv(), {
    ...successDeps(),
    startServices: async () => ({
      webServer: {} as any,
      desktopCore: { transport: { isAgentConnected: () => false } } as any,
      ideaLabRuntime: { idle: async () => undefined },
      ideaLabCapability: { state: "ready" as const },
      dispose: async () => undefined,
    }),
    postCampaign: async () => { posted = true; return campaign; },
  });
  assert.equal(code, 2);
  assert.equal(posted, false);
});

test("live smoke correlates terminal success with persisted smoke identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-smoke-correlation-"));
  const output: string[] = [];
  const env = { ...configuredEnv(), ISEOL_MODEL_ROOT: root };
  const code = await runIdeaLabLiveSmokeCli(env, { ...successDeps(), stdout: (line) => output.push(line) });
  assert.equal(code, 0);
  const persisted = JSON.parse(await readFile(join(root, "smoke-correlation.json"), "utf8")) as {
    smokeExecutionId: string; smokeRoot: string; campaignId: string | null; runId: string | null;
    terminalClassification: string;
  };
  assert.equal(persisted.smokeRoot, root);
  assert.equal(persisted.campaignId, campaign.id);
  assert.equal(persisted.runId, production.runId);
  assert.equal(persisted.terminalClassification, "success");
  assert.match(output[0] ?? "", new RegExp(`smoke=${persisted.smokeExecutionId}`));
});

test("live smoke persists failed pre-campaign readiness without creating a campaign", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-smoke-readiness-"));
  let posted = false;
  const env = { ...configuredEnv(), ISEOL_MODEL_ROOT: root };
  const code = await runIdeaLabLiveSmokeCli(env, {
    ...successDeps(),
    startServices: async () => ({
      webServer: {} as any,
      desktopCore: { transport: { isAgentConnected: () => false } } as any,
      ideaLabRuntime: { idle: async () => undefined },
      ideaLabCapability: { state: "ready" as const },
      dispose: async () => { throw new Error("dispose failed"); },
    }),
    postCampaign: async () => { posted = true; return campaign; },
  });
  assert.equal(code, 2);
  assert.equal(posted, false);
  const persisted = JSON.parse(await readFile(join(root, "smoke-correlation.json"), "utf8")) as {
    campaignId: string | null; desktopAgentConnected: boolean; sameCoreTransport: boolean;
    terminalStage: string; terminalClassification: string;
  };
  assert.equal(persisted.campaignId, null);
  assert.equal(persisted.desktopAgentConnected, false);
  assert.equal(persisted.sameCoreTransport, false);
  assert.equal(persisted.terminalStage, "desktop-agent-preflight");
  assert.equal(persisted.terminalClassification, "required-live-capability-unavailable");
});

test("live smoke preserves an authoritative waiting-agent run failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-smoke-authoritative-run-"));
  const lines: string[] = [];
  const env = { ...configuredEnv(), ISEOL_MODEL_ROOT: join(root, "model") };
  const waitingRun = {
    ...run,
    state: { status: "WAITING_AGENT", stage: "CONTEXT", reason: "Desktop Agent session is unavailable" },
  } as unknown as HarnessRuntimeRunEnvelope;
  const code = await runIdeaLabLiveSmokeCli(env, {
    ...successDeps(),
    startServices: async () => ({
      webServer: {} as any,
      desktopCore: { transport: { isAgentConnected: () => true } } as any,
      ideaLabRuntime: { idle: async () => { throw new Error("WAITING_AGENT: Desktop Agent session is unavailable"); } },
      ideaLabCapability: { state: "ready" as const },
      dispose: async () => undefined,
    }),
    loadRun: async () => waitingRun,
    stderr: (line) => lines.push(line),
  });
  assert.equal(code, 2);
  const persisted = JSON.parse(await readFile(join(root, "smoke-correlation.json"), "utf8")) as SmokeCorrelationLike;
  assert.equal(persisted.smokeRoot, root);
  assert.equal(persisted.terminalStage, "CONTEXT");
  assert.equal(persisted.terminalClassification, "required-live-capability-unavailable");
  assert.match(lines.at(-1) ?? "", /^Idea Lab live smoke blocked-external:/);
  assert.match(lines.at(-1) ?? "", /stage=CONTEXT; reason=required-live-capability-unavailable/);
});

type SmokeCorrelationLike = {
  smokeRoot: string;
  terminalStage: string;
  terminalClassification: string;
};

test("live smoke uses a short cleanup timeout independent of the main budget", async () => {
  const never = new Promise<void>(() => undefined);
  const result = await Promise.race([
    runIdeaLabLiveSmokeCli(configuredEnv(), {
      ...successDeps(),
      startServices: async () => ({
        webServer: {} as any,
        desktopCore: { transport: { isAgentConnected: () => true } } as any,
        ideaLabRuntime: { idle: async () => undefined },
        ideaLabCapability: { state: "ready" as const },
        dispose: async () => { await never; },
      }),
      postCampaign: async () => { throw new Error("Desktop Agent is not connected"); },
      timeoutMs: 1_000,
      cleanupTimeoutMs: 5,
    } as any),
    // Keep the watchdog above the bounded cleanup budget under concurrent
    // Windows test-worker load.
    new Promise<"did-not-settle">((resolve) => setTimeout(() => resolve("did-not-settle"), 500)),
  ]);
  assert.equal(result, 2);
});
