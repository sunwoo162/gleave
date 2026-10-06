import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Principal } from "../identity/contracts.js";
import { assertIdentityId, assertTimestamp } from "../identity/contracts.js";
import type { HarnessEvidenceRecord, HarnessRunStatus } from "../harness/contracts.js";
import { loadHarnessRun, requestHarnessRunRetry, saveHarnessRun } from "../harness/run-store.js";
import { pauseHarnessRun, resumeHarnessRun } from "../harness/run-service.js";
import { appendHarnessRunEvent, saveHarnessCheckpoint } from "../harness/event-store.js";
import { transitionRunState } from "../harness/state-machine.js";
import type { ProjectPurpose } from "./execution-profile.js";
import { defaultAgentRoleRegistrations, resolveExecutionProfile } from "./execution-profile.js";
import { createProjectWorkRequest, listProjectWorkRequests, reconcileProjectWorkRequest, type ProjectWorkRequest } from "./work-request.js";
import { startProjectWorkspaceRun } from "./workspace-run-preparation.js";
import { updateProjectWorkRequest } from "./work-request.js";
import type { ProjectHistoryEvent, ProjectWorkspace } from "./contracts.js";
import { addProjectTreeNode } from "./project-tree.js";
import { selectProjectEvidence } from "./evidence-service.js";
import { projectLifecycleFromEvidence, type ProjectLifecycleView } from "./lifecycle.js";
import { loadProjectHistory } from "./history-store.js";
import { loadProjectWorkspace, loadProjectWorkspaceUnlocked, saveProjectWorkspace, saveProjectWorkspaceUnlocked } from "./workspace-store.js";
import { missingProjectRunObservation, projectRunObservation, runtimeObservationStatus, type UserProjectRunObservation } from "./run-observability.js";
import { listUserProjectWorkspaceFiles, readUserProjectWorkspaceFile, type UserProjectWorkspaceFilePreview, type UserProjectWorkspaceFiles } from "./workspace-files.js";
import { withDurableProjectScheduleLock } from "./schedule-lock.js";
import { withDurableProjectWorkRequestRunLock } from "./work-request-lock.js";
import { withDurableProjectWorkspaceLock } from "./workspace-lock.js";
import { withDurableTeamMembershipLock } from "../teams/membership-lock.js";
import type { ActivityService } from "../activity/contracts.js";
import type { GrowthService } from "../growth/contracts.js";
import type { SettingsService } from "../settings/contracts.js";

