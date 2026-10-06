import "dotenv/config";
import type { Server } from "node:http";
import { basename, dirname, resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { startIseolRuntimeServices, type IseolRuntimeServices } from "../src/runtime/iseol-runtime-services.js";
import { listPrototypeProductions } from "../src/idea-lab/production-store.js";
import { loadIdeaLabCampaign } from "../src/idea-lab/campaign-store.js";
import { listPrototypeCandidates } from "../src/project-model/prototype-store.js";
import { loadHarnessRun } from "../src/harness/run-store.js";
import type { IdeaLabCampaign } from "../src/idea-lab/contracts.js";
import { resolveIdeaLabRuntimeConfig, type IdeaLabRuntimeRoots } from "../src/idea-lab/runtime-config.js";
import { resolveDesktopAgentCoreConfig } from "../src/desktop-agent/core-service.js";
import { resolvePlaywrightBrowserDriverConfig } from "../src/chatgpt-web/playwright-browser-config.js";
import { resolveVercelPrototypeDeployAdapter } from "../src/idea-lab/vercel-deploy-adapter.js";

class LiveSmokeExternalBlocker extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveSmokeExternalBlocker";
  }
}

type SmokeDeps = {
  startServices?: typeof startIseolRuntimeServices;
  postCampaign?: (server: Server, token?: string) => Promise<IdeaLabCampaign>;
  listProductions?: typeof listPrototypeProductions;
  listCandidates?: typeof listPrototypeCandidates;
  loadRun?: typeof loadHarnessRun;
  loadCampaign?: typeof loadIdeaLabCampaign;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  cwd?: string;
  timeoutMs?: number;
  cleanupTimeoutMs?: number;
};

type SmokeCorrelation = {
  smokeExecutionId: string;
  smokeRoot: string;
  startedAt: string;
  pid: number;
  campaignId: string | null;
  productionId: string | null;
  runId: string | null;
  terminalStage: string | null;
  terminalClassification: string | null;
  desktopAgentConnected: boolean;
  desktopAgentEligible: boolean;
  desktopAgentIdMatches: boolean;
  sameCoreTransport: boolean;
  readinessCheckedAt: string | null;
};

export function createSmokeCorrelation(smokeRoot: string, now = new Date().toISOString()): SmokeCorrelation {
  return {
    smokeExecutionId: randomUUID(), smokeRoot, startedAt: now, pid: process.pid,
    campaignId: null, productionId: null, runId: null, terminalStage: null,
    terminalClassification: null, desktopAgentConnected: false, desktopAgentEligible: false,
    desktopAgentIdMatches: false, sameCoreTransport: false, readinessCheckedAt: null,
  };
}

function smokeBaseRoot(modelRoot: string): string {
  const resolved = resolve(modelRoot);
  return basename(resolved).toLowerCase() === "model" ? dirname(resolved) : resolved;
}

async function persistSmokeCorrelation(correlation: SmokeCorrelation): Promise<void> {
  await mkdir(correlation.smokeRoot, { recursive: true });
  await writeFile(`${correlation.smokeRoot}/smoke-correlation.json`, `${JSON.stringify(correlation, null, 2)}\n`, "utf8");
}

function terminalReason(error: unknown): string {
  if (error instanceof LiveSmokeExternalBlocker) return "required-live-capability-unavailable";
  return "domain-verification-failed";
}

function authoritativeRunTerminalState(run: Awaited<ReturnType<typeof loadHarnessRun>>):
  { stage: string; classification: string } | undefined {
  const state = run?.state as { status?: string; stage?: string; reason?: string } | undefined;
  if (!state?.stage || !state.status || state.status === "DONE") return undefined;
  if (state.status === "WAITING_AGENT" || /Desktop Agent session is unavailable/i.test(state.reason ?? "")) {
    return { stage: state.stage, classification: "required-live-capability-unavailable" };
  }
  if (state.status === "FAILED_RETRYABLE" || state.status === "FAILED_FINAL") {
    return { stage: state.stage, classification: state.status === "FAILED_FINAL" ? "run-failed-final" : "run-failed-retryable" };
  }
  return undefined;
}

function formatTerminal(prefix: string, correlation: SmokeCorrelation): string {
  return `${prefix}: smoke=${correlation.smokeExecutionId}; campaign=${correlation.campaignId ?? "none"}; run=${correlation.runId ?? "none"}; stage=${correlation.terminalStage ?? "unknown"}; reason=${correlation.terminalClassification ?? "unknown"}`;
}

