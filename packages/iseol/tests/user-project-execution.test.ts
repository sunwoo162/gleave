import assert from "node:assert/strict";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { loadHarnessRun, saveHarnessRun } from "../src/harness/run-store.js";
import { pauseHarnessRun } from "../src/harness/run-service.js";
import type { HarnessEvidenceKind, HarnessStageExecutionResult } from "../src/harness/contracts.js";
import { superviseHarnessRun } from "../src/harness/run-supervisor.js";
import { transitionRunState } from "../src/harness/state-machine.js";
import { createActivityService } from "../src/activity/service.js";
import { appendProjectHistoryEvent } from "../src/project-model/history-store.js";
import { createUserProjectService } from "../src/project-model/user-project-service.js";
import { projectRunObservation } from "../src/project-model/run-observability.js";
import { withDurableProjectWorkRequestRunLock } from "../src/project-model/work-request-lock.js";
import { withDurableProjectWorkspaceLock } from "../src/project-model/workspace-lock.js";
import { loadProjectWorkspace, saveProjectWorkspace, saveProjectWorkspaceUnlocked } from "../src/project-model/workspace-store.js";
import { createSettingsService } from "../src/settings/service.js";

const at = "2026-09-25T12:00:00.000Z";
function principal(userId: string): Principal { return { userId, sessionId: `${userId}-session`, roles: ["user"] }; }

test("user projects persist with owner scope and create idempotent work requests", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-"));
  const service = createUserProjectService({
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  });
  const created = await service.createProject(principal("user-a"), {
    name: "학습 Todo",
    objective: "학습 기록을 남기는 Todo를 만든다",
    purpose: "rapid-prototype",
    teamMode: "solo",
  });
  assert.equal(created.ownerUserId, "user-a");
  assert.equal((await service.listProjects(principal("user-a"))).length, 1);
  assert.equal((await service.listProjects(principal("user-b"))).length, 0);

  const first = await service.createWorkRequest(principal("user-a"), created.id, {
    title: "기본 화면",
    objective: "학습 Todo의 기본 화면을 구현한다",
    idempotencyKey: "screen-1",
  });
  const repeated = await service.createWorkRequest(principal("user-a"), created.id, {
    title: "기본 화면",
    objective: "학습 Todo의 기본 화면을 구현한다",
    idempotencyKey: "screen-1",
  });
  assert.equal(first.created, true);
  assert.equal(repeated.created, false);
  assert.equal(repeated.request.id, first.request.id);
  assert.equal(first.request.nodeId, `task-${first.request.id}`);
  const createdView = await service.getProject(principal("user-a"), created.id);
  const task = createdView?.workspace.tree.find((node) => node.id === first.request.nodeId);
  assert.equal(task?.kind, "task");
  assert.equal(task?.title, "기본 화면");
  assert.equal(await service.getProject(principal("user-b"), created.id), null);
});

test("project reads wait for the durable workspace lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-read-lock-"));
  const owner = principal("project-read-lock-owner");
  const options = { platformRoot: join(root, "platform"), projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, now: () => at };
  const service = createUserProjectService(options);
  const project = await service.createProject(owner, { name: "기존 프로젝트", objective: "read synchronization", purpose: "rapid-prototype", teamMode: "solo" });
  const workspace = await loadProjectWorkspace(options.projectModelRoot, project.id);
  assert.ok(workspace);
  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableProjectWorkspaceLock(options.projectModelRoot, project.id, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let settled = false;
  const read = service.getProject(owner, project.id).then((result) => { settled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  await saveProjectWorkspaceUnlocked(options.projectModelRoot, { ...workspace, name: "잠금 해제 후 프로젝트", updatedAt: "2026-09-25T12:00:01.000Z" });
  releaseHolder();
  await lockHeld;
  assert.equal((await read)?.workspace.name, "잠금 해제 후 프로젝트");
});

test("project lists wait for each durable workspace lock before projecting state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-list-read-lock-"));
  const owner = principal("project-list-read-lock-owner");
  const options = { platformRoot: join(root, "platform"), projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, now: () => at };
  const service = createUserProjectService(options);
  const project = await service.createProject(owner, { name: "목록 프로젝트", objective: "list synchronization", purpose: "rapid-prototype", teamMode: "solo" });
  let releaseHolder!: () => void;
  const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
  const lockHeld = withDurableProjectWorkspaceLock(options.projectModelRoot, project.id, async () => holderReleased, { waitForMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  let settled = false;
  const read = service.listProjects(owner).then((result) => { settled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  releaseHolder();
  await lockHeld;
  assert.equal((await read)[0]?.id, project.id);
});

test("concurrent Work Request creation preserves both Workspace task nodes", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-workspace-tree-race-"));
  const options = {
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  };
  const firstService = createUserProjectService(options);
  const secondService = createUserProjectService(options);
  const owner = principal("workspace-tree-race-owner");
  const project = await firstService.createProject(owner, {
    name: "Workspace tree race",
    objective: "preserve concurrent task nodes",
    purpose: "rapid-prototype",
    teamMode: "solo",
  });
  const [first, second] = await Promise.all([
    firstService.createWorkRequest(owner, project.id, { title: "First task", objective: "First concurrent task", idempotencyKey: "workspace-tree-first" }),
    secondService.createWorkRequest(owner, project.id, { title: "Second task", objective: "Second concurrent task", idempotencyKey: "workspace-tree-second" }),
  ]);
  const view = await firstService.getProject(owner, project.id);
  const taskIds = new Set(view?.workspace.tree.filter((node) => node.kind === "task").map((node) => node.id));
  assert.equal(view?.workRequests.length, 2);
  assert.equal(taskIds.has(first.request.nodeId ?? `task-${first.request.id}`), true);
  assert.equal(taskIds.has(second.request.nodeId ?? `task-${second.request.id}`), true);
});

test("project scheduling serializes across service instances sharing one project root", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-cross-instance-schedule-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "HARNESS_ENGINEERING.md"), "# Scheduler test harness\n", "utf8");
  const options = {
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  };
  const firstService = createUserProjectService(options);
  const secondService = createUserProjectService(options);
  const owner = principal("schedule-cross-instance-owner");
  const project = await firstService.createProject(owner, {
    name: "Cross-instance scheduler",
    objective: "select one queued work request exactly once",
    purpose: "rapid-prototype",
    teamMode: "solo",
  });
  const task = await firstService.createWorkRequest(owner, project.id, {
    title: "Single scheduled task",
    objective: "create one durable Run",
    idempotencyKey: "cross-instance-schedule-task",
  });
  let enqueueCalls = 0;
  let releaseEnqueue!: () => void;
  const enqueueHeld = new Promise<void>((resolve) => { releaseEnqueue = resolve; });
  const enqueue = async () => {
    enqueueCalls += 1;
    if (enqueueCalls === 1) await enqueueHeld;
    return "accepted" as const;
  };

  const first = firstService.scheduleProjectRuns(owner, project.id, { maxConcurrent: 1 }, enqueue);
  for (let attempt = 0; attempt < 100 && enqueueCalls < 1; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  const second = secondService.scheduleProjectRuns(owner, project.id, { maxConcurrent: 1 }, enqueue);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const callsWhileFirstIsHeld = enqueueCalls;
  releaseEnqueue();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(callsWhileFirstIsHeld, 1);
  assert.equal(enqueueCalls, 1);
  assert.deepEqual([firstResult.selected, secondResult.selected].sort((left, right) => left - right), [0, 1]);
  const view = await firstService.getProject(owner, project.id);
  assert.equal(view?.workRequests.find((request) => request.id === task.request.id)?.status, "running");
  assert.equal(view?.workRequests.filter((request) => request.runId).length, 1);
});

