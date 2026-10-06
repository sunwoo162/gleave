import assert from "node:assert/strict";
import test from "node:test";
import {
  ChatGptWebAuthenticationRequiredError,
  ChatGptWebSessionLostError,
  ChatGptWebStructuredResultError,
} from "../src/chatgpt-web/browser-adapter.js";
import type { ChatGptBrowserDriver } from "../src/chatgpt-web/production-browser-adapter.js";
import { createChatGptIdeaProposalProvider } from "../src/idea-lab/chatgpt-proposal-provider.js";
import type { IdeaProposalDraft } from "../src/idea-lab/proposal-provider.js";
import { createRequestBudgetStore, ExternalRequestBudgetExhaustedError, ExternalRequestOutcomeUnknownError } from "../src/chatgpt-web/request-budget.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const draft: IdeaProposalDraft = {
  title: "Quiet Queue",
  concept: "A focus-aware queue for tiny personal tasks.",
  problemDomain: "personal productivity",
  targetUser: "students with fragmented study time",
  jobToBeDone: "pick the next useful task without replanning",
  coreInteractionLoop: "capture, rank, finish, learn",
  dataModel: "tasks, contexts, completion signals",
  primaryDifferentiator: "context-sensitive task shrinking",
  whyMateriallyDifferent: "It changes task granularity instead of only sorting a list.",
};

function driver(overrides: Partial<ChatGptBrowserDriver> = {}) {
  const calls: Array<[string, unknown?]> = [];
  const base: ChatGptBrowserDriver = {
    openOrResumeConversation: async (input) => { calls.push(["open", input]); return {}; },
    submitPrompt: async (input) => { calls.push(["submit", input]); return { conversationRef: "proposal-conv" }; },
    readStructuredResult: async (input) => { calls.push(["read", input]); return [draft]; },
    probeConversation: async () => "ready",
    closeConversation: async (ref) => { calls.push(["close", ref]); },
  };
  return { calls, value: { ...base, ...overrides } as ChatGptBrowserDriver };
}
test("provider compiles bounded proposal context and uses the first assigned conversation ref", async () => {
  const fake = driver();
  const provider = createChatGptIdeaProposalProvider(fake.value, { timeoutMs: 4321 });
  const result = await provider.generate({
    seed: "camp-seed",
    constraints: ["mobile-first", "no social feed"],
    requestedCount: 1,
    accepted: [{ ...draft, title: "Already Accepted" }],
    attempt: 3,
  });

  assert.deepEqual(result, [draft]);
  assert.deepEqual(fake.calls.map(([name]) => name), ["open", "submit", "read", "close"]);
  const open = fake.calls[0]![1] as { prompt: string; promptSha256: string };
  const submit = fake.calls[1]![1] as { prompt: string; promptSha256: string };
  assert.equal(submit.prompt, open.prompt);
  assert.equal(submit.promptSha256, open.promptSha256);
  assert.match(open.prompt, /camp-seed/);
  assert.match(open.prompt, /mobile-first/);
  assert.match(open.prompt, /Already Accepted/);
  assert.match(open.prompt, /materially different/i);
  const read = fake.calls[2]![1] as { requestId: string; conversationRef: string; timeoutMs: number; contract: string };
  assert.match(read.requestId, /^proposal-[a-f0-9]{48}-3$/);
  assert.deepEqual({ conversationRef: read.conversationRef, timeoutMs: read.timeoutMs, contract: read.contract }, { conversationRef: "proposal-conv", timeoutMs: 4321, contract: "structured-json" });
  assert.equal(fake.calls[3]![1], "proposal-conv");
});
test("provider rejects invalid proposal payloads and still closes the owned conversation", async () => {
  const invalidPayloads: unknown[] = [
    { ...draft },
    [{ ...draft, extra: "nope" }],
    [draft, { ...draft, title: "Second" }],
  ];
  for (const payload of invalidPayloads) {
    const fake = driver({ readStructuredResult: async () => payload });
    const provider = createChatGptIdeaProposalProvider(fake.value);
    await assert.rejects(() => provider.generate({
      seed: "seed", constraints: [], requestedCount: 1, accepted: [], attempt: 1,
    }));
    assert.deepEqual(fake.calls.filter(([name]) => name === "close"), [["close", "proposal-conv"]]);
  }
});

