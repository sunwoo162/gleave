import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import type { WebWorkerSession } from "../src/chatgpt-web/contracts.js";
import type { CompiledWebPrompt } from "../src/chatgpt-web/prompt-compiler.js";
import {
  createProductionChatGptWebAdapter,
  classifyChatGptBrowserOperationFailure,
  type ChatGptBrowserDriver,
} from "../src/chatgpt-web/production-browser-adapter.js";
import {
  resolveChatGptWebBridgeConfig,
  resolveChatGptWebBridgeRuntime,
  resolveProductionChatGptBrowserDriver,
  startChatGptWebBridgeService,
} from "../src/chatgpt-web/browser-service.js";
import { ChatGptWebAuthenticationRequiredError, ChatGptWebSessionLostError } from "../src/chatgpt-web/browser-adapter.js";

const session: WebWorkerSession = {
  version: 1, sessionId: "session-1", runId: "run-1", stage: "IMPLEMENT", generation: 1,
  policySha256: "a".repeat(64), status: "ready", createdAt: "2026-09-08T01:00:00.000Z",
};
const prompt: CompiledWebPrompt = {
  version: 1, kind: "initial", runId: "run-1", stage: "IMPLEMENT", generation: 1,
  policySha256: "a".repeat(64), body: "reason safely", sha256: "b".repeat(64),
};

test("ChatGPT Web bridge bootstrap is opt-in and independent of other Iseol services", () => {
  assert.deepEqual(resolveChatGptWebBridgeConfig({}), { enabled: false, workerRoot: "data/runs" });
  assert.deepEqual(resolveChatGptWebBridgeConfig({ ISEOL_WEB_HOST: "0.0.0.0", ISEOL_DESKTOP_AGENT_TOKEN: "desktop" }), { enabled: false, workerRoot: "data/runs" });
  assert.deepEqual(resolveChatGptWebBridgeConfig({ ISEOL_CHATGPT_WEB_ENABLED: "true", ISEOL_CHATGPT_WEB_ROOT: "data/custom-runs" }), { enabled: true, workerRoot: "data/custom-runs" });
  assert.throws(() => resolveChatGptWebBridgeConfig({ ISEOL_CHATGPT_WEB_ENABLED: "yes" }), /true|false/i);
});

test("enabled bridge fails closed when no browser driver is installed", async () => {
  await assert.rejects(startChatGptWebBridgeService({ enabled: true, workerRoot: "data/runs" }), /browser driver.*required/i);
  assert.deepEqual(await startChatGptWebBridgeService({ enabled: false, workerRoot: "data/runs" }), { enabled: false });
});
test("production adapter exposes only bounded conversation operations", async () => {
  const calls: string[] = [];
  const contracts: string[] = [];
  const requestIds: string[] = [];
  const driver: ChatGptBrowserDriver = {
    openOrResumeConversation: async () => { calls.push("open"); return { conversationRef: "conv-1" }; },
    submitPrompt: async () => { calls.push("submit"); },
    readStructuredResult: async (input) => { calls.push("read"); contracts.push(input.contract); requestIds.push(input.requestId ?? ""); return { version: 1 }; },
    probeConversation: async () => { calls.push("probe"); return "ready"; },
    closeConversation: async () => { calls.push("close"); },
  };
  assert.deepEqual(Object.keys(driver).sort(), ["closeConversation", "openOrResumeConversation", "probeConversation", "readStructuredResult", "submitPrompt"]);
  const adapter = createProductionChatGptWebAdapter(driver);
  const opened = await adapter.openOrResumeSession(session, prompt);
  assert.deepEqual(opened, { conversationRef: "conv-1" });
  await adapter.submitTurn({ ...session, conversationRef: "conv-1" }, prompt);
  await adapter.awaitStructuredResult({ ...session, conversationRef: "conv-1" }, 1000, "patch-frame-v1");
  assert.equal(await adapter.probeSession({ ...session, conversationRef: "conv-1" }), "ready");
  await adapter.closeSession({ ...session, conversationRef: "conv-1" });
  assert.deepEqual(calls, ["open", "submit", "read", "probe", "close"]);
  assert.deepEqual(contracts, ["patch-frame-v1"]);
  assert.deepEqual(requestIds, ["session-1"]);
});
test("auth and navigation failures are classified without leaking browser credentials", async () => {
  const authDriver: ChatGptBrowserDriver = {
    openOrResumeConversation: async () => { throw new ChatGptWebAuthenticationRequiredError("login required"); },
    submitPrompt: async () => undefined,
    readStructuredResult: async () => ({ version: 1 }),
    probeConversation: async () => "auth-required",
    closeConversation: async () => undefined,
  };
  const authAdapter = createProductionChatGptWebAdapter(authDriver);
  await assert.rejects(authAdapter.openOrResumeSession(session, prompt), ChatGptWebAuthenticationRequiredError);

  const lostDriver: ChatGptBrowserDriver = {
    openOrResumeConversation: async () => ({ conversationRef: "conv-2" }),
    submitPrompt: async () => { throw new Error("selector not found"); },
    readStructuredResult: async () => { throw new Error("navigation detached"); },
    probeConversation: async () => "lost",
    closeConversation: async () => undefined,
  };
  const lostAdapter = createProductionChatGptWebAdapter(lostDriver);
  await assert.rejects(lostAdapter.submitTurn({ ...session, conversationRef: "conv-2" }, prompt), ChatGptWebSessionLostError);
  await assert.rejects(lostAdapter.awaitStructuredResult({ ...session, conversationRef: "conv-2" }, 1000, "patch-frame-v1"), ChatGptWebSessionLostError);
});