export function assertLiveSmokeDesktopAgentReady(
  services: Pick<IseolRuntimeServices, "desktopCore">,
  agentId: string,
): void {
  const transport = services.desktopCore?.transport;
  if (!transport || !transport.isAgentConnected(agentId)) {
    throw new LiveSmokeExternalBlocker(`Desktop Agent preflight failed: ${agentId} is not connected to the smoke Core`);
  }
}
function smokeWebConfig(env: Record<string, string | undefined>, cwd: string) {
  return {
    host: "127.0.0.1",
    port: 0,
    token: env.ISEOL_WEB_TOKEN?.trim() || "",
    modelRoot: resolve(env.ISEOL_MODEL_ROOT?.trim() || resolve(cwd, "data", "iseol")),
    harnessRoot: resolve(env.ISEOL_RUN_ROOT?.trim() || resolve(cwd, "data", "runs")),
    webRoot: resolve(cwd, "web"),
  };
}

function prerequisiteState(
  env: Record<string, string | undefined>,
  cwd: string,
  webConfig: ReturnType<typeof smokeWebConfig>,
): "ready" | "blocked" | "invalid" {
  const roots: IdeaLabRuntimeRoots = {
    iseolRoot: cwd,
    modelRoot: webConfig.modelRoot,
    runRoot: webConfig.harnessRoot,
    webRoot: webConfig.webRoot,
    webWorkerRoot: resolve(env.ISEOL_CHATGPT_WEB_ROOT?.trim() || resolve(cwd, "data", "runs")),
    browserProfileRoot: resolve(env.ISEOL_CHATGPT_BROWSER_PROFILE_ROOT?.trim() || resolve(cwd, "data", "chatgpt-profile")),
  };
  try {
    const runtimeConfig = resolveIdeaLabRuntimeConfig(env, roots);
    if (!runtimeConfig.enabled) return "blocked";
    const browserConfig = resolvePlaywrightBrowserDriverConfig(env, {
      repositoryRoot: runtimeConfig.repositoryRoot,
      modelRoot: roots.modelRoot,
      runRoot: roots.runRoot,
      webRoot: roots.webRoot,
      chatGptWebRoot: resolve(env.ISEOL_CHATGPT_WEB_ROOT?.trim() || resolve(cwd, "data", "runs")),
    });
    if (!browserConfig.enabled) return "blocked";
    if (!resolveDesktopAgentCoreConfig(env, cwd, { allowEphemeralPort: true }).enabled) return "blocked";
    return resolveVercelPrototypeDeployAdapter(env) ? "ready" : "blocked";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return /is required when|PROFILE_ROOT is required|TOKEN is required/i.test(message) ? "blocked" : "invalid";
  }
}

function serverUrl(server: Server): string {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Idea Lab live smoke Web server address is unavailable");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function postLiveCampaign(server: Server, token?: string): Promise<IdeaLabCampaign> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${serverUrl(server)}/api/idea-lab/campaigns`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      seed: "Iseol controlled live smoke prototype",
      constraints: ["controlled live smoke", "one prototype only"],
      targetReadyCount: 1,
      productionConcurrency: 1,
    }),
  });
  if (response.status === 503) {
    throw new LiveSmokeExternalBlocker("Idea Lab runtime is not ready");
  }
  if (response.status !== 201) {
    throw new Error(`Idea Lab Campaign creation failed with status ${response.status}`);
  }
  return await response.json() as IdeaLabCampaign;
}

async function within<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new LiveSmokeExternalBlocker("Idea Lab live smoke timed out")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function externalError(error: unknown): boolean {
  if (error instanceof LiveSmokeExternalBlocker) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /authentication|required profile|browser.*(?:missing|not found|not installed)|EADDRINUSE|ECONNREFUSED|Desktop Agent.*not connected|WAITING_AGENT|WAITING_EXTERNAL|Vercel.*(?:401|403|429|unavailable)|ENOENT/i.test(message);
}

type SmokeIdentity = {
  productionId: string;
  proposalId: string;
  candidateId: string;
  runId: string;
  repositoryUrl: string;
  sandboxRoot: string;
  branch: string;
  baseRef: string;
  worktreeRoot: string;
  runTargetRoot: string;
  commitSha: string;
  deploymentProvider: string;
  deploymentId: string;
  deploymentUrl: string;
  deploymentCommitSha: string;
};

