import type { HarnessRuntimeRunEnvelope } from "../harness/contracts.js";
import { assertRunCompletionEvidence } from "../harness/completion-gates.js";
import { assertCheckHttpUrl } from "../desktop-agent/contracts.js";
import type { PrototypeCandidate } from "../project-model/contracts.js";
import { loadPrototypeCandidateUnlocked, savePrototypeCandidateUnlocked } from "../project-model/prototype-store.js";
import { withDurablePrototypeLock } from "../project-model/prototype-lock.js";
import type { IdeaProposal, PrototypeProduction } from "./contracts.js";
import type {
  PrototypeDeployAdapter,
  PrototypeDeployRequest,
  PrototypeDeploymentReceipt,
} from "./deploy-adapter.js";

export function prototypeDeploymentKey(production: PrototypeProduction): string {
  if (!production.commitSha?.trim()) throw new Error("Idea Lab production commit SHA is required for deployment");
  return `prototype:${production.campaignId}:${production.id}:${production.commitSha}`;
}

function deploymentRequest(production: PrototypeProduction): PrototypeDeployRequest {
  if (!production.commitSha?.trim()) throw new Error("Idea Lab production commit SHA is required for deployment");
  return {
    key: prototypeDeploymentKey(production),
    campaignId: production.campaignId,
    productionId: production.id,
    runId: production.runId,
    workspaceRoot: production.worktreeRoot,
    repositoryUrl: production.repositoryUrl,
    branch: production.branch,
    commitSha: production.commitSha,
  };
}
export async function deployPrototypeProduction(
  production: PrototypeProduction,
  adapter: PrototypeDeployAdapter,
): Promise<PrototypeDeploymentReceipt> {
  const request = deploymentRequest(production);
  const existing = await adapter.reconcile(request);
  if (existing) {
    if (existing.commitSha !== request.commitSha) {
      throw new Error("Idea Lab deployment reconcile commit mismatch");
    }
    assertPrototypeDeploymentUrl(existing.url);
    return existing;
  }
  const deployed = await adapter.deploy(request);
  if (deployed.commitSha !== request.commitSha) {
    throw new Error("Idea Lab deployment commit mismatch");
  }
  assertPrototypeDeploymentUrl(deployed.url);
  return deployed;
}

export function assertPrototypeDeploymentUrl(value: string): void {
  try {
    assertCheckHttpUrl(value);
  } catch {
    throw new Error("Idea Lab deployment URL is invalid");
  }
}

export async function verifyPrototypeProductionDeployment(
  production: PrototypeProduction,
  deployment: PrototypeDeploymentReceipt,
  adapter: PrototypeDeployAdapter,
): Promise<PrototypeDeploymentReceipt> {
  const request = deploymentRequest(production);
  if (deployment.commitSha !== request.commitSha) {
    throw new Error("Idea Lab deployment commit mismatch before verification");
  }
  const verified = await adapter.verify({ ...request, deployment });
  if (verified.commitSha !== request.commitSha) throw new Error("Idea Lab verified deployment commit mismatch");
  if (!verified.url.trim() || !verified.verifiedAt) throw new Error("Idea Lab verified deployment is incomplete");
  assertPrototypeDeploymentUrl(verified.url);
  return verified;
}
export type MaterializePrototypeCandidateInput = {
  modelRoot: string;
  production: PrototypeProduction;
  proposal: IdeaProposal;
  run: HarnessRuntimeRunEnvelope;
  deployment: PrototypeDeploymentReceipt;
  at: string;
};

function assertMaterializationInput(input: MaterializePrototypeCandidateInput): void {
  const { production, proposal, run, deployment } = input;
  if (run.request.mode !== "idea-lab") throw new Error("Prototype materialization requires an idea-lab Run");
  if (run.request.runId !== production.runId) throw new Error("Idea Lab production Run identity mismatch");
  if (run.state.status !== "DONE" || !run.state.completedStages.includes("PRODUCTION_VERIFY")) {
    throw new Error("Idea Lab Run must complete PRODUCTION_VERIFY before materialization");
  }
  assertRunCompletionEvidence(run.evidence, "idea-lab");
  if (proposal.id !== production.proposalId || proposal.campaignId !== production.campaignId) {
    throw new Error("Idea Lab proposal production identity mismatch");
  }
  if (!production.commitSha?.trim()) throw new Error("Idea Lab production commit SHA is required");
  if (deployment.commitSha !== production.commitSha) throw new Error("Idea Lab candidate deployment commit mismatch");
  if (!deployment.verifiedAt || !deployment.url.trim()) throw new Error("Idea Lab candidate requires verified preview deployment");
  assertPrototypeDeploymentUrl(deployment.url);
}

function candidateFor(input: MaterializePrototypeCandidateInput): PrototypeCandidate {
  return {
    version: 1,
    id: input.production.id,
    title: input.proposal.title,
    concept: input.proposal.concept,
    repository: {
      url: input.production.repositoryUrl,
      branch: input.production.branch,
      commitSha: input.production.commitSha!,
    },
    deployment: {
      url: input.deployment.url,
      provider: input.deployment.provider,
      deploymentId: input.deployment.deploymentId,
    },
    ...(input.deployment.provider === "local-preview"
      ? {
          browserAcceptance: {
            status: "unverified" as const,
            checkedAt: input.at,
            checks: {
              add: "unverified" as const,
              edit: "unverified" as const,
              complete: "unverified" as const,
              delete: "unverified" as const,
              persistence: "unverified" as const,
              "empty-state": "unverified" as const,
              "empty-input": "unverified" as const,
              responsive: "unverified" as const,
            },
          },
        }
      : {}),
    runIds: [input.production.runId],
    status: "candidate",
    ideaLabOrigin: {
      campaignId: input.production.campaignId,
      proposalId: input.production.proposalId,
      productionId: input.production.id,
    },
    createdAt: input.at,
    updatedAt: input.at,
  };
}

function immutableCandidateIdentity(candidate: PrototypeCandidate): string {
  return JSON.stringify({
    repository: candidate.repository,
    deployment: candidate.deployment,
    runIds: candidate.runIds,
    ideaLabOrigin: candidate.ideaLabOrigin ?? null,
  });
}

export async function materializePrototypeCandidate(
  input: MaterializePrototypeCandidateInput,
): Promise<PrototypeCandidate> {
  assertMaterializationInput(input);
  return withDurablePrototypeLock(input.modelRoot, input.production.id, async () => {
    const next = candidateFor(input);
    const existing = await loadPrototypeCandidateUnlocked(input.modelRoot, next.id);
    if (existing) {
      if (immutableCandidateIdentity(existing) !== immutableCandidateIdentity(next)) {
        throw new Error(`Idea Lab prototype identity conflict: ${next.id}`);
      }
      return existing;
    }
    await savePrototypeCandidateUnlocked(input.modelRoot, next);
    return next;
  }, { waitForMs: 2_000 });
}
