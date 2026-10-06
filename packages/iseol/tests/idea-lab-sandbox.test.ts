import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { DesktopPolicySource, DesktopTaskPack } from "../src/desktop-agent/contracts.js";
import { assertDesktopTaskPack } from "../src/desktop-agent/contracts.js";
import { executeDesktopTaskPack } from "../src/desktop-agent/runtime.js";
import { createDevelopmentRun, refreshDevelopmentRunPreflight } from "../src/harness/run-service.js";
import { loadHarnessRun } from "../src/harness/run-store.js";
import { createDesktopPrototypeSandboxAdapter, prototypeSandboxBranch } from "../src/idea-lab/sandbox-adapter.js";

const NOW = "2026-09-08T03:00:00.000Z";
const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const effective = (sources: DesktopPolicySource[]) => sha(sources.map((s) => `${s.kind}\n${s.path}\n${s.sha256}`).join("\n---\n"));

function initRepo(path: string): void {
  execFileSync("git", ["init", "-b", "main"], { cwd: path, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "iseol@example.com"], { cwd: path });
  execFileSync("git", ["config", "user.name", "Iseol Test"], { cwd: path });
  execFileSync("git", ["add", "-A"], { cwd: path });
  execFileSync("git", ["commit", "-m", "chore: seed sandbox"], { cwd: path, stdio: "ignore" });
}
test("worktree operation contract rejects unsafe branch path and unknown fields", () => {
  const base: DesktopTaskPack = {
    version: 1, jobId: "job-sandbox", runId: "run-sandbox", stage: "CONTEXT", attempt: 0,
    agentId: "agent-1", workspaceRoot: "C:/sandbox", policyDigest: "a".repeat(64),
    policySources: [{ kind: "project-harness", path: "C:/sandbox/repo/docs/HARNESS_ENGINEERING.md", sha256: "b".repeat(64), required: true }],
    idempotencyKey: "sandbox:camp-1:prod-1", leaseUntil: "2026-09-08T03:01:00.000Z",
    operations: [{ id: "allocate", type: "GIT_WORKTREE_CREATE", cwd: "repo", branch: "idea/camp-1/prod-1", worktreePath: "worktrees/camp-1/prod-1", baseRef: "main" } as never],
  };
  assert.doesNotThrow(() => assertDesktopTaskPack(base));
  for (const operation of [
    { ...base.operations[0], branch: "idea/../escape" },
    { ...base.operations[0], worktreePath: "C:/outside" },
    { ...base.operations[0], args: ["--force"] },
  ]) {
    assert.throws(() => assertDesktopTaskPack({ ...base, operations: [operation as never] }), /worktree|branch|unknown|field|relative/i);
  }
});

