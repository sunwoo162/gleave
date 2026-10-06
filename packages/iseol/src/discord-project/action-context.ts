import type { ProjectWorkContext } from "../project-model/contracts.js";
import type { ProjectContext } from "../services/project-context.js";
import { resolveDiscordProjectContext } from "./context-resolver.js";

export type ResolveBoundActionContextInput = {
  modelRoot: string;
  bindingRoot: string;
  workspaceRoot?: string;
  guildId: string;
  storedProjectId: string;
  nodeId?: string;
  runId?: string;
  resolveLegacy?: (projectId: string, guildId: string) => Promise<ProjectContext | null>;
};

export async function resolveBoundActionContext(
  input: ResolveBoundActionContextInput,
): Promise<ProjectWorkContext | null> {
  const context = await resolveDiscordProjectContext(input);
  if (!context) return null;
  if (context.state === "legacy-only") return null;
  if (context.state === "stale-binding" || !context.work) {
    throw new Error(`Stale Discord project binding: ${context.staleReason ?? input.storedProjectId}`);
  }
  if (!context.work.nodeId) {
    throw new Error(`Bound Discord project context has no node: ${input.storedProjectId}`);
  }
  return context.work;
}