test("direct project Run starts serialize across service instances for one Work Request", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-cross-instance-run-start-"));
  const options = {
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  };
  const firstService = createUserProjectService(options);
  const secondService = createUserProjectService(options);
  const owner = principal("run-start-cross-instance-owner");
  const project = await firstService.createProject(owner, {
    name: "Cross-instance Run start",
    objective: "create one Run for one Work Request",
    purpose: "rapid-prototype",
    teamMode: "solo",
  });
  const task = await firstService.createWorkRequest(owner, project.id, {
    title: "Single Run task",
    objective: "avoid duplicate direct starts",
    idempotencyKey: "cross-instance-run-start-task",
  });
  let enqueueCalls = 0;
  let releaseEnqueue!: () => void;
  const enqueueHeld = new Promise<void>((resolve) => { releaseEnqueue = resolve; });
  const enqueue = async () => {
    enqueueCalls += 1;
    if (enqueueCalls === 1) await enqueueHeld;
    return "accepted" as const;
  };

  const first = firstService.startProjectRun(owner, project.id, { workRequestId: task.request.id, runId: "run-cross-first" }, enqueue);
  for (let attempt = 0; attempt < 100 && enqueueCalls < 1; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  const second = secondService.startProjectRun(owner, project.id, { workRequestId: task.request.id, runId: "run-cross-second" }, enqueue);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const callsWhileFirstIsHeld = enqueueCalls;
  releaseEnqueue();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(callsWhileFirstIsHeld, 1);
  assert.equal(enqueueCalls, 1);
  assert.equal(firstResult.status, "started");
  assert.equal(firstResult.runId, "run-cross-first");
  assert.equal(secondResult.status, "already-active");
  assert.equal(secondResult.runId, "run-cross-first");
  assert.equal((await firstService.getProject(owner, project.id))?.workRequests.find((request) => request.id === task.request.id)?.runId, "run-cross-first");
  assert.equal(await loadHarnessRun(join(root, "runs"), "run-cross-second"), null);
});

test("queued Work Request cancellation shares the durable lifecycle lock with Run start", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-cancel-run-race-"));
  const options = {
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  };
  const firstService = createUserProjectService(options);
  const secondService = createUserProjectService(options);
  const owner = principal("cancel-run-race-owner");
  const project = await firstService.createProject(owner, {
    name: "Cancel Run race",
    objective: "serialize cancellation with execution start",
    purpose: "rapid-prototype",
    teamMode: "solo",
  });
  const work = await firstService.createWorkRequest(owner, project.id, {
    title: "Race task",
    objective: "ensure one lifecycle transition wins",
    idempotencyKey: "cancel-run-race-task",
  });
  let enqueueCalls = 0;
  let releaseEnqueue!: () => void;
  const enqueueHeld = new Promise<void>((resolve) => { releaseEnqueue = resolve; });
  const enqueue = async () => {
    enqueueCalls += 1;
    await enqueueHeld;
    return "accepted" as const;
  };

  const start = firstService.startProjectRun(owner, project.id, { workRequestId: work.request.id, runId: "run-cancel-race" }, enqueue);
  for (let attempt = 0; attempt < 100 && enqueueCalls < 1; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(enqueueCalls, 1);
  const cancel = secondService.cancelWorkRequest(owner, project.id, work.request.id);
  await new Promise((resolve) => setTimeout(resolve, 50));
  releaseEnqueue();

  const started = await start;
  assert.equal(started.status, "started");
  await assert.rejects(cancel, /current status is (running|waiting)/);
  assert.notEqual((await firstService.getProject(owner, project.id))?.workRequests.find((request) => request.id === work.request.id)?.status, "cancelled");
});

