import { randomUUID } from "node:crypto";
import type { DesktopJobRecord } from "../desktop-agent/job-store.js";
import type { HarnessRuntimeRunEnvelope } from "./contracts.js";
import { appendHarnessRunEvent, loadHarnessRunEvents, saveHarnessCheckpoint } from "./event-store.js";
import { loadHarnessRun, saveHarnessRunIfUnchanged } from "./run-store.js";
import { transitionRunState } from "./state-machine.js";
import { consumeOperatorApproval } from "./operator-approval-store.js";

export type OperatorReconciliationReason = "stale-runtime-after-shutdown" | "operator-confirmed-no-active-work";

export type ProjectRunReconciliationObservation = {
  activeRuntimeOwner: boolean;
  activeWorker: boolean;
  browserSessionOwner?: string;
  desktopJobs: DesktopJobRecord[];
  completedResultsReconciled: boolean;
};

export type ProjectRunReconciliationInspection = {
  projectId: string;
  runId: string;
  stage: HarnessRuntimeRunEnvelope["state"]["stage"];
  status: HarnessRuntimeRunEnvelope["state"]["status"];
  revision: string;
  canReconcile: boolean;
  blockers: string[];
  activeRuntimeOwner: boolean;
  activeWorker: boolean;
  browserSessionOwner?: string;
  activeDesktopJobs: number;
  indeterminateDesktopJobs: number;
  completedDesktopJobs: number;
  completedResultsReconciled: boolean;
};

export type ProjectRunReconciliationInput = {
  storeRoot: string;
  projectId: string;
  runId: string;
  expectedRevision: string;
  operationId: string;
  reason: OperatorReconciliationReason;
  actor: "operator";
  approvalId: string;
  at: string;
  observe: () => Promise<ProjectRunReconciliationObservation>;
};

export type ProjectRunReconciliationResult =
  | { status: "inspection"; inspection: ProjectRunReconciliationInspection }
  | { status: "reconciled" | "already-reconciled"; run: HarnessRuntimeRunEnvelope; inspection: ProjectRunReconciliationInspection; operationId: string }
  | { status: "rejected" | "conflict"; inspection?: ProjectRunReconciliationInspection; reason: string };

function revision(run: HarnessRuntimeRunEnvelope): string {
  return `${run.updatedAt}:${run.state.updatedAt}:${run.state.stage}:${run.state.status}`;
}

function jobCounts(jobs: DesktopJobRecord[]) {
  return {
    active: jobs.filter((job) => job.status === "pending" || job.status === "leased").length,
    indeterminate: jobs.filter((job) => job.status === "indeterminate").length,
    completed: jobs.filter((job) => job.status === "completed").length,
  };
}

async function buildInspection(
  storeRoot: string,
  projectId: string,
  runId: string,
  expectedRevision: string,
  observe: () => Promise<ProjectRunReconciliationObservation>,
): Promise<{ run: HarnessRuntimeRunEnvelope | null; inspection: ProjectRunReconciliationInspection }> {
  const run = await loadHarnessRun(storeRoot, runId);
  if (!run || run.request.projectId !== projectId) {
    return {
      run: null,
      inspection: {
        projectId, runId, stage: "PREFLIGHT", status: "FAILED_FINAL", revision: "missing",
        canReconcile: false, blockers: ["run-not-found-or-project-mismatch"],
        activeRuntimeOwner: false, activeWorker: false, activeDesktopJobs: 0,
        indeterminateDesktopJobs: 0, completedDesktopJobs: 0, completedResultsReconciled: false,
      },
    };
  }
  const observed = await observe();
  const counts = jobCounts(observed.desktopJobs.filter((job) => job.runId === runId));
  const blockers: string[] = [];
  if (run.state.status !== "RUNNING") blockers.push("status-is-not-running");
  if (observed.activeRuntimeOwner) blockers.push("active-runtime-owner");
  if (observed.activeWorker) blockers.push("active-web-worker");
  if (observed.browserSessionOwner && observed.browserSessionOwner !== runId) blockers.push("browser-session-owned-by-another-run");
  if (counts.active > 0) blockers.push("active-desktop-job");
  if (counts.indeterminate > 0) blockers.push("indeterminate-desktop-job");
  if (!observed.completedResultsReconciled) blockers.push("desktop-results-not-reconciled");
  if (expectedRevision !== revision(run)) blockers.push("revision-mismatch");
  return {
    run,
    inspection: {
      projectId, runId, stage: run.state.stage, status: run.state.status, revision: revision(run),
      canReconcile: blockers.length === 0,
      blockers, activeRuntimeOwner: observed.activeRuntimeOwner, activeWorker: observed.activeWorker,
      ...(observed.browserSessionOwner ? { browserSessionOwner: observed.browserSessionOwner } : {}),
      activeDesktopJobs: counts.active, indeterminateDesktopJobs: counts.indeterminate,
      completedDesktopJobs: counts.completed, completedResultsReconciled: observed.completedResultsReconciled,
    },
  };
}

