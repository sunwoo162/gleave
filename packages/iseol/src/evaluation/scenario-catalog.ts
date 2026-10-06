import type { EvaluationSuite } from "./contracts.js";
import { assertEvaluationSuite } from "./contracts.js";
import type { EvaluationScenarioDefinition } from "./scenario-runner.js";
import { DESKTOP_RECOVERY_SCENARIOS } from "./scenarios/desktop.js";
import { CHATGPT_WEB_RECOVERY_SCENARIOS } from "./scenarios/chatgpt-web.js";
import { SECURITY_SCENARIOS } from "./scenarios/security.js";
import { PROVIDER_RECOVERY_SCENARIOS } from "./scenarios/provider.js";

export const QUICK_EVALUATION_DEFINITIONS: readonly EvaluationScenarioDefinition[] = [
  ...DESKTOP_RECOVERY_SCENARIOS,
  ...CHATGPT_WEB_RECOVERY_SCENARIOS,
  ...SECURITY_SCENARIOS,
  ...PROVIDER_RECOVERY_SCENARIOS,
];

const scenarioIds = QUICK_EVALUATION_DEFINITIONS.map((item) => item.scenario.scenarioId);
if (new Set(scenarioIds).size !== scenarioIds.length) {
  throw new Error("Quick evaluation catalog contains duplicate scenario ids");
}

export const QUICK_EVALUATION_SEEDS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(scenarioIds.map((id, index) => [
    id,
    `quick-v1-${String(index + 1).padStart(2, "0")}`,
  ])),
);

export const QUICK_EVALUATION_SUITE: EvaluationSuite = {
  version: 1,
  suiteId: "quick-evaluation",
  name: "Iseol deterministic quick evaluation",
  mode: "quick",
  scenarioIds,
  defaultSeed: "quick-v1",
  createdAt: "2026-09-08T00:00:00.000Z",
};
assertEvaluationSuite(QUICK_EVALUATION_SUITE);

export function buildQuickLiveSmokeBlockers(input: {
  chatGptBrowserDriverAvailable: boolean;
  realPreviewProviderAvailable: boolean;
}): string[] {
  const blockers: string[] = [];
  if (!input.chatGptBrowserDriverAvailable) {
    blockers.push("ChatGptBrowserDriver unavailable for live smoke verification");
  }
  if (!input.realPreviewProviderAvailable) {
    blockers.push("Real preview provider unavailable for live smoke verification");
  }
  return blockers;
}
