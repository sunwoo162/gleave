import { spawn, type ChildProcess } from "node:child_process";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  PrototypeDeployAdapter,
  PrototypeDeployRequest,
  PrototypeDeploymentReceipt,
} from "./deploy-adapter.js";
import type { IdeaLabRuntimeConfig } from "./runtime-config.js";
import { resolveVercelPrototypeDeployAdapter } from "./vercel-deploy-adapter.js";

type LocalPreviewOptions = {
  allowedWorkspaceRoot: string;
  executable: string;
  args: string[];
  host: "127.0.0.1" | "::1";
  port: number;
  readinessTimeoutMs: number;
  fetch?: typeof globalThis.fetch;
  now?: () => string;
  spawnProcess?: typeof spawn;
};

type OwnedPreview = {
  key: string;
  pid: number;
  startedAt: number;
  child: ChildProcess;
  receipt: PrototypeDeploymentReceipt;
};

function insideOrEqual(root: string, target: string): boolean {
  const relation = relative(resolve(root), resolve(target));
  return relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}

function assertPort(port: number): void {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("local preview port must be between 1024 and 65535");
}

function assertLoopback(host: string): asserts host is "127.0.0.1" | "::1" {
  if (host !== "127.0.0.1" && host !== "::1") throw new Error("local preview host must be loopback");
}

function listenerUrl(host: "127.0.0.1" | "::1", port: number): string {
  return `http://${host === "::1" ? `[${host}]` : host}:${port}/`;
}

function assertListenerUrl(value: string, host: "127.0.0.1" | "::1", port: number): void {
  const expected = listenerUrl(host, port);
  if (value !== expected) throw new Error("local preview URL is outside the configured listener");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("local preview URL is invalid");
  }
  if (parsed.href !== expected) throw new Error("local preview URL is outside the configured listener");
}

function alive(owner: OwnedPreview): boolean {
  return owner.child.exitCode === null && owner.child.signalCode === null && owner.child.killed === false;
}

function expandArgs(args: string[], port: number, workspaceRoot: string): string[] {
  return args.map((arg) => arg.replaceAll("{port}", String(port)).replaceAll("{workspace}", workspaceRoot));
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolvePromise) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise();
    };
    const timer = setTimeout(finish, timeoutMs);
    child.once("close", finish);
  });
}

export function createLocalPreviewDeployAdapter(options: LocalPreviewOptions): PrototypeDeployAdapter & { dispose(): Promise<void> } {
  const allowedWorkspaceRoot = resolve(options.allowedWorkspaceRoot);
  if (!isAbsolute(options.executable)) throw new Error("local preview executable must be absolute");
  const executable = resolve(options.executable);
  assertLoopback(options.host);
  assertPort(options.port);
  if (!Number.isInteger(options.readinessTimeoutMs) || options.readinessTimeoutMs <= 0) {
    throw new Error("local preview readiness timeout must be positive");
  }
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("local preview requires fetch");
  const spawnProcess = options.spawnProcess ?? spawn;
  const now = options.now ?? (() => new Date().toISOString());
  const owners = new Map<string, OwnedPreview>();

  function requestWorkspace(input: PrototypeDeployRequest): string {
    if (!input.runId?.trim()) throw new Error("local preview requires Run identity");
    if (!input.workspaceRoot?.trim()) throw new Error("local preview requires workspace root");
    const workspaceRoot = resolve(input.workspaceRoot);
    if (!insideOrEqual(allowedWorkspaceRoot, workspaceRoot)) throw new Error("local preview workspace is outside the allowed sandbox");
    return workspaceRoot;
  }

  async function stop(owner: OwnedPreview): Promise<void> {
    if (alive(owner)) owner.child.kill();
    await waitForExit(owner.child, Math.min(options.readinessTimeoutMs, 5_000));
    owners.delete(owner.key);
  }

  async function fetchReady(url: string): Promise<void> {
    const deadline = Date.now() + options.readinessTimeoutMs;
    let lastError = "local preview did not become ready";
    while (Date.now() <= deadline) {
      try {
        const response = await fetchImpl(url);
        if (response.status >= 200 && response.status < 400) return;
        lastError = `local preview HTTP status ${response.status}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    }
    throw new Error(lastError);
  }

  return {
    async reconcile(input) {
      const owner = owners.get(input.key);
      if (!owner || !alive(owner)) {
        if (owner) owners.delete(input.key);
        return null;
      }
      if (owner.receipt.commitSha !== input.commitSha || owner.receipt.provider !== "local-preview") {
        throw new Error("local preview deployment identity mismatch");
      }
      return { ...owner.receipt };
    },
    async deploy(input) {
      const workspaceRoot = requestWorkspace(input);
      if (owners.has(input.key)) throw new Error("local preview deployment already owns this identity");
      const port = options.port;
      const url = listenerUrl(options.host, port);
      const child = spawnProcess(executable, expandArgs(options.args, port, workspaceRoot), {
        cwd: workspaceRoot,
        env: { ...process.env, ISEOL_PREVIEW_HOST: options.host, ISEOL_PREVIEW_PORT: String(port) },
        stdio: "ignore",
        windowsHide: true,
        shell: false,
      });
      if (!child.pid) throw new Error("local preview process did not expose a PID");
      const owner: OwnedPreview = {
        key: input.key,
        pid: child.pid,
        startedAt: Date.now(),
        child,
        receipt: {
          provider: "local-preview",
          deploymentId: `local-preview:${input.runId}:${input.productionId}:${port}`,
          url,
          commitSha: input.commitSha,
          deployedAt: now(),
        },
      };
      owners.set(input.key, owner);
      try {
        await fetchReady(url);
        if (!alive(owner)) throw new Error("local preview process exited before readiness");
        return { ...owner.receipt };
      } catch (error) {
        if (!alive(owner)) error = new Error("local preview process exited before readiness");
        await stop(owner);
        throw error;
      }
    },
    async verify(input) {
      const workspaceRoot = requestWorkspace(input);
      void workspaceRoot;
      const owner = owners.get(input.key);
      if (!owner || !alive(owner)) throw new Error("local preview process is not owned or has exited");
      if (input.deployment.provider !== "local-preview" || input.deployment.commitSha !== input.commitSha) {
        throw new Error("local preview verification identity mismatch");
      }
      assertListenerUrl(input.deployment.url, options.host, options.port);
      await fetchReady(input.deployment.url);
      owner.receipt = { ...owner.receipt, verifiedAt: now() };
      return { ...owner.receipt };
    },
    async dispose() {
      for (const owner of [...owners.values()]) await stop(owner);
    },
  };
}

export function resolveIdeaLabDeployAdapter(
  env: Record<string, string | undefined>,
  config: Extract<IdeaLabRuntimeConfig, { enabled: true }>,
): (PrototypeDeployAdapter & { dispose?: () => Promise<void> }) | null {
  if (config.deploymentMode !== "local-preview") return resolveVercelPrototypeDeployAdapter(env);
  if (!config.previewExecutable || !config.previewArgs || !config.previewHost || !config.previewPort || !config.previewTimeoutMs) {
    return null;
  }
  return createLocalPreviewDeployAdapter({
    allowedWorkspaceRoot: config.sandboxRoot,
    executable: config.previewExecutable,
    args: config.previewArgs,
    host: config.previewHost,
    port: config.previewPort,
    readinessTimeoutMs: config.previewTimeoutMs,
  });
}
