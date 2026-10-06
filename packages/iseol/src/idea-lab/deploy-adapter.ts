export type PrototypeDeployRequest = {
  key: string;
  campaignId: string;
  productionId: string;
  repositoryUrl: string;
  branch: string;
  commitSha: string;
  runId?: string;
  workspaceRoot?: string;
};

export type PrototypeDeploymentReceipt = {
  provider: string;
  deploymentId: string;
  url: string;
  commitSha: string;
  deployedAt: string;
  verifiedAt?: string;
};

export interface PrototypeDeployAdapter {
  reconcile(input: PrototypeDeployRequest): Promise<PrototypeDeploymentReceipt | null>;
  deploy(input: PrototypeDeployRequest): Promise<PrototypeDeploymentReceipt>;
  verify(input: PrototypeDeployRequest & { deployment: PrototypeDeploymentReceipt }): Promise<PrototypeDeploymentReceipt>;
}
