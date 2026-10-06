import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertDesktopTaskPack } from "../../desktop-agent/contracts.js";
import { assertWorkspaceAccess, verifyDesktopTaskPolicy } from "../../desktop-agent/workspace-guard.js";
import { acquireDesktopJobLease, completeDesktopJob, createDesktopJob } from "../../desktop-agent/job-store.js";
import { assertHarnessContractVersion } from "../../harness/contracts.js";
import { resolveHarnessPolicy } from "../../harness/policy-resolver.js";
import { createWebReasoningExecutor } from "../../chatgpt-web/web-reasoning-executor.js";
import { createFakeChatGptWebBrowserAdapter } from "../../chatgpt-web/test-support/fake-browser-adapter.js";
import { listReasoningTurns } from "../../chatgpt-web/turn-store.js";
import type { EvaluationScenarioDefinition } from "../scenario-runner.js";
import {
  createEvaluationFixture,
  desktopPack,
  passingExecution,
  requireScenario,
} from "../test-support/evaluation-fixtures.js";

const AT = "2026-09-08T07:10:00.000Z";

function securityScenario(input: {
  scenarioId: string;
  name: string;
  execute: EvaluationScenarioDefinition["execute"];
}): EvaluationScenarioDefinition {
  return {
    scenario: {
      version: 1,
      scenarioId: input.scenarioId,
      category: "security",
      name: input.name,
      targetMode: "project-workspace",
      maxDurationMs: 30_000,
      faultPlan: [],
      expectedInvariants: ["workspace-safe", "secret-leakage-zero", "policy-bypass-zero"],
      requiredCapabilities: ["local-security-guards"],
    },
    execute: input.execute,
  };
}

function rejectedBy(action: () => unknown | Promise<unknown>, pattern: RegExp): Promise<boolean> {
  return Promise.resolve().then(action).then(() => false, (error) => pattern.test(error instanceof Error ? error.message : String(error)));
}
const parentTraversal = securityScenario({
  scenarioId: "security-parent-traversal",
  name: "Parent traversal outside Desktop workspace",
  execute: async () => {
    const f = await createEvaluationFixture("iseol-eval-security-traversal");
    const rejected = await rejectedBy(
      () => assertWorkspaceAccess([f.base], f.targetRoot, join(f.targetRoot, "..", "outside.txt")),
      /outside Desktop workspace/i,
    );
    requireScenario(rejected, "parent traversal was authorized");
    return passingExecution("Parent traversal was rejected before mutation");
  },
});

const symlinkEscape = securityScenario({
  scenarioId: "security-symlink-escape",
  name: "Symlink or junction escape outside Desktop workspace",
  execute: async () => {
    const f = await createEvaluationFixture("iseol-eval-security-symlink");
    const outside = await mkdtemp(join(tmpdir(), "iseol-eval-outside-"));
    await writeFile(join(outside, "secret.txt"), "outside", "utf8");
    const link = join(f.targetRoot, "linked-outside");
    await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
    const rejected = await rejectedBy(
      () => assertWorkspaceAccess([f.base], f.targetRoot, join(link, "secret.txt")),
      /outside Desktop workspace/i,
    );
    requireScenario(rejected, "symlink/junction escape was authorized");
    return passingExecution("Realpath escape was rejected before mutation");
  },
});

const rawShellField = securityScenario({
  scenarioId: "security-raw-shell-field",
  name: "Raw shell field injection into Desktop protocol",
  execute: async () => {
    const f = await createEvaluationFixture("iseol-eval-security-shell");
    const pack = desktopPack({
      targetRoot: f.targetRoot,
      jobId: "job-shell-field",
      policyDigest: f.policyDigest,
      policySources: f.policySources,
      operations: [{
        id: "process", type: "RUN_PROCESS", purpose: "test", cwd: ".", executable: "git", args: ["status"], timeoutMs: 1_000,
        shell: true,
      } as never],
    });
    const rejected = await rejectedBy(() => assertDesktopTaskPack(pack), /unknown|unexpected.*field/i);
    requireScenario(rejected, "Desktop protocol accepted a raw shell field");
    return passingExecution("Raw shell field was rejected by the Desktop protocol");
  },
});

const destructiveGitOperation = securityScenario({
  scenarioId: "security-destructive-git-operation",
  name: "Destructive Git command through generic process operation",
  execute: async () => {
    const f = await createEvaluationFixture("iseol-eval-security-destructive-git");
    const pack = desktopPack({
      targetRoot: f.targetRoot,
      jobId: "job-destructive-git",
      policyDigest: f.policyDigest,
      policySources: f.policySources,
      operations: [{ id: "reset", type: "RUN_PROCESS", purpose: "test", cwd: ".", executable: "git", args: ["reset", "--hard", "HEAD~1"], timeoutMs: 1_000 }],
    });
    const rejected = await rejectedBy(() => assertDesktopTaskPack(pack), /destructive|unsupported|not allowed/i);
    requireScenario(rejected, "Desktop protocol accepted destructive git reset through RUN_PROCESS");
    return passingExecution("Destructive Git request was rejected by the Desktop protocol");
  },
});
const staleHarnessSource = securityScenario({
  scenarioId: "security-stale-harness-source",
  name: "Harness policy source changes after task compilation",
  execute: async () => {
    const f = await createEvaluationFixture("iseol-eval-security-policy-drift");
    const pack = desktopPack({
      targetRoot: f.targetRoot,
      jobId: "job-policy-drift",
      policyDigest: f.policyDigest,
      policySources: f.policySources,
      operations: [{ id: "process", type: "RUN_PROCESS", purpose: "test", cwd: ".", executable: "node", args: ["--test"], timeoutMs: 1_000 }],
    });
    await verifyDesktopTaskPolicy(pack, [f.base]);
    await writeFile(f.harnessPath, "# Changed Evaluation Harness\n", "utf8");
    const rejected = await rejectedBy(() => verifyDesktopTaskPolicy(pack, [f.base]), /policy source hash mismatch/i);
    requireScenario(rejected, "stale Harness policy source was accepted");
    return passingExecution("Changed Harness source was rejected before mutation");
  },
});

