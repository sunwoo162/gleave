import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequestDiagnosticStore } from "../src/chatgpt-web/request-diagnostics.js";
import { createRequestBudgetStore, ExternalRequestOutcomeUnknownError } from "../src/chatgpt-web/request-budget.js";
import { ChatGptWebSessionLostError, ChatGptWebStructuredResultError } from "../src/chatgpt-web/browser-adapter.js";
import type { ChatGptBrowserDriver } from "../src/chatgpt-web/production-browser-adapter.js";
import { createChatGptIdeaProposalProvider } from "../src/idea-lab/chatgpt-proposal-provider.js";

const draft = {
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

function makeDriver(overrides: Partial<ChatGptBrowserDriver> = {}): ChatGptBrowserDriver {
  return {
    openOrResumeConversation: async () => ({}),
    submitPrompt: async () => ({ conversationRef: "proposal-conv" }),
    readStructuredResult: async () => [draft],
    probeConversation: async () => "ready",
    closeConversation: async () => undefined,
    ...overrides,
  };
}

async function events(root: string): Promise<Array<Record<string, unknown>>> {
  const path = join(root, "web-workers", "request-diagnostics.jsonl");
  const text = await readFile(path, "utf8");
  return text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

test("proposal diagnostics persist every successful bridge boundary without payloads", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-request-diagnostics-success-"));
  try {
    const provider = createChatGptIdeaProposalProvider(makeDriver(), {
      requestBudget: createRequestBudgetStore(root, 2),
      diagnostics: createRequestDiagnosticStore(root, () => "2026-01-01T00:00:00.000Z"),
    });
    await provider.generate({
      seed: "private seed must not be persisted in diagnostics",
      constraints: ["private constraint"],
      requestedCount: 1,
      accepted: [],
      attempt: 1,
      budgetIdentity: "campaign-diagnostic-success",
    });

    const records = await events(root);
    assert.deepEqual(records.map((item) => item.stage), [
      "request-reserved", "browser-opened", "submit-started", "submit-returned",
      "response-read-started", "response-read-returned", "structured-result-validated",
    ]);
    assert.ok(records.every((item) => item.ok === true));
    assert.ok(records.every((item) => item.requestId === records[0]!.requestId));
    assert.ok(records.every((item) => typeof item.at === "string" && typeof item.elapsedMs === "number"));
    assert.ok(records.every((item) => !("prompt" in item) && !("response" in item)));
    assert.doesNotMatch(JSON.stringify(records), /private seed|private constraint/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("proposal diagnostics distinguish submit failure from response-read failure and preserve UNKNOWN", async () => {
  for (const [label, override, expectedLastStage, expectedFailure] of [
    ["submit", { submitPrompt: async () => { throw new Error("Page has been closed"); } }, "submit-started", "page-closed"],
    ["read", { readStructuredResult: async () => { throw new ChatGptWebSessionLostError("result unavailable"); } }, "response-read-started", "unknown-session-loss"],
  ] as const) {
    const root = await mkdtemp(join(tmpdir(), `iseol-request-diagnostics-${label}-`));
    try {
      const provider = createChatGptIdeaProposalProvider(makeDriver(override), {
        requestBudget: createRequestBudgetStore(root, 1),
        diagnostics: createRequestDiagnosticStore(root, () => "2026-01-01T00:00:00.000Z"),
      });
      await assert.rejects(() => provider.generate({
        seed: "seed", constraints: [], requestedCount: 1, accepted: [], attempt: 1,
        budgetIdentity: `campaign-diagnostic-${label}`,
      }), ExternalRequestOutcomeUnknownError);
      const records = await events(root);
      const failure = records.find((item) => item.stage === "request-failed");
      assert.equal(failure?.ok, false);
      assert.equal(failure?.lastCompletedStage, expectedLastStage);
      assert.equal(failure?.failureClass, expectedFailure);
      assert.equal((await createRequestBudgetStore(root, 1).inspect(`campaign-diagnostic-${label}`))?.unknown, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("proposal diagnostics preserves bounded response-read failure classes", async () => {
  const records: Array<{ stage: string; failureClass?: string }> = [];
  const fake = makeDriver({
    readStructuredResult: async () => {
      throw new ChatGptWebSessionLostError("safe bounded failure", "clipboard-capture-failed");
    },
  });
  const provider = createChatGptIdeaProposalProvider(fake, {
    diagnostics: { record: async (event) => { records.push(event); } },
  });
  await assert.rejects(() => provider.generate({
    seed: "seed", constraints: [], requestedCount: 1, accepted: [], attempt: 1,
  }));
  assert.equal(records.find((item) => item.stage === "response-read-returned")?.failureClass, "clipboard-capture-failed");
  assert.equal(records.find((item) => item.stage === "request-failed")?.failureClass, "clipboard-capture-failed");
});

test("proposal parser rejection forwards bounded diagnostics to the browser driver", async () => {
  let parserDiagnostic: Record<string, unknown> | undefined;
  const fake = makeDriver({
    readStructuredResult: async () => {
      throw new ChatGptWebStructuredResultError("safe parser rejection", {
        diagnosticCategory: "response-envelope-malformed",
        rejectionClass: "json-syntax-error",
        parserInputReceived: true,
        responseSha256: "a".repeat(64),
      });
    },
    recordParserDiagnostic: async (input) => { parserDiagnostic = input as unknown as Record<string, unknown>; },
  });
  const provider = createChatGptIdeaProposalProvider(fake, {
    diagnostics: { record: async () => undefined },
  });

  await assert.rejects(() => provider.generate({
    seed: "seed", constraints: [], requestedCount: 1, accepted: [], attempt: 1,
    budgetIdentity: "campaign-parser-diagnostic",
  }), ChatGptWebStructuredResultError);

  assert.equal(parserDiagnostic?.runId, "campaign-parser-diagnostic");
  assert.equal(parserDiagnostic?.stage, "IDEA_PROPOSAL");
  assert.equal(parserDiagnostic?.resultContract, "structured-json");
  assert.equal(parserDiagnostic?.conversationRef, "proposal-conv");
  assert.equal(parserDiagnostic?.generation, 1);
  assert.match(String(parserDiagnostic?.sessionId), /^proposal-/);
  assert.equal((parserDiagnostic?.diagnostic as Record<string, unknown>)?.rejectionClass, "json-syntax-error");
  assert.doesNotMatch(JSON.stringify(parserDiagnostic), /safe parser rejection|seed/);
});

test("structured result validation is recorded after a returned response and consumes the request", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-request-diagnostics-validation-"));
  try {
    const provider = createChatGptIdeaProposalProvider(makeDriver({
      readStructuredResult: async () => [{ title: "invalid" }],
    }), {
      requestBudget: createRequestBudgetStore(root, 1),
      diagnostics: createRequestDiagnosticStore(root, () => "2026-01-01T00:00:00.000Z"),
    });
    await assert.rejects(() => provider.generate({
      seed: "seed", constraints: [], requestedCount: 1, accepted: [], attempt: 1,
      budgetIdentity: "campaign-diagnostic-validation",
    }), /Idea proposal draft/);
    const records = await events(root);
    assert.equal(records.find((item) => item.stage === "response-read-returned")?.ok, true);
    assert.equal(records.find((item) => item.stage === "structured-result-validated")?.failureClass, "structured-result-validation-failure");
    assert.equal(records.find((item) => item.stage === "request-failed")?.lastCompletedStage, "response-read-returned");
    assert.equal((await createRequestBudgetStore(root, 1).inspect("campaign-diagnostic-validation"))?.consumed, 1);
    assert.equal((await createRequestBudgetStore(root, 1).inspect("campaign-diagnostic-validation"))?.unknown, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