test("browser operation failures map to bounded classes without exposing exception text", async () => {
  const sentinel = "ISEOL_BROWSER_SECRET_SENTINEL";
  assert.equal(classifyChatGptBrowserOperationFailure(new Error("Page has been closed")), "page-closed");
  assert.equal(classifyChatGptBrowserOperationFailure(new Error("Execution context was destroyed")), "execution-context-destroyed");
  assert.equal(classifyChatGptBrowserOperationFailure(new Error("Timeout 1000ms exceeded")), "timeout");
  assert.equal(classifyChatGptBrowserOperationFailure(new Error("ChatGPT did not assign a canonical conversation identity after prompt submission")), "conversation-identity-changed");
  assert.equal(classifyChatGptBrowserOperationFailure(new Error("ChatGPT new conversation navigation drifted from the canonical page")), "conversation-identity-changed");
  assert.equal(classifyChatGptBrowserOperationFailure(new Error("No pending ChatGPT submission is available for structured result reading")), "pending-submission-missing");
  assert.equal(classifyChatGptBrowserOperationFailure(new Error("ChatGPT clipboard capture failed")), "clipboard-capture-failed");
  assert.equal(classifyChatGptBrowserOperationFailure(new Error("assistant turn copy control unavailable or ambiguous")), "assistant-response-extraction-failed");
  assert.equal(classifyChatGptBrowserOperationFailure(new Error("ChatGPT structured result timed out")), "response-timeout");
  assert.equal(classifyChatGptBrowserOperationFailure(new Error("owned page missing")), "owned-page-missing");
  assert.equal(classifyChatGptBrowserOperationFailure(new Error("Browser disconnected")), "browser-disconnected");
  assert.equal(classifyChatGptBrowserOperationFailure(new Error(sentinel)), "unknown");

  let diagnostic: unknown;
  const driver: ChatGptBrowserDriver = {
    openOrResumeConversation: async () => { throw new Error(sentinel); },
    submitPrompt: async () => undefined,
    readStructuredResult: async () => ({}),
    probeConversation: async () => "ready",
    closeConversation: async () => undefined,
    recordOperationDiagnostic: async (input) => { diagnostic = input; },
  };
  await assert.rejects(createProductionChatGptWebAdapter(driver).openOrResumeSession(session, prompt), ChatGptWebSessionLostError);
  assert.equal((diagnostic as { operation: string }).operation, "acquire-owned-page");
  assert.equal((diagnostic as { failureClass: string }).failureClass, "unknown");
  assert.doesNotMatch(JSON.stringify(diagnostic), new RegExp(sentinel));
});
test("adapter preserves a bounded browser failure class on session-loss errors", async () => {
  const driver: ChatGptBrowserDriver = {
    openOrResumeConversation: async () => { throw new Error("Page has been closed"); },
    submitPrompt: async () => undefined,
    readStructuredResult: async () => ({}),
    probeConversation: async () => "lost",
    closeConversation: async () => undefined,
  };
  const error = await createProductionChatGptWebAdapter(driver).openOrResumeSession(session, prompt).catch((value: unknown) => value);
  assert.ok(error instanceof ChatGptWebSessionLostError);
  assert.equal(error.failureClass, "page-closed");
});
test("controlled smoke rejects mutation intents unless an explicit workspace is allowed", async () => {
  const smokeDriver: ChatGptBrowserDriver = {
    openOrResumeConversation: async () => ({ conversationRef: "smoke-conv" }),
    submitPrompt: async () => undefined,
    readStructuredResult: async () => ({
      version: 1, runId: "smoke-run", stage: "ANALYZE", generation: 1,
      summary: "smoke", decisions: [], outcome: "continue",
      intents: [{ version: 1, intentId: "smoke-intent", runId: "smoke-run", stage: "ANALYZE", workspaceRoot: "C:/tmp/smoke", policySha256: "0".repeat(64), kind: "GIT_INSPECT", cwd: "." }],
    }),
    probeConversation: async () => "ready",
    closeConversation: async () => undefined,
  };
  const { runChatGptWebControlledSmoke } = await import("../src/chatgpt-web/smoke.js");
  await assert.rejects(runChatGptWebControlledSmoke({ driver: smokeDriver }), /explicit temporary workspace/i);
  const allowed = await runChatGptWebControlledSmoke({ driver: smokeDriver, mutationWorkspace: "C:/tmp/smoke" });
  assert.equal(allowed.intentCount, 1);
});
test("production adapter propagates a canonical conversation ref assigned after first submit", async () => {
  const driver = {
    openOrResumeConversation: async () => ({}),
    submitPrompt: async () => ({ conversationRef: "conv-after-submit" }),
    readStructuredResult: async () => ({ version: 1 }),
    probeConversation: async () => "ready",
    closeConversation: async () => undefined,
  } as unknown as ChatGptBrowserDriver;
  const adapter = createProductionChatGptWebAdapter(driver);

  assert.deepEqual(await adapter.openOrResumeSession(session, prompt), {});
  assert.deepEqual(await adapter.submitTurn(session, prompt), { conversationRef: "conv-after-submit" });
});

