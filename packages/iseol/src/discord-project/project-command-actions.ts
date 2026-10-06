import type { ProjectWorkspace } from "../project-model/contracts.js";
import { withDurableProjectWorkspaceLock } from "../project-model/workspace-lock.js";
import type { StoredProject } from "../services/projects.js";
import type { DiscordProjectBinding } from "./contracts.js";
import type { StoredProjectActionFact } from "./history-recorder.js";

export type ProjectChoice = { name: string; value: string };

export async function withStoredProjectLifecycleLock<T>(
  input: { guildId: string; storedProjectId: string },
  deps: {
    findStoredProject(id: string): Promise<StoredProject | null>;
    withLifecycleLock?<R>(task: () => Promise<R>): Promise<R>;
  },
  task: (storedProject: StoredProject) => Promise<T>,
): Promise<T | undefined> {
  const run = async (): Promise<T | undefined> => {
    const storedProject = await deps.findStoredProject(input.storedProjectId);
    if (!storedProject || storedProject.guildId !== input.guildId) return undefined;
    return task(storedProject);
  };
  return deps.withLifecycleLock ? deps.withLifecycleLock(run) : run();
}

export async function listDiscordProjectBindingChoices(
  guildId: string,
  deps: {
    listStoredProjects(): Promise<StoredProject[]>;
    listWorkspaces(): Promise<ProjectWorkspace[]>;
  },
): Promise<{ projects: ProjectChoice[]; workspaces: ProjectChoice[] }> {
  const [storedProjects, workspaces] = await Promise.all([
    deps.listStoredProjects(),
    deps.listWorkspaces(),
  ]);
  return {
    projects: storedProjects
      .filter((project) => project.guildId === guildId)
      .map((project) => ({ name: project.name.slice(0, 100), value: project.id })),
    workspaces: workspaces
      .filter((workspace) => workspace.status === "active")
      .map((workspace) => ({ name: workspace.name.slice(0, 100), value: workspace.id })),
  };
}

export async function bindDiscordProjectWorkspace(
  input: {
    guildId: string;
    storedProjectId: string;
    projectId: string;
    at: string;
  },
  deps: {
    workspaceRoot?: string;
    findStoredProject(id: string): Promise<StoredProject | null>;
    loadWorkspace(id: string): Promise<ProjectWorkspace | null>;
    createBinding(input: {
      guildId: string;
      storedProjectId: string;
      projectId: string;
      defaultNodeId: string;
      at: string;
    }): Promise<DiscordProjectBinding>;
  },
): Promise<DiscordProjectBinding> {
  const stored = await deps.findStoredProject(input.storedProjectId);
  if (!stored || stored.guildId !== input.guildId) {
    throw new Error("StoredProject guild does not match this Discord server");
  }
  const bind = async (): Promise<DiscordProjectBinding> => {
    const workspace = await deps.loadWorkspace(input.projectId);
    if (!workspace || workspace.status !== "active") {
      throw new Error("Project Workspace must exist and be active");
    }
    const root = workspace.tree.find((node) => node.kind === "root");
    if (!root) throw new Error("Active Project Workspace root node is required");
    return deps.createBinding({ ...input, defaultNodeId: root.id });
  };
  if (deps.workspaceRoot) {
    return withDurableProjectWorkspaceLock(deps.workspaceRoot, input.projectId, bind, { waitForMs: 2_000 });
  }
  return bind();
}

export function discordProjectBindingHistoryFact(
  binding: DiscordProjectBinding,
): StoredProjectActionFact {
  return {
    eventType: "discord-project-bound",
    source: "discord",
    action: "project-bound",
    reference: `discord-binding:${binding.guildId}:${binding.storedProjectId}:${binding.projectId}`,
    summary: "Discord project bound to Project Workspace",
  };
}
