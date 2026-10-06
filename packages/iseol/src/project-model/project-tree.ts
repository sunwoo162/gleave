import type {
  ProjectTreeNode,
  ProjectTreeNodeKind,
  ProjectTreeNodeStatus,
  ProjectWorkspace,
} from "./contracts.js";
import { assertProjectModelId } from "./contracts.js";

export type AddProjectTreeNodeInput = {
  id: string;
  parentId?: string;
  kind: ProjectTreeNodeKind;
  title: string;
  status?: ProjectTreeNodeStatus;
  at: string;
};

export function findProjectTreeNode(
  workspace: ProjectWorkspace,
  nodeId: string,
): ProjectTreeNode | null {
  assertProjectModelId(nodeId);
  return workspace.tree.find((node) => node.id === nodeId) ?? null;
}

function withNode(
  workspace: ProjectWorkspace,
  nodeId: string,
  update: (node: ProjectTreeNode) => ProjectTreeNode,
  at: string,
): ProjectWorkspace {
  let found = false;
  const tree = workspace.tree.map((node) => {
    if (node.id !== nodeId) return node;
    found = true;
    return update(node);
  });
  if (!found) throw new Error(`Project tree node not found: ${nodeId}`);
  return { ...workspace, tree, updatedAt: at };
}

export function addProjectTreeNode(
  workspace: ProjectWorkspace,
  input: AddProjectTreeNodeInput,
): ProjectWorkspace {
  assertProjectModelId(input.id);
  if (workspace.tree.some((node) => node.id === input.id)) {
    throw new Error(`Project tree node already exists: ${input.id}`);
  }
  if (!input.title.trim()) throw new Error("Project tree node title is required");

  if (input.kind === "root") {
    if (workspace.tree.some((node) => node.kind === "root")) {
      throw new Error("Project root node already exists");
    }
    if (input.parentId) throw new Error("Project root node cannot have a parent");
  } else {
    if (!input.parentId) throw new Error("Project tree parent is required");
    assertProjectModelId(input.parentId);
    if (!workspace.tree.some((node) => node.id === input.parentId)) {
      throw new Error(`Project tree parent not found: ${input.parentId}`);
    }
  }

  const node: ProjectTreeNode = {
    id: input.id,
    ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
    kind: input.kind,
    title: input.title,
    status: input.status ?? (input.kind === "root" ? "in-progress" : "planned"),
    runIds: [],
    createdAt: input.at,
    updatedAt: input.at,
  };
  return {
    ...workspace,
    tree: [...workspace.tree, node],
    updatedAt: input.at,
  };
}

export function updateProjectTreeNodeStatus(
  workspace: ProjectWorkspace,
  nodeId: string,
  status: ProjectTreeNodeStatus,
  at: string,
): ProjectWorkspace {
  assertProjectModelId(nodeId);
  return withNode(workspace, nodeId, (node) => ({
    ...node,
    status,
    updatedAt: at,
  }), at);
}

export function attachRunToProjectTreeNode(
  workspace: ProjectWorkspace,
  nodeId: string,
  runId: string,
  at: string,
): ProjectWorkspace {
  assertProjectModelId(nodeId);
  if (!runId.trim()) throw new Error("Harness Run id is required");
  return withNode(workspace, nodeId, (node) => {
    if (node.runIds.includes(runId)) return node;
    return {
      ...node,
      runIds: [...node.runIds, runId],
      updatedAt: at,
    };
  }, at);
}
