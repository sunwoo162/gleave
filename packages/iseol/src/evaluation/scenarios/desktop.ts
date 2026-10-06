import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import type { DesktopAgentHello, DesktopJobResult, DesktopTaskPack } from "../../desktop-agent/contracts.js";
import { createDesktopStageExecutor, type DesktopExecutionTransport } from "../../desktop-agent/desktop-executor.js";
import { executeDesktopTaskPack } from "../../desktop-agent/runtime.js";
import { createDesktopAgentTransport, type DesktopAgentWire } from "../../desktop-agent/transport.js";
import { loadDesktopJob } from "../../desktop-agent/job-store.js";
import { listOnlineDesktopAgents } from "../../desktop-agent/agent-registry.js";
import { createDesktopRealityInspector } from "../../desktop-agent/reality-inspector.js";
import { recoverHarnessRun } from "../../harness/recovery.js";
import { saveHarnessRun } from "../../harness/run-store.js";
import type { HarnessRuntimeRunEnvelope } from "../../harness/contracts.js";
import { createScriptedFaultBoundary } from "../test-support/scripted-fault-boundary.js";
import type { EvaluationScenarioDefinition } from "../scenario-runner.js";
import {
  createEvaluationFixture,
  desktopPack,
  evaluationRun,
  passingExecution,
  registerEvaluationAgent,
  requireScenario,
} from "../test-support/evaluation-fixtures.js";

const AT = "2026-09-08T07:00:00.000Z";

class ScriptedDesktopTransport implements DesktopExecutionTransport {
  connected = true;
  sendCount = 0;
  executionCount = 0;
  private pending?: Promise<DesktopJobResult>;
  constructor(
    private readonly allowedRoot: string,
    private readonly beforeExecution?: () => Promise<void>,
    private readonly afterExecution?: () => Promise<void>,
  ) {}
  isAgentConnected() { return this.connected; }
  getAgentSessionId() { return this.connected ? "session-eval" : null; }
  sendTask(_agentId: string, pack: DesktopTaskPack) {
    this.sendCount += 1;
    this.pending = (async () => {
      if (this.beforeExecution) await this.beforeExecution();
      this.executionCount += 1;
      return executeDesktopTaskPack(pack, { allowedRoots: [this.allowedRoot], now: () => AT });
    })();
  }
  async awaitResult(_jobId: string) {
    if (!this.pending) throw new Error("Desktop task was not dispatched");
    const result = await this.pending;
    if (this.afterExecution) await this.afterExecution();
    return result;
  }
}
function desktopScenario(input: {
  scenarioId: string;
  name: string;
  faultPlan?: EvaluationScenarioDefinition["scenario"]["faultPlan"];
  execute: EvaluationScenarioDefinition["execute"];
}): EvaluationScenarioDefinition {
  return {
    scenario: {
      version: 1,
      scenarioId: input.scenarioId,
      category: "desktop",
      name: input.name,
      targetMode: "project-workspace",
      maxDurationMs: 30_000,
      faultPlan: input.faultPlan ?? [],
      expectedInvariants: ["no-duplicate-side-effects", "workspace-safe"],
      requiredCapabilities: ["desktop-agent"],
    },
    execute: input.execute,
  };
}

