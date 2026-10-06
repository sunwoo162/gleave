export const SHUTDOWN_PHASE_TIMEOUT_MS = 2_000;

export const SHUTDOWN_STAGES = [
  "web-server",
  "chatgpt-bridge",
  "idea-lab-runtime",
  "deploy-adapter",
  "desktop-core",
  "browser",
] as const;

export type ShutdownStage = (typeof SHUTDOWN_STAGES)[number];
export type ShutdownEvent = "started" | "completed" | "failed" | "timed-out" | "summary";
export type ShutdownFailureClass = "timeout" | "dispose-error";

export type ShutdownDiagnostic = {
  version: 1;
  at: string;
  event: ShutdownEvent;
  stage?: ShutdownStage;
  elapsedMs: number;
  timeoutMs: number;
  ok: boolean;
  failureClass?: ShutdownFailureClass;
  lastCompletedStage?: ShutdownStage;
  remainingStages: ShutdownStage[];
};

export type ShutdownStageAction = {
  name: ShutdownStage;
  dispose: () => Promise<void>;
};

export class ShutdownDisposeError extends Error {
  readonly stage: ShutdownStage;
  readonly failureClass: ShutdownFailureClass;
  readonly lastCompletedStage?: ShutdownStage;
  readonly remainingStages: ShutdownStage[];

  constructor(input: {
    stage: ShutdownStage;
    failureClass: ShutdownFailureClass;
    lastCompletedStage?: ShutdownStage;
    remainingStages: ShutdownStage[];
  }) {
    super(`Runtime shutdown phase ${input.stage} ${input.failureClass}`);
    this.name = "ShutdownDisposeError";
    this.stage = input.stage;
    this.failureClass = input.failureClass;
    this.lastCompletedStage = input.lastCompletedStage;
    this.remainingStages = [...input.remainingStages];
  }
}

type DisposeInput = {
  stages: readonly ShutdownStageAction[];
  stageTimeoutMs?: number;
  record?: (event: ShutdownDiagnostic) => void;
};

function assertTimeout(value: number): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error("shutdown stage timeout must be a positive integer");
}

function event(input: Omit<ShutdownDiagnostic, "version" | "at">): ShutdownDiagnostic {
  return { version: 1, at: new Date().toISOString(), ...input };
}

async function boundedDispose(action: () => Promise<void>, timeoutMs: number): Promise<"completed" | "failed" | "timed-out"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  const disposal = Promise.resolve().then(action);
  disposal.catch(() => undefined);
  return new Promise<"completed" | "failed" | "timed-out">((resolve) => {
    const finish = (result: "completed" | "failed" | "timed-out") => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    timer = setTimeout(() => finish("timed-out"), timeoutMs);
    disposal.then(() => finish("completed"), () => finish("failed"));
  });
}

export async function disposeWithShutdownDiagnostics(input: DisposeInput): Promise<void> {
  const timeoutMs = input.stageTimeoutMs ?? SHUTDOWN_PHASE_TIMEOUT_MS;
  assertTimeout(timeoutMs);
  const stages = [...input.stages];
  const shutdownStartedAt = Date.now();
  let lastCompletedStage: ShutdownStage | undefined;
  let firstFailure: ShutdownDisposeError | undefined;

  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index]!;
    const remainingAfter = stages.slice(index + 1).map((item) => item.name);
    const startedAt = Date.now();
    input.record?.(event({
      event: "started",
      stage: stage.name,
      elapsedMs: 0,
      timeoutMs,
      ok: false,
      ...(lastCompletedStage ? { lastCompletedStage } : {}),
      remainingStages: [stage.name, ...remainingAfter],
    }));

    const outcome = await boundedDispose(stage.dispose, timeoutMs);
    const elapsedMs = Date.now() - startedAt;
    if (outcome === "timed-out") {
      const failure = new ShutdownDisposeError({
        stage: stage.name,
        failureClass: "timeout",
        ...(lastCompletedStage ? { lastCompletedStage } : {}),
        remainingStages: remainingAfter,
      });
      input.record?.(event({
        event: "timed-out",
        stage: stage.name,
        elapsedMs,
        timeoutMs,
        ok: false,
        failureClass: "timeout",
        ...(lastCompletedStage ? { lastCompletedStage } : {}),
        remainingStages: remainingAfter,
      }));
      input.record?.(event({
        event: "summary",
        elapsedMs,
        timeoutMs,
        ok: false,
        failureClass: "timeout",
        ...(lastCompletedStage ? { lastCompletedStage } : {}),
        remainingStages: [stage.name, ...remainingAfter],
      }));
      throw failure;
    }

    if (outcome === "failed") {
      const failure = new ShutdownDisposeError({
        stage: stage.name,
        failureClass: "dispose-error",
        ...(lastCompletedStage ? { lastCompletedStage } : {}),
        remainingStages: remainingAfter,
      });
      input.record?.(event({
        event: "failed",
        stage: stage.name,
        elapsedMs,
        timeoutMs,
        ok: false,
        failureClass: "dispose-error",
        ...(lastCompletedStage ? { lastCompletedStage } : {}),
        remainingStages: remainingAfter,
      }));
      firstFailure ??= failure;
      continue;
    }

    lastCompletedStage = stage.name;
    input.record?.(event({
      event: "completed",
      stage: stage.name,
      elapsedMs,
      timeoutMs,
      ok: true,
      lastCompletedStage,
      remainingStages: remainingAfter,
    }));
  }

  input.record?.(event({
    event: "summary",
    elapsedMs: Date.now() - shutdownStartedAt,
    timeoutMs,
    ok: firstFailure === undefined,
    ...(firstFailure?.failureClass ? { failureClass: firstFailure.failureClass } : {}),
    ...(lastCompletedStage ? { lastCompletedStage } : {}),
    remainingStages: [],
  }));
  if (firstFailure) throw firstFailure;
}
