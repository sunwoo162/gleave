import type {
  PrototypeDeployAdapter,
  PrototypeDeployRequest,
  PrototypeDeploymentReceipt,
} from "../deploy-adapter.js";

export function createFakePrototypeDeployAdapter(options: {
  loseFirstResponse?: boolean;
  now?: () => string;
} = {}): PrototypeDeployAdapter & { deployCalls: PrototypeDeployRequest[] } {
  const now = options.now ?? (() => new Date().toISOString());
  const receipts = new Map<string, PrototypeDeploymentReceipt>();
  const deployCalls: PrototypeDeployRequest[] = [];
  let loseFirstResponse = options.loseFirstResponse ?? false;
  return {
    deployCalls,
    async reconcile(input) {
      return receipts.get(input.key) ?? null;
    },
    async deploy(input) {
      deployCalls.push(structuredClone(input));
      const receipt: PrototypeDeploymentReceipt = {
        provider: "fake-preview",
        deploymentId: `dep-${input.productionId}`,
        url: `https://preview.invalid/${input.productionId}`,
        commitSha: input.commitSha,
        deployedAt: now(),
      };
      receipts.set(input.key, receipt);
      if (loseFirstResponse) {
        loseFirstResponse = false;
        throw new Error("Fake preview deploy response lost");
      }
      return receipt;
    },
    async verify(input) {
      const current = receipts.get(input.key);
      if (!current) throw new Error(`Fake preview deployment not found: ${input.key}`);
      return { ...current, verifiedAt: now() };
    },
  };
}
