import type { ReasoningTurnResult } from "../contracts.js";
import type { CompiledWebPrompt } from "../prompt-compiler.js";
import {
  ChatGptWebSessionLostError,
  type ChatGptWebBrowserAdapter,
} from "../browser-adapter.js";

export { ChatGptWebSessionLostError } from "../browser-adapter.js";

export type FakeChatGptWebScriptItem = ReasoningTurnResult | Error | unknown;

export function createFakeChatGptWebBrowserAdapter(script: FakeChatGptWebScriptItem[]) {
  const queue = [...script];
  const submittedPrompts: CompiledWebPrompt[] = [];
  const openedSessions: string[] = [];
  const closedSessions: string[] = [];

  const adapter: ChatGptWebBrowserAdapter = {
    async openOrResumeSession(session) {
      openedSessions.push(session.sessionId);
      return { conversationRef: `fake:${session.sessionId}` };
    },
    async submitTurn(_session, prompt) {
      submittedPrompts.push(structuredClone(prompt));
    },
    async awaitStructuredResult(_session, _timeoutMs) {
      if (queue.length === 0) throw new ChatGptWebSessionLostError("Fake browser script exhausted");
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return structuredClone(next);
    },
    async probeSession() { return "ready"; },
    async closeSession(session) { closedSessions.push(session.sessionId); },
  };

  return { adapter, submittedPrompts, openedSessions, closedSessions };
}