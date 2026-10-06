export type AgentRole =
  | "lead"
  | "specialist"
  | "reviewer"
  | "ux"
  | "implementation"
  | "qa-owner";

export type AgentStatus = "planned" | "queued" | "running" | "blocked" | "completed";

export type AgentInstance = {
  id: string;
  role: AgentRole;
  capabilities: string[];
  permissions: string[];
  status: AgentStatus;
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
): AgentInstance {
  return {
    id: `${projectId}:${workstreamId}:${role}`,
    role,
    capabilities,
    permissions: ["workspace.read", "task.report"],
    status: "planned",
  };
}
