import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DesktopJobResult, DesktopTaskPack } from "../src/desktop-agent/contracts.js";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import { registerDesktopAgent } from "../src/desktop-agent/agent-registry.js";
import { acquireDesktopJobLease, createDesktopJob, loadDesktopJob, markDesktopJobIndeterminate } from "../src/desktop-agent/job-store.js";
import { executeDesktopTaskPack } from "../src/desktop-agent/runtime.js";
import { createDesktopRealityInspector } from "../src/desktop-agent/reality-inspector.js";
import { recoverHarnessRun } from "../src/harness/recovery.js";
import { saveHarnessRun } from "../src/harness/run-store.js";

const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

function initGit(workspace: string) {
  execFileSync("git", ["init"], { cwd: workspace, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "iseol@example.com"], { cwd: workspace });
  execFileSync("git", ["config", "user.name", "Iseol Test"], { cwd: workspace });
}

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), "iseol-desktop-recovery-"));
  const targetRoot = join(base, "repo");
  const registryRoot = join(base, "registry");
  const jobRoot = join(base, "jobs");
  const runRoot = join(base, "runs");
  await mkdir(join(targetRoot, "docs"), { recursive: true });
  const harnessPath = join(targetRoot, "docs", "HARNESS_ENGINEERING.md");
  const harnessContent = "# Recovery Harness\n";
  await writeFile(harnessPath, harnessContent, "utf8");
  initGit(targetRoot);
  await writeFile(join(targetRoot, "base.txt"), "base\n", "utf8");
  execFileSync("git", ["add", "-A"], { cwd: targetRoot });
  execFileSync("git", ["commit", "-m", "chore: initial"], { cwd: targetRoot, stdio: "ignore" });
  const expectedHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: targetRoot, encoding: "utf8" }).trim();
  const sourceSha = sha(harnessContent);
  const policyDigest = sha(`project-harness\n${harnessPath}\n${sourceSha}`);
  return { base, targetRoot, registryRoot, jobRoot, runRoot, harnessPath, harnessContent, expectedHead, sourceSha, policyDigest };
}

