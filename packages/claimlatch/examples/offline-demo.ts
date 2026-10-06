import { ClaimLatch } from "../src/gate.js";
import type { ClaimExtractor, ClaimVerifier, EvidenceProvider } from "../src/types.js";

const extractor: ClaimExtractor = {
  async extract() {
    return [
      { id: "claim_1", text: "The release happened on September 1.", kind: "date", importance: "critical" },
      { id: "claim_2", text: "The product supports feature X.", kind: "fact", importance: "normal" },
    ];
  },
};

const evidenceProvider: EvidenceProvider = {
  async search(claim) {
    return [
      {
        id: `${claim.id}_ev_1`,
        claimId: claim.id,
        title: "Example primary source",
        url: "https://example.test/source",
        snippet: claim.id === "claim_1" ? "Released September 1." : "Feature X is not supported.",
        sourceType: "primary",
        retrievedAt: new Date().toISOString(),
        provider: "offline-demo",
      },
    ];
  },
};

const verifier: ClaimVerifier = {
  async verify({ claim, evidence }) {
    const status = claim.id === "claim_1" ? "SUPPORTED" : "CONTRADICTED";
    return {
      claim,
      status,
      reason: status === "SUPPORTED" ? "The source states the same date." : "The source explicitly says feature X is not supported.",
      evidenceIds: evidence.map((item) => item.id),
      evidence,
    };
  },
};

const gate = new ClaimLatch({ extractor, evidenceProvider, verifier });
const report = await gate.verify({ question: "Example?", answer: "Draft answer" });
console.log(JSON.stringify(report, null, 2));
