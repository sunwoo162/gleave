import { IMPLEMENT_DONE_PAYLOAD } from "../chatgpt-web/patch-frame-contract.js";
import { resolve } from "node:path";
import { ChatGptWebStructuredResultError, type ChatGptWebBrowserAdapter } from "../chatgpt-web/browser-adapter.js";
import { patchRejectionDiagnostic } from "../chatgpt-web/patch-diagnostics.js";
import { createHybridStageExecutor } from "../chatgpt-web/hybrid-executor.js";
import { buildValidatedPatchIntent, compileDesktopIntentToTaskPack } from "../chatgpt-web/intent-compiler.js";
import { listDesktopIntents, loadDesktopIntent } from "../chatgpt-web/intent-store.js";
import { createWebReasoningExecutor, type WebDesktopIntentRunner } from "../chatgpt-web/web-reasoning-executor.js";
import { createRequestBudgetStore } from "../chatgpt-web/request-budget.js";
import { createDesktopStageExecutor, desktopJobFeedback, type DesktopExecutionTransport, type DesktopTaskCompiler } from "../desktop-agent/desktop-executor.js";
import { findDesktopJobByIdempotencyKey } from "../desktop-agent/job-store.js";
import { createDesktopRealityInspector } from "../desktop-agent/reality-inspector.js";
import type { HarnessRuntimeRunEnvelope } from "../harness/contracts.js";
import { recoverHarnessRun } from "../harness/recovery.js";
import { createDevelopmentRun } from "../harness/run-service.js";
import { loadHarnessRun } from "../harness/run-store.js";
import { superviseHarnessRun, type HarnessStageExecutor } from "../harness/run-supervisor.js";
import type { IdeaProposal, PrototypeProduction } from "./contracts.js";
import type { ProductionAdvanceResult } from "./campaign-supervisor.js";
import type { PrototypeDeployAdapter, PrototypeDeploymentReceipt } from "./deploy-adapter.js";
import { deployPrototypeProduction, materializePrototypeCandidate, verifyPrototypeProductionDeployment } from "./production-service.js";
import { loadPrototypeProductionUnlocked as loadPrototypeProduction, savePrototypeProductionUnlocked as savePrototypeProduction } from "./production-store.js";
import { withDurableIdeaLabProductionLock } from "./production-lock.js";
import { loadIdeaProposal } from "./proposal-store.js";
import type { IdeaLabRuntimeConfig, IdeaLabRuntimeRoots } from "./runtime-config.js";
import { prototypeSandboxBranch, type PrototypeSandboxAdapter, type PrototypeSandboxAllocation } from "./sandbox-adapter.js";

type EnabledConfig = Extract<IdeaLabRuntimeConfig, { enabled: true }>;

export type IdeaLabProductionRuntimeDriverInput = EnabledConfig & {
  roots: IdeaLabRuntimeRoots;
  sandboxAdapter: PrototypeSandboxAdapter;
  desktopTransport: DesktopExecutionTransport;
  browserAdapter: ChatGptWebBrowserAdapter;
  desktopTaskCompiler: DesktopTaskCompiler;
  desktopStateRoot: string;
  deployAdapter: PrototypeDeployAdapter;
  now?: () => string;
};
const SAFE_PROVIDER_RETRY = "Idea Lab provider operation could not be completed; retrying safely";
const SAFE_PROVIDER_EXTERNAL = "Idea Lab provider authorization or capability is unavailable";
const SAFE_FINAL_FAILURE = "Harness production failed";

function classifyProviderFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/\bstatus (?:401|403)\b|unauthori[sz]ed|forbidden|authentication|authorization/i.test(message)) {
    return { type: "waiting-external" as const, reason: SAFE_PROVIDER_EXTERNAL };
  }
  if (/deployment not ready|response (?:lost|closed)|connection (?:reset|closed)|\bstatus (?:408|425|429|5\d\d)\b|fetch failed|ECONNRESET|ETIMEDOUT|ENETUNREACH|EAI_AGAIN/i.test(message)) {
    return { type: "retryable-failure" as const, reason: SAFE_PROVIDER_RETRY };
  }
  return { type: "final-failure" as const, reason: SAFE_FINAL_FAILURE };
}

function canonicalCommit(run: HarnessRuntimeRunEnvelope): string {
  const evidence = run.evidence.filter((item) =>
    item.kind === "commit" && item.stage === "COMMIT",
  );
  if (evidence.length !== 1 || !/^[0-9a-f]{40}$/i.test(evidence[0]?.reference ?? "")) {
    throw new Error("Idea Lab canonical COMMIT evidence is missing, invalid, or ambiguous");
  }
  return evidence[0]!.reference!;
}