export type UserProjectTeamMode = "solo" | "ai" | "human" | "mixed";
export type UserProject = {
  version: 1;
  id: string;
  ownerUserId: string;
  name: string;
  objective: string;
  purpose: ProjectPurpose;
  teamMode: UserProjectTeamMode;
  teamId?: string;
  workspaceRoot: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type UserProjectInput = { name: string; objective: string; purpose: ProjectPurpose; teamMode: UserProjectTeamMode; teamId?: string };
export type UserProjectWorkInput = { title: string; objective: string; idempotencyKey: string; dependencies?: string[] };
export type UserProjectRuntimeView = { status: "not-started" | "running" | "waiting" | "completed" | "failed" | "unknown"; runId?: string; stage?: string; blocker?: string };
export type UserProjectWorkspaceView = ProjectWorkspace & { files: UserProjectWorkspaceFiles };
export type UserProjectWorkspaceFileRead = UserProjectWorkspaceFilePreview;
export type UserProjectView = { project: UserProject; workspace: UserProjectWorkspaceView; workRequests: ProjectWorkRequest[]; runtime: UserProjectRuntimeView; evidence: HarnessEvidenceRecord[]; observability: { runs: UserProjectRunObservation[] }; lifecycle: ProjectLifecycleView; history: ProjectHistoryEvent[] };
export type UserProjectRunResult = { status: "started" | "already-active" | "waiting" | "paused" | "already-paused"; request: ProjectWorkRequest; runId?: string; blocker?: string };
export type UserProjectScheduleResult = { selected: number; maxConcurrent: number; results: UserProjectRunResult[] };

export type UserProjectService = {
  createProject(principal: Principal, input: UserProjectInput): Promise<UserProject>;
  listProjects(principal: Principal): Promise<UserProject[]>;
  getProject(principal: Principal, projectId: string): Promise<UserProjectView | null>;
  readWorkspaceFile(principal: Principal, projectId: string, relativePath: string): Promise<UserProjectWorkspaceFileRead | null>;
  createWorkRequest(principal: Principal, projectId: string, input: UserProjectWorkInput): Promise<{ request: ProjectWorkRequest; created: boolean }>;
  cancelWorkRequest(principal: Principal, projectId: string, workRequestId: string): Promise<ProjectWorkRequest>;
  startProjectRun(principal: Principal, projectId: string, input: { workRequestId: string; runId: string; approved?: boolean }, enqueueProjectRun?: (runId: string) => Promise<"accepted" | "already-active" | "not-configured">): Promise<UserProjectRunResult>;
  scheduleProjectRuns(principal: Principal, projectId: string, input: { maxConcurrent?: number; approved?: boolean }, enqueueProjectRun?: (runId: string) => Promise<"accepted" | "already-active" | "not-configured">): Promise<UserProjectScheduleResult>;
  resumeProjectRun(principal: Principal, projectId: string, input: { workRequestId: string; approved?: boolean }, enqueueProjectRun?: (runId: string) => Promise<"accepted" | "already-active" | "not-configured">): Promise<UserProjectRunResult>;
  pauseProjectRun(principal: Principal, projectId: string, input: { workRequestId: string }): Promise<UserProjectRunResult>;
  retryProjectRun(principal: Principal, projectId: string, input: { workRequestId: string; approved?: boolean }, enqueueProjectRun?: (runId: string) => Promise<"accepted" | "already-active" | "not-configured">): Promise<UserProjectRunResult>;
  updateProjectTeam(principal: Principal, projectId: string, input: { teamMode: UserProjectTeamMode; teamId?: string }): Promise<UserProject>;
};

export type UserProjectServiceOptions = { platformRoot: string; projectModelRoot: string; projectHarnessRoot: string; iseolRoot: string; teamMembershipRoot?: string; canAccessTeam?: (principal: Principal, teamId: string) => Promise<boolean>; canAccessTeamWithinMembershipLock?: (principal: Principal, teamId: string) => Promise<boolean>; activityService?: ActivityService; growthService?: GrowthService; settingsService?: SettingsService; now?: () => string };

function ensurePrincipal(principal: Principal): void { assertIdentityId(principal.userId); }
function required(value: string, label: string, max: number): string { const trimmed = value.trim(); if (!trimmed || trimmed.length > max) throw new Error(`${label} is required`); return trimmed; }
function userDirectory(root: string, userId: string): string { assertIdentityId(userId); return resolve(root, "users", userId, "projects"); }
function projectPath(root: string, userId: string, projectId: string): string { assertIdentityId(projectId); return resolve(userDirectory(root, userId), `${projectId}.json`); }
async function saveJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await rename(temporary, path);
}
async function loadJson<T>(path: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
async function listUserProjects(root: string, userId: string): Promise<UserProject[]> {
  let names: string[];
  try { names = await readdir(userDirectory(root, userId)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const values: UserProject[] = [];
  for (const name of names.filter((item) => item.endsWith(".json"))) {
    const project = await loadJson<UserProject>(resolve(userDirectory(root, userId), name));
    if (project?.ownerUserId === userId) values.push(project);
  }
  return values.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}
async function listVisibleProjects(root: string, principal: Principal, canAccessTeam?: (principal: Principal, teamId: string) => Promise<boolean>): Promise<UserProject[]> {
  let userIds: string[];
  try { userIds = await readdir(resolve(root, "users")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const visible: UserProject[] = [];
  for (const userId of userIds) {
    try { assertIdentityId(userId); } catch { continue; }
    const projects = await listUserProjects(root, userId);
    for (const project of projects) {
      if (project.ownerUserId === principal.userId || (project.teamId && canAccessTeam && await canAccessTeam(principal, project.teamId))) visible.push(project);
    }
  }
  return visible.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}
async function listVisibleProjectsWithWorkspaceLocks(
  platformRoot: string,
  projectModelRoot: string,
  principal: Principal,
  canAccessTeam?: (principal: Principal, teamId: string) => Promise<boolean>,
): Promise<UserProject[]> {
  const candidates = await listVisibleProjects(platformRoot, principal, canAccessTeam);
  const current: UserProject[] = [];
  for (const candidate of candidates) {
    await withDurableProjectWorkspaceLock(projectModelRoot, candidate.id, async () => {
      const project = await loadJson<UserProject>(projectPath(platformRoot, candidate.ownerUserId, candidate.id));
      if (!project || project.ownerUserId !== candidate.ownerUserId) return;
      if (project.ownerUserId === principal.userId || (project.teamId && canAccessTeam && await canAccessTeam(principal, project.teamId))) current.push(project);
    }, { waitForMs: 2_000 });
  }
  return current.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}
function runtimeStatus(status: HarnessRunStatus): UserProjectRuntimeView["status"] { return runtimeObservationStatus(status); }
function lifecycleActivityType(kind: HarnessEvidenceRecord["kind"]): "project.artifact.recorded" | "project.revision.recorded" | "project.deployment.recorded" | null {
  if (kind === "build" || kind === "test" || kind === "file-change") return "project.artifact.recorded";
  if (kind === "commit" || kind === "pull-request" || kind === "ci") return "project.revision.recorded";
  if (kind === "deployment" || kind === "production-verification") return "project.deployment.recorded";
  return null;
}
function lifecycleActivitySourceId(itemId: string): string {
  return `lifecycle-${createHash("sha256").update(itemId).digest("hex").slice(0, 40)}`;
}
function initialWorkspace(project: UserProject, at: string): ProjectWorkspace {
  const profile = resolveExecutionProfile({ purpose: project.purpose, objective: project.objective, roles: defaultAgentRoleRegistrations() });
  return {
    version: 1,
    id: project.id,
    ownerUserId: project.ownerUserId,
    ...(project.teamId ? { teamId: project.teamId } : {}),
    name: project.name,
    status: "active",
    workspaceRoot: project.workspaceRoot,
    genesis: {
      prototypeId: project.id,
      repository: { url: "local://pending", branch: "main", commitSha: "pending" },
      deployment: { url: "local://pending", provider: "not-configured" },
      runs: [],
      promotedAt: at,
    },
    tree: [{ id: "root", kind: "root", title: project.name, status: "planned", runIds: [], createdAt: at, updatedAt: at }],
    purposeSelection: { version: 1, purpose: project.purpose, selectedAt: at, source: "user", profile },
    createdAt: at,
    updatedAt: at,
  };
}

export function createUserProjectService(options: UserProjectServiceOptions): UserProjectService {
  const now = options.now ?? (() => new Date().toISOString());
  const teamMembershipRoot = options.teamMembershipRoot ?? options.platformRoot;
  const withTeamMembershipMutationLock = <T>(teamId: string, task: () => Promise<T>): Promise<T> => withDurableTeamMembershipLock(teamMembershipRoot, teamId, task, { waitForMs: 2_000 });
  const projectScheduleLocks = new Map<string, Promise<void>>();
  const canAccessTeamForMutation = options.canAccessTeamWithinMembershipLock ?? options.canAccessTeam;
  const withProjectScheduleLock = async <T>(projectId: string, operation: () => Promise<T>): Promise<T> => {
    const previous = projectScheduleLocks.get(projectId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    projectScheduleLocks.set(projectId, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (projectScheduleLocks.get(projectId) === current) projectScheduleLocks.delete(projectId);
    }
  };
  return {
    async createProject(principal, input) {
      ensurePrincipal(principal);
      const at = now(); assertTimestamp(at, "project timestamp");
      if (!["solo", "ai", "human", "mixed"].includes(input.teamMode)) throw new Error("Invalid project team mode");
      const teamRequired = input.teamMode === "human" || input.teamMode === "mixed";
      const teamId = teamRequired ? required(input.teamId ?? "", "Team id", 128) : undefined;
      const project: UserProject = {
        version: 1,
        id: `user-project-${randomUUID()}`,
        ownerUserId: principal.userId,
        name: required(input.name, "Project name", 160),
        objective: required(input.objective, "Project objective", 4_000),
        purpose: input.purpose,
        teamMode: input.teamMode,
        ...(teamId ? { teamId } : {}),
        workspaceRoot: resolve(options.platformRoot, "users", principal.userId, "projects", "workspace", randomUUID()),
        status: "active",
        createdAt: at,
        updatedAt: at,
      };
      const persistProject = async () => {
        if (teamId && (!canAccessTeamForMutation || !await canAccessTeamForMutation(principal, teamId))) throw new Error("Team access required for team project");
        await mkdir(project.workspaceRoot, { recursive: true });
        await saveJson(projectPath(options.platformRoot, principal.userId, project.id), project);
        await saveProjectWorkspace(options.projectModelRoot, initialWorkspace(project, at));
        await options.activityService?.recordActivityEvent(principal, {
          sourceType: "project",
          sourceId: project.id,
          eventType: "project.created",
          eventVersion: 1,
          actorType: "user",
          verificationStatus: "unverified",
          payload: { projectId: project.id, purpose: project.purpose, teamMode: project.teamMode },
          occurredAt: at,
        });
        return project;
      };
      return teamId ? withTeamMembershipMutationLock(teamId, persistProject) : persistProject();
    },
    async updateProjectTeam(principal, projectId, input) {
      ensurePrincipal(principal); assertIdentityId(projectId);
      return withDurableProjectWorkspaceLock(options.projectModelRoot, projectId, async () => {
        if (!["solo", "ai", "human", "mixed"].includes(input.teamMode)) throw new Error("Invalid project team mode");
        const nextTeamId = input.teamMode === "human" || input.teamMode === "mixed"
          ? required(input.teamId ?? "", "Team id", 128)
          : undefined;
        const mutate = async () => {
          const current = await loadJson<UserProject>(projectPath(options.platformRoot, principal.userId, projectId));
          if (!current || current.ownerUserId !== principal.userId || current.status !== "active") throw new Error("Project not found");
          if (nextTeamId && (!canAccessTeamForMutation || !await canAccessTeamForMutation(principal, nextTeamId))) throw new Error("Team access required for team project");
          const at = now(); assertTimestamp(at, "project timestamp");
          const next: UserProject = { ...current, teamMode: input.teamMode, ...(nextTeamId ? { teamId: nextTeamId } : {}), updatedAt: at };
          if (!nextTeamId) delete next.teamId;
          const workspace = await loadProjectWorkspaceUnlocked(options.projectModelRoot, projectId);
          if (!workspace || workspace.ownerUserId !== principal.userId) throw new Error("Project workspace not found");
          await saveJson(projectPath(options.platformRoot, principal.userId, projectId), next);
          const nextWorkspace: ProjectWorkspace = { ...workspace, ...(nextTeamId ? { teamId: nextTeamId } : {}), updatedAt: at };
          if (!nextTeamId) delete nextWorkspace.teamId;
          await saveProjectWorkspaceUnlocked(options.projectModelRoot, nextWorkspace);
          if (options.activityService) await options.activityService.recordActivityEvent(principal, { sourceType: "project", sourceId: `${projectId}:team:${randomUUID()}`, eventType: "project.team.changed", eventVersion: 1, actorType: "user", verificationStatus: "verified", payload: { projectId, teamMode: input.teamMode, changedToTeam: Boolean(nextTeamId) }, occurredAt: at });
          return next;
        };
        return nextTeamId ? withTeamMembershipMutationLock(nextTeamId, mutate) : mutate();
      }, { waitForMs: 2_000 });
    },
    async listProjects(principal) { ensurePrincipal(principal); return listVisibleProjectsWithWorkspaceLocks(options.platformRoot, options.projectModelRoot, principal, options.canAccessTeam); },
    async getProject(principal, projectId) {
      ensurePrincipal(principal);
      try { assertIdentityId(projectId); } catch { return null; }
      return withDurableProjectWorkspaceLock(options.projectModelRoot, projectId, async () => {
      const project = (await listVisibleProjects(options.platformRoot, principal, options.canAccessTeam)).find((item) => item.id === projectId) ?? null;
      if (!project) return null;
      const workspace = await loadProjectWorkspaceUnlocked(options.projectModelRoot, project.id);
      if (!workspace || workspace.ownerUserId !== project.ownerUserId || (project.teamId && workspace.teamId !== project.teamId)) return null;
      const workspaceFiles = await listUserProjectWorkspaceFiles(project.workspaceRoot);
      const storedWorkRequests = await listProjectWorkRequests(options.projectModelRoot, project.id);
      const workRequests: ProjectWorkRequest[] = [];
      for (const request of storedWorkRequests) {
        const projection = await reconcileProjectWorkRequest({
          root: options.projectModelRoot,
          projectId: project.id,
          workId: request.id,
          at: now(),
          findRun: async (runId) => {
            const run = await loadHarnessRun(options.projectHarnessRoot, runId);
            return run
              ? { runId: run.request.runId, projectId: run.request.projectId, state: run.state, updatedAt: run.updatedAt }
              : null;
          },
        });
        workRequests.push(projection?.request ?? request);
      }
      const evidence: HarnessEvidenceRecord[] = [];
      const observabilityRuns: UserProjectRunObservation[] = [];
      let runtime: UserProjectRuntimeView = { status: "not-started" };
      for (const request of workRequests) {
        if (!request.runId) continue;
        const run = await loadHarnessRun(options.projectHarnessRoot, request.runId);
        if (!run) {
          const blocker = "durable Run record not found";
          runtime = { status: "unknown", runId: request.runId, blocker };
          observabilityRuns.push(missingProjectRunObservation(request.runId, blocker));
          continue;
        }
        runtime = { status: runtimeStatus(run.state.status), runId: run.request.runId, stage: run.state.stage, ...(run.state.reason ? { blocker: run.state.reason } : {}) };
        const projectEvidence = selectProjectEvidence({ projectId: project.id, runId: run.request.runId, evidence: run.evidence });
        evidence.push(...projectEvidence);
        observabilityRuns.push(projectRunObservation({ runId: run.request.runId, status: runtimeStatus(run.state.status), stage: run.state.stage, ...(run.state.reason ? { blocker: run.state.reason } : {}), evidence: projectEvidence }));
        if (run.state.status === "DONE" && project.ownerUserId === principal.userId && options.activityService) {
          const runLifecycle = projectLifecycleFromEvidence({ projectId: project.id, runId: run.request.runId, evidence: projectEvidence });
          for (const item of [...runLifecycle.artifacts, ...runLifecycle.revisions, ...runLifecycle.deployments]) {
            const eventType = lifecycleActivityType(item.kind);
            if (!eventType) continue;
            await options.activityService.recordActivityEvent(principal, {
              sourceType: "project-lifecycle",
              sourceId: lifecycleActivitySourceId(item.id),
              eventType,
              eventVersion: 1,
              actorType: "system",
              verificationStatus: "verified",
              payload: { projectId: project.id, runId: run.request.runId, evidenceId: item.evidenceId, kind: item.kind },
              occurredAt: item.recordedAt,
            });
          }
          const activity = await options.activityService.recordActivityEvent(principal, {
            sourceType: "project",
            sourceId: run.request.runId,
            eventType: "project.run.completed",
            eventVersion: 1,
            actorType: "system",
            verificationStatus: "verified",
            payload: { projectId: project.id, runId: run.request.runId, evidenceCount: projectEvidence.length },
            occurredAt: run.updatedAt,
          });
          if (options.growthService) await options.growthService.applyGrowthProjection(activity);
        }
      }
      const lifecycle = projectLifecycleFromEvidence({ projectId: project.id, evidence });
      const history = await loadProjectHistory(options.projectModelRoot, project.id);
      return { project, workspace: { ...workspace, files: workspaceFiles }, workRequests, runtime, evidence, observability: { runs: observabilityRuns }, lifecycle, history };
      }, { waitForMs: 2_000 });
    },
    async readWorkspaceFile(principal, projectId, relativePath) {
      ensurePrincipal(principal);
      const view = await this.getProject(principal, projectId);
      if (!view) return null;
      return readUserProjectWorkspaceFile(view.project.workspaceRoot, relativePath);
    },
    async createWorkRequest(principal, projectId, input) {
      const view = await this.getProject(principal, projectId);
      if (!view) throw new Error("Project not found");
      return withDurableProjectWorkspaceLock(options.projectModelRoot, projectId, async () => {
        const at = now(); assertTimestamp(at, "work request timestamp");
        const title = required(input.title, "Work title", 160);
        const objective = required(input.objective, "Work objective", 4_000);
        const idempotencyKey = required(input.idempotencyKey, "Work idempotency key", 160);
        const result = await createProjectWorkRequest({ root: options.projectModelRoot, projectId, title, objective, idempotencyKey, ...(input.dependencies ? { dependencies: input.dependencies } : {}), at });
        const nodeId = result.request.nodeId ?? `task-${result.request.id}`;
        const request = result.request.nodeId
          ? result.request
          : await updateProjectWorkRequest(options.projectModelRoot, projectId, result.request.id, { nodeId }, at) ?? result.request;
        const workspace = await loadProjectWorkspaceUnlocked(options.projectModelRoot, projectId);
        if (!workspace || workspace.ownerUserId !== view.project.ownerUserId) throw new Error("Project workspace not found");
        if (!workspace.tree.some((node) => node.id === nodeId)) {
          const rootNode = workspace.tree.find((node) => node.kind === "root");
          if (!rootNode) throw new Error("Project workspace root node is required before creating a task");
          await saveProjectWorkspaceUnlocked(options.projectModelRoot, addProjectTreeNode(workspace, { id: nodeId, parentId: rootNode.id, kind: "task", title, status: "planned", at }));
        }
        if (result.created && options.activityService) {
          await options.activityService.recordActivityEvent(principal, {
            sourceType: "project-work-request",
            sourceId: request.id,
            eventType: "project.work.created",
            eventVersion: 1,
            actorType: "user",
            verificationStatus: "unverified",
            payload: { projectId, workRequestId: request.id },
            occurredAt: at,
          });
        }
        return { request, created: result.created };
      }, { waitForMs: 2_000 });
    },
    async cancelWorkRequest(principal, projectId, workRequestId) {
      return withDurableProjectWorkRequestRunLock(options.projectModelRoot, projectId, workRequestId, async () => {
        ensurePrincipal(principal);
        const view = await this.getProject(principal, projectId);
        if (!view) throw new Error("Project not found");
        if (view.project.ownerUserId !== principal.userId) throw new Error("Only the project owner can cancel a work request");
        const workRequest = view.workRequests.find((request) => request.id === workRequestId);
        if (!workRequest) throw new Error("Work request not found");
        if (workRequest.status !== "queued") throw new Error(`Only queued work requests can be cancelled; current status is ${workRequest.status}`);
        const at = now();
        assertTimestamp(at, "work request cancellation timestamp");
        const cancelled = await updateProjectWorkRequest(options.projectModelRoot, projectId, workRequestId, { status: "cancelled", blocker: "프로젝트 소유자가 실행 전에 취소했습니다." }, at) ?? workRequest;
        if (options.activityService) {
          await options.activityService.recordActivityEvent(principal, {
            sourceType: "project-work-request",
            sourceId: workRequestId,
            eventType: "project.work.cancelled",
            eventVersion: 1,
            actorType: "user",
            verificationStatus: "unverified",
            payload: { projectId, workRequestId },
            occurredAt: at,
          });
        }
        return cancelled;
      }, { waitForMs: 2_000 });
    },
    async startProjectRun(principal, projectId, input, enqueueProjectRun) {
      return withDurableProjectWorkRequestRunLock(options.projectModelRoot, projectId, input.workRequestId, async () => {
        const view = await this.getProject(principal, projectId);
        if (!view) throw new Error("Project not found");
        const workRequest = view.workRequests.find((request) => request.id === input.workRequestId);
        if (!workRequest) throw new Error("Work request not found");
        if ((workRequest.status === "running" || (workRequest.status === "waiting" && workRequest.runId)) && workRequest.runId) return { status: "already-active", request: workRequest, runId: workRequest.runId };
        if (workRequest.status !== "queued" && workRequest.status !== "waiting") throw new Error(`Work request is ${workRequest.status}`);
        const incompleteDependencies = (workRequest.dependencies ?? []).filter((dependencyId) => view.workRequests.find((candidate) => candidate.id === dependencyId)?.status !== "completed");
        if (incompleteDependencies.length > 0) {
          const at = now();
          const blocker = `dependencies incomplete: ${incompleteDependencies.join(", ")}`;
          const updated = await updateProjectWorkRequest(options.projectModelRoot, projectId, workRequest.id, { status: "waiting", blocker }, at);
          return { status: "waiting", request: updated ?? workRequest, blocker };
        }
        const settings = options.settingsService ? await options.settingsService.getSettings(principal) : null;
        if (settings?.aiApproval.buildRun && input.approved !== true) throw new Error("Build run approval is required");
        if (!enqueueProjectRun) {
          const at = now();
          const updated = await updateProjectWorkRequest(options.projectModelRoot, projectId, workRequest.id, { status: "waiting", blocker: "Project Runtime is not configured" }, at);
          return { status: "waiting", request: updated ?? workRequest, blocker: "Project Runtime is not configured" };
        }
        const at = now(); assertTimestamp(at, "project run timestamp");
        const started = await startProjectWorkspaceRun(options.projectModelRoot, projectId, { runId: input.runId, objective: workRequest.objective, targetRoot: view.project.workspaceRoot, ...(workRequest.nodeId ? { nodeId: workRequest.nodeId } : {}) }, { iseolRoot: options.iseolRoot, storeRoot: options.projectHarnessRoot, loadedAt: at });
        const execution = await enqueueProjectRun(started.run.request.runId);
        const updated = await updateProjectWorkRequest(options.projectModelRoot, projectId, workRequest.id, {
          status: execution === "not-configured" ? "waiting" : "running",
          runId: started.run.request.runId,
          requestedRunId: started.run.request.runId,
          executionRequestId: `${projectId}:${workRequest.id}:${started.run.request.runId}`,
          ...(execution === "not-configured" ? { blocker: "Project Runtime is not configured" } : {}),
        }, at);
        if (updated && options.activityService) {
          await options.activityService.recordActivityEvent(principal, {
            sourceType: "project-run",
            sourceId: started.run.request.runId,
            eventType: "project.run.requested",
            eventVersion: 1,
            actorType: "user",
            verificationStatus: "unverified",
            payload: { projectId, workRequestId: workRequest.id, runId: started.run.request.runId },
            occurredAt: at,
          });
        }
        if (execution === "not-configured") return { status: "waiting", request: updated ?? workRequest, runId: started.run.request.runId, blocker: "Project Runtime is not configured" };
        return { status: started.status === "already-active" || execution === "already-active" ? "already-active" : "started", request: updated ?? workRequest, runId: started.run.request.runId };
      }, { waitForMs: 2_000 });
    },
    async scheduleProjectRuns(principal, projectId, input, enqueueProjectRun) {
      return withProjectScheduleLock(projectId, () => withDurableProjectScheduleLock(options.projectModelRoot, projectId, async () => {
        const view = await this.getProject(principal, projectId);
        if (!view) throw new Error("Project not found");
        if (view.project.ownerUserId !== principal.userId) throw new Error("Only the project owner can schedule project Runs");
        const maxConcurrent = Math.min(8, Math.max(1, Math.floor(input.maxConcurrent ?? 1)));
        const active = view.workRequests.filter((request) => request.status === "running" && request.runId).length;
        const available = Math.max(0, maxConcurrent - active);
        const ready = view.workRequests.filter((request) => request.status === "queued" && (request.dependencies ?? []).every((dependencyId) => view.workRequests.find((candidate) => candidate.id === dependencyId)?.status === "completed")).slice(0, available);
        const results = await Promise.all(ready.map((request, index) => this.startProjectRun(principal, projectId, { workRequestId: request.id, runId: `scheduled-${projectId}-${Date.now().toString(36)}-${index}-${randomUUID().slice(0, 8)}`, ...(input.approved === undefined ? {} : { approved: input.approved }) }, enqueueProjectRun)));
        return { selected: ready.length, maxConcurrent, results };
      }, { waitForMs: 2_000 }));
    },
    async resumeProjectRun(principal, projectId, input, enqueueProjectRun) {
      return withDurableProjectWorkRequestRunLock(options.projectModelRoot, projectId, input.workRequestId, async () => {
        const view = await this.getProject(principal, projectId);
        if (!view) throw new Error("Project not found");
        if (view.project.ownerUserId !== principal.userId) throw new Error("Only the project owner can resume a Run");
        const workRequest = view.workRequests.find((request) => request.id === input.workRequestId);
        if (!workRequest) throw new Error("Work request not found");
        if (workRequest.status === "running" && workRequest.runId) return { status: "already-active", request: workRequest, runId: workRequest.runId };
        if (workRequest.status !== "waiting" || !workRequest.runId) throw new Error("Only a waiting work request with a durable Run can be resumed");
        const settings = options.settingsService ? await options.settingsService.getSettings(principal) : null;
        if (settings?.aiApproval.buildRun && input.approved !== true) throw new Error("Build run approval is required");
        if (!enqueueProjectRun) return { status: "waiting", request: workRequest, runId: workRequest.runId, blocker: "Project Runtime is not configured" };
        const run = await loadHarnessRun(options.projectHarnessRoot, workRequest.runId);
        if (!run) throw new Error("Requested Run identity has no durable Run record");
        if (run.request.projectId !== projectId) throw new Error("Requested Run project identity mismatch");
        const resumeCheckpointAt = run.state.updatedAt;
        const at = now(); assertTimestamp(at, "project resume timestamp");
        const resumed = await resumeHarnessRun(options.projectHarnessRoot, run.request.runId, at);
        const execution = await enqueueProjectRun(resumed.request.runId);
        if (execution === "not-configured") {
          await saveHarnessRun(options.projectHarnessRoot, run);
          const updated = await updateProjectWorkRequest(options.projectModelRoot, projectId, workRequest.id, { status: "waiting", blocker: "Project Runtime is not configured" }, at);
          return { status: "waiting", request: updated ?? workRequest, runId: workRequest.runId, blocker: "Project Runtime is not configured" };
        }
        const updated = await updateProjectWorkRequest(options.projectModelRoot, projectId, workRequest.id, {
          status: "running",
          runId: resumed.request.runId,
          requestedRunId: resumed.request.runId,
          executionRequestId: `${projectId}:${workRequest.id}:${resumed.request.runId}`,
          blocker: undefined,
        }, at);
        if (updated && options.activityService) {
          await options.activityService.recordActivityEvent(principal, {
            sourceType: "project-run",
            sourceId: `${resumed.request.runId}:resume:${resumeCheckpointAt}`,
            eventType: "project.run.resumed",
            eventVersion: 1,
            actorType: "user",
            verificationStatus: "unverified",
            payload: { projectId, workRequestId: workRequest.id, runId: resumed.request.runId, resumeCheckpointAt },
            occurredAt: at,
          });
        }
        return { status: execution === "already-active" ? "already-active" : "started", request: updated ?? workRequest, runId: resumed.request.runId };
      }, { waitForMs: 2_000 });
    },
    async pauseProjectRun(principal, projectId, input) {
      return withDurableProjectWorkRequestRunLock(options.projectModelRoot, projectId, input.workRequestId, async () => {
        const view = await this.getProject(principal, projectId);
        if (!view) throw new Error("Project not found");
        if (view.project.ownerUserId !== principal.userId) throw new Error("Only the project owner can pause a Run");
        const workRequest = view.workRequests.find((request) => request.id === input.workRequestId);
        if (!workRequest) throw new Error("Work request not found");
        if (!workRequest.runId) throw new Error("Only a work request with a durable Run can be paused");
        const run = await loadHarnessRun(options.projectHarnessRoot, workRequest.runId);
        if (!run) throw new Error("Requested Run identity has no durable Run record");
        if (run.request.projectId !== projectId) throw new Error("Requested Run project identity mismatch");
        if (run.state.status === "PAUSED") return { status: "already-paused", request: workRequest, runId: run.request.runId };
        if (run.state.status !== "RUNNING" && run.state.status !== "READY") throw new Error(`Run cannot be paused from ${run.state.status}`);

        const checkpointAt = run.state.updatedAt;
        const at = now();
        assertTimestamp(at, "project pause timestamp");
        const paused = await pauseHarnessRun(options.projectHarnessRoot, run.request.runId, at, "프로젝트 소유자가 다음 checkpoint에서 실행을 일시 중단했습니다.");
        const updated = await updateProjectWorkRequest(options.projectModelRoot, projectId, workRequest.id, {
          status: "waiting",
          runId: paused.request.runId,
          requestedRunId: paused.request.runId,
          executionRequestId: `${projectId}:${workRequest.id}:${paused.request.runId}`,
          blocker: "프로젝트 소유자가 다음 checkpoint에서 실행을 일시 중단했습니다.",
        }, at);
        if (updated && options.activityService) {
          await options.activityService.recordActivityEvent(principal, {
            sourceType: "project-run",
            sourceId: `${paused.request.runId}:pause:${checkpointAt}`,
            eventType: "project.run.paused",
            eventVersion: 1,
            actorType: "user",
            verificationStatus: "unverified",
            payload: { projectId, workRequestId: workRequest.id, runId: paused.request.runId, pauseCheckpointAt: checkpointAt },
            occurredAt: at,
          });
        }
        return { status: "paused", request: updated ?? workRequest, runId: paused.request.runId, blocker: paused.state.reason };
      }, { waitForMs: 2_000 });
    },
    async retryProjectRun(principal, projectId, input, enqueueProjectRun) {
      return withDurableProjectWorkRequestRunLock(options.projectModelRoot, projectId, input.workRequestId, async () => {
        const view = await this.getProject(principal, projectId);
        if (!view) throw new Error("Project not found");
        if (view.project.ownerUserId !== principal.userId) throw new Error("Only the project owner can retry a Run");
        const workRequest = view.workRequests.find((request) => request.id === input.workRequestId);
        if (!workRequest) throw new Error("Work request not found");
        if (workRequest.status === "running" && workRequest.runId) return { status: "already-active", request: workRequest, runId: workRequest.runId };
        if (workRequest.status !== "failed" || !workRequest.runId) throw new Error("Only a failed work request with a durable Run can be retried");
        const settings = options.settingsService ? await options.settingsService.getSettings(principal) : null;
        if (settings?.aiApproval.buildRun && input.approved !== true) throw new Error("Build run approval is required");
        if (!enqueueProjectRun) return { status: "waiting", request: workRequest, runId: workRequest.runId, blocker: "Project Runtime is not configured" };

        const at = now(); assertTimestamp(at, "project retry timestamp");
        const run = await loadHarnessRun(options.projectHarnessRoot, workRequest.runId);
        if (!run) throw new Error("Requested Run identity has no durable Run record");
        if (run.request.projectId !== projectId) throw new Error("Requested Run project identity mismatch");
        const retry = await requestHarnessRunRetry(options.projectHarnessRoot, run.request.runId, {
          retryReason: "user-request",
          actor: "user",
          requestedAt: at,
        });
        if (retry.status === "already-active") return { status: "already-active", request: workRequest, runId: run.request.runId };
        if (retry.status === "not-allowed") throw new Error(retry.reason);
        const retryRecord = retry.run.retry;
        if (!retryRecord || !Number.isInteger(retryRecord.cycle) || retryRecord.cycle < 1) throw new Error("Retry cycle was not persisted");
        const retryCycle = retryRecord.cycle;

        const execution = await enqueueProjectRun(retry.run.request.runId);
        if (execution === "not-configured") {
          const reason = "Project Runtime is not configured; retry is waiting for reconnection";
          const blockedState = transitionRunState(retry.run.state, { type: "block-user", at, reason });
          const blockedRun = {
            ...retry.run,
            state: blockedState,
            retry: { ...retryRecord, status: "completed" as const },
            updatedAt: at,
          };
          await saveHarnessRun(options.projectHarnessRoot, blockedRun);
          await appendHarnessRunEvent(options.projectHarnessRoot, {
            version: 1,
            id: `retry-blocked-${retry.run.request.runId}-${retryCycle}`,
            runId: retry.run.request.runId,
            type: "status-changed",
            at,
            stage: blockedState.stage,
            status: blockedState.status,
            summary: reason,
          });
          await saveHarnessCheckpoint(options.projectHarnessRoot, {
            version: 1,
            id: `retry-blocked-checkpoint-${retry.run.request.runId}-${retryCycle}`,
            runId: retry.run.request.runId,
            recordedAt: at,
            state: blockedState,
            evidence: blockedRun.evidence,
            summary: reason,
          });
          const updated = await updateProjectWorkRequest(options.projectModelRoot, projectId, workRequest.id, {
            status: "waiting",
            runId: retry.run.request.runId,
            requestedRunId: retry.run.request.runId,
            executionRequestId: `${projectId}:${workRequest.id}:${retry.run.request.runId}`,
            blocker: reason,
          }, at);
          if (updated && options.activityService) {
            await options.activityService.recordActivityEvent(principal, {
              sourceType: "project-run",
              sourceId: `${retry.run.request.runId}:retry:${retryCycle}`,
              eventType: "project.run.retried",
              eventVersion: 1,
              actorType: "user",
              verificationStatus: "unverified",
              payload: { projectId, workRequestId: workRequest.id, runId: retry.run.request.runId, retryCycle },
              occurredAt: at,
            });
          }
          return { status: "waiting", request: updated ?? workRequest, runId: retry.run.request.runId, blocker: reason };
        }
        const updated = await updateProjectWorkRequest(options.projectModelRoot, projectId, workRequest.id, {
          status: "running",
          runId: retry.run.request.runId,
          requestedRunId: retry.run.request.runId,
          executionRequestId: `${projectId}:${workRequest.id}:${retry.run.request.runId}`,
          blocker: undefined,
        }, at);
        if (updated && options.activityService) {
          await options.activityService.recordActivityEvent(principal, {
            sourceType: "project-run",
            sourceId: `${retry.run.request.runId}:retry:${retryCycle}`,
            eventType: "project.run.retried",
            eventVersion: 1,
            actorType: "user",
            verificationStatus: "unverified",
            payload: { projectId, workRequestId: workRequest.id, runId: retry.run.request.runId, retryCycle },
            occurredAt: at,
          });
        }
        return { status: execution === "already-active" ? "already-active" : "started", request: updated ?? workRequest, runId: retry.run.request.runId };
      }, { waitForMs: 2_000 });
    },
  };
}
