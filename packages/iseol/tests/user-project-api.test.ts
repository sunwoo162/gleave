import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createActivityService } from "../src/activity/service.js";
import { createGrowthService } from "../src/growth/read-model.js";
import { createPlatformUserService } from "../src/platform-user/service.js";
import { createSettingsService } from "../src/settings/service.js";
import { createUserProjectService } from "../src/project-model/user-project-service.js";
import type { UserProjectService } from "../src/project-model/user-project-service.js";
import { routeUserProjectRequest } from "../src/project-model/user-project-router.js";
import { loadHarnessRun, saveHarnessRun } from "../src/harness/run-store.js";
import { transitionRunState } from "../src/harness/state-machine.js";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";

test("user project API redacts credential-shaped service errors without changing not-found status", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-error-redaction-"));
  const platformRoot = join(root, "platform");
  const platform = createPlatformUserService(platformRoot, { now: () => "2026-09-25T12:00:00.000Z" });
  const user = await platform.createUser({ id: "project-error-user", email: "project-error@example.com", displayName: "Project Error", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });
  const failingProjects = {
    listProjects: async () => { throw new Error("project not found token%ZZ=project-secret"); },
  } as unknown as UserProjectService;

  const result = await routeUserProjectRequest({ method: "GET", path: "/api/user/projects", headers: { authorization: `Bearer ${session.token}` } }, { platformUserService: platform, userProjectService: failingProjects });

  assert.equal(result.status, 404);
  const message = (result.body as { error: string }).error;
  assert.equal(message.includes("project-secret"), false);
  assert.match(message, /\[redacted\]/i);
});

