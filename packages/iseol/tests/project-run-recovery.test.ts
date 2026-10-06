import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDevelopmentRun } from "../src/harness/run-service.js";
import { loadHarnessRun } from "../src/harness/run-store.js";
import { reconcileProjectWorkspaceRun, startProjectWorkspaceRun } from "../src/project-model/workspace-run-preparation.js";
import type { ProjectWorkspace } from "../src/project-model/contracts.js";
import { loadProjectHistory } from "../src/project-model/history-store.js";
import { saveProjectWorkspace, loadProjectWorkspace } from "../src/project-model/workspace-store.js";
import { defaultAgentRoleRegistrations, resolveExecutionProfile } from "../src/project-model/execution-profile.js";
import { superviseHarnessRun } from "../src/harness/run-supervisor.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-run-recovery-"));
  const modelRoot = join(root, "model");
  const harnessRoot = join(root, "runs");
  const iseolRoot = join(root, "iseol");
  const targetRoot = join(root, "target");
  await mkdir(join(iseolRoot, "docs"), { recursive: true });
  await mkdir(targetRoot, { recursive: true });
  await writeFile(join(iseolRoot, "docs", "HARNESS_ENGINEERING.md"), "isolated policy\n");
  const at = "2026-09-19T00:00:00.000Z";
  const profile = resolveExecutionProfile({
    purpose: "rapid-prototype",
    objective: "Build a recovery project",
    roles: defaultAgentRoleRegistrations(),
  });
  const workspace: ProjectWorkspace = {
    version: 1,
    id: "project-recovery",
    name: "Recovery project",
    status: "active",
    genesis: {
      prototypeId: "prototype-recovery",
      repository: { url: "https://example.invalid/repo", branch: "main", commitSha: "abc" },
      deployment: { url: "https://example.invalid" },
      runs: [],
      promotedAt: at,
    },
    tree: [{ id: "root", kind: "root", title: "Recovery project", status: "in-progress", runIds: [], createdAt: at, updatedAt: at }],
    purposeSelection: { version: 1, purpose: profile.purpose, selectedAt: at, source: "user", profile },
    createdAt: at,
    updatedAt: at,
  };
  await saveProjectWorkspace(modelRoot, workspace);
  return { modelRoot, harnessRoot, iseolRoot, targetRoot };
}

test("restart reconciliation attaches an orphaned Run exactly once", async () => {
  const { modelRoot, harnessRoot, iseolRoot, targetRoot } = await fixture();
  await createDevelopmentRun({
    version: 1,
    runId: "run-recovery",
    mode: "project-workspace",
    projectId: "project-recovery",
    objective: "Recover the interrupted project Run",
    targetRoot,
  }, { iseolRoot, storeRoot: harnessRoot, loadedAt: "2026-09-19T00:01:00.000Z" });

  await reconcileProjectWorkspaceRun(modelRoot, harnessRoot, "project-recovery", "run-recovery", "2026-09-19T00:02:00.000Z");
  await reconcileProjectWorkspaceRun(modelRoot, harnessRoot, "project-recovery", "run-recovery", "2026-09-19T00:03:00.000Z");

  const workspace = await loadProjectWorkspace(modelRoot, "project-recovery");
  assert.deepEqual(workspace?.tree[0]?.runIds, ["run-recovery"]);
  const history = await loadProjectHistory(modelRoot, "project-recovery");
  assert.equal(history.filter((event) => event.type === "run-attached").length, 1);
  assert.equal((await loadHarnessRun(harnessRoot, "run-recovery"))?.request.projectId, "project-recovery");
});

