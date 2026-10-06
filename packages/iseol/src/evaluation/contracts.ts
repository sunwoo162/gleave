export const ISEOL_EVALUATION_VERSION = 1 as const;

export type EvaluationMode = "quick" | "soak";
export type EvaluationTargetMode = "project-workspace" | "idea-lab";
export type EvaluationRunStatus = "queued" | "running" | "passed" | "failed" | "blocked-external" | "cancelled";
export type EvaluationEventType = "evaluation-started" | "fault-injected" | "recovery-observed" | "invariant-violated" | "scenario-completed" | "evaluation-completed";
export type EvaluationFaultBoundary = "harness" | "chatgpt-web" | "desktop" | "git" | "github" | "ci" | "deploy" | "core" | "idea-lab";
export type EvaluationFaultAction = "drop-response" | "disconnect" | "lose-session" | "return-retryable" | "return-final-failure" | "return-permission-denied" | "return-rate-limit" | "return-timeout" | "restart-core" | "stale-late-result" | "corrupt-transient-copy";

export type FaultPlanEntry = {
  boundary: EvaluationFaultBoundary;
  point: string;
  occurrence: number;
  action: EvaluationFaultAction;
};

export type EvaluationSuite = {
  version: 1;
  suiteId: string;
  name: string;
  mode: EvaluationMode;
  scenarioIds: string[];
  defaultSeed: string;
  createdAt: string;
};

export type EvaluationScenario = {
  version: 1;
  scenarioId: string;
  category: string;
  name: string;
  targetMode: EvaluationTargetMode;
  maxDurationMs: number;
  faultPlan: FaultPlanEntry[];
  expectedInvariants: string[];
  requiredCapabilities: string[];
};

export type InjectedFault = FaultPlanEntry & {
  faultId: string;
  scenarioId: string;
  seed: string;
  injectedAt: string;
};

export type EvaluationMetrics = {
  completionRate: number;
  recoverySuccessRate: number;
  humanInterventionCount: number;
  duplicateSideEffectCount: number;
  unexpectedMutationCount: number;
  verificationPassRate: number;
  recoveryLatencyMs: number;
  runDurationMs: number;
  stageRetryCount: number;
  staleSessionResultCount: number;
  providerCallCount: number;
  toolInvocationCount: number;
};

export type InvariantResult = {
  id: string;
  name: string;
  status: "passed" | "failed";
  expected: string;
  actual: string;
  summary: string;
};

export type EvaluationRun = {
  version: 1;
  evaluationId: string;
  suiteId: string;
  scenarioId: string;
  seed: string;
  targetRunId?: string;
  targetCampaignId?: string;
  status: EvaluationRunStatus;
  startedAt: string;
  completedAt?: string;
  injectedFaults: InjectedFault[];
  metrics: EvaluationMetrics;
  invariants: InvariantResult[];
  summary: string;
};

export type EvaluationObservation = {
  version: 1;
  id: string;
  evaluationId: string;
  scenarioId: string;
  type: EvaluationEventType;
  at: string;
  summary: string;
  reference?: string;
};

export type EvaluationScenarioSummary = {
  scenarioId: string;
  evaluationId: string;
  seed: string;
  status: EvaluationRunStatus;
  diagnostic?: string;
};