function assertVerifiedOutcome(
  campaign: IdeaLabCampaign,
  productions: Awaited<ReturnType<typeof listPrototypeProductions>>,
  candidates: Awaited<ReturnType<typeof listPrototypeCandidates>>,
  run: Awaited<ReturnType<typeof loadHarnessRun>>,
): SmokeIdentity {
  if (campaign.status !== "complete" || campaign.targetReadyCount !== 1) {
    throw new Error("Idea Lab live smoke Campaign did not complete exactly one target");
  }
  const ownedProductions = productions.filter((item) => item.campaignId === campaign.id);
  if (ownedProductions.length !== 1 || ownedProductions[0]!.status !== "ready") {
    throw new Error("Idea Lab live smoke requires exactly one READY Production");
  }
  const production = ownedProductions[0]!;
  if (campaign.productionIds.length !== 1 || campaign.productionIds[0] !== production.id) {
    throw new Error("Idea Lab live smoke Campaign Production identity mismatch");
  }
  const matchingCandidates = candidates.filter((item) =>
    item.ideaLabOrigin?.campaignId === campaign.id
    && item.ideaLabOrigin.proposalId === production.proposalId
    && item.ideaLabOrigin.productionId === production.id,
  );
  if (matchingCandidates.length !== 1 || matchingCandidates[0]!.status !== "candidate") {
    throw new Error("Idea Lab live smoke requires one matching PrototypeCandidate");
  }
  const candidate = matchingCandidates[0]!;
  if (candidate.runIds.length !== 1 || candidate.runIds[0] !== production.runId) {
    throw new Error("Idea Lab live smoke Candidate Run identity mismatch");
  }
  if (
    !run
    || run.request.runId !== production.runId
    || run.state.status !== "DONE"
    || run.state.stage !== "DONE"
  ) {
    throw new Error("Idea Lab live smoke canonical Run is not DONE");
  }
  const commits = run.evidence.filter((item) => item.kind === "commit" && item.stage === "COMMIT");
  if (commits.length !== 1 || !/^[0-9a-f]{40}$/i.test(commits[0]?.reference ?? "")) {
    throw new Error("Idea Lab live smoke canonical Run COMMIT evidence is invalid or ambiguous");
  }
  const commitSha = commits[0]!.reference!;
  const deployment = production.deployment;
  if (
    !production.commitSha
    || production.commitSha !== commitSha
    || !deployment
    || deployment.commitSha !== commitSha
    || !deployment.provider
    || !deployment.deploymentId
    || !deployment.url
  ) {
    throw new Error("Idea Lab live smoke deployment identity does not match canonical COMMIT");
  }
  if (run.request.targetRoot !== production.worktreeRoot) {
    throw new Error("Idea Lab live smoke Run target root does not match Production worktree");
  }
  if (
    candidate.repository.url !== production.repositoryUrl
    || candidate.repository.branch !== production.branch
    || candidate.repository.commitSha !== commitSha
    || candidate.deployment.provider !== deployment.provider
    || candidate.deployment.deploymentId !== deployment.deploymentId
    || candidate.deployment.url !== deployment.url
  ) {
    throw new Error("Idea Lab live smoke Candidate identity does not match Production");
  }
  const verified = run.evidence.filter((item) =>
    item.kind === "production-verification" && item.stage === "PRODUCTION_VERIFY",
  );
  if (verified.length !== 1 || verified[0]!.reference !== deployment.url) {
    throw new Error("Idea Lab live smoke canonical Run lacks matching PRODUCTION_VERIFY evidence");
  }
  return {
    productionId: production.id,
    proposalId: production.proposalId,
    candidateId: candidate.id,
    runId: production.runId,
    repositoryUrl: production.repositoryUrl,
    sandboxRoot: production.sandboxRoot,
    branch: production.branch,
    baseRef: production.baseRef,
    worktreeRoot: production.worktreeRoot,
    runTargetRoot: run.request.targetRoot,
    commitSha,
    deploymentProvider: deployment.provider,
    deploymentId: deployment.deploymentId,
    deploymentUrl: deployment.url,
    deploymentCommitSha: deployment.commitSha,
  };
}

