export const EXECUTION_PROFILE_VERSION = 1 as const;

export type ProjectPurpose =
  | "rapid-prototype"
  | "operational-service"
  | "portfolio"
  | "existing-project-improvement";

export type AgentRoleId =
  | "orchestrator" | "planning" | "frontend" | "backend" | "design-system"
  | "review" | "qa" | "documentation" | "user" | "governance";

export type AgentRoleRegistration = {
  id: AgentRoleId;
  kind: "stage-adapter" | "specialist";
  status: "registered" | "planned";
};

/** Roles with real stage adapters are executable; the rest remain planned. */
export function defaultAgentRoleRegistrations(): AgentRoleRegistration[] {
  return [
    { id: "orchestrator", kind: "stage-adapter", status: "registered" },
    { id: "planning", kind: "stage-adapter", status: "registered" },
    { id: "frontend", kind: "stage-adapter", status: "registered" },
    { id: "qa", kind: "stage-adapter", status: "registered" },
    { id: "backend", kind: "specialist", status: "planned" },
    { id: "design-system", kind: "specialist", status: "planned" },
    { id: "review", kind: "specialist", status: "planned" },
    { id: "documentation", kind: "specialist", status: "planned" },
    { id: "user", kind: "specialist", status: "planned" },
    { id: "governance", kind: "specialist", status: "planned" },
  ];
}

export type ExecutionProfile = {
  version: 1;
  purpose: ProjectPurpose;
  objective: string;
  selectedRoles: AgentRoleId[];
  executableRoles: AgentRoleId[];
  plannedRoles: AgentRoleId[];
  verificationStages: string[];
  documentationRequired: boolean;
  koreanSummary: string;
};

const PURPOSE_LABELS: Record<ProjectPurpose, string> = {
  "rapid-prototype": "빠른 프로토타입 체험",
  "operational-service": "실제 운영 서비스",
  portfolio: "포트폴리오 프로젝트",
  "existing-project-improvement": "기존 프로젝트 개선",
};

const PURPOSE_ROLES: Record<ProjectPurpose, AgentRoleId[]> = {
  "rapid-prototype": ["orchestrator", "planning", "frontend", "qa"],
  "operational-service": ["orchestrator", "planning", "frontend", "backend", "qa", "review"],
  portfolio: ["orchestrator", "planning", "frontend", "qa", "review", "design-system", "documentation", "user"],
  "existing-project-improvement": ["orchestrator", "planning", "review", "qa", "documentation"],
};

const PURPOSE_VERIFICATION: Record<ProjectPurpose, string[]> = {
  "rapid-prototype": ["TEST", "BUILD"],
  "operational-service": ["TEST", "BUILD", "COMMIT", "DEPLOY", "PRODUCTION_VERIFY"],
  portfolio: ["TEST", "BUILD", "COMMIT", "DEPLOY", "PRODUCTION_VERIFY"],
  "existing-project-improvement": ["TEST", "BUILD", "COMMIT"],
};

function assertPurpose(value: string): asserts value is ProjectPurpose {
  if (!Object.hasOwn(PURPOSE_LABELS, value)) throw new Error(`Unsupported project purpose: ${value}`);
}

export function resolveExecutionProfile(input: {
  purpose: ProjectPurpose;
  objective: string;
  roles: AgentRoleRegistration[];
}): ExecutionProfile {
  assertPurpose(input.purpose);
  const objective = input.objective.trim();
  if (!objective) throw new Error("Project objective is required");
  if (objective.length > 4_000) throw new Error("Project objective exceeds the allowed size");
  const selectedRoles = [...PURPOSE_ROLES[input.purpose]];
  const registrations = new Map(input.roles.map((role) => [role.id, role]));
  const executableRoles = selectedRoles.filter((id) => {
    const role = registrations.get(id);
    return role?.status === "registered" && role.kind === "stage-adapter";
  });
  const plannedRoles = selectedRoles.filter((id) => !executableRoles.includes(id));
  const missing = plannedRoles.length === 0
    ? "필요한 역할이 모두 등록되어 있습니다."
    : `현재 실행기에 없는 역할은 계획으로 남깁니다: ${plannedRoles.join(", ")}.`;
  return {
    version: EXECUTION_PROFILE_VERSION,
    purpose: input.purpose,
    objective,
    selectedRoles,
    executableRoles,
    plannedRoles,
    verificationStages: [...PURPOSE_VERIFICATION[input.purpose]],
    documentationRequired: input.purpose === "portfolio" || input.purpose === "existing-project-improvement",
    koreanSummary: `${PURPOSE_LABELS[input.purpose]} 목적에 맞춰 ${executableRoles.join(", ") || "등록된 실행 역할 없이"} 역할을 실행하도록 구성했습니다. ${missing}`,
  };
}