export type EvaluationReport = {
  version: 1;
  evaluationId: string;
  suiteId: string;
  status: "passed" | "failed" | "blocked-external";
  startedAt: string;
  completedAt: string;
  metrics: EvaluationMetrics;
  invariants: InvariantResult[];
  scenarios: EvaluationScenarioSummary[];
  liveBlockers: string[];
  summary: string;
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const FAULT_BOUNDARIES = new Set<EvaluationFaultBoundary>(["harness", "chatgpt-web", "desktop", "git", "github", "ci", "deploy", "core", "idea-lab"]);
const FAULT_ACTIONS = new Set<EvaluationFaultAction>(["drop-response", "disconnect", "lose-session", "return-retryable", "return-final-failure", "return-permission-denied", "return-rate-limit", "return-timeout", "restart-core", "stale-late-result", "corrupt-transient-copy"]);
const RUN_STATUSES = new Set<EvaluationRunStatus>(["queued", "running", "passed", "failed", "blocked-external", "cancelled"]);

export function assertEvaluationVersion(version: number): asserts version is 1 {
  if (version !== ISEOL_EVALUATION_VERSION) throw new Error(`Unsupported Iseol Evaluation version: ${version}`);
}

export function assertEvaluationId(id: string): void {
  if (!ID_PATTERN.test(id)) throw new Error(`Invalid Iseol Evaluation id: ${id}`);
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}
function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const set = new Set(allowed);
  for (const key of Object.keys(value)) if (!set.has(key)) throw new Error(`${label} contains unknown field: ${key}`);
}
function assertRequiredString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
}
function assertTimestamp(value: unknown, label: string): asserts value is string {
  assertRequiredString(value, label);
  if (Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
}
function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) throw new Error(`${label} must be non-empty strings`);
}
function assertNonNegative(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number`);
}

export function assertFaultPlanEntry(value: unknown): asserts value is FaultPlanEntry {
  assertObject(value, "Evaluation fault");
  assertExactKeys(value, ["boundary", "point", "occurrence", "action"], "Evaluation fault");
  if (!FAULT_BOUNDARIES.has(value.boundary as EvaluationFaultBoundary)) throw new Error(`Unsupported evaluation fault boundary: ${String(value.boundary)}`);
  assertRequiredString(value.point, "Evaluation fault point");
  if (!Number.isInteger(value.occurrence) || (value.occurrence as number) <= 0) throw new Error("Evaluation fault occurrence must be positive");
  if (!FAULT_ACTIONS.has(value.action as EvaluationFaultAction)) throw new Error(`Unsupported evaluation fault action: ${String(value.action)}`);
}

function assertMetrics(value: unknown): asserts value is EvaluationMetrics {
  assertObject(value, "Evaluation metrics");
  const keys = [
    "completionRate", "recoverySuccessRate", "humanInterventionCount", "duplicateSideEffectCount",
    "unexpectedMutationCount", "verificationPassRate", "recoveryLatencyMs", "runDurationMs",
    "stageRetryCount", "staleSessionResultCount", "providerCallCount", "toolInvocationCount",
  ] as const;
  assertExactKeys(value, keys, "Evaluation metrics");
  for (const key of keys) assertNonNegative(value[key], `Evaluation metric ${key}`);
}
function assertInvariant(value: unknown): asserts value is InvariantResult {
  assertObject(value, "Evaluation invariant");
  assertExactKeys(value, ["id", "name", "status", "expected", "actual", "summary"], "Evaluation invariant");
  assertEvaluationId(String(value.id));
  assertRequiredString(value.name, "Evaluation invariant name");
  if (value.status !== "passed" && value.status !== "failed") throw new Error("Invalid evaluation invariant status");
  assertRequiredString(value.expected, "Evaluation invariant expected");
  assertRequiredString(value.actual, "Evaluation invariant actual");
  assertRequiredString(value.summary, "Evaluation invariant summary");
}

export function assertEvaluationSuite(value: unknown): asserts value is EvaluationSuite {
  assertObject(value, "Evaluation suite");
  assertExactKeys(value, ["version", "suiteId", "name", "mode", "scenarioIds", "defaultSeed", "createdAt"], "Evaluation suite");
  assertEvaluationVersion(Number(value.version));
  assertEvaluationId(String(value.suiteId));
  assertRequiredString(value.name, "Evaluation suite name");
  if (value.mode !== "quick" && value.mode !== "soak") throw new Error("Invalid evaluation suite mode");
  assertStringArray(value.scenarioIds, "Evaluation suite scenarioIds");
  for (const id of value.scenarioIds) assertEvaluationId(id);
  assertRequiredString(value.defaultSeed, "Evaluation suite defaultSeed");
  assertTimestamp(value.createdAt, "Evaluation suite createdAt");
}

export function assertEvaluationScenario(value: unknown): asserts value is EvaluationScenario {
  assertObject(value, "Evaluation scenario");
  assertExactKeys(value, ["version", "scenarioId", "category", "name", "targetMode", "maxDurationMs", "faultPlan", "expectedInvariants", "requiredCapabilities"], "Evaluation scenario");
  assertEvaluationVersion(Number(value.version));
  assertEvaluationId(String(value.scenarioId));
  assertRequiredString(value.category, "Evaluation scenario category");
  assertRequiredString(value.name, "Evaluation scenario name");
  if (value.targetMode !== "project-workspace" && value.targetMode !== "idea-lab") throw new Error("Invalid evaluation target mode");
  if (!Number.isInteger(value.maxDurationMs) || (value.maxDurationMs as number) <= 0) throw new Error("Evaluation maxDurationMs must be positive");
  if (!Array.isArray(value.faultPlan)) throw new Error("Evaluation faultPlan must be an array");
  for (const item of value.faultPlan) assertFaultPlanEntry(item);
  assertStringArray(value.expectedInvariants, "Evaluation expectedInvariants");
  assertStringArray(value.requiredCapabilities, "Evaluation requiredCapabilities");
}

export function assertEvaluationRun(value: unknown): asserts value is EvaluationRun {
  assertObject(value, "Evaluation run");
  assertExactKeys(value, ["version", "evaluationId", "suiteId", "scenarioId", "seed", "targetRunId", "targetCampaignId", "status", "startedAt", "completedAt", "injectedFaults", "metrics", "invariants", "summary"], "Evaluation run");
  assertEvaluationVersion(Number(value.version));
  for (const key of ["evaluationId", "suiteId", "scenarioId"] as const) assertEvaluationId(String(value[key]));
  assertRequiredString(value.seed, "Evaluation run seed");
  if (value.targetRunId !== undefined) assertEvaluationId(String(value.targetRunId));
  if (value.targetCampaignId !== undefined) assertEvaluationId(String(value.targetCampaignId));
  if (!RUN_STATUSES.has(value.status as EvaluationRunStatus)) throw new Error(`Invalid evaluation run status: ${String(value.status)}`);
  assertTimestamp(value.startedAt, "Evaluation run startedAt");
  if (value.completedAt !== undefined) assertTimestamp(value.completedAt, "Evaluation run completedAt");
  if (!Array.isArray(value.injectedFaults)) throw new Error("Evaluation injectedFaults must be an array");
  for (const item of value.injectedFaults) assertInjectedFault(item);
  assertMetrics(value.metrics);
  if (!Array.isArray(value.invariants)) throw new Error("Evaluation invariants must be an array");
  for (const item of value.invariants) assertInvariant(item);
  assertRequiredString(value.summary, "Evaluation run summary");
}

export function assertInjectedFault(value: unknown): asserts value is InjectedFault {
  assertObject(value, "Injected fault");
  assertExactKeys(value, ["faultId", "scenarioId", "seed", "boundary", "point", "occurrence", "action", "injectedAt"], "Injected fault");
  assertEvaluationId(String(value.faultId));
  assertEvaluationId(String(value.scenarioId));
  assertRequiredString(value.seed, "Injected fault seed");
  assertFaultPlanEntry({ boundary: value.boundary, point: value.point, occurrence: value.occurrence, action: value.action });
  assertTimestamp(value.injectedAt, "Injected fault injectedAt");
}

export function assertEvaluationObservation(value: unknown): asserts value is EvaluationObservation {
  assertObject(value, "Evaluation observation");
  assertExactKeys(value, ["version", "id", "evaluationId", "scenarioId", "type", "at", "summary", "reference"], "Evaluation observation");
  assertEvaluationVersion(Number(value.version));
  assertEvaluationId(String(value.id));
  assertEvaluationId(String(value.evaluationId));
  assertEvaluationId(String(value.scenarioId));
  const types = new Set<EvaluationEventType>(["evaluation-started", "fault-injected", "recovery-observed", "invariant-violated", "scenario-completed", "evaluation-completed"]);
  if (!types.has(value.type as EvaluationEventType)) throw new Error(`Invalid evaluation observation type: ${String(value.type)}`);
  assertTimestamp(value.at, "Evaluation observation at");
  assertRequiredString(value.summary, "Evaluation observation summary");
  if (value.reference !== undefined) assertRequiredString(value.reference, "Evaluation observation reference");
}

export function assertEvaluationReport(value: unknown): asserts value is EvaluationReport {
  assertObject(value, "Evaluation report");
  assertExactKeys(value, ["version", "evaluationId", "suiteId", "status", "startedAt", "completedAt", "metrics", "invariants", "scenarios", "liveBlockers", "summary"], "Evaluation report");
  assertEvaluationVersion(Number(value.version));
  assertEvaluationId(String(value.evaluationId));
  assertEvaluationId(String(value.suiteId));
  if (value.status !== "passed" && value.status !== "failed" && value.status !== "blocked-external") throw new Error("Invalid evaluation report status");
  assertTimestamp(value.startedAt, "Evaluation report startedAt");
  assertTimestamp(value.completedAt, "Evaluation report completedAt");
  assertMetrics(value.metrics);
  if (!Array.isArray(value.invariants)) throw new Error("Evaluation report invariants must be an array");
  for (const item of value.invariants) assertInvariant(item);
  if (!Array.isArray(value.scenarios)) throw new Error("Evaluation report scenarios must be an array");
  for (const item of value.scenarios) {
    assertObject(item, "Evaluation scenario summary");
    assertExactKeys(item, ["scenarioId", "evaluationId", "seed", "status", "diagnostic"], "Evaluation scenario summary");
    assertEvaluationId(String(item.scenarioId));
    assertEvaluationId(String(item.evaluationId));
    assertRequiredString(item.seed, "Evaluation scenario seed");
    if (!RUN_STATUSES.has(item.status as EvaluationRunStatus)) throw new Error("Invalid evaluation scenario status");
    if (item.diagnostic !== undefined) assertRequiredString(item.diagnostic, "Evaluation scenario diagnostic");
  }
  assertStringArray(value.liveBlockers, "Evaluation report liveBlockers");
  assertRequiredString(value.summary, "Evaluation report summary");
}