const browserRoots = {
  repositoryRoot: resolve("C:/iseol/repo"),
  modelRoot: resolve("C:/iseol/data/model"),
  runRoot: resolve("C:/iseol/data/runs"),
  webRoot: resolve("C:/iseol/repo/web"),
  chatGptWebRoot: resolve("C:/iseol/chatgpt-runs"),
};
const productionDriver: ChatGptBrowserDriver = {
  openOrResumeConversation: async () => ({ conversationRef: "prod-conv" }),
  submitPrompt: async () => undefined,
  readStructuredResult: async () => ({ version: 1 }),
  probeConversation: async () => "ready",
  closeConversation: async () => undefined,
};

test("production browser resolver is opt-in and constructs only the configured real-driver factory", async () => {
  let calls = 0;
  const createDriver = async () => { calls += 1; return productionDriver; };
  assert.equal(await resolveProductionChatGptBrowserDriver({}, browserRoots as any, { createDriver }), null);
  assert.equal(calls, 0);

  const resolved = await resolveProductionChatGptBrowserDriver({
    ISEOL_CHATGPT_BROWSER_ENABLED: "true",
    ISEOL_CHATGPT_BROWSER_PROFILE_ROOT: resolve("C:/iseol-chatgpt-profile"),
  }, browserRoots as any, { createDriver });
  assert.equal(resolved, productionDriver);
  assert.equal(calls, 1);
});

test("bridge runtime never launches a browser when bridge is disabled and fails closed without browser enablement", async () => {
  let calls = 0;
  const createDriver = async () => { calls += 1; return productionDriver; };
  const disabled = await resolveChatGptWebBridgeRuntime({
    ISEOL_CHATGPT_BROWSER_ENABLED: "true",
    ISEOL_CHATGPT_BROWSER_PROFILE_ROOT: resolve("C:/iseol-chatgpt-profile"),
  }, browserRoots as any, { createDriver });
  assert.equal(disabled.config.enabled, false);
  assert.equal(disabled.driver, null);
  assert.equal(calls, 0);

  const bridgeOnly = await resolveChatGptWebBridgeRuntime({ ISEOL_CHATGPT_WEB_ENABLED: "true" }, browserRoots as any, { createDriver });
  assert.equal(bridgeOnly.config.enabled, true);
  assert.equal(bridgeOnly.driver, null);
  await assert.rejects(startChatGptWebBridgeService(bridgeOnly.config, bridgeOnly.driver ?? undefined), /browser driver.*required/i);
});

test("bridge runtime selects the production browser only when both capabilities are enabled", async () => {
  const runtime = await resolveChatGptWebBridgeRuntime({
    ISEOL_CHATGPT_WEB_ENABLED: "true",
    ISEOL_CHATGPT_WEB_ROOT: "data/chatgpt-runs",
    ISEOL_CHATGPT_BROWSER_ENABLED: "true",
    ISEOL_CHATGPT_BROWSER_PROFILE_ROOT: resolve("C:/iseol-chatgpt-profile"),
  }, browserRoots as any, { createDriver: async () => productionDriver });
  assert.equal(runtime.config.enabled, true);
  assert.equal(runtime.driver, productionDriver);
});

test("production browser resolver rejects a profile inside the ChatGPT worker root before launch", async () => {
  let calls = 0;
  await assert.rejects(resolveProductionChatGptBrowserDriver({
    ISEOL_CHATGPT_BROWSER_ENABLED: "true",
    ISEOL_CHATGPT_BROWSER_PROFILE_ROOT: browserRoots.chatGptWebRoot,
  }, browserRoots as any, { createDriver: async () => { calls += 1; return productionDriver; } }), /outside/i);
  assert.equal(calls, 0);
});