export async function inspectProjectRunReconciliation(input: Omit<ProjectRunReconciliationInput, "operationId" | "reason" | "actor" | "approvalId" | "at">): Promise<ProjectRunReconciliationInspection> {
  return (await buildInspection(input.storeRoot, input.projectId, input.runId, input.expectedRevision, input.observe)).inspection;
}

export async function reconcileProjectRunAsOperator(input: ProjectRunReconciliationInput): Promise<ProjectRunReconciliationResult> {
  if (!input.projectId || !input.runId || !input.expectedRevision || !input.operationId || !input.approvalId) {
    return { status: "rejected", reason: "operator-approval-and-revision-required" };
  }
  if (input.actor !== "operator") return { status: "rejected", reason: "operator-approval-required" };
  const initial = await buildInspection(input.storeRoot, input.projectId, input.runId, input.expectedRevision, input.observe);
  if (!initial.run) return { status: "rejected", inspection: initial.inspection, reason: "run-not-found-or-project-mismatch" };
  const priorEvents = await loadHarnessRunEvents(input.storeRoot, input.runId);
  const previous = priorEvents.find((event) => event.operationId === input.operationId && event.type === "operator-reconciled");
  if (previous) return { status: "already-reconciled", run: initial.run, inspection: initial.inspection, operationId: input.operationId };
  if (!initial.inspection.canReconcile) return { status: "rejected", inspection: initial.inspection, reason: initial.inspection.blockers.join(",") };
  const approval = await consumeOperatorApproval({
    root: input.storeRoot, approvalId: input.approvalId, projectId: input.projectId, runId: input.runId,
    stage: initial.run.state.stage, status: initial.run.state.status, revision: initial.inspection.revision, at: input.at,
  });
  if (!approval.ok) return { status: "rejected", inspection: initial.inspection, reason: approval.reason };

  const paused = {
    ...initial.run,
    state: transitionRunState(initial.run.state, { type: "pause", at: input.at, reason: input.reason }),
    updatedAt: input.at,
  };
  const saved = await saveHarnessRunIfUnchanged(input.storeRoot, initial.run, paused);
  if (!saved) return { status: "conflict", reason: "run-changed-during-reconciliation" };
  const summary = "Operator reconciled a stale Project Workspace Run after bounded ownership checks";
  await appendHarnessRunEvent(input.storeRoot, {
    version: 1, id: `operator-reconciled-${input.operationId}`, runId: input.runId,
    type: "operator-reconciled", at: input.at, stage: paused.state.stage, status: paused.state.status,
    summary, operationId: input.operationId,
    metadata: {
      projectId: input.projectId, previousStatus: initial.run.state.status, nextStatus: paused.state.status,
      activeRuntimeOwner: initial.inspection.activeRuntimeOwner, activeWorker: initial.inspection.activeWorker,
      activeDesktopJobs: initial.inspection.activeDesktopJobs,
      indeterminateDesktopJobs: initial.inspection.indeterminateDesktopJobs,
      completedDesktopJobs: initial.inspection.completedDesktopJobs,
      completedResultsReconciled: initial.inspection.completedResultsReconciled,
      approvalRecorded: true,
    },
  });
  await saveHarnessCheckpoint(input.storeRoot, {
    version: 1, id: randomUUID(), runId: input.runId, recordedAt: input.at,
    state: paused.state, evidence: paused.evidence,
    summary: `${summary}: ${input.reason}`,
  });
  return { status: "reconciled", run: paused, inspection: initial.inspection, operationId: input.operationId };
}