test("provider propagates browser errors and closes after a conversation exists", async () => {
  for (const error of [
    new ChatGptWebAuthenticationRequiredError("login required"),
    new ChatGptWebSessionLostError("session lost"),
    new ChatGptWebStructuredResultError("prose is not structured JSON"),
  ]) {
    const fake = driver({ readStructuredResult: async () => { throw error; } });
    const provider = createChatGptIdeaProposalProvider(fake.value);
    await assert.rejects(() => provider.generate({
      seed: "seed", constraints: [], requestedCount: 1, accepted: [], attempt: 1,
    }), (actual) => actual === error);
    assert.deepEqual(fake.calls.filter(([name]) => name === "close"), [["close", "proposal-conv"]]);
  }
});
test("provider fails closed when first submit does not produce a conversation ref", async () => {
  const fake = driver({ submitPrompt: async (input) => { fake.calls.push(["submit", input]); return {}; } });
  const provider = createChatGptIdeaProposalProvider(fake.value);
  await assert.rejects(() => provider.generate({
    seed: "seed", constraints: [], requestedCount: 1, accepted: [], attempt: 1,
  }), ChatGptWebSessionLostError);
  assert.deepEqual(fake.calls.map(([name]) => name), ["open", "submit"]);
});

test("provider preserves the primary browser failure when cleanup also fails", async () => {
  const primary = new ChatGptWebAuthenticationRequiredError("auth expired");
  const fake = driver({
    readStructuredResult: async () => { throw primary; },
    closeConversation: async () => { throw new Error("close failed"); },
  });
  const provider = createChatGptIdeaProposalProvider(fake.value);
  await assert.rejects(() => provider.generate({
    seed: "seed", constraints: [], requestedCount: 1, accepted: [], attempt: 1,
  }), (actual) => actual === primary);
});

test("provider rejects invalid or oversized request context before opening ChatGPT", async () => {
  for (const input of [
    { seed: "seed", constraints: [], requestedCount: 0, accepted: [], attempt: 1 },
    { seed: "x".repeat(140 * 1024), constraints: [], requestedCount: 1, accepted: [], attempt: 1 },
  ]) {
    const fake = driver();
    const provider = createChatGptIdeaProposalProvider(fake.value);
    await assert.rejects(() => provider.generate(input), /requestedCount|context/i);
    assert.deepEqual(fake.calls, []);
  }
});

test("proposal submissions consume one common budget and UNKNOWN blocks resubmission", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-proposal-budget-"));
  try {
    let submitCount = 0;
    const fake = driver({
      submitPrompt: async (input) => { submitCount += 1; return { conversationRef: "proposal-conv" }; },
      readStructuredResult: async () => { throw new ChatGptWebSessionLostError("result unavailable"); },
    });
    const budget = createRequestBudgetStore(root, 1);
    const provider = createChatGptIdeaProposalProvider(fake.value, { requestBudget: budget });
    const input = { seed: "seed", constraints: [], requestedCount: 1, accepted: [], attempt: 1, budgetIdentity: "campaign-camp-1" };
    await assert.rejects(() => provider.generate(input), ExternalRequestOutcomeUnknownError);
    const record = await budget.inspect("campaign-camp-1");
    assert.equal(record?.unknown, 1);
    await assert.rejects(() => provider.generate(input), ExternalRequestBudgetExhaustedError);
    assert.equal(submitCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("identical proposal prompts in different campaigns use distinct budget request identities", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-proposal-cross-campaign-"));
  try {
    const budget = createRequestBudgetStore(root, 2);
    const input = { seed: "same seed", constraints: [], requestedCount: 1, accepted: [], attempt: 1 };
    const first = driver();
    const second = driver();
    await createChatGptIdeaProposalProvider(first.value, { requestBudget: budget }).generate({
      ...input,
      budgetIdentity: "campaign-first",
    });
    await createChatGptIdeaProposalProvider(second.value, { requestBudget: budget }).generate({
      ...input,
      budgetIdentity: "campaign-second",
    });

    assert.equal(first.calls.filter(([name]) => name === "submit").length, 1);
    assert.equal(second.calls.filter(([name]) => name === "submit").length, 1);
    assert.equal((await budget.inspect("campaign-first"))?.consumed, 1);
    assert.equal((await budget.inspect("campaign-second"))?.consumed, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
