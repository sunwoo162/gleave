import { resolve } from "node:path";
import { createDesktopAgentTransport } from "./transport.js";
import { startDesktopAgentWebSocketServer } from "./ws-server.js";

export type DesktopAgentCoreConfig = {
  enabled: boolean;
  host: string;
  port: number;
  stateRoot: string;
  token?: string;
};

type CoreEnv = Record<string, string | undefined>;

function loopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

function parsePort(value: string | undefined, allowEphemeralPort: boolean): number {
  const port = value?.trim() ? Number(value) : 8791;
  const minimum = allowEphemeralPort ? 0 : 1;
  if (!Number.isInteger(port) || port < minimum || port > 65535) {
    throw new Error(`Invalid ISEOL_DESKTOP_AGENT_PORT: ${value ?? ""}`);
  }
  return port;
}
export function resolveDesktopAgentCoreConfig(
  env: CoreEnv,
  cwd = process.cwd(),
  options: { allowEphemeralPort?: boolean } = {},
): DesktopAgentCoreConfig {
  const hostValue = env.ISEOL_DESKTOP_AGENT_HOST?.trim();
  const portValue = env.ISEOL_DESKTOP_AGENT_PORT?.trim();
  const rootValue = env.ISEOL_DESKTOP_AGENT_ROOT?.trim();
  const token = env.ISEOL_DESKTOP_AGENT_TOKEN?.trim();
  const configured = Boolean(hostValue || portValue || rootValue || token);
  const host = hostValue || "127.0.0.1";
  const port = parsePort(portValue, options.allowEphemeralPort ?? false);
  const stateRoot = resolve(cwd, rootValue || "data/desktop-agent");

  if (!configured) return { enabled: false, host, port, stateRoot };
  if (!token) throw new Error("ISEOL_DESKTOP_AGENT_TOKEN is required when Desktop Agent Core is configured");
  if (!loopbackHost(host)) {
    throw new Error("Desktop Agent Core must bind to loopback and use a TLS reverse proxy for public access");
  }
  return { enabled: true, host, port, stateRoot, token };
}

export async function startDesktopAgentCoreService(config: DesktopAgentCoreConfig) {
  if (!config.enabled || !config.token) throw new Error("Desktop Agent Core service is not enabled");
  const transport = createDesktopAgentTransport({
    registryRoot: config.stateRoot,
    expectedToken: config.token,
  });
  const server = await startDesktopAgentWebSocketServer({
    host: config.host,
    port: config.port,
    transport,
  });
  return {
    config,
    transport,
    url: server.url,
    close: server.close,
  };
}