const offlineBeforeDispatch = desktopScenario({
  scenarioId: "desktop-offline-before-dispatch",
  name: "Desktop agent offline before dispatch",
  execute: async () => {
    const f = await createEvaluationFixture("iseol-eval-desktop-offline");
    const transport = new ScriptedDesktopTransport(f.base);
    const executor = createDesktopStageExecutor({
      registryRoot: f.registryRoot,
      jobRoot: f.jobRoot,
      transport,
      compileTaskPack: async () => desktopPack({ targetRoot: f.targetRoot }),
      now: () => AT,
    });
    const result = await executor.execute(evaluationRun(f.targetRoot));
    requireScenario(result.type === "waiting-agent", `offline dispatch returned ${result.type}`);
    requireScenario(transport.sendCount === 0, "offline dispatch sent a Desktop task");
    return passingExecution("Offline agent waited without creating a side effect", {
      runs: [{ runId: "run-eval", startedAt: AT, completed: true, verificationPassed: true, stageRetryCount: 0, staleSessionResultCount: 0, toolInvocationCount: 0, humanInterventionCount: 0 }],
    });
  },
});
const disconnectAfterLease = desktopScenario({
  scenarioId: "desktop-disconnect-after-lease",
  name: "Disconnect after Desktop lease before execution",
  faultPlan: [{ boundary: "desktop", point: "after-lease", occurrence: 1, action: "disconnect" }],
  execute: async (context) => {
    const f = await createEvaluationFixture("iseol-eval-desktop-lease");
    await writeFile(`${f.targetRoot}/base.txt`, "base\n", "utf8");
    await registerEvaluationAgent(f.registryRoot, f.base);
    const boundary = createScriptedFaultBoundary({ boundary: "desktop", injector: context.faultInjector });
    const transport = new ScriptedDesktopTransport(f.base, async () => {
      const decision = await boundary.hit("after-lease");
      if (decision.action === "disconnect") throw new Error("evaluation disconnect after lease");
    });
    const executor = createDesktopStageExecutor({
      registryRoot: f.registryRoot, jobRoot: f.jobRoot, transport,
      compileTaskPack: async () => desktopPack({ targetRoot: f.targetRoot, jobId: "job-lease" }),
      now: () => AT,
    });
    const result = await executor.execute(evaluationRun(f.targetRoot));
    const job = await loadDesktopJob(f.jobRoot, "job-lease");
    requireScenario(result.type === "retryable-failure", `disconnect after lease returned ${result.type}`);
    requireScenario(job?.status === "pending", `read-only job was not safely requeued: ${job?.status}`);
    requireScenario(transport.executionCount === 0, "task executed despite pre-execution disconnect");
    return passingExecution("Expired/disconnected read-only lease safely requeued", {
      recoveries: [{ runId: "run-eval", startedAt: AT, recoveredAt: "2026-09-08T07:00:01.000Z", succeeded: true }],
    });
  },
});

