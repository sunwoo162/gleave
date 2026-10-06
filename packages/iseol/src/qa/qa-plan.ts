import type { ProjectBriefV1 } from "../integrations/eeee-contracts.js";

export type QaCheckCategory =
  | "requirements"
  | "unit-integration"
  | "e2e"
  | "regression"
  | "visual-accessibility"
  | "security-performance";

export type QaCheckSpec = {
  id: string;
  label: string;
  category: QaCheckCategory;
  ownerWorkstream: string;
  required: true;
};

export type QaReleaseThresholds = {
  maxWarnings: number;
  requireEvidence: true;
  requireLatestRevision: true;
};

export type QaBrief = ProjectBriefV1 & { projectRevision?: string };

export class QaPlan {
  readonly schemaVersion = 1 as const;
  readonly projectId: string;
  readonly projectRevision: string;
  readonly acceptanceCriteria: string[];
  readonly risk: { level: "low" | "medium" | "high"; reasons: string[] };
  readonly requiredChecks: QaCheckSpec[];
  readonly inheritedRegressionRules: string[];
  readonly releaseThresholds: QaReleaseThresholds;

  private constructor(input: Omit<QaPlan, "schemaVersion">) {
    this.projectId = input.projectId;
    this.projectRevision = input.projectRevision;
    this.acceptanceCriteria = input.acceptanceCriteria;
    this.risk = input.risk;
    this.requiredChecks = input.requiredChecks;
    this.inheritedRegressionRules = input.inheritedRegressionRules;
    this.releaseThresholds = input.releaseThresholds;
  }

  static build(
    projectBrief: QaBrief,
    retrievedQualityMemory: Array<Record<string, unknown>>,
  ): QaPlan {
    const inheritedRegressionRules = retrievedQualityMemory
      .filter((memory) => memory.kind === "qa_rule" || memory.kind === "regression_rule")
      .map((memory) => String(memory.content ?? "").trim())
      .filter(Boolean);
    const riskLevel = inheritedRegressionRules.length > 0 ? "high" : "medium";
    return new QaPlan({
      projectId: requireText(projectBrief.projectId, "projectId"),
      projectRevision: projectBrief.projectRevision?.trim() || "unknown",
      acceptanceCriteria: [projectBrief.userGoal, ...projectBrief.scope].map((item) => item.trim()).filter(Boolean),
      risk: {
        level: riskLevel,
        reasons: inheritedRegressionRules.length > 0
          ? ["Inherited quality memory requires regression coverage"]
          : ["Default release risk requires independent checks"],
      },
      requiredChecks: [
        { id: "QA-0", label: "requirements and acceptance criteria", category: "requirements", ownerWorkstream: "product", required: true },
        { id: "QA-1", label: "unit and integration tests", category: "unit-integration", ownerWorkstream: "implementation", required: true },
        { id: "QA-2", label: "end-to-end and runtime smoke", category: "e2e", ownerWorkstream: "integration", required: true },
        { id: "QA-3", label: "inherited regression rules", category: "regression", ownerWorkstream: "qa", required: true },
        { id: "QA-4", label: "visual and accessibility checks", category: "visual-accessibility", ownerWorkstream: "design", required: true },
        { id: "QA-5", label: "security and performance checks", category: "security-performance", ownerWorkstream: "security", required: true },
      ],
      inheritedRegressionRules,
      releaseThresholds: {
        maxWarnings: 0,
        requireEvidence: true,
        requireLatestRevision: true,
      },
    });
  }
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}