test("controlled smoke submits before reading and persists a ref assigned by first submit", async () => {
  const calls: string[] = [];
  const driver: ChatGptBrowserDriver = {
    openOrResumeConversation: async () => { calls.push("open"); return {}; },
    submitPrompt: async () => { calls.push("submit"); return { conversationRef: "smoke-created" }; },
    readStructuredResult: async ({ conversationRef }) => {
      calls.push(`read:${conversationRef}`);
      return { version: 1, runId: "smoke-run", stage: "ANALYZE", generation: 1,
        summary: "smoke", decisions: [], outcome: "continue", intents: [] };
    },
    probeConversation: async () => "ready",
    closeConversation: async (conversationRef) => { calls.push(`close:${conversationRef}`); },
  };
  const { runChatGptWebControlledSmoke } = await import("../src/chatgpt-web/smoke.js");
  const result = await runChatGptWebControlledSmoke({ driver });
  assert.equal(result.conversationRef, "smoke-created");
  assert.deepEqual(calls, ["open", "submit", "read:smoke-created", "close:smoke-created"]);
});

test("enabled bridge service exposes an explicit driver disposal handle", async () => {
  let disposeCalls = 0;
  const driver: ChatGptBrowserDriver = {
    ...productionDriver,
    async dispose() { disposeCalls += 1; },
  };
  const service = await startChatGptWebBridgeService({ enabled: true, workerRoot: "data/runs" }, driver);
  assert.equal(service.enabled, true);
  if (!service.enabled) throw new Error("bridge unexpectedly disabled");
  assert.equal(typeof (service as any).dispose, "function");
  await (service as any).dispose();
  assert.equal(disposeCalls, 1);
});


test("playwright driver refuses composer use while ChatGPT is temporarily rate limited", async () => {
  const { createPlaywrightChatGptBrowserDriver } = await import("../src/chatgpt-web/playwright-browser-driver.js");
  let fillCalls = 0;
  let sendCalls = 0;
  const backend = {
    navigate: async () => undefined,
    currentUrl: async () => "https://chatgpt.com/",
    composerCount: async () => 1,
    authenticationRequiredCount: async () => 0,
    temporaryRestrictionCount: async () => 1,
    fillComposer: async () => { fillCalls += 1; },
    sendPrompt: async () => { sendCalls += 1; },
    assistantMessageCount: async () => 0,
    latestAssistantText: async () => null,
    latestAssistantRawText: async () => null,
    generationControlCount: async () => 0,
    closeOwnedPage: async () => undefined,
    dispose: async () => undefined,
  };
  const driver = await createPlaywrightChatGptBrowserDriver(
    { enabled: true, profileRoot: "C:\\temp\\chatgpt-profile", headless: true },
    { backend: backend as any },
  );
  await assert.rejects(
    driver.openOrResumeConversation({ prompt: "bounded", promptSha256: "c".repeat(64) }),
    /temporarily rate limited/i,
  );
  assert.equal(fillCalls, 0);
  assert.equal(sendCalls, 0);
});

test("playwright driver classifies conversation and usage limits before composer input", async () => {
  const { createPlaywrightChatGptBrowserDriver } = await import("../src/chatgpt-web/playwright-browser-driver.js");
  const makeBackend = (conversation: number, usage: number) => ({
    navigate: async () => undefined, currentUrl: async () => "https://chatgpt.com/", composerCount: async () => 1,
    authenticationRequiredCount: async () => 0, temporaryRestrictionCount: async () => 0,
    conversationLimitCount: async () => conversation, usageLimitCount: async () => usage,
    dismissTemporaryRestriction: async () => false, fillComposer: async () => { throw new Error("must not fill"); },
    sendPrompt: async () => { throw new Error("must not send"); }, assistantMessageCount: async () => 0,
    latestAssistantText: async () => null, latestAssistantRawText: async () => null,
    generationControlCount: async () => 0, closeOwnedPage: async () => undefined, dispose: async () => undefined,
  });
  const config = { enabled: true as const, profileRoot: "C:\\temp\\chatgpt-profile", headless: true };
  const conversationDriver = await createPlaywrightChatGptBrowserDriver(config, { backend: makeBackend(1, 0) as any });
  await assert.rejects(conversationDriver.openOrResumeConversation({ prompt: "x", promptSha256: "d".repeat(64) }), /conversation.*limit/i);
  const usageDriver = await createPlaywrightChatGptBrowserDriver(config, { backend: makeBackend(0, 1) as any });
  await assert.rejects(usageDriver.openOrResumeConversation({ prompt: "x", promptSha256: "e".repeat(64) }), /usage limit/i);
});