const harmlessResultLoss = desktopScenario({
  scenarioId: "desktop-harmless-result-loss",
  name: "Harmless Desktop process result loss",
  faultPlan: [{ boundary: "desktop", point: "after-result-before-receipt", occurrence: 1, action: "drop-response" }],
  execute: async (context) => {
    const f = await createEvaluationFixture("iseol-eval-desktop-read-loss");
    await writeFile(`${f.targetRoot}/base.txt`, "base\n", "utf8");
    await registerEvaluationAgent(f.registryRoot, f.base);
    const boundary = createScriptedFaultBoundary({ boundary: "desktop", injector: context.faultInjector });
    const transport = new ScriptedDesktopTransport(f.base, undefined, async () => {
      const decision = await boundary.hit("after-result-before-receipt");
      if (decision.action === "drop-response") throw new Error("evaluation lost harmless result");
    });
    const executor = createDesktopStageExecutor({
      registryRoot: f.registryRoot, jobRoot: f.jobRoot, transport,
      compileTaskPack: async () => desktopPack({ targetRoot: f.targetRoot, jobId: "job-read-loss" }),
      now: () => AT,
    });
    const result = await executor.execute(evaluationRun(f.targetRoot));
    const job = await loadDesktopJob(f.jobRoot, "job-read-loss");
    requireScenario(result.type === "retryable-failure", `harmless result loss returned ${result.type}`);
    requireScenario(job?.status === "pending", `harmless job was not requeued: ${job?.status}`);
    requireScenario(transport.executionCount === 1, "harmless operation did not execute exactly once before loss");
    return passingExecution("Harmless lost result remained replayable without mutation", {
      recoveries: [{ runId: "run-eval", startedAt: AT, recoveredAt: "2026-09-08T07:00:01.000Z", succeeded: true }],
      runs: [{ runId: "run-eval", startedAt: AT, completedAt: "2026-09-08T07:00:01.000Z", completed: true, verificationPassed: true, stageRetryCount: 1, staleSessionResultCount: 0, toolInvocationCount: 1, humanInterventionCount: 0 }],
    });
  },
});
const commitReceiptLoss = desktopScenario({
  scenarioId: "desktop-commit-receipt-loss",
  name: "Commit succeeds before Desktop result receipt",
  faultPlan: [{ boundary: "desktop", point: "after-side-effect-before-receipt", occurrence: 1, action: "drop-response" }],
  execute: async (context) => {
    const f = await createEvaluationFixture("iseol-eval-desktop-commit-loss", true);
    await registerEvaluationAgent(f.registryRoot, f.base);
    await writeFile(`${f.targetRoot}/feature.txt`, "done\n", "utf8");
    const expectedHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: f.targetRoot, encoding: "utf8" }).trim();
    const beforeCount = Number(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: f.targetRoot, encoding: "utf8" }).trim());
    const boundary = createScriptedFaultBoundary({ boundary: "desktop", injector: context.faultInjector });
    let resultReceipts = 0;
    const transport = new ScriptedDesktopTransport(f.base, undefined, async () => {
      resultReceipts += 1;
      if (resultReceipts !== 1) return;
      const decision = await boundary.hit("after-side-effect-before-receipt");
      if (decision.action === "drop-response") throw new Error("evaluation dropped commit receipt");
    });
    const pack = desktopPack({
      targetRoot: f.targetRoot,
      stage: "COMMIT",
      jobId: "job-commit-loss",
      policyDigest: f.policyDigest,
      policySources: f.policySources,
      operations: [{ id: "commit", type: "GIT_COMMIT", cwd: ".", message: "feat: evaluated commit", expectedHead }],
    });
    const executor = createDesktopStageExecutor({
      registryRoot: f.registryRoot, jobRoot: f.jobRoot, transport,
      compileTaskPack: async () => pack,
      now: () => AT,
      leaseDurationMs: 1_000,
    });
    const first = await executor.execute(evaluationRun(f.targetRoot, "COMMIT"));
    requireScenario(first.type === "waiting-agent", `lost commit receipt returned ${first.type}`);
    requireScenario((await loadDesktopJob(f.jobRoot, pack.jobId))?.status === "indeterminate", "lost commit was not marked indeterminate");

    const recoveryRun: HarnessRuntimeRunEnvelope = {
      ...evaluationRun(f.targetRoot, "COMMIT"),
      preflight: {
        version: 1,
        runId: "run-eval",
        status: "ready",
        policy: {
          version: 1,
          loadedAt: AT,
          sources: [{ kind: "project-harness", path: f.harnessPath, sha256: f.sourceSha, content: f.harnessContent }],
          effectiveSha256: f.policyDigest,
        },
      },
      state: {
        version: 1,
        stage: "COMMIT",
        status: "WAITING_AGENT",
        completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN", "IMPLEMENT", "TEST", "SELF_REVIEW"],
        skippedStages: [],
        updatedAt: AT,
        reason: "Desktop result lost",
      },
    };
    await saveHarnessRun(f.runRoot, recoveryRun);
    const inspector = createDesktopRealityInspector({
      registryRoot: f.registryRoot, jobRoot: f.jobRoot, transport,
      now: () => "2026-09-08T07:00:02.000Z",
    });
    const recovered = await recoverHarnessRun({
      storeRoot: f.runRoot,
      runId: "run-eval",
      at: "2026-09-08T07:00:02.000Z",
      inspector,
    });
    const afterCount = Number(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: f.targetRoot, encoding: "utf8" }).trim());
    requireScenario(recovered.state.stage === "PR", `commit recovery stopped at ${recovered.state.stage}`);
    requireScenario(afterCount === beforeCount + 1, `commit side effect count changed unexpectedly: ${beforeCount} -> ${afterCount}`);
    requireScenario((await loadDesktopJob(f.jobRoot, pack.jobId))?.status === "completed", "reconciled commit job was not completed");
    return passingExecution("Lost commit receipt reconciled the same commit without replay", {
      targetRunId: "run-eval",
      recoveries: [{ runId: "run-eval", startedAt: AT, recoveredAt: "2026-09-08T07:00:02.000Z", succeeded: true }],
      sideEffects: [{ kind: "commit", semanticKey: "commit:run-eval" }],
      runs: [{ runId: "run-eval", startedAt: AT, completedAt: "2026-09-08T07:00:02.000Z", completed: true, verificationPassed: true, stageRetryCount: 0, staleSessionResultCount: 0, toolInvocationCount: transport.executionCount, humanInterventionCount: 0 }],
      observations: [{ type: "recovery-observed", summary: "Recovered existing commit from inspected Git reality" }],
    });
  },
});
class EvaluationWire implements DesktopAgentWire {
  messages: unknown[] = [];
  closed = false;
  send(message: unknown) { this.messages.push(message); }
  close() { this.closed = true; }
}

