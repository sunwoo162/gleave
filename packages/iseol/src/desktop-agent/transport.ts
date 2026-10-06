import { timingSafeEqual } from "node:crypto";
import type { DesktopAgentHello, DesktopJobResult, DesktopTaskPack } from "./contracts.js";
import {
  assertDesktopProtocolVersion,
  assertDesktopTaskPack,
  desktopTaskPackMutates,
} from "./contracts.js";
import { heartbeatDesktopAgent, registerDesktopAgent } from "./agent-registry.js";
import { toDurableDesktopResult } from "./result-store.js";

export type DesktopServerMessage =
  | { version: 1; type: "task"; pack: DesktopTaskPack }
  | { version: 1; type: "accepted"; sessionId: string };

export type DesktopClientMessage =
  | { version: 1; type: "heartbeat"; at: string }
  | { version: 1; type: "result"; result: DesktopJobResult; replay?: boolean };

export interface DesktopAgentWire {
  send(message: DesktopServerMessage): void;
  close(reason?: string): void;
}

export type DesktopAgentSession = {
  sessionId: string;
  agentId: string;
  capabilities: string[];
  connectedAt: string;
  wire: DesktopAgentWire;
};

type DeferredResult = {
  promise: Promise<DesktopJobResult>;
  resolve(result: DesktopJobResult): void;
  attempt: number;
};

export type DesktopAgentTransportOptions = {
  registryRoot: string;
  expectedToken: string;
  now?: () => string;
};