function commitIdentityConflict(production: PrototypeProduction, commitSha: string): boolean {
  return Boolean(
    (production.commitSha?.trim() && production.commitSha !== commitSha)
    || (production.deployment?.commitSha?.trim() && production.deployment.commitSha !== commitSha),
  );
}

function expectedProductionBranch(campaignId: string, productionId: string): string {
  return prototypeSandboxBranch(campaignId, productionId);
}

function assertAllocationIdentity(
  allocation: PrototypeSandboxAllocation,
  input: IdeaLabProductionRuntimeDriverInput,
  campaignId: string,
  productionId: string,
  targetRoot: string,
): void {
  if (allocation.repositoryUrl !== input.repositoryUrl) throw new Error("Idea Lab sandbox repository identity mismatch");
  if (allocation.baseRef !== input.baseRef) throw new Error("Idea Lab sandbox base ref identity mismatch");
  if (allocation.branch !== expectedProductionBranch(campaignId, productionId)) throw new Error("Idea Lab sandbox branch identity mismatch");
  if (resolve(allocation.worktreeRoot) !== targetRoot) throw new Error("Idea Lab sandbox worktree identity mismatch");
}
function assertRunIdentity(
  run: HarnessRuntimeRunEnvelope,
  proposal: IdeaProposal,
  runId: string,
  targetRoot: string,
): void {
  if (
    run.request.runId !== runId ||
    run.request.mode !== "idea-lab" ||
    run.request.objective !== proposal.concept ||
    resolve(run.request.targetRoot) !== targetRoot
  ) {
    throw new Error("Idea Lab production Run identity mismatch");
  }
}
function assertProductionIdentity(
  production: PrototypeProduction,
  proposal: IdeaProposal,
  input: IdeaLabProductionRuntimeDriverInput,
  runId: string,
  targetRoot: string,
): void {
  const expectedBranch = expectedProductionBranch(proposal.campaignId, production.id);
  if (
    production.campaignId !== proposal.campaignId ||
    production.proposalId !== proposal.id ||
    production.runId !== runId ||
    production.repositoryUrl !== input.repositoryUrl ||
    resolve(production.sandboxRoot) !== resolve(input.sandboxRoot) ||
    resolve(production.worktreeRoot) !== targetRoot ||
    production.branch !== expectedBranch ||
    production.baseRef !== input.baseRef
  ) {
    throw new Error("Idea Lab Production identity mismatch");
  }
}

