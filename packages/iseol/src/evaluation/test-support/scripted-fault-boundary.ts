import type { EvaluationFaultBoundary } from "../contracts.js";
import type { EvaluationFaultInjector, FaultDecision } from "../fault-injector.js";

export type ScriptedFaultBoundary = {
  hit(point: string): Promise<FaultDecision>;
};

export function createScriptedFaultBoundary(input: {
  boundary: EvaluationFaultBoundary;
  injector: EvaluationFaultInjector;
}): ScriptedFaultBoundary {
  const occurrences = new Map<string, number>();
  return {
    async hit(point: string): Promise<FaultDecision> {
      const occurrence = (occurrences.get(point) ?? 0) + 1;
      occurrences.set(point, occurrence);
      return input.injector.hit({ boundary: input.boundary, point, occurrence });
    },
  };
}
