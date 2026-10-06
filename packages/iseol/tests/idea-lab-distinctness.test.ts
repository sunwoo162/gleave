import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateProposalDistinctness,
  normalizeProposalField,
  proposalFingerprint,
} from "../src/idea-lab/distinctness.js";
import {
  assertIdeaProposalDraft,
  type IdeaProposalDraft,
} from "../src/idea-lab/proposal-provider.js";
import { FakeIdeaProposalProvider } from "../src/idea-lab/test-support/fake-proposal-provider.js";

function draft(overrides: Partial<IdeaProposalDraft> = {}): IdeaProposalDraft {
  return {
    title: "Focus Loop",
    concept: "Plan and review study sessions",
    problemDomain: "Study Planning",
    targetUser: "High school students",
    jobToBeDone: "Plan focused study blocks",
    coreInteractionLoop: "plan -> focus -> review",
    dataModel: "sessions and reflections",
    primaryDifferentiator: "adaptive reflection",
    whyMateriallyDifferent: "Reflection drives the next session",
    ...overrides,
  };
}

test("proposal normalization and fingerprint ignore cosmetic formatting", () => {
  assert.equal(normalizeProposalField("  Study---Planning!!  "), "study planning");
  const first = draft();
  const cosmetic = draft({ title: "Blue Focus", concept: "Same flow in blue" });
  assert.equal(proposalFingerprint(first), proposalFingerprint(cosmetic));
});test("near-identical proposals are rejected before production", () => {
  const accepted = [draft()];
  const nearDuplicate = draft({ primaryDifferentiator: "manual reflection" });
  const result = evaluateProposalDistinctness(nearDuplicate, accepted);
  assert.equal(result.distinct, false);
  assert.match(result.reason ?? "", /near-duplicate/i);

  const different = draft({
    problemDomain: "peer tutoring",
    targetUser: "students seeking help",
    jobToBeDone: "match with a peer tutor",
    coreInteractionLoop: "request -> match -> session -> rate",
    primaryDifferentiator: "skill-based peer matching",
  });
  assert.equal(evaluateProposalDistinctness(different, accepted).distinct, true);
});

test("proposal draft validation rejects hidden reasoning and credential-shaped fields", () => {
  assert.doesNotThrow(() => assertIdeaProposalDraft(draft()));
  assert.throws(() => assertIdeaProposalDraft({ ...draft(), reasoning: "secret chain" }), /unknown field/i);
  assert.throws(() => assertIdeaProposalDraft({ ...draft(), token: "secret" }), /unknown field/i);
  assert.throws(() => assertIdeaProposalDraft({ ...draft(), cookie: "secret" }), /unknown field/i);
  assert.throws(() => assertIdeaProposalDraft({ ...draft(), prompt: "raw prompt" }), /unknown field/i);
  assert.throws(() => assertIdeaProposalDraft({ ...draft(), targetUser: "" }), /targetUser/i);
});

test("fake proposal provider returns bounded scripted drafts and records attempts", async () => {
  const provider = new FakeIdeaProposalProvider([[draft(), draft({ title: "Second" })]]);
  const result = await provider.generate({
    seed: "student tools",
    constraints: ["web"],
    requestedCount: 2,
    accepted: [],
    attempt: 1,
  });
  assert.equal(result.length, 2);
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0]?.attempt, 1);
});