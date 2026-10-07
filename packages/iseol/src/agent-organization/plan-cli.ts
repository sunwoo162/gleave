import { readFileSync } from "node:fs";
import { parseProjectBriefV1, type ProjectBriefV1 } from "../integrations/eeee-contracts.js";
import { createIseolExecutionService } from "./service.js";

type PlanRequest = {
  brief: ProjectBriefV1;
  projectRevision: string;
  qualityMemory?: Array<{ id: string; kind: string; status: string; content: string; scope: Record<string, unknown> }>;
};

const input = JSON.parse(readFileSync(0, "utf8")) as PlanRequest;
const brief = parseProjectBriefV1(input.brief);
if (!input.projectRevision?.trim()) throw new Error("projectRevision is required");
const plan = createIseolExecutionService().createPlan({
  brief,
  projectRevision: input.projectRevision,
  qualityMemory: input.qualityMemory ?? [],
});
process.stdout.write(JSON.stringify(plan));
