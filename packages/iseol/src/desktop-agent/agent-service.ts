import { homedir, userInfo } from "node:os";
import { resolve } from "node:path";
import { assertDesktopAgentId } from "./agent-registry.js";
import { executeDesktopTaskPack } from "./runtime.js";
import type { DesktopJobResult } from "./contracts.js";
import { desktopOperationCapability } from "./contracts.js";
import { loadCompletedDesktopResults, persistCompletedDesktopResult } from "./result-store.js";
import { connectDesktopAgentWebSocketClient } from "./ws-client.js";

export type DesktopAgentClientConfig = {
  url: string;
  token: string;
  agentId: string;
  requiredOsUser: string;
  workspaceRoots: string[];
  policyRoots?: string[];
  heartbeatIntervalMs: number;
  reconnectBaseMs: number;
  reconnectMaxMs: number;
  resultRoot?: string;
};

type AgentEnv = Record<string, string | undefined>;

type DesktopAgentConnection = {
  close(): Promise<void>;
  closed: Promise<void>;
};

type PersistentAgentDeps = {
  signal?: AbortSignal;
  connect?: typeof connectDesktopAgentWebSocketClient;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  currentOsUser?: () => string;
};
function required(env: AgentEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredRaw(env: AgentEnv, name: string): string {
  const value = env[name];
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value;
}

function positiveInt(value: string | undefined, fallback: number, name: string): number {
  const parsed = value?.trim() ? Number(value) : fallback;
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function assertSecureAgentUrl(value: string): string {
  const raw = value.trim();
  if (!raw || raw !== value || /[\\\u0000-\u001f\u007f]/.test(raw) || /%5c/i.test(raw)) {
    throw new Error("Desktop Agent URL is invalid");
  }
  const schemeSeparator = raw.indexOf("://");
  if (schemeSeparator >= 0) {
    const authority = raw.slice(schemeSeparator + 3).split(/[\/?#]/, 1)[0] ?? "";
    if (authority.includes("@")) throw new Error("Desktop Agent URL must not contain credentials");
  }
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Desktop Agent URL is invalid"); }
  const host = url.hostname.toLowerCase();
  const loopback = ["127.0.0.1", "::1", "[::1]", "localhost"].includes(host);
  if (url.username || url.password) throw new Error("Desktop Agent URL must not contain credentials");
  if (url.protocol !== "wss:" && !(url.protocol === "ws:" && loopback)) {
    throw new Error("Desktop Agent wss:// transport is required for public connections");
  }
  return url.toString();
}

export function resolveDesktopAgentClientConfig(env: AgentEnv): DesktopAgentClientConfig {
  const url = assertSecureAgentUrl(requiredRaw(env, "ISEOL_DESKTOP_AGENT_URL"));
  const token = required(env, "ISEOL_DESKTOP_AGENT_TOKEN");
  const agentId = required(env, "ISEOL_DESKTOP_AGENT_ID");
  assertDesktopAgentId(agentId);
  const requiredOsUser = required(env, "ISEOL_DESKTOP_AGENT_REQUIRED_OS_USER");
  const roots = required(env, "ISEOL_DESKTOP_AGENT_WORKSPACE_ROOTS")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => resolve(item));
  if (roots.length === 0) throw new Error("ISEOL_DESKTOP_AGENT_WORKSPACE_ROOTS is required");
  const policyRoots = (env.ISEOL_DESKTOP_AGENT_POLICY_ROOTS ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => resolve(item));
  const heartbeatIntervalMs = positiveInt(env.ISEOL_DESKTOP_AGENT_HEARTBEAT_MS, 5_000, "ISEOL_DESKTOP_AGENT_HEARTBEAT_MS");
  const reconnectBaseMs = positiveInt(env.ISEOL_DESKTOP_AGENT_RECONNECT_BASE_MS, 1_000, "ISEOL_DESKTOP_AGENT_RECONNECT_BASE_MS");
  const reconnectMaxMs = positiveInt(env.ISEOL_DESKTOP_AGENT_RECONNECT_MAX_MS, 30_000, "ISEOL_DESKTOP_AGENT_RECONNECT_MAX_MS");
  if (reconnectMaxMs < reconnectBaseMs) {
    throw new Error("ISEOL_DESKTOP_AGENT_RECONNECT_MAX_MS must be >= reconnect base");
  }
  return {
    url,
    token,
    agentId,
    requiredOsUser,
    workspaceRoots: [...new Set(roots)],
    policyRoots: [...new Set(policyRoots)],
    heartbeatIntervalMs,
    reconnectBaseMs,
    reconnectMaxMs,
    resultRoot: resolve(env.ISEOL_DESKTOP_AGENT_RESULT_ROOT?.trim() || resolve(homedir(), ".iseol", "desktop-agent", agentId, "completed-results")),
  };
}

export function assertDesktopAgentOsIdentity(requiredOsUser: string, actualOsUser: string): void {
  const same = process.platform === "win32" ? requiredOsUser.toLowerCase() === actualOsUser.toLowerCase() : requiredOsUser === actualOsUser;
  if (!same) throw new Error(`Desktop Agent OS identity mismatch: required ${requiredOsUser}, actual ${actualOsUser}`);
}

function aborted(signal?: AbortSignal): boolean {
  return signal?.aborted ?? false;
}

async function waitForAbort(signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise<void>(() => undefined);
  if (signal.aborted) return;
  await new Promise<void>((resolveAbort) => {
    signal.addEventListener("abort", () => resolveAbort(), { once: true });
  });
}
export async function runPersistentDesktopAgent(
  config: DesktopAgentClientConfig,
  deps: PersistentAgentDeps = {},
): Promise<void> {
  const currentOsUser = deps.currentOsUser ?? (() => userInfo().username);
  assertDesktopAgentOsIdentity(config.requiredOsUser, currentOsUser());
  const connect = deps.connect ?? connectDesktopAgentWebSocketClient;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolveDelay) => setTimeout(resolveDelay, ms)));
  const random = deps.random ?? Math.random;
  let failures = 0;
  const resultRoot = config.resultRoot ?? resolve(homedir(), ".iseol", "desktop-agent", config.agentId, "completed-results");
  const completedResults = await loadCompletedDesktopResults(resultRoot);

  while (!aborted(deps.signal)) {
    let connection: DesktopAgentConnection | null = null;
    try {
      connection = await connect({
        url: config.url,
        hello: {
          version: 1,
          agentId: config.agentId,
          agentVersion: "0.1.0",
          os: process.platform,
          capabilities: ["files", "test", "build", "git", "http", desktopOperationCapability("GIT_INIT"), desktopOperationCapability("GIT_INSPECT")],
          workspaceRoots: config.workspaceRoots,
          token: config.token,
        },
        heartbeatIntervalMs: config.heartbeatIntervalMs,
        completedResults,
        persistResult: (result) => persistCompletedDesktopResult(resultRoot, result),
        onTask: (pack) => executeDesktopTaskPack(pack, {
          allowedRoots: config.workspaceRoots,
          policyRoots: config.policyRoots ?? [],
        }),
      }) as DesktopAgentConnection;
      failures = 0;
      if (aborted(deps.signal)) {
        await connection.close();
        return;
      }
      await Promise.race([connection.closed, waitForAbort(deps.signal)]);
      if (aborted(deps.signal)) {
        await connection.close();
        return;
      }
    } catch {
      if (aborted(deps.signal)) return;
    }

    const baseDelay = Math.min(config.reconnectMaxMs, config.reconnectBaseMs * (2 ** failures));
    failures += 1;
    const delay = Math.min(config.reconnectMaxMs, baseDelay + Math.floor(baseDelay * 0.2 * random()));
    await sleep(delay);
  }
}
