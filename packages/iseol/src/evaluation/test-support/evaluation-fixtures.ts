import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DesktopPolicySource, DesktopTaskPack } from "../../desktop-agent/contracts.js";
import { registerDesktopAgent } from "../../desktop-agent/agent-registry.js";
import type { HarnessRuntimeRunEnvelope, HarnessRunStage } from "../../harness/contracts.js";
import type { EvaluationScenarioExecution } from "../scenario-runner.js";

export const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

export async function createEvaluationFixture(prefix: string, git = false) {
  const base = await mkdtemp(join(tmpdir(), `${prefix}-`));
  const targetRoot = join(base, "repo");
  const registryRoot = join(base, "registry");
  const jobRoot = join(base, "jobs");
  const workerRoot = join(base, "web-worker");
  const runRoot = join(base, "runs");
  await mkdir(join(targetRoot, "docs"), { recursive: true });
  const harnessPath = join(targetRoot, "docs", "HARNESS_ENGINEERING.md");
  const harnessContent = "# Evaluation Harness\n";
  await writeFile(harnessPath, harnessContent, "utf8");
  if (git) {
    execFileSync("git", ["init"], { cwd: targetRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "iseol@example.com"], { cwd: targetRoot });
    execFileSync("git", ["config", "user.name", "Iseol Evaluation"], { cwd: targetRoot });
    await writeFile(join(targetRoot, "base.txt"), "base\n", "utf8");
    execFileSync("git", ["add", "-A"], { cwd: targetRoot });
    execFileSync("git", ["commit", "-m", "chore: initial"], { cwd: targetRoot, stdio: "ignore" });
  }
  const sourceSha = sha256(harnessContent);
  const policySources: DesktopPolicySource[] = [{ kind: "project-harness", path: harnessPath, sha256: sourceSha, required: true }];
  const policyDigest = sha256(`project-harness\n${harnessPath}\n${sourceSha}`);
  return { base, targetRoot, registryRoot, jobRoot, workerRoot, runRoot, harnessPath, harnessContent, sourceSha, policySources, policyDigest };
}
export function evaluationRun(targetRoot: string, stage: HarnessRunStage = "TEST", runId = "run-eval"): HarnessRuntimeRunEnvelope {
  return {
    version: 1,
    request: { version: 1, runId, mode: "project-workspace", objective: "Evaluation scenario", targetRoot },
    preflight: { version: 1, runId, status: "ready" },
    state: {
      version: 1,
      stage,
      status: "RUNNING",
      completedStages: ["PREFLIGHT"],
      skippedStages: [],
      updatedAt: "2026-09-08T07:00:00.000Z",
    },
    evidence: [],
    updatedAt: "2026-09-08T07:00:00.000Z",
  };
}

export function desktopPack(input: {
  targetRoot: string;
  stage?: DesktopTaskPack["stage"];
  jobId?: string;
  runId?: string;
  operations?: DesktopTaskPack["operations"];
  policyDigest?: string;
  policySources?: DesktopPolicySource[];
}): DesktopTaskPack {
  const stage = input.stage ?? "TEST";
  const operations = input.operations ?? [{ id: "read", type: "READ_FILE", path: "base.txt" }];
  const mutates = operations.some((item) => ["APPLY_PATCH", "RUN_PROCESS", "GIT_INIT", "GIT_WORKTREE_CREATE", "GIT_COMMIT"].includes(item.type));
  return {
    version: 1,
    jobId: input.jobId ?? `job-${stage.toLowerCase()}`,
    runId: input.runId ?? "run-eval",
    stage,
    attempt: 1,
    agentId: "agent-eval",
    workspaceRoot: input.targetRoot,
    ...(mutates ? { policyDigest: input.policyDigest, policySources: input.policySources } : {}),
    idempotencyKey: `${stage.toLowerCase()}:${input.jobId ?? "eval"}`,
    leaseUntil: "2026-09-08T07:10:00.000Z",
    operations,
  } as DesktopTaskPack;
}
export async function registerEvaluationAgent(registryRoot: string, workspaceRoot: string, at = "2026-09-08T07:00:00.000Z") {
  return registerDesktopAgent(registryRoot, {
    version: 1,
    agentId: "agent-eval",
    agentVersion: "0.1.0",
    os: process.platform,
    capabilities: ["git", "process"],
    workspaceRoots: [workspaceRoot],
    token: "not-persisted",
  }, at);
}

export function passingInvariantEvidence() {
  return {
    canonicalRunIdStable: true,
    canonicalDesktopJobIdStable: true,
    canonicalProductionIdStable: true,
    duplicateCommitCount: 0,
    duplicatePullRequestCount: 0,
    duplicateMergeCount: 0,
    duplicateDeploymentCount: 0,
    workspaceEscapeCount: 0,
    secretLeakageCount: 0,
    policyBypassMutationCount: 0,
    unverifiedCompletionCount: 0,
  };
}

export function passingExecution(summary: string, input: Partial<EvaluationScenarioExecution> = {}): EvaluationScenarioExecution {
  return {
    runs: [{
      runId: input.targetRunId ?? "run-eval",
      startedAt: "2026-09-08T07:00:00.000Z",
      completedAt: "2026-09-08T07:00:01.000Z",
      completed: true,
      verificationPassed: true,
      stageRetryCount: 0,
      staleSessionResultCount: 0,
      toolInvocationCount: 1,
      humanInterventionCount: 0,
    }],
    recoveries: [],
    sideEffects: [],
    providerCallCount: 0,
    unexpectedMutationCount: 0,
    invariantEvidence: passingInvariantEvidence(),
    summary,
    ...input,
  };
}

export function requireScenario(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
