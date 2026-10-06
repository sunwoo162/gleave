import type { ProjectWorkContext } from "../project-model/contracts.js";
import type { ProjectContext } from "../services/project-context.js";

export type DiscordProjectBinding = {
  version: 1;
  guildId: string;
  storedProjectId: string;
  projectId: string;
  defaultNodeId: string;
  createdAt: string;
  updatedAt: string;
};

export type DiscordProjectContextState =
  | "legacy-only"
  | "bound"
  | "stale-binding";

export type DiscordProjectContext = {
  legacy: ProjectContext;
  state: DiscordProjectContextState;
  binding?: DiscordProjectBinding;
  work?: ProjectWorkContext;
  staleReason?: string;
};
