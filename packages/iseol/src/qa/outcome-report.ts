import {
  parseProjectOutcomeReportV1,
  type ProjectOutcomeReportV1,
} from "../integrations/eeee-contracts.js";
import type { IndependentQaReportV1 } from "./independent-runner.js";

export type ProjectOutcomeInput = {
  requestId: string;
  qaReport: IndependentQaReportV1;
  deterministicVerification: Record<string, unknown>;
  claimLatchReports: Array<Record<string, unknown>>;
  receipts?: Array<Record<string, unknown>>;
  artifacts?: Array<Record<string, unknown>>;
  agentTeams?: Array<Record<string, unknown>>;
  handoffs?: Array<Record<string, unknown>>;
  risks?: Array<Record<string, unknown>>;
  memoryCandidates?: Array<Record<string, unknown>>;
  createdAt: string;
  status?: ProjectOutcomeV1Status;
};

type ProjectOutcomeV1Status = ProjectOutcomeReportV1["status"];

export function buildProjectOutcomeReport(
  input: ProjectOutcomeInput,
): ProjectOutcomeReportV1 {
  return parseProjectOutcomeReportV1({
    schemaVersion: 1,
    projectId: input.qaReport.projectId,
    requestId: input.requestId,
    projectRevision: input.qaReport.projectRevision,
    status: input.status ?? "completed",
    artifacts: input.artifacts ?? [],
    agentTeams: input.agentTeams ?? [{ id: "iseol-qa", role: "independent-qa" }],
    handoffs: input.handoffs ?? [],
    deterministicVerification: input.deterministicVerification,
    qaReport: input.qaReport as unknown as Record<string, unknown>,
    claimLatchReports: input.claimLatchReports,
    receipts: input.receipts ?? [],
    risks: input.risks ?? [],
    memoryCandidates: input.memoryCandidates ?? [],
    createdAt: input.createdAt,
  });
}
