import type { DevelopmentRunRequest, HarnessRuntimeRunEnvelope } from "../harness/contracts.js";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createDevelopmentRun } from "../harness/run-service.js";
import { loadHarnessRun } from "../harness/run-store.js";
import { appendProjectHistoryEventOnce } from "./history-store.js";
import { attachRunToProjectTreeNode } from "./project-tree.js";
import { findProjectTreeNode } from "./project-tree.js";
import { loadProjectWorkspace, loadProjectWorkspaceUnlocked, saveProjectWorkspaceUnlocked } from "./workspace-store.js";
import { withDurableProjectWorkspaceLock } from "./workspace-lock.js";

export type ProjectExecutionPreparation = {
  projectId: string;
  request: DevelopmentRunRequest;
  plan: {
    purpose: NonNullable<DevelopmentRunRequest["purposeProfile"]>["purpose"];
    executableRoles: NonNullable<DevelopmentRunRequest["purposeProfile"]>["executableRoles"];
    plannedRoles: NonNullable<DevelopmentRunRequest["purposeProfile"]>["plannedRoles"];
    verificationStages: string[];
    documentationRequired: boolean;
  };
};

export type StartProjectWorkspaceRunOptions = {
  iseolRoot: string;
  storeRoot: string;
  policyRoot?: string;
  loadedAt?: string;
};

export type StartProjectWorkspaceRunResult = {
  status: "created" | "already-active";
  run: HarnessRuntimeRunEnvelope;
};

function isInsideOrEqual(root: string, target: string): boolean {
  const relation = relative(resolve(root), resolve(target));
  return relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}

const activeStarts = new Map<string, Promise<StartProjectWorkspaceRunResult>>();

/**
 * Repairs the durable boundary between Harness Run creation and Workspace
 * attachment. This is safe to call after a process restart: the Run is
 * validated against the project identity, the tree attachment is idempotent,
 * and the history event has a stable identity.
 */
async function reconcileProjectWorkspaceRunUnlocked(
  root: string,
  harnessRoot: string,
  projectId: string,
  runId: string,
  at = new Date().toISOString(),
  nodeId?: string,
): Promise<{ run: HarnessRuntimeRunEnvelope; attached: boolean }> {
  const run = await loadHarnessRun(harnessRoot, runId);
  if (!run) throw new Error(`Harness Run not found: ${runId}`);
  if (run.request.projectId !== projectId) {
    throw new Error(`Harness Run project identity does not match: ${runId}`);
  }
  const workspace = await loadProjectWorkspaceUnlocked(root, projectId);
  if (!workspace) throw new Error(`Project workspace not found: ${projectId}`);
  const rootNode = workspace.tree.find((node) => node.kind === "root");
  if (!rootNode) throw new Error("Project workspace root node is required before attaching a Run");
  const targetNode = nodeId ? findProjectTreeNode(workspace, nodeId) : rootNode;
  if (!targetNode) throw new Error(`Project tree node not found: ${nodeId}`);

  const attached = targetNode.runIds.includes(runId);
  if (!attached) {
    await saveProjectWorkspaceUnlocked(root, attachRunToProjectTreeNode(workspace, targetNode.id, runId, at));
  }
  await appendProjectHistoryEventOnce(root, {
    version: 1,
    id: `run-attached-${projectId}-${runId}`,
    projectId,
    type: "run-attached",
    at,
    summary: `Harness Run attached: ${runId}`,
    runId,
    nodeId: targetNode.id,
    action: "run-start",
  });
  return { run, attached };
}

export function reconcileProjectWorkspaceRun(
  root: string,
  harnessRoot: string,
  projectId: string,
  runId: string,
  at = new Date().toISOString(),
  nodeId?: string,
) {
  return withDurableProjectWorkspaceLock(root, projectId, () => reconcileProjectWorkspaceRunUnlocked(root, harnessRoot, projectId, runId, at, nodeId), { waitForMs: 2_000 });
}

