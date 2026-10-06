import { resolveProjectWorkContext, resolveProjectWorkContextUnlocked } from "../project-model/work-context.js";
import { loadProjectWorkspace, loadProjectWorkspaceUnlocked } from "../project-model/workspace-store.js";
import { withDurableProjectWorkspaceLock } from "../project-model/workspace-lock.js";
import {
  resolveProjectContext,
  type ProjectContext,
} from "../services/project-context.js";
import { loadDiscordProjectBinding } from "./binding-store.js";
import type { DiscordProjectContext } from "./contracts.js";

export type ResolveDiscordProjectContextInput = {
  modelRoot: string;
  bindingRoot: string;
  guildId: string;
  storedProjectId: string;
  workspaceRoot?: string;
  nodeId?: string;
  runId?: string;
  resolveLegacy?: (
    projectId: string,
    guildId: string,
  ) => Promise<ProjectContext | null>;
};

export async function resolveDiscordProjectContext(
  input: ResolveDiscordProjectContextInput,
): Promise<DiscordProjectContext | null> {
  const resolveLegacy = input.resolveLegacy ?? resolveProjectContext;
  const legacy = await resolveLegacy(input.storedProjectId, input.guildId);
  if (!legacy) return null;
  const binding = await loadDiscordProjectBinding(
    input.bindingRoot,
    input.guildId,
    input.storedProjectId,
  );
  if (!binding) return { legacy, state: "legacy-only" };

  if (
    binding.guildId !== input.guildId
    || binding.storedProjectId !== input.storedProjectId
  ) {
    return {
      legacy,
      binding,
      state: "stale-binding",
      staleReason: "Discord project binding identity mismatch",
    };
  }

  const resolveBound = async (): Promise<DiscordProjectContext> => {
    const workspace = await (input.workspaceRoot ? loadProjectWorkspaceUnlocked : loadProjectWorkspace)(input.modelRoot, binding.projectId);
    if (!workspace) {
      return {
        legacy,
        binding,
        state: "stale-binding",
        staleReason: `Bound Project Workspace not found: ${binding.projectId}`,
      };
    }

    const nodeId = input.nodeId ?? binding.defaultNodeId;
    const work = await (input.workspaceRoot ? resolveProjectWorkContextUnlocked : resolveProjectWorkContext)({
      modelRoot: input.modelRoot,
      projectId: binding.projectId,
      nodeId,
      ...(input.runId === undefined ? {} : { runId: input.runId }),
    });
    if (!work) {
      return {
        legacy,
        binding,
        state: "stale-binding",
        staleReason: input.runId
          ? `Invalid bound node/Run context: ${nodeId}/${input.runId}`
          : `Bound Project Workspace node not found: ${nodeId}`,
      };
    }

    return {
      legacy,
      binding,
      work,
      state: "bound",
    };
  };
  if (input.workspaceRoot) {
    return withDurableProjectWorkspaceLock(input.workspaceRoot, binding.projectId, resolveBound, { waitForMs: 2_000 });
  }
  return resolveBound();
}
