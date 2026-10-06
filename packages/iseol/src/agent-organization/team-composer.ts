import type { ProjectBriefV1 } from "../integrations/eeee-contracts.js";
import {
  makeAgent,
  type AgentOrganizationPlan,
  type WorkstreamPlan,
} from "./registry.js";

export type QualityMemoryReference = {
  id: string;
  kind: string;
  status: string;
  content: string;
  scope: Record<string, unknown>;
};

export type ComposeAgentTeamsInput = {
  brief: ProjectBriefV1;
  qualityMemory: QualityMemoryReference[];
};

type WorkstreamSpec = [string, string, string];

export function composeAgentTeams(
  input: ComposeAgentTeamsInput,
): AgentOrganizationPlan {
  const workstreamSpecs: WorkstreamSpec[] = isSmallProject(input.brief)
    ? [
        ["delivery", "Deliver the requested small project", "implementation,integration"],
        ["qa", "Independently verify the integrated result", "verification,regression"],
      ]
    : workstreamsFor(input.brief);

  const workstreams: WorkstreamPlan[] = workstreamSpecs.map(([id, objective, capabilityList]) => {
    const capabilities = capabilityList.split(",");
    const roles = id === "qa" ? (["qa-owner", "reviewer"] as const) : (["lead", "specialist", "reviewer"] as const);
    return {
      id,
      owner: "iseol",
      objective,
      agents: roles.map((role, index) =>
        makeAgent(input.brief.projectId, id, role, [capabilities[index % capabilities.length] ?? "delivery"]),
      ),
    };
  });

  return {
    schemaVersion: 1,
    projectId: input.brief.projectId,
    owner: "iseol",
    retrievedMemoryIds: input.qualityMemory.map((memory) => memory.id),
    workstreams,
  };
}

function workstreamsFor(brief: ProjectBriefV1): Array<[string, string, string]> {
  if (inferTargetType(brief) === "web_app") {
    return [
      ["design", "Define the interaction and visual system", "ux,design-system,accessibility"],
      ["frontend", "Implement the user-facing application", "ui,client-state,responsive"],
      ["backend", "Implement application services and APIs", "api,validation,security"],
      ["data", "Design persistence and data integrity", "schema,migrations,fixtures"],
      ["qa", "Independently verify behavior and regressions", "verification,regression,accessibility"],
      ["integration", "Integrate the workstreams and release safely", "integration,release,observability"],
    ];
  }
  if (inferTargetType(brief) === "local_ai_app") {
    return [
      ["experience", "Define the local assistant experience", "ux,desktop,accessibility"],
      ["runtime", "Implement local model and tool execution", "runtime,sandbox,policy"],
      ["memory", "Implement durable memory and retrieval", "storage,retrieval,provenance"],
      ["qa", "Independently verify safety and behavior", "verification,regression,security"],
      ["integration", "Integrate adapters and release boundaries", "integration,release,observability"],
    ];
  }
  return [
    ["delivery", "Implement the requested product behavior", "implementation,integration,documentation"],
    ["qa", "Independently verify the integrated result", "verification,regression,security"],
  ];
}

function isSmallProject(brief: ProjectBriefV1): boolean {
  const text = `${brief.userGoal} ${brief.scope.join(" ")}`.toLowerCase();
  return inferTargetType(brief) === "developer_tool"
    && brief.scope.length <= 1
    && /\b(tiny|small|one|single|minimal)\b/.test(text);
}

function inferTargetType(brief: ProjectBriefV1): "web_app" | "local_ai_app" | "developer_tool" | "other" {
  const text = `${brief.userGoal} ${brief.scope.join(" ")}`.toLowerCase();
  if (/local\s+ai|offline\s+ai/.test(text)) return "local_ai_app";
  if (/web|website|dashboard|frontend/.test(text)) return "web_app";
  if (/cli|command\s+line|developer\s+tool/.test(text)) return "developer_tool";
  return "other";
}