export async function prepareProjectWorkspaceRun(
  root: string,
  projectId: string,
  input: Pick<DevelopmentRunRequest, "runId" | "objective" | "targetRoot">,
): Promise<ProjectExecutionPreparation> {
  const workspace = await loadProjectWorkspace(root, projectId);
  if (!workspace) throw new Error(`Project workspace not found: ${projectId}`);
  const selection = workspace.purposeSelection;
  if (!selection) throw new Error("Project purpose must be selected before run preparation");
  if (workspace.workspaceRoot && !isInsideOrEqual(workspace.workspaceRoot, input.targetRoot)) {
    throw new Error("Run targetRoot must remain inside the workspace-owned project folder");
  }
  const profile = selection.profile;
  const purposeProfile = {
    version: 1 as const,
    purpose: profile.purpose,
    executableRoles: [...profile.executableRoles],
    plannedRoles: [...profile.plannedRoles],
    verificationStages: [...profile.verificationStages],
    documentationRequired: profile.documentationRequired,
  };
  return {
    projectId,
    request: {
      version: 1,
      mode: "project-workspace",
      runId: input.runId,
      objective: input.objective,
      targetRoot: input.targetRoot,
      projectId,
      purposeProfile,
      projectContext: {
        name: workspace.name.slice(0, 160),
        purposeSummary: profile.koreanSummary.slice(0, 400),
        requirements: input.objective.slice(0, 4_000),
      },
    },
    plan: {
      purpose: purposeProfile.purpose,
      executableRoles: [...purposeProfile.executableRoles],
      plannedRoles: [...purposeProfile.plannedRoles],
      verificationStages: [...purposeProfile.verificationStages],
      documentationRequired: purposeProfile.documentationRequired,
    },
  };
}

export async function startProjectWorkspaceRun(
  root: string,
  projectId: string,
  input: Pick<DevelopmentRunRequest, "runId" | "objective" | "targetRoot"> & { nodeId?: string },
  options: StartProjectWorkspaceRunOptions,
): Promise<StartProjectWorkspaceRunResult> {
  const key = `${options.storeRoot}:${input.runId}`;
  const existingStart = activeStarts.get(key);
  if (existingStart) return existingStart;
  const operation = (async () => {
    const workspace = await loadProjectWorkspace(root, projectId);
    if (!workspace) throw new Error(`Project workspace not found: ${projectId}`);
    if (!workspace.tree.some((node) => node.kind === "root")) {
      throw new Error("Project workspace root node is required before starting a Run");
    }
    const prepared = await prepareProjectWorkspaceRun(root, projectId, input);
    const current = await loadHarnessRun(options.storeRoot, input.runId);
    let run: HarnessRuntimeRunEnvelope;
    let status: "created" | "already-active" = "created";
    if (current) {
      if (current.request.projectId !== projectId || current.request.objective !== prepared.request.objective || current.request.targetRoot !== prepared.request.targetRoot || current.request.purposeProfile?.purpose !== prepared.request.purposeProfile?.purpose) {
        throw new Error("Project Run identity or request does not match the existing Run");
      }
      if (["DONE", "FAILED_FINAL", "CANCELLED"].includes(current.state.status)) {
        throw new Error("Project Run is already terminal");
      }
      run = current;
      status = "already-active";
    } else {
      run = await createDevelopmentRun(prepared.request, {
        iseolRoot: options.iseolRoot,
        storeRoot: options.storeRoot,
        policyRoot: options.policyRoot,
        loadedAt: options.loadedAt,
      });
    }
    await reconcileProjectWorkspaceRun(
      root,
      options.storeRoot,
      projectId,
      input.runId,
      options.loadedAt ?? new Date().toISOString(),
      input.nodeId,
    );
    return { status, run };
  })();
  activeStarts.set(key, operation);
  try { return await operation; }
  finally { if (activeStarts.get(key) === operation) activeStarts.delete(key); }
}