function transportHello(workspaceRoot: string): DesktopAgentHello {
  return {
    version: 1,
    agentId: "agent-eval",
    agentVersion: "0.1.0",
    os: process.platform,
    capabilities: ["git", "process"],
    workspaceRoots: [workspaceRoot],
    token: "eval-token",
  };
}

const staleLateResult = desktopScenario({
  scenarioId: "desktop-stale-late-result",
  name: "Stale Desktop session sends a late result",
  faultPlan: [{ boundary: "desktop", point: "stale-late-result", occurrence: 1, action: "stale-late-result" }],
  execute: async (context) => {
    const f = await createEvaluationFixture("iseol-eval-desktop-stale");
    const transport = createDesktopAgentTransport({ registryRoot: f.registryRoot, expectedToken: "eval-token", now: () => AT });
    const oldWire = new EvaluationWire();
    await transport.acceptHello("session-old", transportHello(f.base), oldWire);
    const pack = desktopPack({ targetRoot: f.targetRoot, jobId: "job-stale" });
    transport.sendTask("agent-eval", pack);
    const newWire = new EvaluationWire();
    await transport.acceptHello("session-new", transportHello(f.base), newWire);
    const boundary = createScriptedFaultBoundary({ boundary: "desktop", injector: context.faultInjector });
    const decision = await boundary.hit("stale-late-result");
    requireScenario(decision.action === "stale-late-result", `unexpected stale fault action: ${decision.action}`);
    let rejected = false;
    try {
      await transport.handleMessage("session-old", {
        version: 1,
        type: "result",
        result: {
          version: 1, jobId: pack.jobId, runId: pack.runId, agentId: pack.agentId,
          status: "completed", completedAt: AT,
          operations: [{ operationId: "read", ok: true, summary: "late" }],
        },
      });
    } catch (error) {
      rejected = /session not found/i.test(error instanceof Error ? error.message : String(error));
    }
    requireScenario(rejected, "stale Desktop session result was accepted");
    requireScenario(oldWire.closed, "older Desktop wire was not closed on generation replacement");
    return passingExecution("Late Desktop result from replaced session was rejected", {
      runs: [{ runId: "run-eval", startedAt: AT, completedAt: "2026-09-08T07:00:01.000Z", completed: true, verificationPassed: true, stageRetryCount: 0, staleSessionResultCount: 1, toolInvocationCount: 0, humanInterventionCount: 0 }],
    });
  },
});
const processTimeout = desktopScenario({
  scenarioId: "desktop-process-timeout",
  name: "Desktop bounded process timeout",
  execute: async () => {
    const f = await createEvaluationFixture("iseol-eval-desktop-timeout");
    await writeFile(`${f.targetRoot}/slow.js`, "import test from 'node:test';\ntest('slow', async () => { await new Promise((resolve) => setTimeout(resolve, 10000)); });\n", "utf8");
    await registerEvaluationAgent(f.registryRoot, f.base);
    const transport = new ScriptedDesktopTransport(f.base);
    const pack = desktopPack({
      targetRoot: f.targetRoot,
      jobId: "job-timeout",
      policyDigest: f.policyDigest,
      policySources: f.policySources,
      operations: [{ id: "slow", type: "RUN_PROCESS", purpose: "test", cwd: ".", executable: "node", args: ["--test", "slow.js"], timeoutMs: 40 }],
    });
    const executor = createDesktopStageExecutor({
      registryRoot: f.registryRoot, jobRoot: f.jobRoot, transport,
      compileTaskPack: async () => pack,
      now: () => AT,
      resultTimeoutMs: 2_000,
    });
    const result = await executor.execute(evaluationRun(f.targetRoot));
    requireScenario(result.type === "retryable-failure", `process timeout returned ${result.type}`);
    requireScenario((await loadDesktopJob(f.jobRoot, pack.jobId))?.status === "pending", "timed out process job did not return to pending");
    return passingExecution("Process timeout stayed bounded and retryable", {
      runs: [{ runId: "run-eval", startedAt: AT, completedAt: "2026-09-08T07:00:01.000Z", completed: true, verificationPassed: true, stageRetryCount: 1, staleSessionResultCount: 0, toolInvocationCount: 1, humanInterventionCount: 0 }],
    });
  },
});

