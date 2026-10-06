import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { listDesktopJobs } from "../desktop-agent/job-store.js";
import { loadWebWorkerSession } from "../chatgpt-web/session-store.js";
import { listEvaluationRuns } from "./evaluation-store.js";
import { evaluationDirectory, listEvaluationJsonFiles } from "./store-utils.js";

export type EvaluationResourceSnapshot = {
  observedAt: string;
  evaluationRunCount: number;
  evaluationReportCount: number;
  desktopJobCount: number;
  expiredLiveLeaseCount: number;
  unreconciledMutatingIndeterminateCount: number;
  webSessionCount: number;
  staleHealthySessionCount: number;
  orphanProcessCount: number;
  temporaryFileCount: number;
  rssBytes: number;
};

export type ObserveEvaluationResourcesInput = {
  evaluationRoot: string;
  desktopJobRoots?: string[];
  desktopRegistryRoots?: string[];
  webSessionRoots?: string[];
  ownedChildProcessPids?: number[];
  now?: string;
  webSessionStaleAfterMs?: number;
};

const MUTATING_OPERATIONS = new Set(["APPLY_PATCH", "RUN_PROCESS", "GIT_INIT", "GIT_WORKTREE_CREATE", "GIT_COMMIT"]);
const HEALTHY_WEB_STATUSES = new Set(["starting", "ready", "busy"]);

async function listWebSessions(root: string) {
  const directory = resolve(root, "web-workers", "sessions");
  let names: string[];
  try { names = await readdir(directory); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const sessions = [];
  for (const name of names.filter((item) => item.endsWith(".json")).sort()) {
    const session = await loadWebWorkerSession(root, name.slice(0, -5));
    if (session) sessions.push(session);
  }
  return sessions;
}

async function countTemporaryFiles(root: string): Promise<number> {
  let names: string[];
  try { names = await readdir(root, { recursive: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
  return names.filter((name) => String(name).endsWith(".tmp")).length;
}

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Invalid owned child process pid: ${pid}`);
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
}

export async function observeEvaluationResources(
  input: ObserveEvaluationResourcesInput,
): Promise<EvaluationResourceSnapshot> {
  const observedAt = input.now ?? new Date().toISOString();
  const observedMs = Date.parse(observedAt);
  if (Number.isNaN(observedMs)) throw new Error("Evaluation resource observedAt must be an ISO timestamp");
  const staleAfterMs = input.webSessionStaleAfterMs ?? 60_000;
  if (!Number.isFinite(staleAfterMs) || staleAfterMs < 0) {
    throw new Error("Evaluation web session stale threshold must be non-negative");
  }

  let desktopJobCount = 0;
  let expiredLiveLeaseCount = 0;
  let unreconciledMutatingIndeterminateCount = 0;
  for (const root of input.desktopJobRoots ?? []) {
    const jobs = await listDesktopJobs(root);
    desktopJobCount += jobs.length;
    for (const job of jobs) {
      const terminal = job.status === "completed" || job.status === "cancelled";
      if (!terminal && job.lease && Date.parse(job.lease.expiresAt) <= observedMs) {
        expiredLiveLeaseCount += 1;
      }
      const mutating = job.pack.operations.some((operation) => MUTATING_OPERATIONS.has(operation.type));
      if (job.status === "indeterminate" && mutating) unreconciledMutatingIndeterminateCount += 1;
    }
  }

  let webSessionCount = 0;
  let staleHealthySessionCount = 0;
  for (const root of input.webSessionRoots ?? []) {
    const sessions = await listWebSessions(root);
    webSessionCount += sessions.length;
    for (const session of sessions) {
      const activityAt = session.lastTurnAt ?? session.createdAt;
      const ageMs = observedMs - Date.parse(activityAt);
      if (HEALTHY_WEB_STATUSES.has(session.status) && ageMs > staleAfterMs) {
        staleHealthySessionCount += 1;
      }
    }
  }

  const ownedRoots = [
    input.evaluationRoot,
    ...(input.desktopJobRoots ?? []),
    ...(input.desktopRegistryRoots ?? []),
    ...(input.webSessionRoots ?? []),
  ];
  let temporaryFileCount = 0;
  for (const root of new Set(ownedRoots.map((item) => resolve(item)))) {
    temporaryFileCount += await countTemporaryFiles(root);
  }

  return {
    observedAt,
    evaluationRunCount: (await listEvaluationRuns(input.evaluationRoot)).length,
    evaluationReportCount: (await listEvaluationJsonFiles(evaluationDirectory(input.evaluationRoot, "reports"))).length,
    desktopJobCount,
    expiredLiveLeaseCount,
    unreconciledMutatingIndeterminateCount,
    webSessionCount,
    staleHealthySessionCount,
    orphanProcessCount: (input.ownedChildProcessPids ?? []).filter(processAlive).length,
    temporaryFileCount,
    rssBytes: process.memoryUsage().rss,
  };
}
