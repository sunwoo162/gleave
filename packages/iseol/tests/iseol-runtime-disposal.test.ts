import assert from "node:assert/strict";
import test from "node:test";
import type { ChatGptBrowserDriver } from "../src/chatgpt-web/production-browser-adapter.js";
import { startIseolRuntimeServices } from "../src/runtime/iseol-runtime-services.js";

test("runtime shutdown serializes disposal and preserves ownership order when Idea Lab disposal never settles", async () => {
  const events: string[] = [];
  const never = new Promise<void>(() => undefined);
  const roots = {
    iseolRoot: "C:/iseol",
    modelRoot: "C:/iseol-model",
    runRoot: "C:/iseol-runs",
    webRoot: "C:/iseol-web",
    browserProfileRoot: "C:/chatgpt-profile",
  };
  const browser: ChatGptBrowserDriver = {
    openOrResumeConversation: async () => ({ conversationRef: "conversation-1" }),
    submitPrompt: async () => ({ conversationRef: "conversation-1" }),
    readStructuredResult: async () => [],
    closeConversation: async () => undefined,
    dispose: async () => { events.push("browser"); },
  };

  const services = await startIseolRuntimeServices({
    env: { ISEOL_CHATGPT_WEB_ENABLED: "false" },
    roots,
    webConfig: {
      host: "127.0.0.1",
      port: 0,
      token: "",
      modelRoot: roots.modelRoot,
      harnessRoot: roots.runRoot,
      webRoot: roots.webRoot,
    },
    desktopConfig: {
      enabled: true,
      host: "127.0.0.1",
      port: 0,
      stateRoot: "C:/desktop-state",
      token: "desktop-token",
    },
    ideaLabConfig: {
      enabled: true,
      repositoryRoot: "C:/sandbox/source",
      repositoryUrl: "https://github.com/example/idea-lab.git",
      baseRef: "main",
      sandboxRoot: "C:/sandbox",
      agentId: "agent-live",
      testExecutable: "npm.cmd",
      testArgs: ["test"],
      testTimeoutMs: 30_000,
    },
    agentReadyTimeoutMs: 0,
    deps: {
      startDesktop: async () => ({
        transport: {
          isAgentConnected: () => true,
          sendTask() {},
          awaitResult: async () => { throw new Error("unused"); },
        },
        close: async () => { events.push("desktop"); },
      }),
      startWeb: async () => ({
        close: (done?: (error?: Error) => void) => { events.push("web"); done?.(); },
      }) as any,
      resolveBrowser: async () => browser,
      resolveDeploy: async () => ({}) as any,
      createProposalProvider: () => ({}) as any,
      createProductionDriver: () => ({}) as any,
      createRuntime: () => ({
        enqueue() {},
        recover: async () => undefined,
        idle: async () => never,
        dispose: async () => {
          events.push("runtime");
          await never;
        },
      }),
    },
  } as any);

  const disposal = services.dispose();
  const outcome = await Promise.race([
    disposal.then(() => "settled" as const),
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 25)),
  ]);

  assert.equal(outcome, "timeout");
  assert.deepEqual(events, ["web", "runtime"]);
});
