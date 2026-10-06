import type { IdeaProposalDraft } from "./proposal-provider.js";

const STRUCTURAL_FIELDS = [
  "problemDomain",
  "targetUser",
  "jobToBeDone",
  "coreInteractionLoop",
  "primaryDifferentiator",
] as const satisfies readonly (keyof IdeaProposalDraft)[];

export function normalizeProposalField(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function proposalFingerprint(proposal: IdeaProposalDraft): string {
  return STRUCTURAL_FIELDS.map((field) => normalizeProposalField(proposal[field])).join("|");
}

export type ProposalDistinctnessResult = {
  distinct: boolean;
  reason?: string;
  matchedFields?: number;
};

export function evaluateProposalDistinctness(
  candidate: IdeaProposalDraft,
  accepted: IdeaProposalDraft[],
): ProposalDistinctnessResult {
  const fingerprint = proposalFingerprint(candidate);
  for (const existing of accepted) {
    if (proposalFingerprint(existing) === fingerprint) {
      return { distinct: false, reason: "Exact structural duplicate", matchedFields: STRUCTURAL_FIELDS.length };
    }
    const matchedFields = STRUCTURAL_FIELDS.filter(
      (field) => normalizeProposalField(candidate[field]) === normalizeProposalField(existing[field]),
    ).length;
    if (matchedFields >= 4) {
      return { distinct: false, reason: `Near-duplicate proposal (${matchedFields}/5 structural fields match)`, matchedFields };
    }
  }
  return { distinct: true };
}