test("user project API binds project and work request to the authenticated user", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-api-"));
  const platform = createPlatformUserService(join(root, "platform"), { now: () => "2026-09-25T12:00:00.000Z" });
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, now: () => "2026-09-25T12:00:00.000Z" });
  const userA = await platform.createUser({ id: "project-api-a", email: "project-a@example.com", displayName: "A", timezone: "Asia/Seoul" });
  const userB = await platform.createUser({ id: "project-api-b", email: "project-b@example.com", displayName: "B", timezone: "Asia/Seoul" });
  const sessionA = await platform.createSession({ userId: userA.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });
  const sessionB = await platform.createSession({ userId: userB.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: join(root, "web"), userService: platform, userProjectService: projects });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
  try {
    const createdResponse = await fetch(`${url}/api/user/projects`, { method: "POST", headers: headers(sessionA.token), body: JSON.stringify({ name: "API project", objective: "bind work", purpose: "rapid-prototype", teamMode: "solo" }) });
    assert.equal(createdResponse.status, 201);
    const project = (await createdResponse.json() as any).project;
    const queryProject = await fetch(`${url}/api/user/projects/${project.id}?next=%2F`, { headers: headers(sessionA.token) });
    assert.equal(queryProject.status, 200);
    const encodedProjectSeparator = await fetch(`${url}/api/user/projects/${project.id}%2Fteam`, { headers: headers(sessionA.token) });
    assert.equal(encodedProjectSeparator.status, 404);
    const rawBackslashStatus = await new Promise<number>((resolve, reject) => {
      const request = httpRequest({ hostname: "127.0.0.1", port: (server.address() as AddressInfo).port, method: "GET", path: `/api/user/projects\\${project.id}`, headers: headers(sessionA.token) }, (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode ?? 0));
      });
      request.once("error", reject);
      request.end();
    });
    assert.equal(rawBackslashStatus, 404);
    const workResponse = await fetch(`${url}/api/user/projects/${project.id}/work-requests`, { method: "POST", headers: headers(sessionA.token), body: JSON.stringify({ title: "Task", objective: "record task", idempotencyKey: "task-1" }) });
    assert.equal(workResponse.status, 201);
    const work = (await workResponse.json() as any).request;
    const waiting = await fetch(`${url}/api/user/projects/${project.id}/runs`, { method: "POST", headers: headers(sessionA.token), body: JSON.stringify({ workRequestId: work.id, runId: "run-project-api-1" }) });
    assert.equal(waiting.status, 409);
    assert.equal((await waiting.json() as any).blocker, "Project Runtime is not configured");
    const foreign = await fetch(`${url}/api/user/projects/${project.id}`, { headers: headers(sessionB.token) });
    assert.equal(foreign.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("user project API exposes an owner-scoped bounded text file preview", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-file-api-"));
  const platform = createPlatformUserService(join(root, "platform"), { now: () => "2026-09-25T12:00:00.000Z" });
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, now: () => "2026-09-25T12:00:00.000Z" });
  const userA = await platform.createUser({ id: "file-api-a", email: "file-a@example.com", displayName: "A", timezone: "Asia/Seoul" });
  const userB = await platform.createUser({ id: "file-api-b", email: "file-b@example.com", displayName: "B", timezone: "Asia/Seoul" });
  const sessionA = await platform.createSession({ userId: userA.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });
  const sessionB = await platform.createSession({ userId: userB.id, roles: ["user"], expiresAt: "2026-09-26T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: join(root, "web"), userService: platform, userProjectService: projects });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
  try {
    const createdResponse = await fetch(`${url}/api/user/projects`, { method: "POST", headers: headers(sessionA.token), body: JSON.stringify({ name: "File API project", objective: "read a real file", purpose: "rapid-prototype", teamMode: "solo" }) });
    assert.equal(createdResponse.status, 201);
    const project = (await createdResponse.json() as any).project;
    await mkdir(join(project.workspaceRoot, "src"), { recursive: true });
    await writeFile(join(project.workspaceRoot, "src", "main.ts"), "export const ready = true;\n", "utf8");
    const previewResponse = await fetch(`${url}/api/user/projects/${project.id}/files?path=${encodeURIComponent("src/main.ts")}`, { headers: headers(sessionA.token) });
    assert.equal(previewResponse.status, 200);
    assert.deepEqual(await previewResponse.json(), { status: "ready", path: "src/main.ts", size: Buffer.byteLength("export const ready = true;\n", "utf8"), content: "export const ready = true;\n" });
    const foreign = await fetch(`${url}/api/user/projects/${project.id}/files?path=${encodeURIComponent("src/main.ts")}`, { headers: headers(sessionB.token) });
    assert.equal(foreign.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("user project API keeps a dependent task waiting before creating a Run", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-dependency-api-"));
  const now = "2026-09-28T12:00:00.000Z";
  const platform = createPlatformUserService(join(root, "platform"), { now: () => now });
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, now: () => now });
  const user = await platform.createUser({ id: "dependency-api-user", email: "dependency-api@example.com", displayName: "Dependency API", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-29T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: join(root, "web"), userService: platform, userProjectService: projects, ideaLabRuntime: { state: "ready", enqueueProjectRun: async () => "accepted" } });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  try {
    const project = (await (await fetch(`${url}/api/user/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Dependency API project", objective: "block dependent execution", purpose: "rapid-prototype", teamMode: "solo" }) })).json() as any).project;
    const prerequisite = (await (await fetch(`${url}/api/user/projects/${project.id}/work-requests`, { method: "POST", headers, body: JSON.stringify({ title: "Prerequisite", objective: "complete first", idempotencyKey: "dependency-prerequisite" }) })).json() as any).request;
    const dependent = (await (await fetch(`${url}/api/user/projects/${project.id}/work-requests`, { method: "POST", headers, body: JSON.stringify({ title: "Dependent", objective: "wait for prerequisite", idempotencyKey: "dependency-dependent", dependencies: [prerequisite.id] }) })).json() as any).request;
    const start = await fetch(`${url}/api/user/projects/${project.id}/runs`, { method: "POST", headers, body: JSON.stringify({ workRequestId: dependent.id, runId: "dependency-api-run" }) });
    assert.equal(start.status, 409);
    assert.equal((await start.json() as any).blocker, `dependencies incomplete: ${prerequisite.id}`);
    const view = await (await fetch(`${url}/api/user/projects/${project.id}`, { headers })).json() as any;
    const stored = view.workRequests.find((item: any) => item.id === dependent.id);
    assert.equal(stored.status, "waiting");
    assert.equal(stored.runId, undefined);
    assert.equal(await loadHarnessRun(join(root, "runs"), "dependency-api-run"), null);
  } finally { await server.closeForShutdown(); }
});

test("user project API schedules only the bounded number of ready queued tasks", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-schedule-api-"));
  const now = "2026-09-28T13:00:00.000Z";
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "HARNESS_ENGINEERING.md"), "# Scheduler test harness\n", "utf8");
  const platform = createPlatformUserService(join(root, "platform"), { now: () => now });
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, now: () => now });
  const user = await platform.createUser({ id: "schedule-api-user", email: "schedule-api@example.com", displayName: "Schedule API", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-29T13:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: join(root, "web"), userService: platform, userProjectService: projects, ideaLabRuntime: { state: "ready", enqueueProjectRun: async () => "accepted" } });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  try {
    const project = (await (await fetch(`${url}/api/user/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Schedule API project", objective: "run ready tasks with an explicit concurrency bound", purpose: "rapid-prototype", teamMode: "solo" }) })).json() as any).project;
    const first = (await (await fetch(`${url}/api/user/projects/${project.id}/work-requests`, { method: "POST", headers, body: JSON.stringify({ title: "Queue first", objective: "first ready task", idempotencyKey: "schedule-first" }) })).json() as any).request;
    const second = (await (await fetch(`${url}/api/user/projects/${project.id}/work-requests`, { method: "POST", headers, body: JSON.stringify({ title: "Queue second", objective: "second ready task", idempotencyKey: "schedule-second" }) })).json() as any).request;
    const scheduled = await fetch(`${url}/api/user/projects/${project.id}/schedule`, { method: "POST", headers, body: JSON.stringify({ maxConcurrent: 1 }) });
    assert.equal(scheduled.status, 202);
    const body = await scheduled.json() as any;
    assert.equal(body.results.length, 1);
    assert.equal(body.results[0].status, "started");
    const view = await (await fetch(`${url}/api/user/projects/${project.id}`, { headers })).json() as any;
    assert.equal(view.workRequests.find((item: any) => item.id === first.id)?.status, "running");
    assert.equal(view.workRequests.find((item: any) => item.id === second.id)?.status, "queued");
  } finally { await server.closeForShutdown(); }
});

test("user project API does not exceed the concurrency bound when a Run is already active", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-active-schedule-api-"));
  const now = "2026-09-28T13:30:00.000Z";
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "HARNESS_ENGINEERING.md"), "# Active scheduler test harness\n", "utf8");
  const platform = createPlatformUserService(join(root, "platform"), { now: () => now });
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, now: () => now });
  const user = await platform.createUser({ id: "active-schedule-api-user", email: "active-schedule-api@example.com", displayName: "Active Schedule API", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-29T13:30:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: join(root, "web"), userService: platform, userProjectService: projects, ideaLabRuntime: { state: "ready", enqueueProjectRun: async () => "accepted" } });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  try {
    const project = (await (await fetch(`${url}/api/user/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Active scheduler project", objective: "count active Runs in the queue limit", purpose: "rapid-prototype", teamMode: "solo" }) })).json() as any).project;
    const first = (await (await fetch(`${url}/api/user/projects/${project.id}/work-requests`, { method: "POST", headers, body: JSON.stringify({ title: "Already active", objective: "consume the only execution slot", idempotencyKey: "active-first" }) })).json() as any).request;
    const second = (await (await fetch(`${url}/api/user/projects/${project.id}/work-requests`, { method: "POST", headers, body: JSON.stringify({ title: "Must remain queued", objective: "wait until the active slot is free", idempotencyKey: "active-second" }) })).json() as any).request;
    const started = await fetch(`${url}/api/user/projects/${project.id}/runs`, { method: "POST", headers, body: JSON.stringify({ workRequestId: first.id, runId: "active-schedule-run" }) });
    assert.equal(started.status, 202);
    const scheduled = await fetch(`${url}/api/user/projects/${project.id}/schedule`, { method: "POST", headers, body: JSON.stringify({ maxConcurrent: 1 }) });
    assert.equal(scheduled.status, 200);
    const body = await scheduled.json() as any;
    assert.equal(body.selected, 0);
    const view = await (await fetch(`${url}/api/user/projects/${project.id}`, { headers })).json() as any;
    assert.equal(view.workRequests.find((item: any) => item.id === first.id)?.status, "running");
    assert.equal(view.workRequests.find((item: any) => item.id === second.id)?.status, "queued");
  } finally { await server.closeForShutdown(); }
});

test("user project API serializes concurrent scheduler requests for the same project", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-concurrent-schedule-api-"));
  const now = "2026-09-28T14:00:00.000Z";
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "HARNESS_ENGINEERING.md"), "# Concurrent scheduler test harness\n", "utf8");
  const platform = createPlatformUserService(join(root, "platform"), { now: () => now });
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, now: () => now });
  const user = await platform.createUser({ id: "concurrent-schedule-api-user", email: "concurrent-schedule-api@example.com", displayName: "Concurrent Schedule API", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-29T14:00:00.000Z" });
  let enqueueCalls = 0;
  let releaseEnqueue!: () => void;
  const enqueueHeld = new Promise<void>((resolve) => { releaseEnqueue = resolve; });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1",
    port: 0,
    token: "operator",
    modelRoot: join(root, "model"),
    harnessRoot: join(root, "harness"),
    webRoot: join(root, "web"),
    userService: platform,
    userProjectService: projects,
    ideaLabRuntime: { state: "ready", enqueueProjectRun: async () => { enqueueCalls += 1; await enqueueHeld; return "accepted"; } },
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  try {
    const project = (await (await fetch(`${url}/api/user/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Concurrent scheduler project", objective: "avoid selecting the same task twice", purpose: "rapid-prototype", teamMode: "solo" }) })).json() as any).project;
    const task = (await (await fetch(`${url}/api/user/projects/${project.id}/work-requests`, { method: "POST", headers, body: JSON.stringify({ title: "Single queued task", objective: "must start exactly once", idempotencyKey: "concurrent-single-task" }) })).json() as any).request;
    const requestBody = JSON.stringify({ maxConcurrent: 1 });
    const first = fetch(`${url}/api/user/projects/${project.id}/schedule`, { method: "POST", headers, body: requestBody });
    const second = fetch(`${url}/api/user/projects/${project.id}/schedule`, { method: "POST", headers, body: requestBody });
    for (let attempt = 0; attempt < 100 && enqueueCalls < 1; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    releaseEnqueue();
    const responses = await Promise.all([first, second]);
    const bodies = await Promise.all(responses.map(async (response) => ({ status: response.status, body: await response.json() as any })));
    assert.equal(enqueueCalls, 1);
    assert.deepEqual(bodies.map((item) => item.status).sort((a, b) => a - b), [200, 202]);
    assert.deepEqual(bodies.map((item) => item.body.selected).sort((a, b) => a - b), [0, 1]);
    const view = await (await fetch(`${url}/api/user/projects/${project.id}`, { headers })).json() as any;
    const stored = view.workRequests.find((item: any) => item.id === task.id);
    assert.equal(stored.status, "running");
    assert.equal(view.workRequests.filter((item: any) => item.runId).length, 1);
  } finally { await server.closeForShutdown(); }
});

test("user project API enforces build approval before accepting a run request", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-approval-api-"));
  const platformRoot = join(root, "platform");
  const platform = createPlatformUserService(platformRoot, { now: () => "2026-09-26T12:00:00.000Z" });
  const settings = createSettingsService(platformRoot, { now: () => "2026-09-26T12:00:00.000Z" });
  const projects = createUserProjectService({ platformRoot, projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, now: () => "2026-09-26T12:00:00.000Z" });
  const user = await platform.createUser({ id: "approval-api-user", email: "approval-api@example.com", displayName: "Approval API", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: join(root, "web"), userService: platform, userProjectService: projects, settingsService: settings });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  try {
    const projectResponse = await fetch(`${url}/api/user/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Approval API project", objective: "guard server execution", purpose: "rapid-prototype", teamMode: "solo" }) });
    const project = (await projectResponse.json() as any).project;
    const workResponse = await fetch(`${url}/api/user/projects/${project.id}/work-requests`, { method: "POST", headers, body: JSON.stringify({ title: "Guarded task", objective: "wait for approval", idempotencyKey: "approval-api-task" }) });
    const work = (await workResponse.json() as any).request;
    await settings.updateSettings({ userId: user.id, sessionId: session.id, roles: ["user"] }, { aiApproval: { buildRun: true } });

    const rejected = await fetch(`${url}/api/user/projects/${project.id}/runs`, { method: "POST", headers, body: JSON.stringify({ workRequestId: work.id, runId: "approval-api-run" }) });
    assert.equal(rejected.status, 409);
    assert.equal((await rejected.json() as any).error, "Build run approval is required");

    const approved = await fetch(`${url}/api/user/projects/${project.id}/runs`, { method: "POST", headers, body: JSON.stringify({ workRequestId: work.id, runId: "approval-api-run", approved: true }) });
    assert.equal(approved.status, 409);
    assert.equal((await approved.json() as any).blocker, "Project Runtime is not configured");
  } finally {
    await server.closeForShutdown();
  }
});

test("user project API resumes a waiting Run without changing its identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-resume-api-"));
  const now = "2026-09-26T12:00:00.000Z";
  const platform = createPlatformUserService(join(root, "platform"), { now: () => now });
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, now: () => now });
  const user = await platform.createUser({ id: "resume-api-user", email: "resume-api@example.com", displayName: "Resume API", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-27T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: join(root, "web"), userService: platform, userProjectService: projects, ideaLabRuntime: { state: "ready", enqueueProjectRun: async () => "accepted" } });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  try {
    const project = (await (await fetch(`${url}/api/user/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Resume API project", objective: "resume a waiting Run", purpose: "rapid-prototype", teamMode: "solo" }) })).json() as any).project;
    const work = (await (await fetch(`${url}/api/user/projects/${project.id}/work-requests`, { method: "POST", headers, body: JSON.stringify({ title: "Resume task", objective: "continue the same Run", idempotencyKey: "resume-api-task" }) })).json() as any).request;
    const started = await fetch(`${url}/api/user/projects/${project.id}/runs`, { method: "POST", headers, body: JSON.stringify({ workRequestId: work.id, runId: "resume-api-run" }) });
    assert.equal(started.status, 202);
    const run = await loadHarnessRun(join(root, "runs"), "resume-api-run");
    assert.ok(run);
    await saveHarnessRun(join(root, "runs"), { ...run, state: transitionRunState(run.state, { type: "wait-agent", at: now, reason: "Agent reconnect required" }), updatedAt: now });

    const resumed = await fetch(`${url}/api/user/projects/${project.id}/runs/resume`, { method: "POST", headers, body: JSON.stringify({ workRequestId: work.id }) });
    assert.equal(resumed.status, 202);
    assert.equal((await resumed.json() as any).runId, "resume-api-run");
    const after = await loadHarnessRun(join(root, "runs"), "resume-api-run");
    assert.equal(after?.state.status, "READY");
    assert.equal(after?.request.runId, "resume-api-run");
  } finally {
    await server.closeForShutdown();
  }
});

test("user project API pauses a running Run behind the owner boundary and preserves a durable checkpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-pause-api-"));
  const now = "2026-09-26T13:00:00.000Z";
  const platform = createPlatformUserService(join(root, "platform"), { now: () => now });
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, now: () => now });
  const owner = await platform.createUser({ id: "pause-api-owner", email: "pause-api-owner@example.com", displayName: "Pause API owner", timezone: "Asia/Seoul" });
  const foreign = await platform.createUser({ id: "pause-api-foreign", email: "pause-api-foreign@example.com", displayName: "Pause API foreign", timezone: "Asia/Seoul" });
  const ownerSession = await platform.createSession({ userId: owner.id, roles: ["user"], expiresAt: "2026-09-27T13:00:00.000Z" });
  const foreignSession = await platform.createSession({ userId: foreign.id, roles: ["user"], expiresAt: "2026-09-27T13:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: join(root, "web"), userService: platform, userProjectService: projects, ideaLabRuntime: { state: "ready", enqueueProjectRun: async () => "accepted" } });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
  try {
    const project = (await (await fetch(`${url}/api/user/projects`, { method: "POST", headers: headers(ownerSession.token), body: JSON.stringify({ name: "Pause API project", objective: "pause a running Run", purpose: "rapid-prototype", teamMode: "solo" }) })).json() as any).project;
    const work = (await (await fetch(`${url}/api/user/projects/${project.id}/work-requests`, { method: "POST", headers: headers(ownerSession.token), body: JSON.stringify({ title: "Pause task", objective: "pause before the next stage", idempotencyKey: "pause-api-task" }) })).json() as any).request;
    const started = await fetch(`${url}/api/user/projects/${project.id}/runs`, { method: "POST", headers: headers(ownerSession.token), body: JSON.stringify({ workRequestId: work.id, runId: "pause-api-run" }) });
    assert.equal(started.status, 202);
    const run = await loadHarnessRun(join(root, "runs"), "pause-api-run");
    assert.ok(run);
    await saveHarnessRun(join(root, "runs"), { ...run, state: transitionRunState({ ...run.state, status: "READY", reason: undefined }, { type: "start", at: now }), updatedAt: now });

    const paused = await fetch(`${url}/api/user/projects/${project.id}/runs/pause`, { method: "POST", headers: headers(ownerSession.token), body: JSON.stringify({ workRequestId: work.id }) });
    assert.equal(paused.status, 200);
    assert.equal((await paused.json() as any).runId, "pause-api-run");
    assert.equal((await loadHarnessRun(join(root, "runs"), "pause-api-run"))?.state.status, "PAUSED");

    const foreignPause = await fetch(`${url}/api/user/projects/${project.id}/runs/pause`, { method: "POST", headers: headers(foreignSession.token), body: JSON.stringify({ workRequestId: work.id }) });
    assert.equal(foreignPause.status, 404);
    const view = await (await fetch(`${url}/api/user/projects/${project.id}`, { headers: headers(ownerSession.token) })).json() as any;
    assert.equal(view.runtime.status, "waiting");
    assert.equal(view.workRequests.find((item: any) => item.id === work.id)?.status, "waiting");
  } finally {
    await server.closeForShutdown();
  }
});