test("runtime creates one worktree and reconciles the same branch path on retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-idea-sandbox-"));
  const repo = join(root, "repo");
  await mkdir(join(repo, "docs"), { recursive: true });
  const harness = join(repo, "docs", "HARNESS_ENGINEERING.md");
  await writeFile(harness, "# Sandbox Harness\n", "utf8");
  await writeFile(join(repo, "seed.txt"), "seed\n", "utf8");
  initRepo(repo);
  const sources: DesktopPolicySource[] = [{ kind: "project-harness", path: harness, sha256: sha("# Sandbox Harness\n"), required: true }];
  const pack: DesktopTaskPack = {
    version: 1, jobId: "job-sandbox", runId: "run-sandbox", stage: "CONTEXT", attempt: 1,
    agentId: "agent-1", workspaceRoot: root, policyDigest: effective(sources), policySources: sources,
    idempotencyKey: "sandbox:camp-1:prod-1", leaseUntil: "2026-09-08T03:01:00.000Z",
    operations: [{ id: "allocate", type: "GIT_WORKTREE_CREATE", cwd: "repo", branch: "idea/camp-1/prod-1", worktreePath: "worktrees/camp-1/prod-1", baseRef: "main" } as never],
  };
  const first = await executeDesktopTaskPack(pack, { allowedRoots: [root] });
  const second = await executeDesktopTaskPack(pack, { allowedRoots: [root] });
  assert.equal(first.status, "completed");
  assert.equal(second.status, "completed");
  const listed = execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: repo, encoding: "utf8" });
  assert.equal((listed.match(/branch refs\/heads\/idea\/camp-1\/prod-1/g) ?? []).length, 1);
});
test("planned target can preflight from policyRoot then refresh from the real worktree", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-idea-preflight-"));
  const iseolRoot = join(root, "iseol");
  const policyRoot = join(root, "sandbox-repo");
  const targetRoot = join(root, "worktrees", "camp-1", "prod-1");
  const storeRoot = join(root, "runs");
  await mkdir(join(iseolRoot, "docs"), { recursive: true });
  await mkdir(join(policyRoot, "docs"), { recursive: true });
  await writeFile(join(iseolRoot, "docs", "HARNESS_ENGINEERING.md"), "# Global\n", "utf8");
  await writeFile(join(policyRoot, "docs", "HARNESS_ENGINEERING.md"), "# Sandbox policy\n", "utf8");
  const run = await createDevelopmentRun({ version: 1, runId: "run-idea-1", mode: "idea-lab", objective: "build proposal", targetRoot }, {
    iseolRoot, storeRoot, loadedAt: NOW, policyRoot,
  } as never);
  assert.equal(run.preflight.status, "ready");
  assert.equal(run.preflight.policy?.sources.some((source) => source.path.includes("sandbox-repo")), true);
  await mkdir(join(targetRoot, "docs"), { recursive: true });
  await writeFile(join(targetRoot, "docs", "HARNESS_ENGINEERING.md"), "# Candidate policy\n", "utf8");
  await writeFile(join(targetRoot, "AGENTS.md"), "# Candidate agents\n", "utf8");
  const refreshed = await refreshDevelopmentRunPreflight({ storeRoot, runId: "run-idea-1", iseolRoot, loadedAt: "2026-09-08T03:00:01.000Z" });
  assert.equal(refreshed.preflight.policy?.sources.some((source) => source.path === join(targetRoot, "AGENTS.md")), true);
  assert.deepEqual(await loadHarnessRun(storeRoot, "run-idea-1"), refreshed);
});

test("desktop sandbox adapter derives stable branch and dispatches only typed task packs", async () => {
  const sent: DesktopTaskPack[] = [];
  const run = {
    version: 1,
    request: { version: 1, runId: "run-idea-1", mode: "idea-lab", objective: "build", targetRoot: "C:/sandbox/worktrees/camp-1/prod-1" },
    preflight: { version: 1, runId: "run-idea-1", status: "ready", policy: { version: 1, loadedAt: NOW, effectiveSha256: "a".repeat(64), sources: [{ kind: "project-harness", path: "C:/sandbox/repo/docs/HARNESS_ENGINEERING.md", sha256: "b".repeat(64), content: "# Sandbox" }] } },
    state: { version: 1, stage: "CONTEXT", status: "READY", completedStages: ["PREFLIGHT"], skippedStages: [], updatedAt: NOW },
    evidence: [], updatedAt: NOW,
  } as const;
  const adapter = createDesktopPrototypeSandboxAdapter({
    dispatch: async (pack) => { sent.push(pack); return { version: 1, jobId: pack.jobId, runId: pack.runId, agentId: pack.agentId, status: "completed", completedAt: NOW, operations: [{ operationId: "allocate", ok: true, summary: "created", reference: pack.workspaceRoot }] }; },
    refreshPreflight: async () => run as never,
    now: () => NOW,
  });
  const allocation = await adapter.allocate({ campaignId: "camp-1", productionId: "prod-1", run: run as never, sandboxRoot: "C:/sandbox", repositoryRoot: "C:/sandbox/repo", repositoryUrl: "https://example.invalid/sandbox.git", baseRef: "main", agentId: "agent-1", iseolRoot: "C:/iseol", runStoreRoot: "C:/runs" });
  assert.equal(prototypeSandboxBranch("camp-1", "prod-1"), "idea/camp-1/prod-1");
  assert.equal(allocation.branch, "idea/camp-1/prod-1");
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.operations[0]?.type, "GIT_WORKTREE_CREATE");
  assert.equal((sent[0]?.operations[0] as { cwd?: string }).cwd, relative("C:/sandbox", "C:/sandbox/repo").replaceAll("\\", "/"));
});
