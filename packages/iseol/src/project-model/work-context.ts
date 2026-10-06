import type { ProjectWorkContext } from "./contracts.js";
import { findProjectTreeNode } from "./project-tree.js";
import { loadProjectWorkspace, loadProjectWorkspaceUnlocked } from "./workspace-store.js";

export type ResolveProjectWorkContextInput = {
  modelRoot: string;
  projectId: string;
  nodeId?: string;
  runId?: string;
};

function resolveProjectWorkContextFromWorkspace(
  input: ResolveProjectWorkContextInput,
  workspace: Awaited<ReturnType<typeof loadProjectWorkspaceUnlocked>>,
): ProjectWorkContext | null {
  if (!workspace) return null;

  if (!input.nodeId) {
    if (input.runId) return null;
    return { projectId: workspace.id };
  }

  const node = findProjectTreeNode(workspace, input.nodeId);
  if (!node) return null;

  if (input.runId && !node.runIds.includes(input.runId)) return null;

  return {
    projectId: workspace.id,
    nodeId: node.id,
    ...(input.runId === undefined ? {} : { runId: input.runId }),
  };
}

export async function resolveProjectWorkContextUnlocked(
  input: ResolveProjectWorkContextInput,
): Promise<ProjectWorkContext | null> {
  return resolveProjectWorkContextFromWorkspace(
    input,
    await loadProjectWorkspaceUnlocked(input.modelRoot, input.projectId),
  );
}

export async function resolveProjectWorkContext(
  input: ResolveProjectWorkContextInput,
): Promise<ProjectWorkContext | null> {
  return resolveProjectWorkContextFromWorkspace(
    input,
    await loadProjectWorkspace(input.modelRoot, input.projectId),
  );
}