function recoveryRun(f: Awaited<ReturnType<typeof fixture>>): HarnessRuntimeRunEnvelope {
  return {
    version: 1,
    request: { version: 1, runId: "run-commit", mode: "project-workspace", objective: "Recover commit", targetRoot: f.targetRoot },
    preflight: {
      version: 1,
      runId: "run-commit",
      status: "ready",
      policy: {
        version: 1,
        loadedAt: "2026-09-08T03:00:00.000Z",
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
      updatedAt: "2026-09-08T03:00:10.000Z",
      reason: "Desktop Agent disconnected",
    },
    evidence: [],
    updatedAt: "2026-09-08T03:00:10.000Z",
  };
}

function commitPack(f: Awaited<ReturnType<typeof fixture>>): DesktopTaskPack {
  return {
    version: 1,
    jobId: "job-commit",
    runId: "run-commit",
    stage: "COMMIT",
    attempt: 1,
    agentId: "agent-001",
    workspaceRoot: f.targetRoot,
    policyDigest: f.policyDigest,
    policySources: [{ kind: "project-harness", path: f.harnessPath, sha256: f.sourceSha, required: true }],
    idempotencyKey: "commit:run-commit",
    leaseUntil: "2026-09-08T03:00:20.000Z",
    operations: [{
      id: "commit",
      type: "GIT_COMMIT",
      cwd: ".",
      message: "feat: recovered commit",
      expectedHead: f.expectedHead,
    }],
  } as DesktopTaskPack;
}

class RuntimeTransport {
  sendCount = 0;
  private results = new Map<string, Promise<DesktopJobResult>>();
  constructor(private readonly allowedRoot: string) {}
  isAgentConnected() { return true; }
  getAgentSessionId() { return "session-new"; }
  sendTask(_agentId: string, pack: DesktopTaskPack) {
    this.sendCount += 1;
    this.results.set(pack.jobId, executeDesktopTaskPack(pack, { allowedRoots: [this.allowedRoot] }));
  }
  async awaitResult(jobId: string) {
    const result = this.results.get(jobId);
    if (!result) throw new Error(`missing fake result ${jobId}`);
    return result;
  }
}

async function registerAgent(f: Awaited<ReturnType<typeof fixture>>) {
  await registerDesktopAgent(f.registryRoot, {
    version: 1,
    agentId: "agent-001",
    agentVersion: "0.1.0",
    os: "win32",
    capabilities: ["git", "process"],
    workspaceRoots: [f.base],
    token: "not-persisted",
  }, "2026-09-08T03:00:25.000Z");
}

test("reconnect reconciles an already-created intended commit without committing twice", async () => {
  const f = await fixture();
  await registerAgent(f);
  const pack = commitPack(f);
  await createDesktopJob(f.jobRoot, pack, "2026-09-08T03:00:00.000Z");
  await acquireDesktopJobLease(f.jobRoot, pack.jobId, "session-old", "2026-09-08T03:00:00.000Z", 10_000);
  await writeFile(join(f.targetRoot, "feature.txt"), "done\n", "utf8");
  execFileSync("git", ["add", "-A"], { cwd: f.targetRoot });
  execFileSync("git", ["commit", "-m", "feat: recovered commit"], { cwd: f.targetRoot, stdio: "ignore" });
  const committedHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: f.targetRoot, encoding: "utf8" }).trim();
  const beforeCount = execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: f.targetRoot, encoding: "utf8" }).trim();
  const run = recoveryRun(f);
  await saveHarnessRun(f.runRoot, run);
  const transport = new RuntimeTransport(f.base);
  const inspector = createDesktopRealityInspector({
    registryRoot: f.registryRoot,
    jobRoot: f.jobRoot,
    transport,
    now: () => "2026-09-08T03:00:30.000Z",
  });

  const reality = await inspector.inspect(run);
  assert.equal(reality.agentAvailable, true);
  assert.equal(reality.currentCommit, committedHead);
  assert.equal(reality.desktopCommit?.reference, committedHead);
  assert.equal(reality.desktopCommit?.jobId, "job-commit");

  const recovered = await recoverHarnessRun({
    storeRoot: f.runRoot,
    runId: "run-commit",
    at: "2026-09-08T03:00:30.000Z",
    inspector,
  });
  assert.equal(recovered.state.stage, "PR");
  assert.equal(recovered.evidence.some((item) => item.kind === "commit" && item.reference === committedHead), true);
  assert.equal((await loadDesktopJob(f.jobRoot, "job-commit"))?.status, "completed");
  const afterCount = execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: f.targetRoot, encoding: "utf8" }).trim();
  assert.equal(afterCount, beforeCount);
});

test("active foreign lease prevents commit reconciliation takeover", async () => {
  const f = await fixture();
  await registerAgent(f);
  const pack = commitPack(f);
  await createDesktopJob(f.jobRoot, pack, "2026-09-08T03:00:00.000Z");
  await acquireDesktopJobLease(f.jobRoot, pack.jobId, "session-old", "2026-09-08T03:00:00.000Z", 60_000);
  const transport = new RuntimeTransport(f.base);
  const inspector = createDesktopRealityInspector({
    registryRoot: f.registryRoot,
    jobRoot: f.jobRoot,
    transport,
    now: () => "2026-09-08T03:00:20.000Z",
  });
  const reality = await inspector.inspect(recoveryRun(f));
  assert.equal(reality.agentAvailable, true);
  assert.equal(reality.desktopCommit, undefined);
  assert.equal((await loadDesktopJob(f.jobRoot, "job-commit"))?.lease?.owner, "session-old");
});