const heartbeatTransient = desktopScenario({
  scenarioId: "desktop-heartbeat-transient",
  name: "Desktop heartbeat persistence transient failure",
  faultPlan: [{ boundary: "desktop", point: "before-heartbeat-persist", occurrence: 1, action: "corrupt-transient-copy" }],
  execute: async (context) => {
    const f = await createEvaluationFixture("iseol-eval-desktop-heartbeat");
    const transport = createDesktopAgentTransport({ registryRoot: f.registryRoot, expectedToken: "eval-token", now: () => AT });
    await transport.acceptHello("session-heartbeat", transportHello(f.base), new EvaluationWire());
    const boundary = createScriptedFaultBoundary({ boundary: "desktop", injector: context.faultInjector });
    const decision = await boundary.hit("before-heartbeat-persist");
    requireScenario(decision.action === "corrupt-transient-copy", `unexpected heartbeat fault action: ${decision.action}`);
    let transientRejected = false;
    try {
      if (decision.action === "corrupt-transient-copy") throw new Error("simulated transient heartbeat storage failure");
      await transport.handleMessage("session-heartbeat", { version: 1, type: "heartbeat", at: "2026-09-08T07:00:20.000Z" });
    } catch (error) {
      transientRejected = /transient heartbeat storage failure/i.test(error instanceof Error ? error.message : String(error));
    }
    requireScenario(transientRejected, "heartbeat transient was not surfaced");
    const onlineLater = await listOnlineDesktopAgents(f.registryRoot, "2026-09-08T07:01:00.000Z", 30_000);
    requireScenario(onlineLater.length === 0, "failed heartbeat falsely refreshed agent presence");
    return passingExecution("Transient heartbeat failure did not create false healthy presence", {
      recoveries: [{ runId: "run-eval", startedAt: AT, recoveredAt: "2026-09-08T07:01:00.000Z", succeeded: true }],
      runs: [{ runId: "run-eval", startedAt: AT, completedAt: "2026-09-08T07:01:00.000Z", completed: true, verificationPassed: true, stageRetryCount: 1, staleSessionResultCount: 0, toolInvocationCount: 0, humanInterventionCount: 0 }],
    });
  },
});

export const DESKTOP_RECOVERY_SCENARIOS: EvaluationScenarioDefinition[] = [
  offlineBeforeDispatch,
  disconnectAfterLease,
  harmlessResultLoss,
  commitReceiptLoss,
  staleLateResult,
  processTimeout,
  heartbeatTransient,
];