function tokenMatches(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createDesktopAgentTransport(options: DesktopAgentTransportOptions) {
  if (!options.expectedToken) throw new Error("Desktop Agent authentication token is required");
  const now = options.now ?? (() => new Date().toISOString());
  const sessionsById = new Map<string, DesktopAgentSession>();
  const sessionByAgent = new Map<string, string>();
  const pending = new Map<string, DeferredResult>();
  const completed = new Map<string, DesktopJobResult>();
  const connectionListeners =
    new Set<(agentId: string) => void>();
  const disconnectionListeners =
    new Set<(agentId: string) => void>();

  async function acceptHello(
    sessionId: string,
    hello: DesktopAgentHello,
    wire: DesktopAgentWire,
  ): Promise<DesktopAgentSession> {
    assertDesktopProtocolVersion(hello.version);
    if (!tokenMatches(options.expectedToken, hello.token)) {
      throw new Error("Desktop Agent authentication failed");
    }
    const previousId = sessionByAgent.get(hello.agentId);
    if (previousId) {
      const previous = sessionsById.get(previousId);
      const protectedCapabilities = previous?.capabilities.filter((capability) => capability.startsWith("operation:")) ?? [];
      if (protectedCapabilities.some((capability) => !hello.capabilities.includes(capability))) {
        throw new Error("Desktop Agent identity is connected with a more capable session");
      }
      previous?.wire.close("replaced by newer Desktop Agent session");
      sessionsById.delete(previousId);
    }
    const at = now();
    await registerDesktopAgent(options.registryRoot, hello, at, sessionId);
    const session = { sessionId, agentId: hello.agentId, capabilities: [...hello.capabilities], connectedAt: at, wire };
    sessionsById.set(sessionId, session);
    sessionByAgent.set(hello.agentId, sessionId);

    for (const listener of connectionListeners) {
      try {
        listener(hello.agentId);
      } catch {
        // Listener failure must not invalidate an accepted Agent session.
      }
    }
    return session;
  }

  async function handleMessage(sessionId: string, message: DesktopClientMessage): Promise<void> {
    assertDesktopProtocolVersion(message.version);
    const session = sessionsById.get(sessionId);
    if (!session) throw new Error(`Desktop Agent session not found: ${sessionId}`);
    if (message.type === "heartbeat") {
      await heartbeatDesktopAgent(options.registryRoot, session.agentId, message.at, sessionId);
      return;
    }
    if (message.result.agentId !== session.agentId) {
      throw new Error(`Desktop Job result agent mismatch: ${message.result.jobId}`);
    }
    const existing = completed.get(message.result.jobId);
    if (existing) {
      if (JSON.stringify(toDurableDesktopResult(existing)) !== JSON.stringify(toDurableDesktopResult(message.result))) {
        throw new Error(`Conflicting Desktop Job result: ${message.result.jobId}`);
      }
      return;
    }
    const waiting = pending.get(message.result.jobId);
    if (!waiting) {
      if (message.replay) return;
      throw new Error(`Unknown Desktop Job result: ${message.result.jobId}`);
    }
    pending.delete(message.result.jobId);
    completed.set(message.result.jobId, structuredClone(message.result));
    waiting.resolve(message.result);
  }

  function onAgentConnected(
    listener: (agentId: string) => void,
  ): () => void {
    connectionListeners.add(listener);

    return () => {
      connectionListeners.delete(listener);
    };
  }

  function onAgentDisconnected(
    listener: (agentId: string) => void,
  ): () => void {
    disconnectionListeners.add(listener);

    return () => {
      disconnectionListeners.delete(listener);
    };
  }

  function disconnect(sessionId: string): void {
    const session = sessionsById.get(sessionId);
    if (!session) return;
    sessionsById.delete(sessionId);
    if (sessionByAgent.get(session.agentId) === sessionId) {
      sessionByAgent.delete(session.agentId);
      for (const listener of disconnectionListeners) {
        try {
          listener(session.agentId);
        } catch {
          // Listener failure must not invalidate transport cleanup.
        }
      }
    }
  }

  function getAgentSessionId(agentId: string): string | null {
    const sessionId = sessionByAgent.get(agentId);
    return sessionId && sessionsById.has(sessionId) ? sessionId : null;
  }

  function isAgentConnected(agentId: string): boolean {
    const sessionId = sessionByAgent.get(agentId);
    return sessionId !== undefined && sessionsById.has(sessionId);
  }

  function sendTask(agentId: string, pack: DesktopTaskPack, expectedSessionId?: string): void {
    assertDesktopTaskPack(pack);
    if (pack.agentId !== agentId) throw new Error(`Desktop Task Pack agent mismatch: ${pack.agentId}`);
    const sessionId = sessionByAgent.get(agentId);
    const session = sessionId ? sessionsById.get(sessionId) : undefined;
    if (!session) throw new Error(`Desktop Agent is not connected: ${agentId}`);
    if (expectedSessionId && sessionId !== expectedSessionId) {
      throw new Error(`Desktop Agent session changed before dispatch: ${agentId}`);
    }
    const existing = pending.get(pack.jobId);

    if (existing) {
      // Duplicate dispatch of the same physical attempt joins the current wait.
      if (pack.attempt <= existing.attempt) return;

      // Mutations remain single-shot because their outcome is indeterminate
      // after a lost response. Read-only work can safely be retried.
      if (desktopTaskPackMutates(pack)) return;

      existing.attempt = pack.attempt;
      session.wire.send({ version: 1, type: "task", pack });
      return;
    }

    let resolveResult!: (result: DesktopJobResult) => void;
    const promise = new Promise<DesktopJobResult>((resolve) => { resolveResult = resolve; });
    pending.set(pack.jobId, {
      promise,
      resolve: resolveResult,
      attempt: pack.attempt,
    });
    session.wire.send({ version: 1, type: "task", pack });
  }

  async function awaitResult(jobId: string, timeoutMs: number): Promise<DesktopJobResult> {
    const done = completed.get(jobId);
    if (done) return done;
    const waiting = pending.get(jobId);
    if (!waiting) throw new Error(`Desktop Job is not awaiting a result: ${jobId}`);
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        waiting.promise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`Desktop Job result timeout: ${jobId}`)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    acceptHello,
    onAgentConnected,
    onAgentDisconnected,
    handleMessage,
    disconnect,
    isAgentConnected,
    getAgentSessionId,
    sendTask,
    awaitResult,
  };
}

export type DesktopAgentTransport = ReturnType<typeof createDesktopAgentTransport>;

export async function acceptDesktopAgentHello(
  transport: DesktopAgentTransport,
  sessionId: string,
  hello: DesktopAgentHello,
  wire: DesktopAgentWire,
) {
  return transport.acceptHello(sessionId, hello, wire);
}

export async function handleDesktopAgentMessage(
  transport: DesktopAgentTransport,
  sessionId: string,
  message: DesktopClientMessage,
) {
  return transport.handleMessage(sessionId, message);
}