test("published commit recovery waits until origin contains the exact committed branch head", async () => {
  const f = await fixture();
  await registerAgent(f);
  const pack = commitPack(f);
  const operation = pack.operations[0];
  assert.equal(operation?.type, "GIT_COMMIT");
  if (operation?.type !== "GIT_COMMIT") return;
  operation.publish = true;
  await createDesktopJob(f.jobRoot, pack, "2026-09-08T03:00:00.000Z");
  await acquireDesktopJobLease(f.jobRoot, pack.jobId, "session-old", "2026-09-08T03:00:00.000Z", 10_000);
  await writeFile(join(f.targetRoot, "feature.txt"), "done\n", "utf8");
  execFileSync("git", ["add", "-A"], { cwd: f.targetRoot });
  execFileSync("git", ["commit", "-m", "feat: recovered commit"], { cwd: f.targetRoot, stdio: "ignore" });
  const committedHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: f.targetRoot, encoding: "utf8" }).trim();
  const branch = execFileSync("git", ["branch", "--show-current"], { cwd: f.targetRoot, encoding: "utf8" }).trim();
  const remote = join(f.base, "remote.git");
  execFileSync("git", ["init", "--bare", remote], { stdio: "ignore" });
  execFileSync("git", ["remote", "add", "origin", remote], { cwd: f.targetRoot });
  const transport = new RuntimeTransport(f.base);
  const inspector = createDesktopRealityInspector({ registryRoot: f.registryRoot, jobRoot: f.jobRoot, transport, now: () => "2026-09-08T03:00:30.000Z" });

  const beforePush = await inspector.inspect(recoveryRun(f));
  assert.equal(beforePush.desktopCommit, undefined);
  execFileSync("git", ["push", "origin", `HEAD:refs/heads/${branch}`], { cwd: f.targetRoot, stdio: "ignore" });
  const afterPush = await inspector.inspect(recoveryRun(f));
  assert.equal(afterPush.desktopCommit?.reference, committedHead);
  assert.equal((await loadDesktopJob(f.jobRoot, pack.jobId))?.status, "completed");
});

test("reconciles an indeterminate APPLY_PATCH only when the exact creation postcondition is present", async () => {
  const f = await fixture();
  await registerDesktopAgent(f.registryRoot, { version: 1, agentId: "agent-001", agentVersion: "0.1.0", os: "win32", capabilities: ["git", "process"], workspaceRoots: [f.targetRoot], token: "not-persisted" }, "2026-09-08T03:00:25.000Z");
  const patch = "diff --git a/recovered.txt b/recovered.txt\nnew file mode 100644\n--- /dev/null\n+++ b/recovered.txt\n@@ -0,0 +1 @@\n+recovered\n";
  const run: HarnessRuntimeRunEnvelope = {
    ...recoveryRun(f),
    request: { ...recoveryRun(f).request, runId: "run-implement" },
    state: { ...recoveryRun(f).state, stage: "IMPLEMENT", status: "RUNNING", completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN"] },
  };
  await saveHarnessRun(f.runRoot, run);
  const pack = {
    version: 1 as const, jobId: "job-apply", runId: run.request.runId, stage: "IMPLEMENT" as const,
    attempt: 1, agentId: "agent-001", workspaceRoot: f.targetRoot, policyDigest: f.policyDigest,
    policySources: [{ kind: "project-harness", path: f.harnessPath, sha256: f.sourceSha, required: true }],
    idempotencyKey: "web-intent:run-implement:patch", leaseUntil: "2026-09-08T02:59:00.000Z",
    operations: [{ id: "patch", type: "APPLY_PATCH" as const, path: "recovered.txt", patch }],
  } as DesktopTaskPack;
  await createDesktopJob(f.jobRoot, pack, "2026-09-08T03:00:00.000Z");
  await acquireDesktopJobLease(f.jobRoot, pack.jobId, "session-old", "2026-09-08T03:00:00.000Z", 10_000);
  await markDesktopJobIndeterminate(f.jobRoot, pack.jobId, "session-old", "2026-09-08T03:00:20.000Z");
  await writeFile(join(f.targetRoot, "recovered.txt"), "recovered\n", "utf8");
  const inspector = createDesktopRealityInspector({ registryRoot: f.registryRoot, jobRoot: f.jobRoot, transport: new RuntimeTransport(f.base), now: () => "2026-09-08T03:00:40.000Z" });
  const reality = await inspector.inspect(run);
  assert.equal(reality.desktopPatch?.jobId, pack.jobId);
  assert.equal((await loadDesktopJob(f.jobRoot, pack.jobId))?.status, "completed");
  assert.equal((await loadDesktopJob(f.jobRoot, pack.jobId))?.result?.operations[0]?.summary, "Reconciled existing APPLY_PATCH effect");
});
