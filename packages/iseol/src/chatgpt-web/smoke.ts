import type { ChatGptBrowserDriver } from "./production-browser-adapter.js";
import { createProductionChatGptWebAdapter } from "./production-browser-adapter.js";
import { assertReasoningTurnResult, type WebWorkerSession } from "./contracts.js";
import type { CompiledWebPrompt } from "./prompt-compiler.js";

export async function runChatGptWebControlledSmoke(input: {
  driver: ChatGptBrowserDriver;
  mutationWorkspace?: string;
  timeoutMs?: number;
}) {
  const policySha256 = "0".repeat(64);
  const session: WebWorkerSession = {
    version: 1, sessionId: "smoke-session", runId: "smoke-run", stage: "ANALYZE", generation: 1,
    policySha256, status: "ready", createdAt: new Date().toISOString(),
  };
  const prompt: CompiledWebPrompt = {
    version: 1, kind: "initial", runId: "smoke-run", stage: "ANALYZE", generation: 1, policySha256,
    body: [
      "Controlled Iseol smoke. Return exactly one JSON object only, with no prose or markdown.",
      "Return exactly this ReasoningTurnResult envelope:",
      '{"version":1,"runId":"smoke-run","stage":"ANALYZE","generation":1,"summary":"Controlled Iseol smoke completed.","decisions":[],"intents":[],"outcome":"stage-complete"}',
      "Do not request Desktop mutation.",
    ].join("\n"),
    sha256: "0".repeat(64),
  };
  const adapter = createProductionChatGptWebAdapter(input.driver);
  const opened = await adapter.openOrResumeSession(session, prompt);
  let active = { ...session, ...opened };
  const submitted = await adapter.submitTurn(active, prompt);
  active = { ...active, ...(submitted ?? {}) };
  const result = await adapter.awaitStructuredResult(active, input.timeoutMs ?? 30_000, "structured-json");
  assertReasoningTurnResult(result);
  if (result.intents.length > 0) {
    if (!input.mutationWorkspace) throw new Error("Controlled ChatGPT Web smoke rejects Desktop intents without an explicit temporary workspace");
    const wrongWorkspace = result.intents.find((intent) => intent.workspaceRoot !== input.mutationWorkspace);
    if (wrongWorkspace) throw new Error("Controlled ChatGPT Web smoke intent targets an unexpected workspace");
  }
  await adapter.closeSession(active).catch(() => undefined);
  return {
    conversationRef: active.conversationRef ?? null,
    outcome: result.outcome,
    summary: result.summary,
    intentCount: result.intents.length,
  };
}