test("user project API cancels only a queued work request and persists the terminal state", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-cancel-api-"));
  const now = "2026-09-27T12:00:00.000Z";
  const platform = createPlatformUserService(join(root, "platform"), { now: () => now });
  const activity = createActivityService(join(root, "platform"), { now: () => now });
  const growth = createGrowthService(join(root, "platform"), { now: () => now });
  const projects = createUserProjectService({ platformRoot: join(root, "platform"), projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, activityService: activity, now: () => now });
  const user = await platform.createUser({ id: "cancel-api-user", email: "cancel-api@example.com", displayName: "Cancel API", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-28T12:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: join(root, "web"), userService: platform, activityService: activity, growthService: growth, userProjectService: projects });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  try {
    const project = (await (await fetch(`${url}/api/user/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Cancel API project", objective: "cancel a queued task", purpose: "rapid-prototype", teamMode: "solo" }) })).json() as any).project;
    const work = (await (await fetch(`${url}/api/user/projects/${project.id}/work-requests`, { method: "POST", headers, body: JSON.stringify({ title: "Queued task", objective: "cancel before execution", idempotencyKey: "cancel-api-task" }) })).json() as any).request;

    const cancelled = await fetch(`${url}/api/user/projects/${project.id}/work-requests/${work.id}/cancel`, { method: "POST", headers, body: "{}" });
    assert.equal(cancelled.status, 200);
    assert.equal((await cancelled.json() as any).request.status, "cancelled");

    const view = await (await fetch(`${url}/api/user/projects/${project.id}`, { headers })).json() as any;
    assert.equal(view.workRequests.find((item: any) => item.id === work.id)?.status, "cancelled");

    const activityResponse = await fetch(`${url}/api/user/activity`, { headers });
    assert.equal(activityResponse.status, 200);
    const activityBody = await activityResponse.json() as any;
    const cancellationEvent = activityBody.events.find((item: any) => item.sourceId === work.id && item.eventType === "project.work.cancelled");
    assert.equal(cancellationEvent?.sourceType, "project-work-request");
    assert.equal(cancellationEvent?.actorType, "user");
    assert.equal(cancellationEvent?.verificationStatus, "unverified");
    assert.deepEqual(cancellationEvent?.payload, { projectId: project.id, workRequestId: work.id });
    assert.equal((await (await fetch(`${url}/api/user/growth`, { headers })).json() as any).xp, 0);

    const repeated = await fetch(`${url}/api/user/projects/${project.id}/work-requests/${work.id}/cancel`, { method: "POST", headers, body: "{}" });
    assert.equal(repeated.status, 409);
  } finally {
    await server.closeForShutdown();
  }
});

test("user project API records one unverified activity event for a newly created work request", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-work-activity-api-"));
  const now = "2026-09-27T13:00:00.000Z";
  const platformRoot = join(root, "platform");
  const platform = createPlatformUserService(platformRoot, { now: () => now });
  const activity = createActivityService(platformRoot, { now: () => now });
  const growth = createGrowthService(platformRoot, { now: () => now });
  const projects = createUserProjectService({ platformRoot, projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, activityService: activity, now: () => now });
  const user = await platform.createUser({ id: "work-activity-api-user", email: "work-activity@example.com", displayName: "Work Activity", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-28T13:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: join(root, "web"), userService: platform, activityService: activity, growthService: growth, userProjectService: projects });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  try {
    const project = (await (await fetch(`${url}/api/user/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Work activity project", objective: "record task activity", purpose: "rapid-prototype", teamMode: "solo" }) })).json() as any).project;
    const body = JSON.stringify({ title: "Recorded task", objective: "persist task activity", idempotencyKey: "work-activity-task" });
    const created = await fetch(`${url}/api/user/projects/${project.id}/work-requests`, { method: "POST", headers, body });
    assert.equal(created.status, 201);
    const work = (await created.json() as any).request;
    const replay = await fetch(`${url}/api/user/projects/${project.id}/work-requests`, { method: "POST", headers, body });
    assert.equal(replay.status, 200);

    const activityResponse = await fetch(`${url}/api/user/activity`, { headers });
    assert.equal(activityResponse.status, 200);
    const events = (await activityResponse.json() as any).events.filter((item: any) => item.sourceId === work.id && item.eventType === "project.work.created");
    assert.equal(events.length, 1);
    assert.equal(events[0].sourceType, "project-work-request");
    assert.equal(events[0].actorType, "user");
    assert.equal(events[0].verificationStatus, "unverified");
    assert.deepEqual(events[0].payload, { projectId: project.id, workRequestId: work.id });
  } finally {
    await server.closeForShutdown();
  }
});

test("user project API records one unverified activity event for a newly created project", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-created-activity-api-"));
  const now = "2026-09-27T13:30:00.000Z";
  const platformRoot = join(root, "platform");
  const platform = createPlatformUserService(platformRoot, { now: () => now });
  const activity = createActivityService(platformRoot, { now: () => now });
  const growth = createGrowthService(platformRoot, { now: () => now });
  const projects = createUserProjectService({ platformRoot, projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, activityService: activity, now: () => now });
  const user = await platform.createUser({ id: "project-created-activity-user", email: "project-created-activity@example.com", displayName: "Project Created Activity", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-28T13:30:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: join(root, "web"), userService: platform, activityService: activity, growthService: growth, userProjectService: projects });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  try {
    const response = await fetch(`${url}/api/user/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Created activity project", objective: "record project activity", purpose: "rapid-prototype", teamMode: "solo" }) });
    assert.equal(response.status, 201);
    const project = (await response.json() as any).project;

    const activityResponse = await fetch(`${url}/api/user/activity`, { headers });
    assert.equal(activityResponse.status, 200);
    const events = (await activityResponse.json() as any).events.filter((item: any) => item.sourceId === project.id && item.eventType === "project.created");
    assert.equal(events.length, 1);
    assert.equal(events[0].sourceType, "project");
    assert.equal(events[0].actorType, "user");
    assert.equal(events[0].verificationStatus, "unverified");
    assert.deepEqual(events[0].payload, { projectId: project.id, purpose: "rapid-prototype", teamMode: "solo" });
    assert.equal((await (await fetch(`${url}/api/user/growth`, { headers })).json() as any).xp, 0);
  } finally {
    await server.closeForShutdown();
  }
});

test("user project API records one unverified activity event when a Run is requested", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-run-activity-api-"));
  const now = "2026-09-27T14:00:00.000Z";
  const platformRoot = join(root, "platform");
  const platform = createPlatformUserService(platformRoot, { now: () => now });
  const activity = createActivityService(platformRoot, { now: () => now });
  const growth = createGrowthService(platformRoot, { now: () => now });
  const projects = createUserProjectService({ platformRoot, projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, activityService: activity, now: () => now });
  const user = await platform.createUser({ id: "project-run-activity-user", email: "project-run-activity@example.com", displayName: "Project Run Activity", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-28T14:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: join(root, "web"), userService: platform, activityService: activity, growthService: growth, userProjectService: projects, ideaLabRuntime: { state: "ready", enqueueProjectRun: async () => "accepted" } });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  try {
    const project = (await (await fetch(`${url}/api/user/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Run activity project", objective: "record requested Run activity", purpose: "rapid-prototype", teamMode: "solo" }) })).json() as any).project;
    const work = (await (await fetch(`${url}/api/user/projects/${project.id}/work-requests`, { method: "POST", headers, body: JSON.stringify({ title: "Requested Run task", objective: "request a durable Run", idempotencyKey: "run-activity-task" }) })).json() as any).request;
    const started = await fetch(`${url}/api/user/projects/${project.id}/runs`, { method: "POST", headers, body: JSON.stringify({ workRequestId: work.id, runId: "run-activity-1" }) });
    assert.equal(started.status, 202);
    assert.equal((await started.json() as any).runId, "run-activity-1");

    const activityResponse = await fetch(`${url}/api/user/activity`, { headers });
    assert.equal(activityResponse.status, 200);
    const events = (await activityResponse.json() as any).events.filter((item: any) => item.sourceId === "run-activity-1" && item.eventType === "project.run.requested");
    assert.equal(events.length, 1);
    assert.equal(events[0].sourceType, "project-run");
    assert.equal(events[0].actorType, "user");
    assert.equal(events[0].verificationStatus, "unverified");
    assert.deepEqual(events[0].payload, { projectId: project.id, workRequestId: work.id, runId: "run-activity-1" });
    assert.equal((await (await fetch(`${url}/api/user/growth`, { headers })).json() as any).xp, 0);

    const replay = await fetch(`${url}/api/user/projects/${project.id}/runs`, { method: "POST", headers, body: JSON.stringify({ workRequestId: work.id, runId: "run-activity-1" }) });
    assert.equal(replay.status, 202);
    const replayActivity = await fetch(`${url}/api/user/activity`, { headers });
    const replayEvents = (await replayActivity.json() as any).events.filter((item: any) => item.sourceId === "run-activity-1" && item.eventType === "project.run.requested");
    assert.equal(replayEvents.length, 1);
  } finally {
    await server.closeForShutdown();
  }
});

test("user project API records bounded activity for Run resume and retry actions", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-recovery-activity-api-"));
  const now = "2026-09-27T15:00:00.000Z";
  const platformRoot = join(root, "platform");
  const platform = createPlatformUserService(platformRoot, { now: () => now });
  const activity = createActivityService(platformRoot, { now: () => now });
  const growth = createGrowthService(platformRoot, { now: () => now });
  const projects = createUserProjectService({ platformRoot, projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, activityService: activity, now: () => now });
  const user = await platform.createUser({ id: "project-recovery-activity-user", email: "project-recovery-activity@example.com", displayName: "Project Recovery Activity", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-28T15:00:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: join(root, "web"), userService: platform, activityService: activity, growthService: growth, userProjectService: projects, ideaLabRuntime: { state: "ready", enqueueProjectRun: async () => "accepted" } });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  try {
    const project = (await (await fetch(`${url}/api/user/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Recovery activity project", objective: "record recovery actions", purpose: "rapid-prototype", teamMode: "solo" }) })).json() as any).project;
    const work = (await (await fetch(`${url}/api/user/projects/${project.id}/work-requests`, { method: "POST", headers, body: JSON.stringify({ title: "Recovery task", objective: "resume then retry the same Run", idempotencyKey: "recovery-activity-task" }) })).json() as any).request;
    const started = await fetch(`${url}/api/user/projects/${project.id}/runs`, { method: "POST", headers, body: JSON.stringify({ workRequestId: work.id, runId: "run-recovery-activity-1" }) });
    assert.equal(started.status, 202);
    const run = await loadHarnessRun(join(root, "runs"), "run-recovery-activity-1");
    assert.ok(run);
    await saveHarnessRun(join(root, "runs"), { ...run, state: transitionRunState(run.state, { type: "wait-agent", at: now, reason: "Agent reconnect required" }), updatedAt: now });

    const resumed = await fetch(`${url}/api/user/projects/${project.id}/runs/resume`, { method: "POST", headers, body: JSON.stringify({ workRequestId: work.id }) });
    assert.equal(resumed.status, 202);
    assert.equal((await resumed.json() as any).runId, "run-recovery-activity-1");

    const resumedRun = await loadHarnessRun(join(root, "runs"), "run-recovery-activity-1");
    assert.ok(resumedRun);
    await saveHarnessRun(join(root, "runs"), { ...resumedRun, state: transitionRunState(resumedRun.state, { type: "final-failure", at: now, reason: "isolated recovery failure" }), updatedAt: now });

    const retried = await fetch(`${url}/api/user/projects/${project.id}/runs/retry`, { method: "POST", headers, body: JSON.stringify({ workRequestId: work.id }) });
    assert.equal(retried.status, 202);
    assert.equal((await retried.json() as any).runId, "run-recovery-activity-1");

    const activityResponse = await fetch(`${url}/api/user/activity`, { headers });
    assert.equal(activityResponse.status, 200);
    const events = (await activityResponse.json() as any).events;
    const resumedEvents = events.filter((item: any) => item.eventType === "project.run.resumed" && item.payload?.runId === "run-recovery-activity-1");
    const retriedEvents = events.filter((item: any) => item.eventType === "project.run.retried" && item.payload?.runId === "run-recovery-activity-1");
    assert.equal(resumedEvents.length, 1);
    assert.equal(retriedEvents.length, 1);
    assert.equal(resumedEvents[0].sourceType, "project-run");
    assert.equal(resumedEvents[0].sourceId, "run-recovery-activity-1:resume:2026-09-27T15:00:00.000Z");
    assert.equal(resumedEvents[0].actorType, "user");
    assert.equal(resumedEvents[0].verificationStatus, "unverified");
    assert.deepEqual(resumedEvents[0].payload, { projectId: project.id, workRequestId: work.id, runId: "run-recovery-activity-1", resumeCheckpointAt: "2026-09-27T15:00:00.000Z" });
    assert.equal(retriedEvents[0].sourceId, "run-recovery-activity-1:retry:1");
    assert.equal(retriedEvents[0].sourceType, "project-run");
    assert.equal(retriedEvents[0].actorType, "user");
    assert.equal(retriedEvents[0].verificationStatus, "unverified");
    assert.deepEqual(retriedEvents[0].payload, { projectId: project.id, workRequestId: work.id, runId: "run-recovery-activity-1", retryCycle: 1 });
    assert.equal((await (await fetch(`${url}/api/user/growth`, { headers })).json() as any).xp, 0);
  } finally {
    await server.closeForShutdown();
  }
});

test("user project API records retry activity when Runtime reconnect is still required", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-user-project-retry-waiting-activity-api-"));
  const now = "2026-09-27T15:30:00.000Z";
  const platformRoot = join(root, "platform");
  const platform = createPlatformUserService(platformRoot, { now: () => now });
  const activity = createActivityService(platformRoot, { now: () => now });
  const growth = createGrowthService(platformRoot, { now: () => now });
  const projects = createUserProjectService({ platformRoot, projectModelRoot: join(root, "project-model"), projectHarnessRoot: join(root, "runs"), iseolRoot: root, activityService: activity, now: () => now });
  let enqueueResult: "accepted" | "not-configured" = "accepted";
  const user = await platform.createUser({ id: "project-retry-waiting-activity-user", email: "project-retry-waiting-activity@example.com", displayName: "Retry Waiting Activity", timezone: "Asia/Seoul" });
  const session = await platform.createSession({ userId: user.id, roles: ["user"], expiresAt: "2026-09-28T15:30:00.000Z" });
  const server = await startWebControlPlaneServer({ host: "127.0.0.1", port: 0, token: "operator", modelRoot: join(root, "model"), harnessRoot: join(root, "harness"), webRoot: join(root, "web"), userService: platform, activityService: activity, growthService: growth, userProjectService: projects, ideaLabRuntime: { state: "ready", enqueueProjectRun: async () => enqueueResult } });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
  try {
    const project = (await (await fetch(`${url}/api/user/projects`, { method: "POST", headers, body: JSON.stringify({ name: "Retry waiting activity project", objective: "preserve a reconnect checkpoint", purpose: "rapid-prototype", teamMode: "solo" }) })).json() as any).project;
    const work = (await (await fetch(`${url}/api/user/projects/${project.id}/work-requests`, { method: "POST", headers, body: JSON.stringify({ title: "Retry waiting task", objective: "keep retry waiting and auditable", idempotencyKey: "retry-waiting-activity-task" }) })).json() as any).request;
    const started = await fetch(`${url}/api/user/projects/${project.id}/runs`, { method: "POST", headers, body: JSON.stringify({ workRequestId: work.id, runId: "run-retry-waiting-activity-1" }) });
    assert.equal(started.status, 202);
    const run = await loadHarnessRun(join(root, "runs"), "run-retry-waiting-activity-1");
    assert.ok(run);
    await saveHarnessRun(join(root, "runs"), { ...run, state: transitionRunState(run.state, { type: "final-failure", at: now, reason: "Runtime disconnected" }), updatedAt: now });
    enqueueResult = "not-configured";

    const retried = await fetch(`${url}/api/user/projects/${project.id}/runs/retry`, { method: "POST", headers, body: JSON.stringify({ workRequestId: work.id }) });
    assert.equal(retried.status, 409);
    const retryResult = await retried.json() as any;
    assert.equal(retryResult.request.status, "waiting");
    assert.match(retryResult.blocker, /not configured/i);

    const activityResponse = await fetch(`${url}/api/user/activity`, { headers });
    const events = (await activityResponse.json() as any).events.filter((item: any) => item.eventType === "project.run.retried" && item.payload?.runId === "run-retry-waiting-activity-1");
    assert.equal(events.length, 1);
    assert.equal(events[0].sourceId, "run-retry-waiting-activity-1:retry:1");
    assert.equal(events[0].verificationStatus, "unverified");
    assert.deepEqual(events[0].payload, { projectId: project.id, workRequestId: work.id, runId: "run-retry-waiting-activity-1", retryCycle: 1 });
    assert.equal((await (await fetch(`${url}/api/user/growth`, { headers })).json() as any).xp, 0);
  } finally {
    await server.closeForShutdown();
  }
});
