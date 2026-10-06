import WebSocket from "ws";
import { assertDesktopProtocolVersion, type DesktopAgentHello, type DesktopJobResult, type DesktopTaskPack } from "./contracts.js";
import { toDurableDesktopResult } from "./result-store.js";
import { formatUserFacingError } from "../security/user-error.js";

export type ConnectDesktopAgentWebSocketClientOptions = {
  url: string;
  hello: DesktopAgentHello;
  heartbeatIntervalMs: number;
  onTask(pack: DesktopTaskPack): Promise<DesktopJobResult>;
  completedResults?: Map<string, DesktopJobResult>;
  persistResult?: (result: DesktopJobResult) => Promise<void>;
  now?: () => string;
};

export async function connectDesktopAgentWebSocketClient(
  options: ConnectDesktopAgentWebSocketClientOptions,
) {
  const now = options.now ?? (() => new Date().toISOString());
  const completedResults = options.completedResults ?? new Map<string, DesktopJobResult>();
  const socket = new WebSocket(options.url);
  let heartbeat: NodeJS.Timeout | undefined;
  let accepted = false;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolveDone) => { resolveClosed = resolveDone; });

  const ready = new Promise<void>((resolveReady, rejectReady) => {
    socket.once("open", () => {
      socket.send(JSON.stringify({ version: 1, type: "hello", hello: options.hello }));
    });
    socket.once("error", rejectReady);
    socket.on("message", async (data) => {
      let frame: any;
      try {
        frame = JSON.parse(data.toString());
      } catch {
        socket.close(4002, "invalid json frame");
        return;
      }
      try { assertDesktopProtocolVersion(frame?.version ?? 0); } catch { socket.close(4003, "unsupported protocol version"); return; }
      if (!accepted && frame?.type === "accepted") {
        accepted = true;
        heartbeat = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ version: 1, type: "heartbeat", at: now() }));
          }
        }, options.heartbeatIntervalMs);
        for (const rawResult of completedResults.values()) {
          const result = toDurableDesktopResult(rawResult);
          completedResults.set(result.jobId, result);
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ version: 1, type: "result", result, replay: true }));
          }
        }
        resolveReady();
        return;
      }
      if (frame?.type !== "task") return;
      const pack = frame.pack as DesktopTaskPack;
      try {
        const cached = completedResults.get(pack.jobId);
        const result = cached ?? await options.onTask(pack);
        const durableResult = toDurableDesktopResult(result);
        if (!cached) {
          await options.persistResult?.(durableResult);
          completedResults.set(durableResult.jobId, durableResult);
        }
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ version: 1, type: "result", result }));
        }
      } catch (error) {
        const result: DesktopJobResult = {
          version: 1,
          jobId: pack.jobId,
          runId: pack.runId,
          agentId: options.hello.agentId,
          status: "retryable-failure",
          completedAt: now(),
          operations: [{
            operationId: "__task__",
            ok: false,
            summary: formatUserFacingError(error),
          }],
        };
        completedResults.set(result.jobId, toDurableDesktopResult(result));
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ version: 1, type: "result", result: toDurableDesktopResult(result) }));
        }
      }
    });
    socket.once("close", (code, reason) => {
      if (!accepted) rejectReady(new Error(`Desktop Agent WebSocket closed before acceptance: ${code} ${reason}`));
    });
  });

  socket.on("close", () => {
    if (heartbeat) clearInterval(heartbeat);
    resolveClosed();
  });

  await ready;
  return {
    closed,
    close: async () => {
      if (socket.readyState === WebSocket.CLOSED) return;
      socket.close(1000, "client close");
      await closed;
    },
  };
}