export async function runIdeaLabLiveSmokeCli(
  env: Record<string, string | undefined> = process.env,
  deps: SmokeDeps = {},
): Promise<number> {
  const stdout = deps.stdout ?? console.log;
  const stderr = deps.stderr ?? console.error;
  const cwd = deps.cwd ?? process.cwd();
  const webConfig = smokeWebConfig(env, cwd);
  const correlation = createSmokeCorrelation(smokeBaseRoot(webConfig.modelRoot));
  await persistSmokeCorrelation(correlation);
  const prerequisite = prerequisiteState(env, cwd, webConfig);
  if (prerequisite === "invalid") {
    correlation.terminalStage = "prerequisite";
    correlation.terminalClassification = "invalid-live-configuration";
    await persistSmokeCorrelation(correlation).catch(() => undefined);
    stderr(formatTerminal("Idea Lab live smoke failed", correlation));
    return 1;
  }
  if (prerequisite === "blocked") {
    correlation.terminalStage = "prerequisite";
    correlation.terminalClassification = "required-live-settings-unavailable";
    await persistSmokeCorrelation(correlation).catch(() => undefined);
    stderr(formatTerminal("Idea Lab live smoke blocked-external", correlation));
    return 2;
  }
  const timeoutMs = deps.timeoutMs ?? 15 * 60_000;
  const cleanupTimeoutMs = deps.cleanupTimeoutMs ?? Math.min(timeoutMs, 10_000);
  const startServices = deps.startServices ?? startIseolRuntimeServices;
  const postCampaign = deps.postCampaign ?? postLiveCampaign;
  const listProductions = deps.listProductions ?? listPrototypeProductions;
  const listCandidates = deps.listCandidates ?? listPrototypeCandidates;
  const loadRun = deps.loadRun ?? loadHarnessRun;
  const loadCampaign = deps.loadCampaign ?? loadIdeaLabCampaign;
  let services: IseolRuntimeServices | undefined;
  let servicesDisposeStarted = false;
  let ownedAgent: ChildProcess | undefined;
  let exitCode = 1;
  let activeStage = "start-services";
  try {
    const agentUrl = env.ISEOL_DESKTOP_AGENT_URL?.trim();
    if (agentUrl) {
      ownedAgent = spawn(process.execPath, ["--import", "tsx", "src/desktop-agent/main.ts"], {
        cwd,
        env: { ...process.env, ...env },
        stdio: ["ignore", "ignore", "ignore"],
        windowsHide: true,
      });
    }
    activeStage = "start-services";
    services = await within(startServices({ env, webConfig }), timeoutMs);
    if (services.ideaLabCapability.state !== "ready" || !services.ideaLabRuntime) {
      throw new LiveSmokeExternalBlocker("Idea Lab live runtime composition is blocked");
    }
    activeStage = "desktop-agent-preflight";
    const agentId = env.ISEOL_IDEA_LAB_AGENT_ID?.trim();
    if (!agentId) throw new LiveSmokeExternalBlocker("Desktop Agent preflight failed: agent id is not configured");
    const connected = Boolean(services.desktopCore?.transport?.isAgentConnected(agentId));
    correlation.desktopAgentConnected = connected;
    correlation.desktopAgentIdMatches = connected;
    correlation.desktopAgentEligible = connected;
    correlation.sameCoreTransport = connected;
    correlation.readinessCheckedAt = new Date().toISOString();
    await persistSmokeCorrelation(correlation);
    assertLiveSmokeDesktopAgentReady(services, agentId);
    activeStage = "post-campaign";
    const created = await within(postCampaign(services.webServer, webConfig.token), timeoutMs);
    correlation.campaignId = created.id;
    await persistSmokeCorrelation(correlation);
    activeStage = "runtime-idle";
    await within(services.ideaLabRuntime.idle(), timeoutMs);
    const finalCampaign = await within(loadCampaign(webConfig.modelRoot, created.id), timeoutMs);
    if (!finalCampaign) throw new Error("Idea Lab live smoke Campaign disappeared after runtime idle");

    const productions = await within(listProductions(webConfig.modelRoot), timeoutMs);
    const candidates = await within(listCandidates(webConfig.modelRoot), timeoutMs);
    const campaignProductions = productions.filter((item) => item.campaignId === finalCampaign.id);
    const canonicalProduction = campaignProductions.length === 1 ? campaignProductions[0] : undefined;
    if (canonicalProduction) {
      correlation.productionId = canonicalProduction.id;
      correlation.runId = canonicalProduction.runId;
      await persistSmokeCorrelation(correlation);
    }
    const run = canonicalProduction
      ? await within(loadRun(webConfig.harnessRoot, canonicalProduction.runId), timeoutMs)
      : null;
    const verified = assertVerifiedOutcome(finalCampaign, productions, candidates, run);

    activeStage = "pre-restart-dispose";
    servicesDisposeStarted = true;
    await within(services.dispose(), timeoutMs);
    services = undefined;
    servicesDisposeStarted = false;
    activeStage = "restart-services";
    services = await within(startServices({ env, webConfig }), timeoutMs);
    if (services.ideaLabCapability.state !== "ready" || !services.ideaLabRuntime) {
      throw new LiveSmokeExternalBlocker("Idea Lab live runtime restart is blocked");
    }
    activeStage = "restart-idle";
    await within(services.ideaLabRuntime.idle(), timeoutMs);
    const restartedCampaign = await within(loadCampaign(webConfig.modelRoot, created.id), timeoutMs);
    if (!restartedCampaign) throw new Error("Idea Lab live smoke Campaign disappeared after restart");
    const restartedProductions = await within(listProductions(webConfig.modelRoot), timeoutMs);
    const restartedCandidates = await within(listCandidates(webConfig.modelRoot), timeoutMs);
    const restartedProduction = restartedProductions.find((item) => item.campaignId === created.id);
    const restartedRun = restartedProduction
      ? await within(loadRun(webConfig.harnessRoot, restartedProduction.runId), timeoutMs)
      : null;
    const afterRestart = assertVerifiedOutcome(restartedCampaign, restartedProductions, restartedCandidates, restartedRun);
    for (const key of Object.keys(verified) as Array<keyof SmokeIdentity>) {
      if (afterRestart[key] !== verified[key]) {
        throw new Error(`Idea Lab live smoke durable identity changed across restart: ${key}`);
      }
    }
    correlation.terminalStage = "restart-idle";
    correlation.terminalClassification = "success";
    await persistSmokeCorrelation(correlation);
    stdout(
      `Idea Lab live smoke passed: smoke=${correlation.smokeExecutionId}; campaign=${finalCampaign.id}; production=${verified.productionId}; candidate=${verified.candidateId}; run=${verified.runId}; restart=verified`,
    );
    exitCode = 0;
  } catch (error) {
    let authoritative: { stage: string; classification: string } | undefined;
    if (correlation.campaignId) {
      try {
        const productions = await listProductions(webConfig.modelRoot);
        const production = productions.find((item) => item.campaignId === correlation.campaignId);
        if (production) {
          correlation.productionId ??= production.id;
          correlation.runId ??= production.runId;
          authoritative = authoritativeRunTerminalState(await loadRun(webConfig.harnessRoot, production.runId));
        }
      } catch { /* preserve the original failure if durable state cannot be read */ }
    }
    correlation.terminalStage = authoritative?.stage ?? activeStage;
    correlation.terminalClassification = authoritative?.classification ?? terminalReason(error);
    await persistSmokeCorrelation(correlation).catch(() => undefined);
    const authoritativeExternalBlock = correlation.terminalClassification === "required-live-capability-unavailable";
    if (externalError(error) || authoritativeExternalBlock) {
      stderr(formatTerminal("Idea Lab live smoke blocked-external", correlation));
      exitCode = 2;
    } else {
      stderr(formatTerminal("Idea Lab live smoke failed during domain verification", correlation));
      exitCode = 1;
    }
  } finally {
    if (services && !servicesDisposeStarted) {
      servicesDisposeStarted = true;
      try {
        await within(services.dispose(), cleanupTimeoutMs);
      } catch {
        const preserveAuthoritativeFailure = correlation.terminalClassification !== null
          && correlation.terminalClassification !== "success";
        if (!preserveAuthoritativeFailure) {
          correlation.terminalStage = "service-disposal";
          correlation.terminalClassification = "service-disposal-failed";
        }
        await persistSmokeCorrelation(correlation).catch(() => undefined);
        stderr(formatTerminal("Idea Lab live smoke failed during service disposal", correlation));
        if (exitCode !== 2) exitCode = 1;
      }
    }
    if (ownedAgent && !ownedAgent.killed) {
      ownedAgent.kill();
    }
  }
  return exitCode;
}

const cliPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (cliPath && import.meta.url === cliPath) {
  process.exitCode = await runIdeaLabLiveSmokeCli();
}
