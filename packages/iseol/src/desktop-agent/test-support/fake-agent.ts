import WebSocket from "ws";
import type { DesktopAgentHello, DesktopJobResult, DesktopTaskPack } from "../contracts.js";
import { executeDesktopTaskPack } from "../runtime.js";

export type ConnectFakeDesktopAgentOptions = {
  url: string;
  hello: DesktopAgentHello;
  allowedRoots: string[];
  heartbeatIntervalMs?: number;
  now?: () => string;
  dropResult?: (pack: DesktopTaskPack, result: DesktopJobResult) => boolean;
};

export async function connectFakeDesktopAgent(options: ConnectFakeDesktopAgentOptions) {
  const now = options.now ?? (() => new Date().toISOString());
  const socket = new WebSocket(options.url);
  const results = new Map<string, DesktopJobResult>();
  let heartbeat: NodeJS.Timeout | undefined;
  let accepted = false;

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
      if (!accepted && frame?.type === "accepted") {
        accepted = true;
        const interval = options.heartbeatIntervalMs ?? 1_000;
        heartbeat = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ version: 1, type: "heartbeat", at: now() }));
          }
        }, interval);
        resolveReady();
        return;
      }
      if (frame?.type !== "task") return;
      const pack = frame.pack as DesktopTaskPack;
      const result = await executeDesktopTaskPack(pack, { allowedRoots: options.allowedRoots, now });
      results.set(pack.jobId, result);
      if (options.dropResult?.(pack, result)) {
        socket.close(1011, "drop result after local execution");
        return;
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ version: 1, type: "result", result }));
      }
    });
    socket.once("close", (code, reason) => {
      if (!accepted) rejectReady(new Error(`Fake Desktop Agent closed before acceptance: ${code} ${reason}`));
    });
  });

  socket.on("close", () => {
    if (heartbeat) clearInterval(heartbeat);
  });

  await ready;
  return {
    getResult(jobId: string) { return results.get(jobId); },
    close: () => new Promise<void>((resolveClose) => {
      if (socket.readyState === WebSocket.CLOSED) { resolveClose(); return; }
      socket.once("close", () => resolveClose());
      if (socket.readyState === WebSocket.OPEN) socket.close(1000, "fake close");
    }),
  };
}