test("project Run resumes serialize across service instances for one Work Request", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-cross-instance-run-resume-"));
  const options = {
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  };
  const firstService = createUserProjectService(options);
  const secondService = createUserProjectService(options);
  const owner = principal("run-resume-cross-instance-owner");
  const project = await firstService.createProject(owner, {
    name: "Cross-instance Run resume",
    objective: "resume one Run once",
    purpose: "rapid-prototype",
    teamMode: "solo",
  });
  const task = await firstService.createWorkRequest(owner, project.id, {
    title: "Single resume task",
    objective: "avoid duplicate resume dispatch",
    idempotencyKey: "cross-instance-run-resume-task",
  });
  await firstService.startProjectRun(owner, project.id, { workRequestId: task.request.id, runId: "run-resume-cross" }, async () => "accepted");
  const run = await loadHarnessRun(join(root, "runs"), "run-resume-cross");
  assert.ok(run);
  await saveHarnessRun(join(root, "runs"), { ...run, state: transitionRunState(run.state, { type: "wait-agent", at, reason: "Agent reconnect required" }), updatedAt: at });

  let enqueueCalls = 0;
  let releaseEnqueue!: () => void;
  const enqueueHeld = new Promise<void>((resolve) => { releaseEnqueue = resolve; });
  const enqueue = async () => {
    enqueueCalls += 1;
    if (enqueueCalls === 1) await enqueueHeld;
    return "accepted" as const;
  };

  const first = firstService.resumeProjectRun(owner, project.id, { workRequestId: task.request.id }, enqueue);
  for (let attempt = 0; attempt < 100 && enqueueCalls < 1; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  const second = secondService.resumeProjectRun(owner, project.id, { workRequestId: task.request.id }, enqueue);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const callsWhileFirstIsHeld = enqueueCalls;
  releaseEnqueue();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(callsWhileFirstIsHeld, 1);
  assert.equal(enqueueCalls, 1);
  assert.equal(firstResult.status, "started");
  assert.equal(firstResult.runId, "run-resume-cross");
  assert.equal(secondResult.status, "already-active");
  assert.equal(secondResult.runId, "run-resume-cross");
  assert.equal((await loadHarnessRun(join(root, "runs"), "run-resume-cross"))?.retry?.cycle, undefined);
});

test("project Run pause waits for the durable lifecycle lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-run-pause-lock-"));
  const options = {
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  };
  const service = createUserProjectService(options);
  const owner = principal("run-pause-lock-owner");
  const project = await service.createProject(owner, { name: "Pause lock", objective: "serialize pause", purpose: "rapid-prototype", teamMode: "solo" });
  const work = await service.createWorkRequest(owner, project.id, { title: "Pause lock task", objective: "hold the lifecycle boundary", idempotencyKey: "pause-lock-task" });
  await service.startProjectRun(owner, project.id, { workRequestId: work.request.id, runId: "run-pause-lock" }, async () => "accepted");
  const run = await loadHarnessRun(join(root, "runs"), "run-pause-lock");
  assert.ok(run);
  await saveHarnessRun(join(root, "runs"), { ...run, state: transitionRunState({ ...run.state, status: "READY", reason: undefined }, { type: "start", at }), updatedAt: at });

  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurableProjectWorkRequestRunLock(options.projectModelRoot, project.id, work.request.id, async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;
  let settled = false;
  const pause = service.pauseProjectRun(owner, project.id, { workRequestId: work.request.id }).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  releaseHolder();
  const paused = await pause;
  assert.equal(paused.status, "paused");
});

test("project Run retry waits for the durable lifecycle lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-run-retry-lock-"));
  const options = {
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  };
  const service = createUserProjectService(options);
  const owner = principal("run-retry-lock-owner");
  const project = await service.createProject(owner, { name: "Retry lock", objective: "serialize retry", purpose: "rapid-prototype", teamMode: "solo" });
  const work = await service.createWorkRequest(owner, project.id, { title: "Retry lock task", objective: "hold the lifecycle boundary", idempotencyKey: "retry-lock-task" });
  await service.startProjectRun(owner, project.id, { workRequestId: work.request.id, runId: "run-retry-lock" }, async () => "accepted");
  const run = await loadHarnessRun(join(root, "runs"), "run-retry-lock");
  assert.ok(run);
  await saveHarnessRun(join(root, "runs"), { ...run, state: transitionRunState(run.state, { type: "final-failure", at, reason: "isolated executor failed" }), updatedAt: at });
  assert.equal((await service.getProject(owner, project.id))?.workRequests[0]?.status, "failed");

  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurableProjectWorkRequestRunLock(options.projectModelRoot, project.id, work.request.id, async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;
  let settled = false;
  const retry = service.retryProjectRun(owner, project.id, { workRequestId: work.request.id }, async () => "accepted").then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  releaseHolder();
  const retried = await retry;
  assert.equal(retried.status, "started");
  assert.equal((await loadHarnessRun(join(root, "runs"), "run-retry-lock"))?.retry?.cycle, 1);
});

