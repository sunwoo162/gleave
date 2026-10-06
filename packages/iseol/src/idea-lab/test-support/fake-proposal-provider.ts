import {
  assertIdeaProposalDraft,
  assertIdeaProposalProviderResult,
  type IdeaProposalDraft,
  type IdeaProposalProvider,
  type IdeaProposalProviderInput,
} from "../proposal-provider.js";

export class FakeIdeaProposalProvider implements IdeaProposalProvider {
  readonly calls: IdeaProposalProviderInput[] = [];
  private readonly batches: IdeaProposalDraft[][];

  constructor(batches: IdeaProposalDraft[][]) {
    this.batches = batches.map((batch) => batch.map((item) => ({ ...item })));
    this.batches.flat().forEach(assertIdeaProposalDraft);
  }

  async generate(input: IdeaProposalProviderInput): Promise<IdeaProposalDraft[]> {
    this.calls.push(structuredClone(input));
    const batch = this.batches[this.calls.length - 1] ?? [];
    assertIdeaProposalProviderResult(batch, input.requestedCount);
    return batch.map((item) => ({ ...item }));
  }
}
