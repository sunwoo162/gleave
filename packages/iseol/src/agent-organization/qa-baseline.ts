import type { ProjectBriefV1 } from "../integrations/eeee-contracts.js";
import type { QualityMemoryReference } from "./team-composer.js";

export type QaBaselineCheck = {
  id: string;
  memoryId: string;
  description: string;
  required: true;
};

export type QaBaseline = {
  schemaVersion: 1;
  memoryIds: string[];
  requiredChecks: QaBaselineCheck[];
};

export function buildQaBaseline(input: {
  brief: ProjectBriefV1;
  memories: QualityMemoryReference[];
}): QaBaseline {
  const eligible = input.memories.filter((memory) =>
    (memory.kind === "qa_rule" || memory.kind === "regression_rule")
      && memory.status === "active"
      && scopeMatches(input.brief, memory),
  );

  const unique = new Map(eligible.map((memory) => [memory.id, memory]));
  const requiredChecks = [...unique.values()].map((memory) => ({
    id: `memory-check:${memory.id}`,
    memoryId: memory.id,
    description: memory.content,
    required: true as const,
  }));

  return {
    schemaVersion: 1,
    memoryIds: requiredChecks.map((check) => check.memoryId),
    requiredChecks,
  };
}

function scopeMatches(brief: ProjectBriefV1, memory: QualityMemoryReference): boolean {
  const text = `${brief.userGoal} ${brief.scope.join(" ")}`.toLowerCase();
  const technology = memory.scope.technology;
  const targetType = inferTargetType(brief);
  if (technology === "web" && targetType !== "web_app") return false;
  if (technology === "backend" && !["web_app", "developer_tool"].includes(targetType)) return false;
  const feature = memory.scope.feature;
  return typeof feature !== "string" || text.includes(feature.toLowerCase());
}

function inferTargetType(brief: ProjectBriefV1): "web_app" | "local_ai_app" | "developer_tool" | "other" {
  const text = `${brief.userGoal} ${brief.scope.join(" ")}`.toLowerCase();
  if (/local\s+ai|offline\s+ai/.test(text)) return "local_ai_app";
  if (/web|website|dashboard|frontend/.test(text)) return "web_app";
  if (/cli|command\s+line|developer\s+tool/.test(text)) return "developer_tool";
  return "other";
}