test("user project view exposes durable project history only through the existing project ACL", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-history-"));
  const service = createUserProjectService({
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  });
  const project = await service.createProject(principal("history-owner"), {
    name: "History workspace",
    objective: "show durable project activity",
    purpose: "portfolio",
    teamMode: "solo",
  });
  await appendProjectHistoryEvent(join(root, "project-model"), {
    version: 1,
    id: "history-event-1",
    projectId: project.id,
    type: "integration-action-recorded",
    at,
    occurredAt: at,
    summary: "local project activity recorded",
    source: "calendar",
    action: "schedule-check",
  });

  const ownerView = await service.getProject(principal("history-owner"), project.id);
  assert.deepEqual(ownerView?.history.map((event) => event.id), ["history-event-1"]);
  assert.equal(ownerView?.history[0]?.source, "calendar");
  assert.equal(await service.getProject(principal("history-outsider"), project.id), null);
});

test("user project creation provisions the owner-bound Runtime workspace directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-workspace-"));
  const service = createUserProjectService({
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  });
  const project = await service.createProject(principal("workspace-user"), {
    name: "Runtime workspace",
    objective: "provision the local workspace before an Agent Run",
    purpose: "rapid-prototype",
    teamMode: "solo",
  });
  const workspace = await stat(project.workspaceRoot);
  assert.equal(workspace.isDirectory(), true);
});

test("user project view exposes only bounded relative workspace files without contents or secret-like names", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-files-"));
  const service = createUserProjectService({
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  });
  const project = await service.createProject(principal("file-owner"), { name: "Files", objective: "inspect workspace files", purpose: "rapid-prototype", teamMode: "solo" });
  await mkdir(join(project.workspaceRoot, "src"), { recursive: true });
  await writeFile(join(project.workspaceRoot, "src", "index.ts"), "export const answer = 42;", "utf8");
  await writeFile(join(project.workspaceRoot, ".env"), "TOKEN=do-not-expose", "utf8");
  await mkdir(join(project.workspaceRoot, ".git"), { recursive: true });
  await writeFile(join(project.workspaceRoot, ".git", "config"), "secret metadata", "utf8");

  const view = await service.getProject(principal("file-owner"), project.id);
  assert.deepEqual(view?.workspace.files, {
    status: "ready",
    items: [{ path: "src/index.ts", size: Buffer.byteLength("export const answer = 42;", "utf8") }],
  });
});

test("user project file preview is owner-scoped, text-only, bounded, and path-contained", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-file-preview-"));
  const service = createUserProjectService({
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  });
  const project = await service.createProject(principal("preview-owner"), { name: "Preview", objective: "read bounded text files", purpose: "rapid-prototype", teamMode: "solo" });
  await mkdir(join(project.workspaceRoot, "src"), { recursive: true });
  await writeFile(join(project.workspaceRoot, "src", "index.ts"), "export const answer = 42;\n", "utf8");
  await writeFile(join(project.workspaceRoot, ".env"), "TOKEN=do-not-expose", "utf8");
  await writeFile(join(project.workspaceRoot, "large.txt"), Buffer.alloc(128 * 1024 + 1, 65));
  await writeFile(join(project.workspaceRoot, "binary.bin"), Buffer.from([0, 1, 2, 3]));
  await writeFile(join(project.workspaceRoot, "invalid.txt"), Buffer.from([0xc3, 0x28]));

  const preview = await service.readWorkspaceFile(principal("preview-owner"), project.id, "src/index.ts");
  assert.deepEqual(preview, { status: "ready", path: "src/index.ts", size: Buffer.byteLength("export const answer = 42;\n", "utf8"), content: "export const answer = 42;\n" });
  assert.equal((await service.readWorkspaceFile(principal("preview-owner"), project.id, ".env"))?.status, "not-available");
  assert.equal((await service.readWorkspaceFile(principal("preview-owner"), project.id, "large.txt"))?.status, "not-available");
  assert.equal((await service.readWorkspaceFile(principal("preview-owner"), project.id, "binary.bin"))?.status, "not-available");
  assert.equal((await service.readWorkspaceFile(principal("preview-owner"), project.id, "invalid.txt"))?.status, "not-available");
  assert.equal((await service.readWorkspaceFile(principal("preview-owner"), project.id, "../package.json"))?.status, "not-available");
  assert.equal(await service.readWorkspaceFile(principal("preview-outsider"), project.id, "src/index.ts"), null);
});

test("user project preview classifies unified diffs and explains binary files without exposing bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-diff-preview-"));
  const service = createUserProjectService({
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  });
  const project = await service.createProject(principal("diff-owner"), { name: "Diff", objective: "inspect a verified patch", purpose: "rapid-prototype", teamMode: "solo" });
  const patch = [
    "diff --git a/src/example.ts b/src/example.ts",
    "--- a/src/example.ts",
    "+++ b/src/example.ts",
    "@@ -1,2 +1,3 @@",
    " const answer = 41;",
    "-export const ready = false;",
    "+export const ready = true;",
    "+export const verified = true;",
    "",
  ].join("\n");
  await writeFile(join(project.workspaceRoot, "change.patch"), patch, "utf8");
  await writeFile(join(project.workspaceRoot, "image.bin"), Buffer.from([0, 1, 2, 3]));

  const diff = await service.readWorkspaceFile(principal("diff-owner"), project.id, "change.patch");
  assert.equal(diff?.status, "ready");
  assert.equal((diff as any).format, "unified-diff");
  assert.deepEqual((diff as any).stats, { additions: 2, deletions: 1 });
  assert.equal((diff as any).hunks[0].header, "@@ -1,2 +1,3 @@");
  assert.deepEqual((diff as any).hunks[0].lines.map((line: { kind: string }) => line.kind), ["context", "deletion", "addition", "addition"]);
  assert.equal((diff as any).hunks[0].lines[2].newLine, 2);

  const binary = await service.readWorkspaceFile(principal("diff-owner"), project.id, "image.bin");
  assert.equal(binary?.status, "not-available");
  assert.match((binary as any).blocker, /binary/i);
});