function deploymentReceipt(production: PrototypeProduction): PrototypeDeploymentReceipt | null {
  const value = production.deployment;
  if (!value?.provider || !value.deploymentId || !value.url || !value.commitSha || !value.deployedAt) return null;
  if (value.commitSha !== production.commitSha) return null;
  return {
    provider: value.provider, deploymentId: value.deploymentId, url: value.url,
    commitSha: value.commitSha, deployedAt: value.deployedAt,
    ...(value.verifiedAt ? { verifiedAt: value.verifiedAt } : {}),
  };
}
function verifiedReceipt(production: PrototypeProduction): PrototypeDeploymentReceipt | null {
  const value = deploymentReceipt(production);
  return value?.verifiedAt ? value : null;
}
export function createIdeaLabProductionRuntimeDriver(input: IdeaLabProductionRuntimeDriverInput) {
  const now = input.now ?? (() => new Date().toISOString());
  const webWorkerRoot = input.roots.webWorkerRoot ?? input.roots.webRoot;
  const requestBudget = input.externalRequestBudget
    ? createRequestBudgetStore(webWorkerRoot, input.externalRequestBudget, now)
    : undefined;
  const activeAdvances = new Map<string, Promise<ProductionAdvanceResult>>();

  async function createProductionUnlocked(proposal: IdeaProposal, ordinal: number): Promise<PrototypeProduction> {
    const id = `${proposal.campaignId}-prod-${ordinal}`;
    const runId = `run-${id}`;
    const targetRoot = resolve(input.sandboxRoot, proposal.campaignId, id);
    const existing = await loadPrototypeProduction(input.roots.modelRoot, id);
    let run = await loadHarnessRun(input.roots.runRoot, runId);
    if (existing && !run) throw new Error("Idea Lab production Run is missing for existing Production");


    if (run) assertRunIdentity(run, proposal, runId, targetRoot);


    if (!run) {
      run = await createDevelopmentRun(
        { version: 1, runId, mode: "idea-lab", objective: proposal.concept, targetRoot },
        { iseolRoot: input.roots.iseolRoot, storeRoot: input.roots.runRoot, policyRoot: input.repositoryRoot, loadedAt: now() },
      );
    }

    if (existing) {
      assertProductionIdentity(existing, proposal, input, runId, targetRoot);
      return existing;
    }
    const allocationInput = {
      campaignId: proposal.campaignId,
      productionId: id,
      run,
      sandboxRoot: input.sandboxRoot,
      repositoryRoot: input.repositoryRoot,
      repositoryUrl: input.repositoryUrl,
      baseRef: input.baseRef,
      agentId: input.agentId,
      iseolRoot: input.roots.iseolRoot,
      runStoreRoot: input.roots.runRoot,
    };
    const provisional: PrototypeProduction = {
      version: 1,
      id,
      campaignId: proposal.campaignId,
      proposalId: proposal.id,
      runId,
      repositoryUrl: input.repositoryUrl,
      sandboxRoot: input.sandboxRoot,
      worktreeRoot: targetRoot,
      branch: expectedProductionBranch(proposal.campaignId, id),
      baseRef: input.baseRef,
      status: "queued",
      createdAt: now(),
      updatedAt: now(),
    };
    await savePrototypeProduction(input.roots.modelRoot, provisional);
    const allocation = await input.sandboxAdapter.inspect(allocationInput)
      ?? await input.sandboxAdapter.allocate(allocationInput);
    assertAllocationIdentity(allocation, input, proposal.campaignId, id, targetRoot);

    const created: PrototypeProduction = {
      ...provisional,
      repositoryUrl: allocation.repositoryUrl,
      sandboxRoot: input.sandboxRoot,
      worktreeRoot: allocation.worktreeRoot,
      branch: allocation.branch,
      baseRef: allocation.baseRef,
      updatedAt: now(),
    };
    await savePrototypeProduction(input.roots.modelRoot, created);
    return created;
  }

  async function createProduction(proposal: IdeaProposal, ordinal: number): Promise<PrototypeProduction> {
    const id = `${proposal.campaignId}-prod-${ordinal}`;
    return withDurableIdeaLabProductionLock(
      input.roots.modelRoot,
      id,
      () => createProductionUnlocked(proposal, ordinal),
      { waitForMs: 2_000 },
    );
  }

  function createProviderExecutor(productionId: string): HarnessStageExecutor {
    return {
      async execute(run) {
        if (run.state.stage !== "DEPLOY" && run.state.stage !== "PRODUCTION_VERIFY") {
          return { type: "waiting-external", reason: "Idea Lab provider stage is not enabled" };
        }

        const current = await loadPrototypeProduction(input.roots.modelRoot, productionId);
        if (!current) return { type: "final-failure", reason: SAFE_FINAL_FAILURE };

        try {
          const commitSha = canonicalCommit(run);
          if (commitIdentityConflict(current, commitSha)) {
            return { type: "final-failure", reason: SAFE_FINAL_FAILURE };
          }
          const deployable: PrototypeProduction = {
            ...current,
            commitSha,
            status: run.state.stage === "DEPLOY" ? "deploying" : "verifying",
            updatedAt: now(),
          };
          await savePrototypeProduction(input.roots.modelRoot, deployable);
          if (run.state.stage === "DEPLOY") {
            const deployment = await deployPrototypeProduction(deployable, input.deployAdapter);
            const withDeployment: PrototypeProduction = {
              ...deployable,
              deployment,
              status: "verifying",
              updatedAt: now(),
            };
            await savePrototypeProduction(input.roots.modelRoot, withDeployment);
            return {
              type: "completed",
              evidence: [{
                version: 1,
                id: `deploy-${productionId}`,
                kind: "deployment",
                stage: "DEPLOY",
                recordedAt: now(),
                summary: "Preview deployed",
                provider: deployment.provider,
                reference: deployment.url,
              }],
            };
          }

          const deployment = deploymentReceipt(deployable);
          if (!deployment) return { type: "final-failure", reason: SAFE_FINAL_FAILURE };
          const verified = await verifyPrototypeProductionDeployment(deployable, deployment, input.deployAdapter);
          await savePrototypeProduction(input.roots.modelRoot, {
            ...deployable,
            deployment: verified,
            status: "verifying",
            updatedAt: now(),
          });
          return {
            type: "completed",
            evidence: [{
              version: 1,
              id: `verify-${productionId}`,
              kind: "production-verification",
              stage: "PRODUCTION_VERIFY",
              recordedAt: now(),
              summary: "Preview verified",
              provider: verified.provider,
              reference: verified.url,
            }],
          };
        } catch (error) {
          return classifyProviderFailure(error);
        }
      },
    };
  }

  function createExecutor(productionId: string): HarnessStageExecutor {
    let desktop: HarnessStageExecutor;
    const browserAdapter: ChatGptWebBrowserAdapter = {
      openOrResumeSession: (session, prompt) => input.browserAdapter.openOrResumeSession(session, prompt),
      submitTurn: (session, prompt) => input.browserAdapter.submitTurn(session, prompt),
      probeSession: (session) => input.browserAdapter.probeSession(session),
      closeSession: (session) => input.browserAdapter.closeSession(session),
      async awaitStructuredResult(session, timeoutMs, contract) {
        const raw = await input.browserAdapter.awaitStructuredResult(session, timeoutMs, contract);
        if (contract !== "patch-frame-v1" || typeof raw !== "string") return raw;
        const run = await loadHarnessRun(input.roots.runRoot, session.runId);
        if (!run) throw new ChatGptWebStructuredResultError("ChatGPT patch validation requires the active Run");
        try {
          if (raw.trim() === IMPLEMENT_DONE_PAYLOAD) {
            return {
              version: 1,
              runId: run.request.runId,
              stage: run.state.stage,
              generation: session.generation,
              summary: "IMPLEMENT patch sequence complete",
              decisions: [],
              intents: [],
              outcome: "stage-complete",
            };
          }

          const intent = buildValidatedPatchIntent(
            { run, session, resultGeneration: session.generation, commitAuthorized: false },
            raw,
          );

          return {
            version: 1,
            runId: run.request.runId,
            stage: run.state.stage,
            generation: session.generation,
            summary: "Validated IMPLEMENT patch",
            decisions: [],
            intents: [intent],
            outcome: "continue",
          };
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Patch validation failed";
          const rejectionClass = /path|workspace/i.test(reason) ? "invalid-path" : /hunk.*line counts/i.test(reason) ? "malformed-hunk" : /hunk|diff/i.test(reason) ? "malformed-unified-diff" : "unknown-safe-class";
          const safeReason = rejectionClass === "malformed-hunk" ? "hunk line counts do not match" : rejectionClass === "invalid-path" ? "workspace path rejected" : rejectionClass === "malformed-unified-diff" ? "unified diff rejected" : "patch validation rejected";
          throw new ChatGptWebStructuredResultError(`ChatGPT patch validation failed: ${safeReason}`, {
            ...patchRejectionDiagnostic(raw, rejectionClass),
            diagnosticCategory: "patch-validation-failure",
            validationResult: "rejected",
          });
        }
      },
    };
    const runDesktopIntent: WebDesktopIntentRunner = async ({ run, session, intent }) => {
      const pack = compileDesktopIntentToTaskPack(
        { run, session, resultGeneration: session.generation },
        intent,
        input.agentId,
        now(),
      );
      desktop = createDesktopStageExecutor({
        registryRoot: input.desktopStateRoot,
        jobRoot: input.desktopStateRoot,
        transport: input.desktopTransport,
        compileTaskPack: async () => pack,
        captureRetryableResultAsFeedback: true,
      });
      return desktop.execute(run);
    };

    const recoverDesktopFeedback = async ({ run, priorTurns }: { run: HarnessRuntimeRunEnvelope; priorTurns: Array<{ desktopIntentIds: string[] }> }) => {
      const feedback = [];
      const seen = new Set<string>();
      for (const turn of priorTurns) {
        for (const intentId of turn.desktopIntentIds) {
          if (seen.has(intentId)) continue;
          seen.add(intentId);
          const intentRecord = await loadDesktopIntent(webWorkerRoot, run.request.runId, intentId);
          if (!intentRecord) throw new Error(`Recovered Desktop intent record is missing: ${intentId}`);
          if (intentRecord.status === "rejected") {
            feedback.push({ kind: "reasoning-rejection", summary: intentRecord.reason ?? "Desktop intent was rejected", reference: `intent:${intentId}` });
            continue;
          }
          const job = await findDesktopJobByIdempotencyKey(input.desktopStateRoot, `web-intent:${run.request.runId}:${intentId}`);
          if (!job || job.status !== "completed" || !job.result) {
            throw new Error(`Recovered Desktop Job is not completed: ${intentId}`);
          }
          if (job.runId !== run.request.runId || job.stage !== run.state.stage) {
            throw new Error(`Recovered Desktop Job identity mismatch: ${intentId}`);
          }
          feedback.push(...desktopJobFeedback(run, job.result, job));
        }
      }
      const persistedIntents = await listDesktopIntents(webWorkerRoot, run.request.runId);
      for (const intentRecord of persistedIntents) {
        const intentId = intentRecord.intent.intentId;
        if (seen.has(intentId) || intentRecord.status !== "accepted") continue;
        if (intentRecord.intent.runId !== run.request.runId || intentRecord.intent.stage !== run.state.stage) continue;
        const job = await findDesktopJobByIdempotencyKey(input.desktopStateRoot, `web-intent:${run.request.runId}:${intentId}`);
        if (!job || job.status !== "completed" || !job.result) continue;
        if (job.runId !== run.request.runId || job.stage !== run.state.stage) {
          throw new Error(`Recovered Desktop Job identity mismatch: ${intentId}`);
        }
        seen.add(intentId);
        feedback.push(...desktopJobFeedback(run, job.result, job));
      }
      return feedback;
    };

    const web = createWebReasoningExecutor({
      workerRoot: webWorkerRoot,
      adapter: browserAdapter,
      runDesktopIntent,
      recoverDesktopFeedback,
      now,
      rateLimitBackoffMs: [30_000, 60_000, 120_000],
      commitAuthorized: false,
      ...(requestBudget ? { requestBudget } : {}),
    });
    desktop = createDesktopStageExecutor({
      registryRoot: input.desktopStateRoot,
      jobRoot: input.desktopStateRoot,
      transport: input.desktopTransport,
      compileTaskPack: input.desktopTaskCompiler,
      now,
    });
    const hybrid = createHybridStageExecutor({
      webExecutor: web,
      desktopExecutor: desktop,
      providerExecutor: createProviderExecutor(productionId),
    });
    return {
      async execute(run: HarnessRuntimeRunEnvelope) {
        const result = await hybrid.execute(run);
        if (result.type === "retryable-failure"
          && run.state.stage === "IMPLEMENT"
          && /ChatGPT Web failure: rejected structured-result budget exhausted; patch (?:appendix|frame|validation) invalid/i.test(result.reason)) {
          return { type: "final-failure" as const, reason: result.reason };
        }
        return result;
      },
    };
  }

  async function persistFailure(production: PrototypeProduction): Promise<PrototypeProduction> {
    const failed: PrototypeProduction = {
      ...production,
      status: "failed",
      failureSummary: SAFE_FINAL_FAILURE,
      updatedAt: now(),
    };
    await savePrototypeProduction(input.roots.modelRoot, failed);
    return failed;
  }

  async function finalizeReady(
    production: PrototypeProduction,
    proposal: IdeaProposal,    run: HarnessRuntimeRunEnvelope,
  ): Promise<PrototypeProduction> {
    let commitSha: string;
    try {
      commitSha = canonicalCommit(run);
    } catch {
      return persistFailure(production);
    }
    let latest = await loadPrototypeProduction(input.roots.modelRoot, production.id) ?? production;
    if (commitIdentityConflict(latest, commitSha)) return persistFailure(latest);
    latest = { ...latest, commitSha, status: "deploying", updatedAt: now() };
    await savePrototypeProduction(input.roots.modelRoot, latest);

    let deployment = verifiedReceipt(latest);
    if (!deployment) {
      try {
        const deployed = await deployPrototypeProduction(latest, input.deployAdapter);
        latest = { ...latest, deployment: deployed, status: "verifying", updatedAt: now() };
        await savePrototypeProduction(input.roots.modelRoot, latest);
        deployment = await verifyPrototypeProductionDeployment(latest, deployed, input.deployAdapter);
        latest = { ...latest, deployment, status: "verifying", updatedAt: now() };
        await savePrototypeProduction(input.roots.modelRoot, latest);
      } catch (error) {
        const failure = classifyProviderFailure(error);
        if (failure.type === "final-failure") return persistFailure(latest);
        throw new Error(failure.reason);
      }
    }

    const ready: PrototypeProduction = {
      ...latest,
      commitSha,
      deployment,
      status: "ready",
      failureSummary: undefined,
      blockerSummary: undefined,
      updatedAt: now(),
    };
    await materializePrototypeCandidate({
      modelRoot: input.roots.modelRoot,
      production: ready,      proposal,
      run,
      deployment,
      at: now(),
    });
    await savePrototypeProduction(input.roots.modelRoot, ready);
    return ready;
  }

  async function advanceProductionOnce(production: PrototypeProduction): Promise<ProductionAdvanceResult> {
    const proposal = await loadIdeaProposal(input.roots.modelRoot, production.proposalId);
    let run = await loadHarnessRun(input.roots.runRoot, production.runId);
    if (!proposal || !run) throw new Error("Idea Lab production dependency is missing");
    assertRunIdentity(run, proposal, production.runId, resolve(input.sandboxRoot, proposal.campaignId, production.id));

    const canonical = await loadPrototypeProduction(input.roots.modelRoot, production.id);
    if (!canonical) throw new Error("Idea Lab production dependency is missing");
    assertProductionIdentity(
      canonical,
      proposal,
      input,
      production.runId,
      resolve(input.sandboxRoot, production.campaignId, production.id),
    );

    if (run.state.status === "FAILED_FINAL") return persistFailure(canonical);
    if (run.state.status === "DONE") return finalizeReady(canonical, proposal, run);
    if (run.retry?.status === "active" && run.state.status === "RUNNING") {
      run = await recoverHarnessRun({
        storeRoot: input.roots.runRoot,
        runId: production.runId,
        inspector: createDesktopRealityInspector({
          registryRoot: input.desktopStateRoot,
          jobRoot: input.desktopStateRoot,
          transport: input.desktopTransport,
          now,
        }),
        at: now(),
      });
      if (run.state.status === "WAITING_AGENT") {
        const latest = await loadPrototypeProduction(input.roots.modelRoot, production.id) ?? canonical;
        await savePrototypeProduction(input.roots.modelRoot, { ...latest, status: "running", updatedAt: now() });
        return { production: { ...latest, status: "running", updatedAt: now() }, directive: "yield" };
      }
    }
    if (run.state.status === "WAITING_AGENT") {
      run = await recoverHarnessRun({
        storeRoot: input.roots.runRoot,
        runId: production.runId,
        inspector: createDesktopRealityInspector({
          registryRoot: input.desktopStateRoot,
          jobRoot: input.desktopStateRoot,
          transport: input.desktopTransport,
          now,
        }),
        at: now(),
      });

      if (run.state.status === "WAITING_AGENT") {
        const latest =
          await loadPrototypeProduction(input.roots.modelRoot, production.id)
          ?? canonical;

        const running: PrototypeProduction = {
          ...latest,
          status: "running",
          updatedAt: now(),
        };

        await savePrototypeProduction(input.roots.modelRoot, running);
        return {
          production: running,
          directive: "yield",
        };
      }
    }

    const final = await superviseHarnessRun({
      storeRoot: input.roots.runRoot,
      runId: production.runId,
      executor: createExecutor(production.id),
      maxSteps: 16,
      now,
    });
    if (final.state.status === "FAILED_FINAL") {
      const latest = await loadPrototypeProduction(input.roots.modelRoot, production.id) ?? canonical;
      return persistFailure(latest);
    }
    if (final.state.status === "FAILED_RETRYABLE") {
      const latest = await loadPrototypeProduction(input.roots.modelRoot, production.id) ?? canonical;
      await savePrototypeProduction(input.roots.modelRoot, {
        ...latest,
        status: "running",
        updatedAt: now(),
      });
      throw new Error("Idea Lab Harness retryable failure; yield campaign supervision for recovery");
    }
    if (final.state.status !== "DONE") {
      const latest = await loadPrototypeProduction(input.roots.modelRoot, production.id) ?? canonical;
      const running: PrototypeProduction = {
        ...latest,
        status: "running",
        updatedAt: now(),
      };
      await savePrototypeProduction(input.roots.modelRoot, running);
      return running;
    }
    const latest = await loadPrototypeProduction(input.roots.modelRoot, production.id) ?? canonical;
    return finalizeReady(latest, proposal, final);
  }

  async function advanceProduction(production: PrototypeProduction): Promise<ProductionAdvanceResult> {
    const existing = activeAdvances.get(production.id);
    if (existing) return existing;
    const operation = withDurableIdeaLabProductionLock(
      input.roots.modelRoot,
      production.id,
      () => advanceProductionOnce(production),
      { waitForMs: 2_000 },
    );
    activeAdvances.set(production.id, operation);
    try { return await operation; }
    finally { if (activeAdvances.get(production.id) === operation) activeAdvances.delete(production.id); }
  }

  return { createProduction, advanceProduction };
}
