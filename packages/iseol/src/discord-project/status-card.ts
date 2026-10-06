import type { HarnessRuntimeRunEnvelope } from "../harness/contracts.js";
import { withDurableHarnessRunLock } from "../harness/run-lock.js";
import { assertCheckHttpUrl } from "../desktop-agent/contracts.js";
import type { ProjectWorkspace } from "../project-model/contracts.js";
import { withDurableProjectWorkspaceLock } from "../project-model/workspace-lock.js";
import type { DiscordProjectContext } from "./contracts.js";

export type DiscordProjectStatusView = {
  legacy: { projectId: string; name: string; frontend: string; backend: string };
  integrations: { calendar: boolean; figma: boolean; notion: boolean };
  workspace: {
    state: "unbound" | "bound" | "stale";
    reason?: string;
    projectName?: string;
    projectStatus?: ProjectWorkspace["status"];
    deploymentUrl?: string;
    node?: ProjectWorkspace["tree"][number];
    runs: Array<{ runId: string; stage: string; status: string; updatedAt: string }>;
  };
};

export type DiscordProjectStatusDependencies = {
  workspaceRoot?: string;
  runRoot?: string;
  loadWorkspace(projectId: string): Promise<ProjectWorkspace | null>;
  loadRun(runId: string): Promise<HarnessRuntimeRunEnvelope | null>;
};

function safeDeploymentUrl(value: string | undefined): string | undefined {
  if (!value || /%(?![0-9a-f]{2})/i.test(value)) return undefined;
  try {
    assertCheckHttpUrl(value);
    return value;
  } catch {
    return undefined;
  }
}

function legacyView(context: DiscordProjectContext): Omit<DiscordProjectStatusView, "workspace"> {
  return {
    legacy: {
      projectId: context.legacy.projectId,
      name: context.legacy.name,
      frontend: context.legacy.repositories.frontend.url,
      backend: context.legacy.repositories.backend.url,
    },
    integrations: {
      calendar: Boolean(context.legacy.integrations.calendar.id || context.legacy.integrations.calendar.url),
      figma: Boolean(context.legacy.integrations.figma.url || context.legacy.integrations.figma.fileKey),
      notion: Boolean(context.legacy.integrations.notion.url || context.legacy.integrations.notion.pageId),
    },
  };
}

async function buildDiscordProjectStatusUnlocked(
  context: DiscordProjectContext,
  deps: DiscordProjectStatusDependencies,
): Promise<DiscordProjectStatusView> {
  const base = legacyView(context);
  if (context.state === "legacy-only") {
    return { ...base, workspace: { state: "unbound", runs: [] } };
  }
  if (context.state === "stale-binding" || !context.binding || !context.work?.nodeId) {
    return {
      ...base,
      workspace: { state: "stale", runs: [], ...(context.staleReason ? { reason: context.staleReason } : {}) },
    };
  }
  const workspace = await deps.loadWorkspace(context.binding.projectId);
  if (!workspace) {
    return { ...base, workspace: { state: "stale", reason: "Project Workspace is missing", runs: [] } };
  }
  const node = workspace.tree.find((item) => item.id === context.work!.nodeId);
  if (!node) {
    return { ...base, workspace: { state: "stale", reason: "Project tree node is missing", runs: [] } };
  }
  const runs: DiscordProjectStatusView["workspace"]["runs"] = [];
  for (const runId of node.runIds) {
    const run = deps.runRoot
      ? await withDurableHarnessRunLock(deps.runRoot, runId, () => deps.loadRun(runId), { waitForMs: 2_000 })
      : await deps.loadRun(runId);
    if (!run) continue;
    runs.push({ runId, stage: run.state.stage, status: run.state.status, updatedAt: run.updatedAt });
  }
  const deploymentUrl = safeDeploymentUrl(workspace.genesis.deployment.url);
  return {
    ...base,
    workspace: {
      state: "bound",
      projectName: workspace.name,
      projectStatus: workspace.status,
      ...(deploymentUrl ? { deploymentUrl } : {}),
      node: { ...node, runIds: [...node.runIds] },
      runs,
    },
  };
}

export async function buildDiscordProjectStatus(
  context: DiscordProjectContext,
  deps: DiscordProjectStatusDependencies,
): Promise<DiscordProjectStatusView> {
  if (deps.workspaceRoot && context.state === "bound" && context.binding && context.work?.nodeId) {
    return withDurableProjectWorkspaceLock(
      deps.workspaceRoot,
      context.binding.projectId,
      () => buildDiscordProjectStatusUnlocked(context, deps),
      { waitForMs: 2_000 },
    );
  }
  return buildDiscordProjectStatusUnlocked(context, deps);
}