test("user project evidence keeps unknown runtime state instead of claiming success", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-evidence-"));
  const service = createUserProjectService({
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  });
  const project = await service.createProject(principal("user-a"), { name: "Evidence", objective: "verify evidence", purpose: "rapid-prototype", teamMode: "solo" });
  const view = await service.getProject(principal("user-a"), project.id);
  assert.equal(view?.runtime.status, "not-started");
  assert.deepEqual(view?.evidence, []);
});

test("accepted Runtime execution preserves project Run identity and filters evidence by ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-runtime-"));
  const service = createUserProjectService({
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  });
  const project = await service.createProject(principal("user-a"), { name: "Runtime", objective: "verify runtime binding", purpose: "rapid-prototype", teamMode: "solo" });
  const work = await service.createWorkRequest(principal("user-a"), project.id, { title: "Run", objective: "bind a Run", idempotencyKey: "run-1" });
  const started = await service.startProjectRun(principal("user-a"), project.id, { workRequestId: work.request.id, runId: "run-user-project-1" }, async () => "accepted");
  assert.equal(started.status, "started");
  assert.equal(started.runId, "run-user-project-1");

  const run = await loadHarnessRun(join(root, "runs"), "run-user-project-1");
  assert.equal(run?.request.projectId, project.id);
  assert.ok(run);
  await saveHarnessRun(join(root, "runs"), {
    ...run,
    evidence: [
      { version: 1, id: "owned", kind: "test", stage: "TEST", recordedAt: at, summary: "owned evidence", projectId: project.id, runId: run.request.runId },
      { version: 1, id: "foreign-project", kind: "test", stage: "TEST", recordedAt: at, summary: "foreign project", projectId: "other-project", runId: run.request.runId },
      { version: 1, id: "foreign-run", kind: "test", stage: "TEST", recordedAt: at, summary: "foreign run", projectId: project.id, runId: "other-run" },
    ],
  });

  const view = await service.getProject(principal("user-a"), project.id);
  assert.deepEqual(view?.evidence.map((item) => item.id), ["owned"]);
  const observation = view?.observability.runs[0];
  assert.equal(observation?.runId, "run-user-project-1");
  assert.equal(observation?.status, "waiting");
  assert.equal(observation?.stage, "PREFLIGHT");
  assert.match(observation?.blocker ?? "", /HARNESS_ENGINEERING\.md/);
  assert.deepEqual(observation?.changedFiles, []);
  assert.deepEqual(observation?.checks, [{ id: "owned", kind: "test", stage: "TEST", summary: "owned evidence", recordedAt: at }]);
  assert.deepEqual(observation?.logs, []);
  assert.deepEqual(observation?.preview, { status: "not-available", blocker: "Runtime가 검증된 미리보기 주소를 기록하지 않았습니다." });
  assert.deepEqual(view?.workspace.tree.find((node) => node.id === work.request.nodeId)?.runIds, ["run-user-project-1"]);
  assert.deepEqual(view?.workspace.tree.find((node) => node.kind === "root")?.runIds, []);
});

test("Project Workspace exposes only a recorded verified HTTP preview URL", () => {
  const observation = projectRunObservation({
    runId: "run-preview-1",
    status: "completed",
    stage: "DONE",
    evidence: [
      { version: 1, id: "deploy-preview", kind: "deployment", stage: "DEPLOY", recordedAt: at, summary: "preview deployed", provider: "local-preview", reference: "http://127.0.0.1:4173/", projectId: "project-1", runId: "run-preview-1" },
      { version: 1, id: "verify-preview", kind: "production-verification", stage: "PRODUCTION_VERIFY", recordedAt: at, summary: "preview verified", reference: "http://127.0.0.1:4173/", projectId: "project-1", runId: "run-preview-1" },
      { version: 1, id: "unsafe-preview", kind: "production-verification", stage: "PRODUCTION_VERIFY", recordedAt: at, summary: "unsafe", reference: "javascript:alert(1)", projectId: "project-1", runId: "run-preview-1" },
    ],
  });
  assert.deepEqual(observation.preview, {
    status: "ready",
    url: "http://127.0.0.1:4173/",
    provider: "local-preview",
    recordedAt: at,
  });
});

test("Project Workspace rejects preview URLs whose raw authority or path needs URL normalization", () => {
  for (const reference of [
    "http://127.0.0.1:4173\\@attacker.example/",
    "http://127.0.0.1:4173/%5C@attacker.example/",
    "http://127.0.0.1:4173/preview\n.html",
    "http://127.0.0.1:4173/preview\t.html",
    "http://127.0.0.1:4173/?access_token=secret-value",
    "http://127.0.0.1:4173/#oauth_token=secret-value",
    "http://127.0.0.1:4173/#access_token%3Dsecret%ZZ",
  ]) {
    const observation = projectRunObservation({
      runId: "run-preview-invalid",
      status: "completed",
      stage: "DONE",
      evidence: [
        { version: 1, id: "invalid-preview", kind: "production-verification", stage: "PRODUCTION_VERIFY", recordedAt: at, summary: "invalid preview", reference, projectId: "project-1", runId: "run-preview-invalid" },
      ],
    });
    assert.deepEqual(observation.preview, { status: "not-available", blocker: "Runtime가 검증된 미리보기 주소를 기록하지 않았습니다." }, reference);
  }
});

