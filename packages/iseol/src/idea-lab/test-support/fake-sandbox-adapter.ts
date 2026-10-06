import type {
  PrototypeSandboxAdapter,
  PrototypeSandboxAllocateInput,
  PrototypeSandboxAllocation,
} from "../sandbox-adapter.js";
import { prototypeSandboxBranch } from "../sandbox-adapter.js";

export function createFakePrototypeSandboxAdapter(): PrototypeSandboxAdapter & {
  allocations: PrototypeSandboxAllocateInput[];
} {
  const allocations: PrototypeSandboxAllocateInput[] = [];
  const result = (input: PrototypeSandboxAllocateInput): PrototypeSandboxAllocation => ({
    repositoryUrl: input.repositoryUrl,
    branch: prototypeSandboxBranch(input.campaignId, input.productionId),
    worktreeRoot: input.run.request.targetRoot,
    baseRef: input.baseRef,
  });
  return {
    allocations,
    async allocate(input) {
      allocations.push(structuredClone(input));
      return result(input);
    },
    async inspect(input) {
      const exists = allocations.some((item) =>
        item.campaignId === input.campaignId && item.productionId === input.productionId,
      );
      return exists ? result(input) : null;
    },
  };
}
