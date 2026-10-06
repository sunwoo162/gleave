import type { HarnessStageExecutor, HarnessStageExecutionResult } from "../harness/run-supervisor.js";

export type CreateHybridStageExecutorInput = {
  webExecutor: HarnessStageExecutor;
  desktopExecutor: HarnessStageExecutor;
  providerExecutor?: HarnessStageExecutor;
};

const WEB_STAGES = new Set(["ANALYZE", "PLAN", "IMPLEMENT", "SELF_REVIEW"]);
const DESKTOP_STAGES = new Set(["CONTEXT", "TEST", "COMMIT"]);
const PROVIDER_STAGES = new Set(["PR", "CI", "MERGE", "DEPLOY", "PRODUCTION_VERIFY"]);

export function createHybridStageExecutor(input: CreateHybridStageExecutorInput): HarnessStageExecutor {
  return {
    async execute(run): Promise<HarnessStageExecutionResult> {
      const stage = run.state.stage;
      if (WEB_STAGES.has(stage)) return input.webExecutor.execute(run);
      if (DESKTOP_STAGES.has(stage)) return input.desktopExecutor.execute(run);
      if (PROVIDER_STAGES.has(stage)) {
        if (!input.providerExecutor) return { type: "waiting-external", reason: `Provider executor is not configured for ${stage}` };
        return input.providerExecutor.execute(run);
      }
      return { type: "waiting-external", reason: `No Hybrid executor owner is configured for ${stage}` };
    },
  };
}