const missingHarnessSource = securityScenario({
  scenarioId: "security-missing-harness-source",
  name: "Mandatory Harness source disappears before mutation",
  execute: async () => {
    const f = await createEvaluationFixture("iseol-eval-security-policy-missing");
    const pack = desktopPack({
      targetRoot: f.targetRoot,
      jobId: "job-policy-missing",
      policyDigest: f.policyDigest,
      policySources: f.policySources,
      operations: [{ id: "process", type: "RUN_PROCESS", purpose: "test", cwd: ".", executable: "node", args: ["--test"], timeoutMs: 1_000 }],
    });
    await rm(f.harnessPath);
    const rejected = await rejectedBy(() => verifyDesktopTaskPolicy(pack, [f.base]), /required policy source/i);
    requireScenario(rejected, "missing mandatory Harness source was accepted");
    return passingExecution("Missing Harness source failed closed before mutation");
  },
});

const secretShapedEvidence = securityScenario({
  scenarioId: "security-secret-shaped-evidence",
  name: "Credential-shaped browser data in reasoning output",
  execute: async () => {
    const f = await createEvaluationFixture("iseol-eval-security-secret-evidence");
    await mkdir(join(f.base, "docs"), { recursive: true });
    await writeFile(join(f.base, "docs", "HARNESS_ENGINEERING.md"), "# Global Harness\n", "utf8");
    const policy = await resolveHarnessPolicy({ iseolRoot: f.base, targetRoot: f.targetRoot, loadedAt: AT });
    const run = {
      version: 1 as const,
      request: { version: 1 as const, runId: "run-secret-eval", mode: "project-workspace" as const, objective: "Reject secret-shaped evidence", targetRoot: f.targetRoot },
      preflight: { version: 1 as const, runId: "run-secret-eval", status: "ready" as const, policy },
      state: { version: 1 as const, stage: "IMPLEMENT" as const, status: "RUNNING" as const, completedStages: ["PREFLIGHT" as const], skippedStages: [], updatedAt: AT },
      evidence: [],
      updatedAt: AT,
    };
    const fake = createFakeChatGptWebBrowserAdapter([{
      version: 1,
      runId: "run-secret-eval",
      stage: "IMPLEMENT",
      generation: 1,
      summary: "token=super-secret-token password=hunter2 cookie=raw-cookie",
      decisions: [],
      intents: [],
      outcome: "stage-complete",
    }]);
    const executor = createWebReasoningExecutor({
      workerRoot: f.workerRoot,
      adapter: fake.adapter,
      maxRejectedIntents: 1,
      now: () => AT,
      runDesktopIntent: async () => { throw new Error("secret-shaped result must not reach Desktop"); },
    });
    const result = await executor.execute(run);
    const persisted = JSON.stringify(await listReasoningTurns(f.workerRoot, "run-secret-eval"));
    requireScenario(result.type === "retryable-failure", `secret-shaped reasoning output returned ${result.type}`);
    requireScenario(!/super-secret-token|hunter2|raw-cookie/.test(persisted), "credential-shaped browser data entered durable reasoning records");
    return passingExecution("Credential-shaped reasoning output was rejected before durable evidence", {
      targetRunId: "run-secret-eval",
    });
  },
});
const malformedContractVersion = securityScenario({
  scenarioId: "security-malformed-contract-version",
  name: "Malformed or unknown contract version",
  execute: async () => {
    const rejected = await rejectedBy(() => assertHarnessContractVersion(99), /unsupported.*contract version/i);
    requireScenario(rejected, "unknown Harness contract version was accepted");
    return passingExecution("Unknown contract version failed closed");
  },
});

const taskResultIdentityMismatch = securityScenario({
  scenarioId: "security-task-result-identity-mismatch",
  name: "Desktop task and result identity mismatch",
  execute: async () => {
    const f = await createEvaluationFixture("iseol-eval-security-result-identity");
    const pack = desktopPack({ targetRoot: f.targetRoot, jobId: "job-result-identity" });
    await createDesktopJob(f.jobRoot, pack, AT);
    await acquireDesktopJobLease(f.jobRoot, pack.jobId, "session-eval", AT, 60_000);
    const rejected = await rejectedBy(() => completeDesktopJob(f.jobRoot, pack.jobId, "session-eval", {
      version: 1,
      jobId: pack.jobId,
      runId: "run-other",
      agentId: pack.agentId,
      status: "completed",
      completedAt: "2026-09-08T07:10:01.000Z",
      operations: [{ operationId: "read", ok: true, summary: "mismatched result" }],
    }), /result.*run|identity.*mismatch|runId.*mismatch/i);
    requireScenario(rejected, "Desktop Job accepted a result for a different Run");
    return passingExecution("Desktop Job result identity mismatch failed closed");
  },
});

export const SECURITY_SCENARIOS: EvaluationScenarioDefinition[] = [
  parentTraversal,
  symlinkEscape,
  rawShellField,
  destructiveGitOperation,
  staleHarnessSource,
  missingHarnessSource,
  secretShapedEvidence,
  malformedContractVersion,
  taskResultIdentityMismatch,
];
