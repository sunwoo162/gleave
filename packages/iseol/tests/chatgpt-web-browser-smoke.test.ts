import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { ChatGptWebAuthenticationRequiredError } from "../src/chatgpt-web/browser-adapter.js";
import type { ChatGptBrowserDriver } from "../src/chatgpt-web/production-browser-adapter.js";
import { runChatGptWebControlledSmoke } from "../src/chatgpt-web/smoke.js";
import { runChatGptWebBrowserSmokeCli } from "../scripts/chatgpt-web-browser-smoke.js";

const roots = {
  repositoryRoot: resolve("C:/iseol/repo"),
  modelRoot: resolve("C:/iseol/model"),
  runRoot: resolve("C:/iseol/runs"),
  webRoot: resolve("C:/iseol/repo/web"),
  chatGptWebRoot: resolve("C:/iseol/chatgpt-runs"),
};

const fakeDriver: ChatGptBrowserDriver = {
  openOrResumeConversation: async () => ({}),
  submitPrompt: async () => ({ conversationRef: "smoke-conv" }),
  readStructuredResult: async () => ({
    version: 1, runId: "smoke-run", stage: "ANALYZE", generation: 1,
    summary: "smoke", decisions: [], outcome: "continue", intents: [],
  }),
  probeConversation: async () => "ready",
  closeConversation: async () => undefined,
};test("smoke CLI returns external-blocker code 2 when browser capability is disabled", async () => {
  const lines: string[] = [];
  const code = await runChatGptWebBrowserSmokeCli({}, { roots, stderr: (line) => lines.push(line) });
  assert.equal(code, 2);
  assert.ok(lines.some((line) => /not configured|disabled/i.test(line)));
});

test("smoke CLI returns external-blocker code 2 for authentication-required", async () => {
  const code = await runChatGptWebBrowserSmokeCli({
    ISEOL_CHATGPT_BROWSER_ENABLED: "true",
    ISEOL_CHATGPT_BROWSER_PROFILE_ROOT: resolve("C:/iseol-chatgpt-profile"),
  }, {
    roots,
    resolveDriver: async () => fakeDriver,
    runSmoke: async () => { throw new ChatGptWebAuthenticationRequiredError("login required"); },
    stderr: () => undefined,
  });
  assert.equal(code, 2);
});

test("smoke CLI returns zero only for a deterministic successful smoke", async () => {
  const output: string[] = [];
  const code = await runChatGptWebBrowserSmokeCli({
    ISEOL_CHATGPT_BROWSER_ENABLED: "true",
    ISEOL_CHATGPT_BROWSER_PROFILE_ROOT: resolve("C:/iseol-chatgpt-profile"),
  }, { roots, resolveDriver: async () => fakeDriver, stdout: (line) => output.push(line) });
  assert.equal(code, 0);
  assert.ok(output.some((line) => /smoke passed/i.test(line)));
});
test("smoke CLI returns external-blocker code 2 when enabled browser config is missing its profile", async () => {
  const code = await runChatGptWebBrowserSmokeCli({ ISEOL_CHATGPT_BROWSER_ENABLED: "true" }, {
    roots, stderr: () => undefined,
  });
  assert.equal(code, 2);
});

test("smoke CLI returns domain-failure code 1 and never labels it passed", async () => {
  const output: string[] = [];
  const code = await runChatGptWebBrowserSmokeCli({
    ISEOL_CHATGPT_BROWSER_ENABLED: "true",
    ISEOL_CHATGPT_BROWSER_PROFILE_ROOT: resolve("C:/iseol-chatgpt-profile"),
  }, {
    roots,
    resolveDriver: async () => fakeDriver,
    runSmoke: async () => { throw new Error("schema mismatch"); },
    stdout: (line) => output.push(line),
    stderr: (line) => output.push(line),
  });
  assert.equal(code, 1);
  assert.equal(output.some((line) => /passed/i.test(line)), false);
});

test("smoke CLI disposes the production driver on both success and domain failure", async () => {
  for (const shouldFail of [false, true]) {
    let disposeCalls = 0;
    const disposableDriver: ChatGptBrowserDriver = {
      ...fakeDriver,
      async dispose() { disposeCalls += 1; },
    };
    const code = await runChatGptWebBrowserSmokeCli({
      ISEOL_CHATGPT_BROWSER_ENABLED: "true",
      ISEOL_CHATGPT_BROWSER_PROFILE_ROOT: resolve("C:/iseol-chatgpt-profile"),
    }, {
      roots,
      resolveDriver: async () => disposableDriver,
      runSmoke: async () => {
        if (shouldFail) throw new Error("domain failure");
        return { conversationRef: "smoke-conv", outcome: "continue", summary: "ok", intentCount: 0 };
      },
      stdout: () => undefined,
      stderr: () => undefined,
    });
    assert.equal(code, shouldFail ? 1 : 0);
    assert.equal(disposeCalls, 1);
  }
});


test("controlled smoke prompt requires the exact ReasoningTurnResult envelope", async () => {
  let submittedPrompt = "";
  const driver: ChatGptBrowserDriver = {
    ...fakeDriver,
    async submitPrompt(input) {
      submittedPrompt = input.prompt;
      return { conversationRef: "smoke-conv" };
    },
  };

  await runChatGptWebControlledSmoke({ driver });

  for (const required of [
    '"version":1', '"runId":"smoke-run"', '"stage":"ANALYZE"',
    '"generation":1', '"summary"', '"decisions"', '"intents":[]', '"outcome"',
  ]) {
    assert.ok(submittedPrompt.includes(required), `missing schema fragment: ${required}`);
  }
  assert.match(submittedPrompt, /JSON object only/i);
  assert.match(submittedPrompt, /do not request Desktop mutation/i);
});
