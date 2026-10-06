import {
  assertHarnessContractVersion,
  type DevelopmentRunRequest,
  type HarnessPolicySnapshot,
  type HarnessPreflightRecord,
} from "./contracts.js";
import { resolveHarnessPolicy } from "./policy-resolver.js";
import { formatUserFacingError } from "../security/user-error.js";

export type PrepareDevelopmentRunOptions = {
  iseolRoot: string;
  loadedAt?: string;
  policyRoot?: string;
};

function validateRequest(request: DevelopmentRunRequest): void {
  assertHarnessContractVersion(request.version);
  if (!request.runId.trim()) throw new Error("Development Run runId is required");
  if (!request.objective.trim()) throw new Error("Development Run objective is required");
  if (!request.targetRoot.trim()) throw new Error("Development Run targetRoot is required");
  if (request.mode !== "idea-lab" && request.mode !== "project-workspace") {
    throw new Error(`Unsupported Development Run mode: ${String(request.mode)}`);
  }
}
export async function prepareDevelopmentRun(
  request: DevelopmentRunRequest,
  options: PrepareDevelopmentRunOptions,
): Promise<HarnessPreflightRecord> {
  validateRequest(request);

  try {
    const policy = await resolveHarnessPolicy({
      iseolRoot: options.iseolRoot,
      targetRoot: options.policyRoot ?? request.targetRoot,
      loadedAt: options.loadedAt,
    });
    return {
      version: 1,
      runId: request.runId,
      status: "ready",
      ...(request.mode === "project-workspace" ? { gitPreparation: "bootstrap-if-empty" as const } : {}),
      policy,
    };
  } catch (error) {
    const reason = formatUserFacingError(error);
    return { version: 1, runId: request.runId, status: "blocked", reason };
  }
}

export function assertPreflightReady(
  record: HarnessPreflightRecord,
): asserts record is HarnessPreflightRecord & { status: "ready"; policy: HarnessPolicySnapshot } {
  if (record.status !== "ready" || !record.policy) {
    throw new Error(`Development Run preflight is not ready${record.reason ? `: ${record.reason}` : ""}`);
  }
}
