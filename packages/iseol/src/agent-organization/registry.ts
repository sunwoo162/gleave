import type { AgentDefinition, AgentRole, AgentStatus } from "./contracts.js";
export type { AgentDefinition, AgentRole, AgentStatus } from "./contracts.js";

export type AgentInstance = {
  id: string;
  role: AgentRole;
  capabilities: string[];
  permissions: string[];
  status: AgentStatus;
  ownedPaths?: string[];
  runtimeProfile?: string;
  completionCriteria?: string[];
};

export type WorkstreamPlan = {
  id: string;
  owner: "iseol";
  objective: string;
  agents: AgentInstance[];
};

export type AgentOrganizationPlan = {
  schemaVersion: 1;
  projectId: string;
  owner: "iseol";
  retrievedMemoryIds: string[];
  workstreams: WorkstreamPlan[];
};

export function makeAgent(
  projectId: string,
  workstreamId: string,
  role: AgentRole,
  capabilities: string[],
  options: Partial<Pick<AgentDefinition, "ownedPaths" | "permissions" | "runtimeProfile" | "completionCriteria" | "dependencies">> = {},
): AgentInstance {
  const permissions = options.permissions ?? defaultPermissions(role);
  return {
    id: `${projectId}:${workstreamId}:${role}`,
    role,
    capabilities,
    permissions,
    status: "planned",
    ownedPaths: options.ownedPaths ?? defaultOwnedPaths(workstreamId),
    runtimeProfile: options.runtimeProfile ?? defaultRuntimeProfile(role),
    completionCriteria: options.completionCriteria ?? ["structured result", "verification evidence"],
  };
}

function defaultPermissions(role: AgentRole): string[] {
  if (role === "reviewer" || role === "qa-owner") return ["workspace.read", "task.report", "evidence.write"];
  if (role === "lead") return ["workspace.read", "task.report", "handoff.write"];
  return ["workspace.read", "workspace.write:owned-paths", "task.report"];
}

function defaultOwnedPaths(workstreamId: string): string[] {
  return [`src/${workstreamId}`];
}

function defaultRuntimeProfile(role: AgentRole): string {
  if (role === "reviewer" || role === "qa-owner") return "verification";
  if (role === "lead") return "coordination";
  return "implementation";
}
