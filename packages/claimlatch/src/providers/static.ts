import type { Claim, Evidence, EvidenceProvider } from "../types.js";

export class StaticEvidenceProvider implements EvidenceProvider {
  readonly #resolver: (claim: Claim) => Evidence[] | Promise<Evidence[]>;

  constructor(resolver: (claim: Claim) => Evidence[] | Promise<Evidence[]>) {
    this.#resolver = resolver;
  }

  search(claim: Claim): Promise<Evidence[]> {
    return Promise.resolve(this.#resolver(claim));
  }
}