test("project execution requires persisted build approval before enqueueing a Runtime run", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-approval-"));
  const settings = createSettingsService(join(root, "platform"), { now: () => at });
  const service = createUserProjectService({
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    settingsService: settings,
    now: () => at,
  });
  const user = principal("approval-user");
  const project = await service.createProject(user, { name: "Approval", objective: "guard execution", purpose: "rapid-prototype", teamMode: "solo" });
  const work = await service.createWorkRequest(user, project.id, { title: "Guarded run", objective: "require confirmation", idempotencyKey: "approval-run-1" });
  await settings.updateSettings(user, { aiApproval: { buildRun: true } });
  let enqueued = false;

  await assert.rejects(
    () => service.startProjectRun(user, project.id, { workRequestId: work.request.id, runId: "run-approval-1" }, async () => {
      enqueued = true;
      return "accepted";
    }),
    /Build run approval is required/,
  );
  assert.equal(enqueued, false);
  assert.equal((await service.getProject(user, project.id))?.workRequests[0]?.status, "queued");

  const approved = await service.startProjectRun(user, project.id, { workRequestId: work.request.id, runId: "run-approval-1", approved: true }, async () => "accepted");
  assert.equal(approved.status, "started");
  assert.equal(approved.runId, "run-approval-1");
});

test("user project owner can resume a waiting Run with the same Run identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-resume-"));
  const service = createUserProjectService({
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  });
  const user = principal("resume-owner");
  const project = await service.createProject(user, { name: "Resume", objective: "resume a waiting Run", purpose: "rapid-prototype", teamMode: "solo" });
  const work = await service.createWorkRequest(user, project.id, { title: "Resume task", objective: "continue the same Run", idempotencyKey: "resume-1" });
  await service.startProjectRun(user, project.id, { workRequestId: work.request.id, runId: "run-resume-1" }, async () => "accepted");
  const run = await loadHarnessRun(join(root, "runs"), "run-resume-1");
  assert.ok(run);
  const waiting = { ...run, state: transitionRunState(run.state, { type: "wait-agent", at, reason: "Agent reconnect required" }), updatedAt: at };
  await saveHarnessRun(join(root, "runs"), waiting);

  const enqueued: string[] = [];
  const resumed = await service.resumeProjectRun(user, project.id, { workRequestId: work.request.id }, async (runId) => {
    enqueued.push(runId);
    return "accepted";
  });

  assert.equal(resumed.status, "started");
  assert.equal(resumed.runId, "run-resume-1");
  assert.deepEqual(enqueued, ["run-resume-1"]);
  const after = await loadHarnessRun(join(root, "runs"), "run-resume-1");
  assert.equal(after?.request.projectId, project.id);
  assert.equal(after?.state.status, "READY");
  assert.equal(after?.state.stage, run.state.stage);
  assert.equal((await service.getProject(user, project.id))?.workRequests[0]?.status, "running");
});

test("user project owner can pause a running Run durably and resume the same checkpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-pause-"));
  const service = createUserProjectService({
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  });
  const owner = principal("pause-owner");
  const foreign = principal("pause-foreign");
  const project = await service.createProject(owner, { name: "Pause", objective: "pause and resume a Run", purpose: "rapid-prototype", teamMode: "solo" });
  const work = await service.createWorkRequest(owner, project.id, { title: "Pause task", objective: "preserve the current checkpoint", idempotencyKey: "pause-1" });
  await service.startProjectRun(owner, project.id, { workRequestId: work.request.id, runId: "run-pause-1" }, async () => "accepted");
  const run = await loadHarnessRun(join(root, "runs"), "run-pause-1");
  assert.ok(run);
  await saveHarnessRun(join(root, "runs"), { ...run, state: transitionRunState({ ...run.state, status: "READY", reason: undefined }, { type: "start", at }), updatedAt: at });

  const paused = await service.pauseProjectRun(owner, project.id, { workRequestId: work.request.id });
  assert.equal(paused.status, "paused");
  assert.equal(paused.runId, "run-pause-1");
  assert.equal((await loadHarnessRun(join(root, "runs"), "run-pause-1"))?.state.status, "PAUSED");
  const pausedView = await service.getProject(owner, project.id);
  assert.equal(pausedView?.runtime.status, "waiting");
  assert.equal(pausedView?.workRequests[0]?.status, "waiting");
  assert.match(pausedView?.workRequests[0]?.blocker ?? "", /일시 중단/);
  await assert.rejects(() => service.pauseProjectRun(foreign, project.id, { workRequestId: work.request.id }), /Project not found/);

  const repeated = await service.pauseProjectRun(owner, project.id, { workRequestId: work.request.id });
  assert.equal(repeated.status, "already-paused");
  const resumed = await service.resumeProjectRun(owner, project.id, { workRequestId: work.request.id }, async () => "accepted");
  assert.equal(resumed.status, "started");
  assert.equal(resumed.runId, "run-pause-1");
  assert.equal((await loadHarnessRun(join(root, "runs"), "run-pause-1"))?.state.status, "READY");
});