test("purpose-bound Run reaches DONE through the existing Harness supervisor", async () => {
  const { modelRoot, harnessRoot, iseolRoot, targetRoot } = await fixture();
  const started = await startProjectWorkspaceRun(modelRoot, "project-recovery", {
    runId: "run-vertical",
    objective: "Build the recovery project",
    targetRoot,
  }, { iseolRoot, storeRoot: harnessRoot, loadedAt: "2026-09-19T00:04:00.000Z" });
  assert.equal(started.status, "created");
  assert.equal(started.run.preflight.status, "ready");
  assert.equal(started.run.state.stage, "CONTEXT");
  const requiredKinds: Record<string, "test" | "build" | "review" | "commit" | "pull-request" | "ci" | "deployment" | "production-verification"> = {
    TEST: "test",
    BUILD: "build",
    IMPLEMENT: "build",
    SELF_REVIEW: "review",
    COMMIT: "commit",
    PR: "pull-request",
    CI: "ci",
    DEPLOY: "deployment",
    PRODUCTION_VERIFY: "production-verification",
  };
  const completed = await superviseHarnessRun({
    storeRoot: harnessRoot,
    runId: "run-vertical",
    maxSteps: 20,
    now: (() => {
      let index = 0;
      return () => `2026-09-19T00:04:${String(index++).padStart(2, "0")}.000Z`;
    })(),
    executor: {
      async execute(run) {
        return {
          type: "completed" as const,
          evidence: [{
            version: 1,
            id: `evidence-${run.state.stage}`,
            kind: requiredKinds[run.state.stage] ?? "command",
            stage: run.state.stage,
            recordedAt: run.updatedAt,
            summary: `Deterministic ${run.state.stage} result`,
            projectId: run.request.projectId,
            runId: run.request.runId,
          }],
        };
      },
    },
  });
  assert.equal(completed.state.status, "DONE");
  assert.equal(completed.state.stage, "DONE");
  assert.equal(completed.request.purposeProfile?.purpose, "rapid-prototype");
  assert.equal(completed.evidence.some((item) => item.kind === "test"), true);
  assert.equal(completed.evidence.some((item) => item.kind === "deployment"), true);
  const workspace = await loadProjectWorkspace(modelRoot, "project-recovery");
  assert.deepEqual(workspace?.tree[0]?.runIds, ["run-vertical"]);
});

test("concurrent start requests share one durable purpose-bound Run", async () => {
  const { modelRoot, harnessRoot, iseolRoot, targetRoot } = await fixture();
  const input = { runId: "run-concurrent", objective: "Build the recovery project", targetRoot };
  const results = await Promise.all([
    startProjectWorkspaceRun(modelRoot, "project-recovery", input, { iseolRoot, storeRoot: harnessRoot, loadedAt: "2026-09-19T00:05:00.000Z" }),
    startProjectWorkspaceRun(modelRoot, "project-recovery", input, { iseolRoot, storeRoot: harnessRoot, loadedAt: "2026-09-19T00:05:00.000Z" }),
  ]);
  assert.equal(results[0]?.status, "created");
  assert.equal(results[1]?.status, "created");
  const workspace = await loadProjectWorkspace(modelRoot, "project-recovery");
  assert.deepEqual(workspace?.tree[0]?.runIds, ["run-concurrent"]);
  assert.equal((await loadProjectHistory(modelRoot, "project-recovery")).filter((event) => event.type === "run-attached").length, 1);
});

test("project Run target must stay inside the workspace-owned project folder", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-owned-root-"));
  const projectRoot = join(root, "project");
  const outsideRoot = join(root, "outside");
  const at = "2026-09-19T00:06:00.000Z";
  const profile = resolveExecutionProfile({ purpose: "rapid-prototype", objective: "work", roles: defaultAgentRoleRegistrations() });
  const workspace = {
    version: 1 as const, id: "project-owned", name: "Owned", status: "active" as const,
    workspaceRoot: projectRoot,
    genesis: { prototypeId: "prototype-owned", repository: { url: "https://example.test/repo", branch: "main" }, deployment: { url: "https://example.test" }, runs: [], promotedAt: at },
    tree: [{ id: "root", kind: "root" as const, title: "Owned", status: "in-progress" as const, runIds: [], createdAt: at, updatedAt: at }],
    purposeSelection: { version: 1 as const, purpose: profile.purpose, selectedAt: at, source: "user" as const, profile },
    createdAt: at, updatedAt: at,
  } as ProjectWorkspace & { workspaceRoot: string };
  await saveProjectWorkspace(root, workspace);
  await assert.rejects(
    startProjectWorkspaceRun(root, "project-owned", { runId: "run-owned", objective: "work", targetRoot: outsideRoot }, { iseolRoot: root, storeRoot: join(root, "runs"), loadedAt: at }),
    /workspace-owned project folder/,
  );
});
