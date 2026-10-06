import type {
  HarnessPreflightRecord,
  HarnessRunStage,
  HarnessRunState,
} from "./contracts.js";

export const HARNESS_STAGE_ORDER: HarnessRunStage[] = [
  "PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN", "IMPLEMENT", "TEST",
  "SELF_REVIEW", "COMMIT", "PR", "CI", "MERGE", "DEPLOY",
  "PRODUCTION_VERIFY", "DONE",
];

export type HarnessRunTransition =
  | { type: "start"; at: string }
  | { type: "complete-stage"; at: string }
  | { type: "skip-stage"; at: string; reason: string }
  | { type: "pause"; at: string; reason?: string }
  | { type: "resume"; at: string }
  | { type: "wait-external"; at: string; reason: string }
  | { type: "wait-agent"; at: string; reason: string }
  | { type: "block-user"; at: string; reason: string }
  | { type: "retryable-failure"; at: string; reason: string }
  | { type: "final-failure"; at: string; reason: string }
  | { type: "recover"; at: string; reason?: string }
  | { type: "cancel"; at: string; reason?: string };export function nextHarnessStage(stage: HarnessRunStage): HarnessRunStage | null {
  const index = HARNESS_STAGE_ORDER.indexOf(stage);
  if (index < 0 || index === HARNESS_STAGE_ORDER.length - 1) return null;
  return HARNESS_STAGE_ORDER[index + 1] ?? null;
}

export function createInitialRunState(
  preflight: HarnessPreflightRecord,
  now: string,
): HarnessRunState {
  if (preflight.status === "ready") {
    return {
      version: 1,
      stage: "CONTEXT",
      status: "READY",
      completedStages: ["PREFLIGHT"],
      skippedStages: [],
      updatedAt: now,
    };
  }

  return {
    version: 1,
    stage: "PREFLIGHT",
    status: "BLOCKED_USER",
    completedStages: [],
    skippedStages: [],
    updatedAt: now,
    reason: preflight.reason ?? "Harness preflight is blocked",
  };
}

function ensureMutable(state: HarnessRunState): void {
  if (state.status === "DONE" || state.status === "CANCELLED" || state.status === "FAILED_FINAL") {
    throw new Error(`Run state is terminal: ${state.status}`);
  }
}function advanceStage(
  state: HarnessRunState,
  at: string,
  skippedReason?: string,
): HarnessRunState {
  if (state.status !== "RUNNING") {
    throw new Error(`Stage completion requires RUNNING status, got ${state.status}`);
  }
  if (state.stage === "DONE") throw new Error("DONE stage is terminal");

  const next = nextHarnessStage(state.stage);
  if (!next) throw new Error(`No next stage after ${state.stage}`);

  const completedStages = [...state.completedStages];
  const skippedStages = [...state.skippedStages];
  if (skippedReason !== undefined) {
    if (!skippedReason.trim()) throw new Error("Stage skip reason is required");
    skippedStages.push({ stage: state.stage, reason: skippedReason, at });
  } else if (!completedStages.includes(state.stage)) {
    completedStages.push(state.stage);
  }

  const { reason: _reason, ...withoutReason } = state;
  return {
    ...withoutReason,
    stage: next,
    status: next === "DONE" ? "DONE" : "RUNNING",
    completedStages,
    skippedStages,
    updatedAt: at,
  };
}

export function transitionRunState(
  state: HarnessRunState,
  command: HarnessRunTransition,
): HarnessRunState {
  ensureMutable(state);

  switch (command.type) {
    case "start":
      if (state.status !== "READY" && state.status !== "FAILED_RETRYABLE") {
        throw new Error(`Run start requires READY or FAILED_RETRYABLE status, got ${state.status}`);
      }
      {
        const { reason: _reason, ...withoutReason } = state;
        return { ...withoutReason, status: "RUNNING", updatedAt: command.at };
      }
    case "complete-stage":
      return advanceStage(state, command.at);
    case "skip-stage":
      return advanceStage(state, command.at, command.reason);
    case "pause": {
      if (state.status !== "RUNNING" && state.status !== "READY") {
        throw new Error(`Run pause requires RUNNING or READY status, got ${state.status}`);
      }
      const { reason: _reason, ...withoutReason } = state;
      return {
        ...withoutReason,
        status: "PAUSED",
        updatedAt: command.at,
        ...(command.reason === undefined ? {} : { reason: command.reason }),
      };
    }
    case "resume": {
      if (
        state.status !== "PAUSED"
        && state.status !== "WAITING_EXTERNAL"
        && state.status !== "WAITING_AGENT"
        && state.status !== "BLOCKED_USER"
        && state.status !== "RECOVERING"
      ) {
        throw new Error(`Run resume is not allowed from ${state.status}`);
      }
      const { reason: _reason, ...withoutReason } = state;
      return { ...withoutReason, status: "READY", updatedAt: command.at };
    }
    default:
      break;
  }

  const reason = "reason" in command ? command.reason : undefined;
  const statusByType = {
    "wait-external": "WAITING_EXTERNAL",
    "wait-agent": "WAITING_AGENT",
    "block-user": "BLOCKED_USER",
    "retryable-failure": "FAILED_RETRYABLE",
    "final-failure": "FAILED_FINAL",
    recover: "RECOVERING",
    cancel: "CANCELLED",
  } as const;

  const status = statusByType[command.type];
  if (!status) throw new Error(`Unsupported Run transition: ${String(command.type)}`);
  const { reason: _reason, ...withoutReason } = state;
  return {
    ...withoutReason,
    status,
    updatedAt: command.at,
    ...(reason === undefined ? {} : { reason }),
  };
}