import { createHash } from "node:crypto";
import {
  assertEvaluationId,
  assertFaultPlanEntry,
  assertInjectedFault,
  type EvaluationFaultAction,
  type EvaluationFaultBoundary,
  type FaultPlanEntry,
  type InjectedFault,
} from "./contracts.js";

export type { FaultPlanEntry } from "./contracts.js";

export type FaultPoint = {
  boundary: EvaluationFaultBoundary;
  point: string;
  occurrence: number;
};

export type FaultDecision =
  | { action: "none" }
  | { action: EvaluationFaultAction; faultId: string };

export type EvaluationFaultInjector = {
  hit(point: FaultPoint): Promise<FaultDecision>;
};

export type DeterministicFaultInjectorInput = {
  scenarioId: string;
  seed: string;
  plan: FaultPlanEntry[];
  recordFault(fault: InjectedFault): Promise<void> | void;
  now?: () => string;
};

function assertFaultPoint(point: FaultPoint): void {
  assertFaultPlanEntry({ ...point, action: "drop-response" });
}

function faultIdFor(input: {
  scenarioId: string;
  seed: string;
  entry: FaultPlanEntry;
}): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({
      scenarioId: input.scenarioId,
      seed: input.seed,
      boundary: input.entry.boundary,
      point: input.entry.point,
      occurrence: input.entry.occurrence,
      action: input.entry.action,
    }))
    .digest("hex")
    .slice(0, 24);
  return `fault-${digest}`;
}

function semanticKey(entry: Pick<FaultPlanEntry, "boundary" | "point" | "occurrence">): string {
  return `${entry.boundary}\u0000${entry.point}\u0000${entry.occurrence}`;
}

export function createDeterministicFaultInjector(
  input: DeterministicFaultInjectorInput,
): EvaluationFaultInjector {
  assertEvaluationId(input.scenarioId);
  if (typeof input.seed !== "string" || !input.seed.trim()) {
    throw new Error("Evaluation fault injector seed is required");
  }
  if (!Array.isArray(input.plan)) throw new Error("Evaluation fault plan must be an array");
  if (typeof input.recordFault !== "function") throw new Error("Evaluation fault recorder is required");

  const entries = new Map<string, FaultPlanEntry>();
  for (const entry of input.plan) {
    assertFaultPlanEntry(entry);
    const key = semanticKey(entry);
    if (entries.has(key)) throw new Error(`Duplicate evaluation fault point: ${entry.boundary}/${entry.point}/${entry.occurrence}`);
    entries.set(key, { ...entry });
  }

  const now = input.now ?? (() => new Date().toISOString());
  const recorded = new Set<string>();

  return {
    async hit(point: FaultPoint): Promise<FaultDecision> {
      assertFaultPoint(point);
      const entry = entries.get(semanticKey(point));
      if (!entry) return { action: "none" };

      const fault: InjectedFault = {
        faultId: faultIdFor({ scenarioId: input.scenarioId, seed: input.seed, entry }),
        scenarioId: input.scenarioId,
        seed: input.seed,
        boundary: entry.boundary,
        point: entry.point,
        occurrence: entry.occurrence,
        action: entry.action,
        injectedAt: now(),
      };
      assertInjectedFault(fault);
      if (!recorded.has(fault.faultId)) {
        await input.recordFault(fault);
        recorded.add(fault.faultId);
      }
      return { action: entry.action, faultId: fault.faultId };
    },
  };
}