test("user project owner can retry a terminal failure with the same Run identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-retry-"));
  const service = createUserProjectService({
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  });
  const user = principal("retry-owner");
  const project = await service.createProject(user, { name: "Retry", objective: "recover a terminal Run", purpose: "rapid-prototype", teamMode: "solo" });
  const work = await service.createWorkRequest(user, project.id, { title: "Retry task", objective: "retry the same durable Run", idempotencyKey: "retry-1" });
  await service.startProjectRun(user, project.id, { workRequestId: work.request.id, runId: "run-retry-1" }, async () => "accepted");
  const run = await loadHarnessRun(join(root, "runs"), "run-retry-1");
  assert.ok(run);
  await saveHarnessRun(join(root, "runs"), {
    ...run,
    state: transitionRunState(run.state, { type: "final-failure", at, reason: "isolated executor failed" }),
    updatedAt: at,
  });

  const failed = await service.getProject(user, project.id);
  assert.equal(failed?.runtime.status, "failed");
  assert.equal(failed?.workRequests[0]?.status, "failed");
  const enqueued: string[] = [];
  const retried = await service.retryProjectRun(user, project.id, { workRequestId: work.request.id }, async (runId) => {
    enqueued.push(runId);
    return "accepted";
  });

  assert.equal(retried.status, "started");
  assert.equal(retried.runId, "run-retry-1");
  assert.deepEqual(enqueued, ["run-retry-1"]);
  assert.equal((await loadHarnessRun(join(root, "runs"), "run-retry-1"))?.retry?.cycle, 1);
  assert.equal((await loadHarnessRun(join(root, "runs"), "run-retry-1"))?.state.status, "READY");
  assert.equal((await service.getProject(user, project.id))?.workRequests[0]?.status, "running");
});

test("user project retry falls back to a blocked waiting Run when Runtime disappears", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-retry-blocked-"));
  const service = createUserProjectService({
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  });
  const user = principal("retry-blocked-owner");
  const project = await service.createProject(user, { name: "Retry blocked", objective: "recover a disappeared Runtime", purpose: "rapid-prototype", teamMode: "solo" });
  const work = await service.createWorkRequest(user, project.id, { title: "Retry after disconnect", objective: "keep a truthful waiting boundary", idempotencyKey: "retry-blocked-1" });
  await service.startProjectRun(user, project.id, { workRequestId: work.request.id, runId: "run-retry-blocked-1" }, async () => "accepted");
  const run = await loadHarnessRun(join(root, "runs"), "run-retry-blocked-1");
  assert.ok(run);
  await saveHarnessRun(join(root, "runs"), { ...run, state: transitionRunState(run.state, { type: "final-failure", at, reason: "Runtime disconnected" }), updatedAt: at });

  const retried = await service.retryProjectRun(user, project.id, { workRequestId: work.request.id }, async () => "not-configured");
  assert.equal(retried.status, "waiting");
  assert.equal(retried.runId, "run-retry-blocked-1");
  assert.match(retried.blocker ?? "", /not configured/i);
  const blockedRun = await loadHarnessRun(join(root, "runs"), "run-retry-blocked-1");
  assert.equal(blockedRun?.state.status, "BLOCKED_USER");
  assert.equal((await service.getProject(user, project.id))?.workRequests[0]?.status, "waiting");
});

test("user project reads reconcile a terminal Harness Run into the durable work request", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-reconcile-"));
  const service = createUserProjectService({
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  });
  const user = principal("reconcile-user");
  const project = await service.createProject(user, { name: "Reconcile", objective: "reflect terminal runs", purpose: "rapid-prototype", teamMode: "solo" });
  const work = await service.createWorkRequest(user, project.id, { title: "Reconcile task", objective: "show completed state", idempotencyKey: "reconcile-1" });
  await service.startProjectRun(user, project.id, { workRequestId: work.request.id, runId: "run-reconcile-1" }, async () => "accepted");
  const run = await loadHarnessRun(join(root, "runs"), "run-reconcile-1");
  assert.ok(run);
  await saveHarnessRun(join(root, "runs"), { ...run, state: { ...run.state, stage: "DONE", status: "DONE", completedStages: [...run.state.completedStages, "DONE"], updatedAt: at }, updatedAt: at });

  const view = await service.getProject(user, project.id);
  assert.equal(view?.workRequests[0]?.status, "completed");
  assert.equal(view?.workRequests[0]?.runId, "run-reconcile-1");
});

