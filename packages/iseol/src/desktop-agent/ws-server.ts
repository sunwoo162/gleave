import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import { assertDesktopProtocolVersion, type DesktopAgentHello } from "./contracts.js";
import type { DesktopAgentTransport, DesktopAgentWire, DesktopClientMessage } from "./transport.js";
import { sanitizeCredentialText } from "../security/text-safety.js";

export type StartDesktopAgentWebSocketServerOptions = {
  host: string;
  port: number;
  transport: DesktopAgentTransport;
};

function parseFrame(data: WebSocket.RawData): unknown {
  return JSON.parse(data.toString());
}

function boundedCloseReason(message: string): string {
  let result = sanitizeCredentialText(message, 120);
  while (Buffer.byteLength(result, "utf8") > 123) result = result.slice(0, -1);
  return result;
}

export async function startDesktopAgentWebSocketServer(
  options: StartDesktopAgentWebSocketServerOptions,
) {
  const server = new WebSocketServer({ host: options.host, port: options.port });
  await new Promise<void>((resolveReady, reject) => {
    server.once("listening", resolveReady);
    server.once("error", reject);
  });

  server.on("connection", (socket) => {
    const sessionId = randomUUID();
    let accepted = false;
    const wire: DesktopAgentWire = {
      send: (message) => socket.send(JSON.stringify(message)),
      close: (reason) => socket.close(4000, boundedCloseReason(reason ?? "")),
    };

    socket.on("message", async (data) => {
      try {
        const frame = parseFrame(data);
        if (!accepted) {
          if (!frame || typeof frame !== "object" || (frame as any).type !== "hello") {
            throw new Error("Desktop Agent first WebSocket frame must be hello");
          }
          assertDesktopProtocolVersion((frame as { version?: number }).version ?? 0);
          const hello = (frame as { hello: DesktopAgentHello }).hello;
          await options.transport.acceptHello(sessionId, hello, wire);
          accepted = true;
          socket.send(JSON.stringify({ version: 1, type: "accepted", sessionId }));
          return;
        }
        await options.transport.handleMessage(sessionId, frame as DesktopClientMessage);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        socket.close(4001, boundedCloseReason(message));
      }
    });

    socket.on("close", () => options.transport.disconnect(sessionId));
  });

  const address = server.address() as AddressInfo;
  return {
    url: `ws://${options.host}:${address.port}`,
    close: () => new Promise<void>((resolveClose, reject) => {
      for (const client of server.clients) client.terminate();
      server.close((error) => error ? reject(error) : resolveClose());
    }),
  };
}
