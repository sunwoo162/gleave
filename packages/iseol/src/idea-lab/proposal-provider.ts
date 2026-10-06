export type IdeaProposalDraft = {
  title: string;
  concept: string;
  problemDomain: string;
  targetUser: string;
  jobToBeDone: string;
  coreInteractionLoop: string;
  dataModel: string;
  primaryDifferentiator: string;
  whyMateriallyDifferent: string;
};

export type IdeaProposalProviderInput = {
  seed: string;
  constraints: string[];
  requestedCount: number;
  accepted: IdeaProposalDraft[];
  attempt: number;
  /** Durable identity used when this provider reserves an external request. */
  budgetIdentity?: string;
};

export interface IdeaProposalProvider {
  generate(input: IdeaProposalProviderInput): Promise<IdeaProposalDraft[]>;
}

const DRAFT_KEYS = [
  "title", "concept", "problemDomain", "targetUser", "jobToBeDone",
  "coreInteractionLoop", "dataModel", "primaryDifferentiator", "whyMateriallyDifferent",
] as const;

export function assertIdeaProposalDraft(value: unknown): asserts value is IdeaProposalDraft {
  if (!value || typeof value !== "object") throw new Error("Idea proposal draft must be an object");
  const item = value as Record<string, unknown>;
  const allowed = new Set<string>(DRAFT_KEYS);
  for (const key of Object.keys(item)) {
    if (!allowed.has(key)) throw new Error(`Idea proposal draft contains unknown field: ${key}`);
  }
  for (const key of DRAFT_KEYS) {
    if (typeof item[key] !== "string" || !item[key].trim()) {
      throw new Error(`Idea proposal draft ${key} is required`);
    }
  }
}

export function assertIdeaProposalProviderResult(value: unknown, requestedCount: number): asserts value is IdeaProposalDraft[] {
  if (!Array.isArray(value)) throw new Error("Idea proposal provider result must be an array");
  if (value.length === 0 || value.length > requestedCount) {
    throw new Error(`Idea proposal provider returned invalid count: ${value.length}`);
  }
  value.forEach(assertIdeaProposalDraft);
}