test("user project reads project lifecycle evidence into idempotent activity events", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-lifecycle-activity-"));
  const activity = createActivityService(join(root, "platform"), { now: () => at });
  const service = createUserProjectService({
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    activityService: activity,
    now: () => at,
  });
  const user = principal("lifecycle-activity-owner");
  const project = await service.createProject(user, { name: "Lifecycle activity", objective: "record the verified project chain", purpose: "portfolio", teamMode: "solo" });
  const work = await service.createWorkRequest(user, project.id, { title: "Record lifecycle", objective: "preserve artifact revision deployment evidence", idempotencyKey: "lifecycle-activity-1" });
  await service.startProjectRun(user, project.id, { workRequestId: work.request.id, runId: "run-lifecycle-activity-1" }, async () => "accepted");
  const run = await loadHarnessRun(join(root, "runs"), "run-lifecycle-activity-1");
  assert.ok(run);
  await saveHarnessRun(join(root, "runs"), {
    ...run,
    state: { ...run.state, stage: "DONE", status: "DONE", completedStages: [...run.state.completedStages, "DONE"], updatedAt: at },
    evidence: [
      { version: 1, id: "artifact-build", kind: "build", stage: "BUILD", recordedAt: at, summary: "build evidence", projectId: project.id, runId: run.request.runId },
      { version: 1, id: "revision-commit", kind: "commit", stage: "COMMIT", recordedAt: at, summary: "revision evidence", projectId: project.id, runId: run.request.runId },
      { version: 1, id: "deployment-preview", kind: "deployment", stage: "DEPLOY", recordedAt: at, summary: "deployment evidence", projectId: project.id, runId: run.request.runId },
    ],
    updatedAt: at,
  });

  await service.getProject(user, project.id);
  const view = await service.getProject(user, project.id);
  assert.equal(view?.lifecycle.artifacts[0]?.evidenceId, "artifact-build");
  const lifecycleEvents = (await activity.listActivityEvents(user)).filter((event) => event.sourceType === "project-lifecycle");
  assert.deepEqual(lifecycleEvents.map((event) => event.eventType).sort(), ["project.artifact.recorded", "project.deployment.recorded", "project.revision.recorded"]);
  assert.deepEqual(lifecycleEvents.map((event) => event.payload.evidenceId).sort(), ["artifact-build", "deployment-preview", "revision-commit"]);
  assert.ok(lifecycleEvents.every((event) => event.actorType === "system" && event.verificationStatus === "verified"));
});

test("user project reads preserve a terminal Harness failure reason on the work request", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-failure-reason-"));
  const service = createUserProjectService({
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: join(root, "runs"),
    iseolRoot: root,
    now: () => at,
  });
  const user = principal("failure-reason-user");
  const project = await service.createProject(user, { name: "Failure reason", objective: "show the reason", purpose: "rapid-prototype", teamMode: "solo" });
  const work = await service.createWorkRequest(user, project.id, { title: "Failure task", objective: "retain the failure reason", idempotencyKey: "failure-reason-1" });
  await service.startProjectRun(user, project.id, { workRequestId: work.request.id, runId: "run-failure-reason-1" }, async () => "accepted");
  const run = await loadHarnessRun(join(root, "runs"), "run-failure-reason-1");
  assert.ok(run);
  await saveHarnessRun(join(root, "runs"), { ...run, state: transitionRunState(run.state, { type: "final-failure", at, reason: "Agent verification failed" }), updatedAt: at });

  const view = await service.getProject(user, project.id);
  assert.equal(view?.runtime.status, "failed");
  assert.equal(view?.workRequests[0]?.status, "failed");
  assert.equal(view?.workRequests[0]?.blocker, "Agent verification failed");
});

test("isolated Harness supervisor persists stage evidence and user project completion", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-harness-integration-"));
  const runRoot = join(root, "runs");
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "HARNESS_ENGINEERING.md"), "# Isolated Harness Policy\n", "utf8");
  const service = createUserProjectService({
    platformRoot: join(root, "platform"),
    projectModelRoot: join(root, "project-model"),
    projectHarnessRoot: runRoot,
    iseolRoot: root,
    now: () => at,
  });
  const user = principal("harness-integration-user");
  const project = await service.createProject(user, { name: "Harness integration", objective: "verify isolated evidence", purpose: "rapid-prototype", teamMode: "solo" });
  const work = await service.createWorkRequest(user, project.id, { title: "Run locally", objective: "complete isolated stages", idempotencyKey: "harness-integration-1" });
  let execution: Promise<Awaited<ReturnType<typeof superviseHarnessRun>>> | undefined;
  const started = await service.startProjectRun(user, project.id, { workRequestId: work.request.id, runId: "run-harness-integration-1" }, async (runId) => {
    execution = superviseHarnessRun({
      storeRoot: runRoot,
      runId,
      maxSteps: 32,
      now: () => at,
      executor: {
        async execute(run): Promise<HarnessStageExecutionResult> {
          const kindByStage: Partial<Record<string, HarnessEvidenceKind>> = {
            TEST: "test",
            SELF_REVIEW: "review",
            COMMIT: "commit",
            PR: "pull-request",
            CI: "ci",
            DEPLOY: "deployment",
            PRODUCTION_VERIFY: "production-verification",
          };
          const evidence = [{ version: 1 as const, id: `evidence-${run.state.stage.toLowerCase()}`, kind: kindByStage[run.state.stage] ?? "command", stage: run.state.stage, recordedAt: at, summary: `isolated ${run.state.stage}`, projectId: project.id, runId: run.request.runId }];
          if (run.state.stage === "TEST") evidence.push({ version: 1 as const, id: "evidence-build", kind: "build" as const, stage: run.state.stage, recordedAt: at, summary: "isolated BUILD evidence", projectId: project.id, runId: run.request.runId });
          return { type: "completed", evidence };
        },
      },
    });
    void execution.catch(() => undefined);
    return "accepted";
  });
  assert.equal(started.status, "started");
  const completedRun = await execution;
  assert.equal(completedRun?.state.status, "DONE");
  assert.ok(completedRun?.evidence.some((item) => item.kind === "deployment" && item.projectId === project.id));
  const view = await service.getProject(user, project.id);
  assert.equal(view?.runtime.status, "completed");
  assert.equal(view?.workRequests[0]?.status, "completed");
  assert.ok(view?.evidence.some((item) => item.kind === "production-verification" && item.runId === "run-harness-integration-1"));
});
