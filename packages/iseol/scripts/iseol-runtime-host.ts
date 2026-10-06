import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { timingSafeEqual } from "node:crypto";
import { chmod, mkdir, open, readFile, rm, rename, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
const execFile = promisify(execFileCallback);
import { startIseolRuntimeServices, type IseolRuntimeServices } from "../src/runtime/iseol-runtime-services.js";
import { loadHarnessRun } from "../src/harness/run-store.js";
import { listDesktopJobs, loadDesktopJob } from "../src/desktop-agent/job-store.js";
import { containDesktopJobAsOperator, inspectDesktopJobReconciliation, issueDesktopJobContainmentApproval } from "../src/desktop-agent/operator-reconciliation.js";
import { operatorCredentialPath, bootstrapOperatorCredential, readOperatorCredential, rotateOperatorCredential, verifyOperatorCredential } from "../src/runtime/operator-credentials.js";

export type IseolRuntimeHostConfig = {
  version: 1;
  dataRoot: string;
  modelRoot: string;
  runRoot: string;
  webWorkerRoot: string;
  browserProfileRoot: string;
  lockPath: string;
  codeVersion?: string;
  projectRuntimeEnabled?: boolean;
  desktopAgentId?: string;
  projectModelRoot?: string;
  projectRunRoot?: string;
  projectWebWorkerRoot?: string;
  projectDesktopStateRoot?: string;
  operatorCredentialPath?: string;
};

export type RuntimeCodeVersion = { codeVersion: string; source: "git-head" | "configured" | "unverified" };

export async function resolveRuntimeCodeVersion(config: Pick<IseolRuntimeHostConfig, "codeVersion">): Promise<RuntimeCodeVersion> {
  try {
    const result = await execFile("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), timeout: 2000, windowsHide: true, maxBuffer: 4096 });
    const head = result.stdout.trim();
    if (/^[0-9a-f]{7,64}$/i.test(head)) return { codeVersion: head, source: "git-head" };
  } catch { /* Git is optional in packaged deployments. */ }
  if (config.codeVersion) return { codeVersion: config.codeVersion, source: "configured" };
  return { codeVersion: "unverified", source: "unverified" };
}

function overlaps(left: string, right: string): boolean {
  const inside = (root: string, target: string) => {
    const relation = relative(resolve(root), resolve(target));
    return relation === "" || (!isAbsolute(relation) && relation !== ".." && !relation.startsWith(`..${sep}`));
  };
  return inside(left, right) || inside(right, left);
}

function validateProjectRoots(config: Pick<IseolRuntimeHostConfig, "modelRoot" | "runRoot" | "webWorkerRoot" | "browserProfileRoot" | "projectModelRoot" | "projectRunRoot" | "projectWebWorkerRoot" | "projectDesktopStateRoot">): void {
  const projectEntries = [
    ["projectModelRoot", config.projectModelRoot],
    ["projectRunRoot", config.projectRunRoot],
    ["projectWebWorkerRoot", config.projectWebWorkerRoot],
    ["projectDesktopStateRoot", config.projectDesktopStateRoot],
  ] as const;
  const existingEntries = [
    ["modelRoot", config.modelRoot],
    ["runRoot", config.runRoot],
    ["webWorkerRoot", config.webWorkerRoot],
    ["browserProfileRoot", config.browserProfileRoot],
  ] as const;
  for (const [projectName, projectRoot] of projectEntries) {
    if (!projectRoot) continue;
    for (const [existingName, existingRoot] of existingEntries) {
      if (overlaps(projectRoot, existingRoot)) throw new Error(`project root overlap: ${projectName} and ${existingName}`);
    }
  }
  for (let index = 0; index < projectEntries.length; index += 1) {
    const [leftName, leftRoot] = projectEntries[index]!;
    if (!leftRoot) continue;
    for (let next = index + 1; next < projectEntries.length; next += 1) {
      const [rightName, rightRoot] = projectEntries[next]!;
      if (rightRoot && overlaps(leftRoot, rightRoot)) throw new Error(`project root overlap: ${leftName} and ${rightName}`);
    }
  }
}

export function loadRuntimeHostConfig(path = process.env.ISEOL_RUNTIME_CONFIG ?? "iseol-runtime.json"): IseolRuntimeHostConfig {
  if (!existsSync(path)) throw new Error(`runtime configuration is missing: ${path}`);
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<IseolRuntimeHostConfig>;
  const required = ["dataRoot", "modelRoot", "runRoot", "webWorkerRoot", "browserProfileRoot"] as const;
  for (const key of required) {
    if (typeof raw[key] !== "string" || !raw[key].trim()) throw new Error(`runtime configuration field is missing: ${key}`);
  }
  const dataRoot = resolve(raw.dataRoot!);
  // Store APIs take the model container, not its idea-lab child directory.
  // Support the historical host configuration without moving or copying data.
  const configuredModelRoot = resolve(raw.modelRoot!);
  const legacyIdeaRoot = configuredModelRoot === resolve(dataRoot, "idea-lab");
  const ideaLabStoreNames = ["campaigns", "productions", "proposals", "prototypes"];
  const hasCanonicalIdeaLabStore = ideaLabStoreNames.some(name => existsSync(resolve(configuredModelRoot, name)));
  const hasNestedIdeaLabStore = ideaLabStoreNames.some(name => existsSync(resolve(configuredModelRoot, "idea-lab", name)));
  if (legacyIdeaRoot && hasCanonicalIdeaLabStore && hasNestedIdeaLabStore) {
    throw new Error("Ambiguous legacy modelRoot: canonical and nested Idea Lab data both exist");
  }
  const projectRuntimeEnabled = raw.projectRuntimeEnabled;
  if (projectRuntimeEnabled !== undefined && typeof projectRuntimeEnabled !== "boolean") {
    throw new Error("runtime configuration field must be boolean: projectRuntimeEnabled");
  }
  if (raw.desktopAgentId !== undefined && (typeof raw.desktopAgentId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(raw.desktopAgentId))) {
    throw new Error("runtime configuration field is invalid: desktopAgentId");
  }
  const config = {
    version: 1,
    dataRoot,
    modelRoot: legacyIdeaRoot && !hasNestedIdeaLabStore ? dataRoot : configuredModelRoot,
    runRoot: resolve(raw.runRoot!),
    webWorkerRoot: resolve(raw.webWorkerRoot!),
    browserProfileRoot: resolve(raw.browserProfileRoot!),
    lockPath: resolve(raw.lockPath ?? `${dataRoot}/runtime/iseol-runtime.lock`),
    ...(typeof raw.codeVersion === "string" && raw.codeVersion.trim() ? { codeVersion: raw.codeVersion.trim().slice(0, 80) } : {}),
    ...(projectRuntimeEnabled === undefined ? {} : { projectRuntimeEnabled }),
    ...(typeof raw.desktopAgentId === "string" ? { desktopAgentId: raw.desktopAgentId } : {}),
    ...(typeof raw.projectModelRoot === "string" && raw.projectModelRoot.trim() ? { projectModelRoot: resolve(raw.projectModelRoot) } : {}),
    ...(typeof raw.projectRunRoot === "string" && raw.projectRunRoot.trim() ? { projectRunRoot: resolve(raw.projectRunRoot) } : {}),
    ...(typeof raw.projectWebWorkerRoot === "string" && raw.projectWebWorkerRoot.trim() ? { projectWebWorkerRoot: resolve(raw.projectWebWorkerRoot) } : {}),
    ...(typeof raw.projectDesktopStateRoot === "string" && raw.projectDesktopStateRoot.trim() ? { projectDesktopStateRoot: resolve(raw.projectDesktopStateRoot) } : {}),
    operatorCredentialPath: resolve(raw.operatorCredentialPath ?? operatorCredentialPath(dataRoot)),
  };
  validateProjectRoots(config);
  return config;
}

export function resolveConfiguredRuntimeOperatorId(storedOperatorId?: string, environmentOperatorId?: string): string {
  return storedOperatorId?.trim() || environmentOperatorId?.trim() || "";
}

/**
 * Resolve the explicitly configured Desktop Core listener used by operator-stop.
 * The Desktop Core resolver has a legacy 8791 default for startup, but an
 * external stop must fail closed when the target port was not explicitly
 * propagated to the CLI process.
 */
export function resolveConfiguredRuntimeDesktopAgentPort(value = process.env.ISEOL_DESKTOP_AGENT_PORT): number | undefined {
  const raw = value?.trim() ?? "";
  if (!raw) return undefined;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("ISEOL_DESKTOP_AGENT_PORT must be a valid TCP port");
  }
  return port;
}

export async function saveRuntimeHostConfig(path: string, config: Omit<IseolRuntimeHostConfig, "version"> & { version?: 1 }): Promise<void> {
  const normalized = {
    version: 1 as const,
    dataRoot: resolve(config.dataRoot),
    modelRoot: resolve(config.modelRoot),
    runRoot: resolve(config.runRoot),
    webWorkerRoot: resolve(config.webWorkerRoot),
    browserProfileRoot: resolve(config.browserProfileRoot),
    lockPath: resolve(config.lockPath),
    ...(config.codeVersion ? { codeVersion: config.codeVersion.slice(0, 80) } : {}),
    ...(config.projectRuntimeEnabled === undefined ? {} : { projectRuntimeEnabled: config.projectRuntimeEnabled }),
    ...(config.desktopAgentId ? { desktopAgentId: config.desktopAgentId } : {}),
    ...(config.projectModelRoot ? { projectModelRoot: resolve(config.projectModelRoot) } : {}),
    ...(config.projectRunRoot ? { projectRunRoot: resolve(config.projectRunRoot) } : {}),
    ...(config.projectWebWorkerRoot ? { projectWebWorkerRoot: resolve(config.projectWebWorkerRoot) } : {}),
    ...(config.projectDesktopStateRoot ? { projectDesktopStateRoot: resolve(config.projectDesktopStateRoot) } : {}),
    operatorCredentialPath: resolve(config.operatorCredentialPath ?? operatorCredentialPath(config.dataRoot)),
  };
  validateProjectRoots(normalized);
  const temporary = `${path}.${process.pid}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporary, JSON.stringify(normalized, null, 2), "utf8");
  await rename(temporary, path);
}

export function runtimeMaintenanceLockPath(runtimeLockPath: string): string {
  return resolve(dirname(runtimeLockPath), "iseol-maintenance.lock");
}

export function parseRuntimeHostStdin<T>(raw: string): T {
  return JSON.parse(raw.replace(/^\uFEFF/, "")) as T;
}

export function normalizeRuntimeLockRecoveryInput(input: {
  expectedFingerprint?: unknown;
  recoveryConfirmation?: unknown;
  legacyOwnerConfirmation?: unknown;
}): {
  expectedFingerprint: string;
  confirmation: string;
  legacyOwnerConfirmation?: string;
} {
  return {
    expectedFingerprint: typeof input.expectedFingerprint === "string" ? input.expectedFingerprint : "",
    confirmation: typeof input.recoveryConfirmation === "string" ? input.recoveryConfirmation : "",
    ...(typeof input.legacyOwnerConfirmation === "string" ? { legacyOwnerConfirmation: input.legacyOwnerConfirmation } : {}),
  };
}

function readRuntimeHostStdin<T>(): T {
  // fs.promises.readFile does not accept numeric stdin descriptors on Windows;
  // readFileSync(0) is the supported cross-shell path for redirected stdin.
  return parseRuntimeHostStdin<T>(readFileSync(0, "utf8"));
}

export function runtimeRecoveryLockPath(runtimeLockPath: string): string {
  return resolve(dirname(runtimeLockPath), "iseol-recovery.lock");
}

export function runtimeStopSignal(platform = process.platform): "SIGINT" | "SIGTERM" {
  return platform === "win32" ? "SIGINT" : "SIGTERM";
}

export type RuntimeShutdownRequest = {
  expectedPid: number;
  expectedFingerprint: string;
  expectedOwnerIdentity: string;
  operatorId: string;
  requestId: string;
};

export type RuntimeShutdownResponse =
  | { status: "stopped"; pid: number }
  | { status: "stop-failed"; pid: number; reason: string }
  | { status: "rejected"; reason: string };

/**
 * The endpoint is derived from the lock path rather than persisted in the lock.
 * On Windows this is a named pipe, which avoids the non-catchable SIGINT path
 * for detached/non-console Node processes. On POSIX it is a private Unix socket
 * next to the lock and is removed when the server is closed.
 */
export function runtimeShutdownEndpoint(lockPath: string): string {
  const endpointId = createHash("sha256").update(resolve(lockPath), "utf8").digest("hex").slice(0, 32);
  return process.platform === "win32"
    ? `\\\\.\\pipe\\iseol-runtime-shutdown-${endpointId}`
    : resolve(dirname(lockPath), `.iseol-runtime-shutdown-${endpointId}.sock`);
}

function boundedShutdownReason(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return reason.replace(/[\r\n]+/g, " ").slice(0, 240) || "shutdown failed";
}

export async function createRuntimeShutdownServer(
  endpoint: string,
  handler: (request: RuntimeShutdownRequest) => Promise<RuntimeShutdownResponse>,
  onResponse?: (response: RuntimeShutdownResponse) => void,
): Promise<{ endpoint: string; close: () => Promise<void> }> {
  if (process.platform !== "win32") await rm(endpoint, { force: true });
  const server: Server = createServer((socket: Socket) => {
    let input = "";
    let settled = false;
    const finish = async () => {
      if (settled) return;
      settled = true;
      try {
        if (input.length > 16 * 1024) throw new Error("shutdown request is too large");
        const parsed = JSON.parse(input) as Partial<RuntimeShutdownRequest>;
        if (!Number.isInteger(parsed.expectedPid) || parsed.expectedPid <= 0
          || typeof parsed.expectedFingerprint !== "string"
          || typeof parsed.expectedOwnerIdentity !== "string"
          || typeof parsed.operatorId !== "string"
          || typeof parsed.requestId !== "string") throw new Error("shutdown request is invalid");
        const response = await handler(parsed as RuntimeShutdownRequest);
        socket.end(`${JSON.stringify(response)}\n`, () => onResponse?.(response));
      } catch (error) {
        socket.end(`${JSON.stringify({ status: "rejected", reason: boundedShutdownReason(error) })}\n`);
      }
    };
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      if (settled) return;
      input += chunk;
      if (input.includes("\n")) {
        input = input.slice(0, input.indexOf("\n"));
        void finish();
      }
    });
    socket.on("end", () => { void finish(); });
    socket.on("error", () => { settled = true; });
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error) => { server.off("listening", onListening); rejectListen(error); };
    const onListening = () => { server.off("error", onError); resolveListen(); };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(endpoint);
  });
  if (process.platform !== "win32") await chmod(endpoint, 0o600);
  return {
    endpoint,
    close: () => new Promise<void>((resolveClose, rejectClose) => {
      server.close(async (error) => {
        if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") { rejectClose(error); return; }
        if (process.platform !== "win32") await rm(endpoint, { force: true });
        resolveClose();
      });
    }),
  };
}

export async function requestRuntimeShutdown(
  endpoint: string,
  request: RuntimeShutdownRequest,
  timeoutMs = 15_000,
): Promise<RuntimeShutdownResponse> {
  return new Promise((resolveResponse, rejectResponse) => {
    let output = "";
    let settled = false;
    const socket = createConnection(endpoint);
    const finish = (error?: Error, response?: RuntimeShutdownResponse) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) rejectResponse(error);
      else resolveResponse(response!);
    };
    socket.setTimeout(timeoutMs, () => finish(new Error("Runtime graceful shutdown timed out")));
    socket.setEncoding("utf8");
    socket.once("connect", () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk: string) => {
      output += chunk;
      const newline = output.indexOf("\n");
      if (newline < 0) return;
      try {
        const response = JSON.parse(output.slice(0, newline)) as RuntimeShutdownResponse;
        if (!response || typeof response !== "object" || typeof response.status !== "string") throw new Error("Runtime shutdown response is invalid");
        finish(undefined, response);
      } catch (error) { finish(error instanceof Error ? error : new Error("Runtime shutdown response is invalid")); }
    });
    socket.once("error", (error) => finish(error instanceof Error ? error : new Error("Runtime shutdown control channel failed")));
    socket.once("end", () => { if (!settled) finish(new Error("Runtime shutdown control channel closed without a result")); });
  });
}

export type RuntimeLockOwnerProbe = (pid: number, lock: Record<string, unknown>) => Promise<{
  state: "verified" | "absent" | "reused" | "unavailable";
  identity?: string;
  executable?: string;
  createdAt?: string;
}>;

export type RuntimeLockInspection = {
  state: "stopped" | "running" | "stale" | "owner-unconfirmed" | "owner-reused" | "unreadable";
  fingerprint: string;
  identity: Record<string, unknown>;
  owner: { state: "verified" | "absent" | "reused" | "unavailable"; identity?: string };
  reason?: string;
};

function normalizedExecutable(executable: string): string {
  return executable.replaceAll("/", "\\").toLowerCase();
}

function processIdentity(executable: string, createdAt: string | undefined, pid: number, commandLine?: string): string {
  const stable = createdAt ? { pid, executable: normalizedExecutable(executable), createdAt } : { pid, executable: normalizedExecutable(executable), commandLine: commandLine ?? "" };
  return createHash("sha256").update(JSON.stringify(stable), "utf8").digest("hex");
}

export type RuntimeProcessIdentity = { executable: string; commandLine: string; createdAt?: string };

async function readProcessIdentity(pid: number): Promise<RuntimeProcessIdentity | null> {
  if (process.platform === "win32") {
    try {
      const filter = `ProcessId = ${pid}`;
      const result = await execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `$p=Get-CimInstance Win32_Process -Filter '${filter}'; if($p){$p | Select-Object ExecutablePath,CommandLine,@{Name='CreationTimeUtc';Expression={$_.CreationDate.ToUniversalTime().ToString('o')}} | ConvertTo-Json -Compress}`], { timeout: 2000, maxBuffer: 64 * 1024 });
      const parsed = JSON.parse(result.stdout.trim()) as { ExecutablePath?: unknown; CommandLine?: unknown; CreationTimeUtc?: unknown };
      if (typeof parsed.ExecutablePath === "string" && typeof parsed.CommandLine === "string") return { executable: parsed.ExecutablePath, commandLine: parsed.CommandLine, ...(typeof parsed.CreationTimeUtc === "string" ? { createdAt: parsed.CreationTimeUtc } : {}) };
    } catch { return null; }
    return null;
  }
  try {
    const commandLine = (await readFile(`/proc/${pid}/cmdline`, "utf8")).replaceAll("\0", " ").trim();
    return commandLine ? { executable: commandLine.split(" ")[0]!, commandLine, createdAt: new Date(Date.now() - process.uptime() * 1000).toISOString() } : null;
  } catch { return null; }
}

async function readRuntimePortOwner(port: number): Promise<number | null> {
  if (process.platform !== "win32") return null;
  try {
    const result = await execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-NetTCPConnection -LocalPort ${Math.trunc(port)} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)`], { timeout: 2000, maxBuffer: 4096, windowsHide: true });
    const value = Number.parseInt(result.stdout.trim(), 10);
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

const defaultRuntimeOwnerProbe: RuntimeLockOwnerProbe = async (pid, lock) => {
  try {
    process.kill(pid, 0);
    const observed = await readProcessIdentity(pid);
    if (!observed) return { state: "unavailable" };
    const observedIdentity = processIdentity(observed.executable, observed.createdAt, pid, observed.commandLine);
    const result = { identity: observedIdentity, executable: observed.executable, ...(observed.createdAt ? { createdAt: observed.createdAt } : {}) };
    if (lock.ownerIdentity === observedIdentity) return { state: "verified", ...result };
    if (typeof lock.ownerCreatedAt === "string" && observed.createdAt && typeof lock.ownerExecutable === "string" && normalizedExecutable(lock.ownerExecutable) === normalizedExecutable(observed.executable)) return { state: "reused", ...result };
    return { state: "unavailable", ...result };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH"
      ? { state: "absent" }
      : { state: "unavailable" };
  }
};

function lockFingerprint(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

async function runtimeOwnerMetadata(): Promise<{ ownerIdentity: string; ownerExecutable: string; ownerCommandLine: string; ownerCreatedAt: string }> {
  const ownerExecutable = process.execPath;
  const ownerCommandLine = [process.execPath, ...process.argv].join(" ");
  const observed = await readProcessIdentity(process.pid);
  const ownerCreatedAt = observed?.createdAt ?? new Date(Date.now() - process.uptime() * 1000).toISOString();
  return { ownerIdentity: processIdentity(ownerExecutable, ownerCreatedAt, process.pid, ownerCommandLine), ownerExecutable, ownerCommandLine, ownerCreatedAt };
}

export async function inspectRuntimeLock(path: string, probe: RuntimeLockOwnerProbe = defaultRuntimeOwnerProbe): Promise<RuntimeLockInspection> {
  let raw: string;
  try { raw = await readFile(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "stopped", fingerprint: "", identity: {}, owner: { state: "absent" } };
    return { state: "unreadable", fingerprint: "", identity: {}, owner: { state: "unavailable" }, reason: "lock-read-failed" };
  }
  const fingerprint = lockFingerprint(raw);
  let identity: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    identity = parsed as Record<string, unknown>;
  } catch {
    return { state: "unreadable", fingerprint, identity: {}, owner: { state: "unavailable" }, reason: "lock-json-invalid" };
  }
  const pid = Number.isInteger(identity.pid) && (identity.pid as number) > 0 ? identity.pid as number : null;
  if (pid === null) return { state: "unreadable", fingerprint, identity, owner: { state: "unavailable" }, reason: "lock-pid-invalid" };
  const owner = await probe(pid, identity);
  if (owner.state === "verified" && identity.ownerIdentity && owner.identity === identity.ownerIdentity) {
    return { state: "running", fingerprint, identity, owner };
  }
  if (owner.state === "reused") {
    return { state: "owner-reused", fingerprint, identity, owner };
  }
  if (owner.state === "unavailable") return { state: "owner-unconfirmed", fingerprint, identity, owner };
  if (owner.state === "absent" && typeof identity.ownerIdentity === "string" && identity.ownerIdentity.length > 0) {
    return { state: "stale", fingerprint, identity, owner };
  }
  return { state: "owner-unconfirmed", fingerprint, identity, owner };
}

async function assertNoMaintenanceOwnership(runtimeLockPath: string): Promise<void> {
  const maintenancePath = runtimeMaintenanceLockPath(runtimeLockPath);
  const recoveryPath = runtimeRecoveryLockPath(runtimeLockPath);
  try {
    await readFile(maintenancePath, "utf8");
    throw new Error("maintenance ownership is active; refusing Runtime startup");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    await readFile(recoveryPath, "utf8");
    throw new Error("Runtime recovery ownership is active; refusing Runtime startup");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function acquireRuntimeMaintenanceLock(
  runtimeLockPath: string,
  maintenancePath = runtimeMaintenanceLockPath(runtimeLockPath),
  metadata: { dataRoot?: string; codeVersion?: string; codeVersionSource?: RuntimeCodeVersion["source"] } = {},
  options: { allowRecoveryOwnership?: boolean } = {},
): Promise<() => Promise<void>> {
  if (!options.allowRecoveryOwnership) {
    try {
      await readFile(runtimeLockPath, "utf8");
      throw new Error("Runtime ownership is active; maintenance mode requires a stopped Runtime");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await readFile(runtimeRecoveryLockPath(runtimeLockPath), "utf8");
      throw new Error("Runtime recovery ownership is active; refusing maintenance takeover");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  await mkdir(dirname(maintenancePath), { recursive: true });
  let handle: FileHandle;
  try { handle = await open(maintenancePath, "wx"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("maintenance ownership already exists; refusing takeover");
    throw error;
  }
  await handle.writeFile(JSON.stringify({ version: 2, pid: process.pid, ...(await runtimeOwnerMetadata()), startedAt: new Date().toISOString(), ...metadata }));
  return async () => { await handle.close(); await rm(maintenancePath, { force: true }); };
}

export async function acquireRuntimeRecoveryLock(
  runtimeLockPath: string,
  recoveryPath = runtimeRecoveryLockPath(runtimeLockPath),
  metadata: { dataRoot?: string; codeVersion?: string; codeVersionSource?: RuntimeCodeVersion["source"] } = {},
): Promise<() => Promise<void>> {
  try {
    await readFile(runtimeMaintenanceLockPath(runtimeLockPath), "utf8");
    throw new Error("maintenance ownership is active; refusing Runtime recovery");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(dirname(recoveryPath), { recursive: true });
  let handle: FileHandle;
  try { handle = await open(recoveryPath, "wx"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Runtime recovery ownership already exists; refusing takeover");
    throw error;
  }
  await handle.writeFile(JSON.stringify({ version: 2, pid: process.pid, ...(await runtimeOwnerMetadata()), startedAt: new Date().toISOString(), ...metadata }));
  return async () => { await handle.close(); await rm(recoveryPath, { force: true }); };
}

export async function acquireRuntimeLock(path: string, metadata: { dataRoot?: string; codeVersion?: string; codeVersionSource?: RuntimeCodeVersion["source"] } = {}): Promise<() => Promise<void>> {
  await assertNoMaintenanceOwnership(path);
  await mkdir(dirname(path), { recursive: true });
  let handle: FileHandle;
  try { handle = await open(path, "wx"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let ownerPid: number | null = null;
    let rawLock = "";
    try {
      rawLock = await readFile(path, "utf8");
      const lock = JSON.parse(rawLock) as { pid?: unknown };
      ownerPid = Number.isInteger(lock.pid) && (lock.pid as number) > 0 ? lock.pid as number : null;
    } catch {
      throw new Error("runtime lock is unreadable; refusing to remove it");
    }
    if (ownerPid !== null) {
      try { process.kill(ownerPid, 0); } catch (probeError) {
        if ((probeError as NodeJS.ErrnoException).code === "ESRCH") {
          throw new Error(`stale Runtime lock requires explicit operator recovery (path: ${path}; fingerprint: ${lockFingerprint(rawLock)})`);
        }
        throw new Error("Runtime lock owner could not be verified; refusing takeover");
      }
    }
    if (!handle!) throw new Error("another Iseol runtime already owns this configuration");
  }
  const owner = await runtimeOwnerMetadata();
  await handle.writeFile(JSON.stringify({ version: 2, pid: process.pid, ...owner, startedAt: new Date().toISOString(), ...metadata }));
  return async () => {
    try {
      const current = JSON.parse(await readFile(path, "utf8")) as { ownerIdentity?: unknown };
      if (current.ownerIdentity !== owner.ownerIdentity) throw new Error("Runtime lock ownership changed before release");
      await rm(path, { force: true });
    } finally { await handle.close(); }
  };
}

export async function readRuntimeHostStatus(config: IseolRuntimeHostConfig): Promise<Record<string, unknown>> {
  const inspection = await inspectRuntimeLock(config.lockPath);
  return { state: inspection.state, configVersion: config.version, dataRoot: config.dataRoot, codeVersion: inspection.identity.codeVersion ?? config.codeVersion ?? "unverified", codeVersionSource: inspection.identity.codeVersionSource ?? (config.codeVersion ? "configured" : "unverified"), fingerprint: inspection.fingerprint, owner: inspection.owner, ...inspection.identity, ...(inspection.reason ? { reason: inspection.reason } : {}) };
}

export async function requestRuntimeStop(config: Pick<IseolRuntimeHostConfig, "lockPath"> & {
  operatorId?: string;
  operatorCredentialVerified?: boolean;
}): Promise<{ state: "stopped"; pid: number }> {
  const inspection = await inspectRuntimeLock(config.lockPath);
  if (inspection.state !== "running" || inspection.owner.state !== "verified" || !Number.isInteger(inspection.identity.pid)) {
    throw new Error(`Runtime stop requires a verified running owner (state: ${inspection.state})`);
  }
  if (!config.operatorId || !config.operatorCredentialVerified) throw new Error("operator-authentication-failed");
  const pid = inspection.identity.pid as number;
  const raw = await readFile(config.lockPath, "utf8");
  const expectedOwnerIdentity = typeof inspection.identity.ownerIdentity === "string" ? inspection.identity.ownerIdentity : "";
  if (!expectedOwnerIdentity || lockFingerprint(raw) !== inspection.fingerprint) throw new Error("Runtime lock changed before graceful stop");
  const response = await requestRuntimeShutdown(runtimeShutdownEndpoint(config.lockPath), {
    expectedPid: pid,
    expectedFingerprint: inspection.fingerprint,
    expectedOwnerIdentity,
    operatorId: config.operatorId,
    requestId: randomUUID(),
  });
  if (response.status === "stopped") return { state: "stopped", pid: response.pid };
  if (response.status === "stop-failed") throw new Error(`Runtime graceful shutdown failed: ${response.reason}`);
  throw new Error(`Runtime graceful shutdown rejected: ${response.reason}`);
}

export async function runRuntimeStopLifecycle(input: {
  pid: number;
  dispose: () => Promise<void>;
  release: () => Promise<void>;
  close?: () => void;
}): Promise<RuntimeShutdownResponse> {
  try {
    await input.dispose();
    await input.release();
    input.close?.();
    return { status: "stopped", pid: input.pid };
  } catch (error) {
    // Releasing a lock after a partial disposal would allow another Runtime
    // to start while resources may still be alive, so fail closed instead.
    return { status: "stop-failed", pid: input.pid, reason: boundedShutdownReason(error) };
  }
}

function normalizedCommandLine(commandLine: string): string {
  return commandLine.replaceAll("/", "\\").replace(/\s+/g, " ").trim().toLowerCase();
}

export async function requestControlledRuntimeStop(
  config: Pick<IseolRuntimeHostConfig, "lockPath" | "dataRoot" | "projectDesktopStateRoot">,
  input: {
    expectedPid: number;
    expectedCreatedAt: string;
    expectedExecutable: string;
    expectedCommandLine: string;
    expectedFingerprint: string;
    desktopAgentPort?: number;
    operatorId: string;
    operatorCredentialVerified?: boolean;
    confirmation: string;
    at?: string;
    readProcess?: (pid: number) => Promise<RuntimeProcessIdentity | null>;
    readPortOwner?: (port: number) => Promise<number | null>;
    terminate?: (pid: number) => void;
  },
): Promise<{ status: "stop-requested"; pid: number; signal: "SIGTERM" }> {
  if (!input.operatorId || !input.operatorCredentialVerified) throw new Error("operator-authentication-failed");
  if (!Number.isInteger(input.expectedPid) || input.expectedPid <= 0) throw new Error("expected PID is invalid");
  const readProcess = input.readProcess ?? readProcessIdentity;
  const readPortOwner = input.readPortOwner ?? readRuntimePortOwner;
  const terminate = input.terminate ?? ((pid: number) => process.kill(pid, "SIGTERM"));
  let raw: string;
  try { raw = await readFile(config.lockPath, "utf8"); }
  catch { throw new Error("runtime lock is unavailable"); }
  const fingerprint = lockFingerprint(raw);
  if (fingerprint !== input.expectedFingerprint) throw new Error("runtime lock fingerprint mismatch");
  let lock: Record<string, unknown>;
  try { lock = JSON.parse(raw) as Record<string, unknown>; }
  catch { throw new Error("runtime lock is unreadable"); }
  if (lock.pid !== input.expectedPid) throw new Error("runtime lock PID mismatch");
  if (typeof lock.dataRoot !== "string" || resolve(lock.dataRoot) !== resolve(config.dataRoot)) throw new Error("runtime dataRoot mismatch");
  if (!Number.isInteger(input.desktopAgentPort) || input.desktopAgentPort < 1 || input.desktopAgentPort > 65_535) {
    throw new Error("Desktop Agent port is not configured");
  }
  for (const ownershipPath of [runtimeMaintenanceLockPath(config.lockPath), runtimeRecoveryLockPath(config.lockPath)]) {
    try {
      await readFile(ownershipPath, "utf8");
      throw new Error("maintenance or recovery ownership is active");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const listenerOwner = await readPortOwner(input.desktopAgentPort);
  if (listenerOwner !== input.expectedPid) throw new Error("Runtime listener ownership mismatch");
  const first = await readProcess(input.expectedPid);
  if (!first) throw new Error("process identity unavailable");
  const matches = (observed: RuntimeProcessIdentity): boolean => Boolean(
    observed.createdAt === input.expectedCreatedAt
      && normalizedExecutable(observed.executable) === normalizedExecutable(input.expectedExecutable)
      && normalizedCommandLine(observed.commandLine) === normalizedCommandLine(input.expectedCommandLine),
  );
  if (!matches(first)) throw new Error("process identity changed");
  if (config.projectDesktopStateRoot) {
    const nowMs = Date.parse(input.at ?? new Date().toISOString());
    const jobs = await listDesktopJobs(config.projectDesktopStateRoot);
    const active = jobs.find((job) => (job.lease && Date.parse(job.lease.expiresAt) > nowMs) || job.status === "leased" || job.status === "indeterminate");
    if (active) throw new Error(`active Desktop mutation or lease: ${active.jobId}`);
  }
  const expectedConfirmation = `I approve controlled external termination of Runtime pid ${input.expectedPid} createdAt ${input.expectedCreatedAt} fingerprint ${input.expectedFingerprint}`;
  if (input.confirmation !== expectedConfirmation) throw new Error("operator-confirmation-required");
  const final = await readProcess(input.expectedPid);
  if (!final || !matches(final)) throw new Error("process identity changed before termination");
  try { terminate(input.expectedPid); }
  catch { throw new Error("external termination failed"); }
  return { status: "stop-requested", pid: input.expectedPid, signal: "SIGTERM" };
}

export async function recoverStaleRuntimeLock(config: IseolRuntimeHostConfig, input: {
  expectedFingerprint: string;
  operatorToken: string;
  configuredOperatorToken: string;
  operatorId: string;
  confirmation: string;
  legacyOwnerConfirmation?: string;
  operatorCredentialVerified?: boolean;
  at: string;
  probe?: RuntimeLockOwnerProbe;
}): Promise<{ status: "recovered" | "rejected"; reason?: string; releaseMaintenance: () => Promise<void> }> {
  const reject = (reason: string): { status: "rejected"; reason: string; releaseMaintenance: () => Promise<void> } => ({ status: "rejected", reason, releaseMaintenance: async () => {} });
  if (!input.operatorId || (!input.operatorCredentialVerified && (!input.configuredOperatorToken || !equalSecret(input.operatorToken, input.configuredOperatorToken)))) return reject("operator-authentication-failed");
  const initial = await inspectRuntimeLock(config.lockPath, input.probe);
  const legacyOwnerConfirmation = `I confirm external owner inspection for Runtime lock ${initial.fingerprint} pid ${String(initial.identity.pid)}`;
  const ownerConfirmed = initial.state === "stale"
    || (initial.state === "owner-unconfirmed" && input.legacyOwnerConfirmation === legacyOwnerConfirmation && initial.owner.state === "absent");
  if (!ownerConfirmed) return reject(`runtime-lock-${initial.state}`);
  if (initial.fingerprint !== input.expectedFingerprint) return reject("runtime-lock-identity-mismatch");
  if (input.confirmation !== `I approve stale Runtime lock recovery for ${input.expectedFingerprint}`) return reject("operator-confirmation-required");
  let releaseRecovery: (() => Promise<void>) | undefined;
  try {
    releaseRecovery = await acquireRuntimeRecoveryLock(config.lockPath, runtimeRecoveryLockPath(config.lockPath), { dataRoot: config.dataRoot, ...(config.codeVersion ? { codeVersion: config.codeVersion } : {}) });
    const verified = await inspectRuntimeLock(config.lockPath, input.probe);
    const verifiedOwnerConfirmed = verified.state === "stale"
      || (verified.state === "owner-unconfirmed" && input.legacyOwnerConfirmation === legacyOwnerConfirmation && verified.owner.state === "absent");
    if (!verifiedOwnerConfirmed || verified.fingerprint !== input.expectedFingerprint) {
      await releaseRecovery();
      return reject("runtime-lock-changed-before-recovery");
    }
    const releaseMaintenance = await acquireRuntimeMaintenanceLock(config.lockPath, runtimeMaintenanceLockPath(config.lockPath), { dataRoot: config.dataRoot, ...(config.codeVersion ? { codeVersion: config.codeVersion } : {}) }, { allowRecoveryOwnership: true });
    const final = await inspectRuntimeLock(config.lockPath, input.probe);
    const finalOwnerConfirmed = final.state === "stale"
      || (final.state === "owner-unconfirmed" && input.legacyOwnerConfirmation === legacyOwnerConfirmation && final.owner.state === "absent");
    if (!finalOwnerConfirmed || final.fingerprint !== input.expectedFingerprint) {
      await releaseMaintenance(); await releaseRecovery();
      return reject("runtime-lock-changed-before-release");
    }
    const currentRaw = await readFile(config.lockPath, "utf8");
    if (lockFingerprint(currentRaw) !== input.expectedFingerprint) {
      await releaseMaintenance(); await releaseRecovery();
      return reject("runtime-lock-identity-mismatch");
    }
    await rm(config.lockPath, { force: false });
    await releaseRecovery();
    return { status: "recovered", releaseMaintenance };
  } catch (error) {
    await releaseRecovery?.().catch(() => {});
    return reject(error instanceof Error ? error.message : "runtime-lock-recovery-failed");
  }
}

/**
 * Recover only the Runtime lock. This deliberately does not inspect or mutate
 * Project Desktop jobs; callers must use the batch command separately only
 * when containment is independently approved and required.
 */
export async function recoverStaleRuntimeLockOnly(config: IseolRuntimeHostConfig, input: {
  expectedFingerprint: string;
  operatorToken: string;
  configuredOperatorToken: string;
  operatorId: string;
  confirmation: string;
  legacyOwnerConfirmation?: string;
  operatorCredentialVerified?: boolean;
  at: string;
  probe?: RuntimeLockOwnerProbe;
}): Promise<{ status: "recovered" | "rejected"; reason?: string }> {
  const recovered = await recoverStaleRuntimeLock(config, input);
  if (recovered.status !== "recovered") return { status: "rejected", reason: recovered.reason };
  await recovered.releaseMaintenance();
  return { status: "recovered" };
}

export async function inspectRuntimeMaintenanceJob(config: IseolRuntimeHostConfig, input: { projectId: string; jobId: string; now: string }) {
  if (!config.projectRunRoot || !config.projectDesktopStateRoot) throw new Error("Project Desktop maintenance roots are not configured");
  const job = await loadDesktopJob(config.projectDesktopStateRoot, input.jobId);
  if (!job) return null;
  const run = await loadHarnessRun(config.projectRunRoot, job.runId);
  if (!run || run.request.projectId !== input.projectId) throw new Error("Desktop job does not belong to the requested Project Workspace");
  return inspectDesktopJobReconciliation({ root: config.projectDesktopStateRoot, jobId: input.jobId, now: input.now });
}

export async function containRuntimeMaintenanceJob(config: IseolRuntimeHostConfig, input: {
  projectId: string; jobId: string; expectedRevision: string; operationId: string; approvalId: string; at: string;
}): Promise<Awaited<ReturnType<typeof containDesktopJobAsOperator>>> {
  if (!config.projectRunRoot || !config.projectDesktopStateRoot) throw new Error("Project Desktop maintenance roots are not configured");
  const release = await acquireRuntimeMaintenanceLock(config.lockPath, runtimeMaintenanceLockPath(config.lockPath), { dataRoot: config.dataRoot, ...(config.codeVersion ? { codeVersion: config.codeVersion } : {}) });
  try {
    const activeLease = config.projectDesktopStateRoot
      ? (await listDesktopJobs(config.projectDesktopStateRoot)).find((job) => job.lease && Date.parse(job.lease.expiresAt) > Date.parse(input.at))
      : undefined;
    if (activeLease) return { status: "rejected", reason: "active-desktop-lease" };
    const job = await loadDesktopJob(config.projectDesktopStateRoot, input.jobId);
    if (!job) return { status: "rejected", reason: "job-not-found" };
    const run = await loadHarnessRun(config.projectRunRoot, job.runId);
    if (!run || run.request.projectId !== input.projectId) return { status: "rejected", reason: "job-not-found-or-project-mismatch" };
    return containDesktopJobAsOperator({ root: config.projectDesktopStateRoot, jobId: input.jobId, expectedRevision: input.expectedRevision, operationId: input.operationId, approvalId: input.approvalId, at: input.at, actor: "operator" });
  } finally {
    await release();
  }
}

function equalSecret(actual: string, expected: string): boolean {
  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function approveAndContainRuntimeMaintenanceJob(config: IseolRuntimeHostConfig, input: {
  projectId: string; jobId: string; expectedRevision: string; requestId: string; operationId: string;
  operatorToken: string; configuredOperatorToken: string; operatorId: string; confirmation: string; at: string; expiresAt: string;
  operatorCredentialVerified?: boolean;
}) {
  if (!config.projectRunRoot || !config.projectDesktopStateRoot) throw new Error("Project Desktop maintenance roots are not configured");
  const release = await acquireRuntimeMaintenanceLock(config.lockPath, runtimeMaintenanceLockPath(config.lockPath), { dataRoot: config.dataRoot, ...(config.codeVersion ? { codeVersion: config.codeVersion } : {}) });
  try {
    if (!input.operatorId || (!input.operatorCredentialVerified && (!input.configuredOperatorToken || !equalSecret(input.operatorToken, input.configuredOperatorToken)))) {
      return { status: "rejected" as const, reason: "operator-authentication-failed" };
    }
    const activeLease = (await listDesktopJobs(config.projectDesktopStateRoot)).find((job) => job.lease && Date.parse(job.lease.expiresAt) > Date.parse(input.at));
    if (activeLease) return { status: "rejected" as const, reason: "active-desktop-lease" };
    const inspection = await inspectRuntimeMaintenanceJob(config, { projectId: input.projectId, jobId: input.jobId, now: input.at });
    if (!inspection) return { status: "rejected" as const, reason: "job-not-found" };
    if (inspection.revision !== input.expectedRevision) return { status: "rejected" as const, reason: "job-revision-mismatch", inspection };
    if (inspection.contained) return { status: "already-contained" as const, inspection };
    if (!inspection.canContain) return { status: "rejected" as const, reason: inspection.blockers.join(","), inspection };
    const expectedConfirmation = `I approve containment of ${input.jobId} at revision ${input.expectedRevision}`;
    if (input.confirmation !== expectedConfirmation) return { status: "rejected" as const, reason: "operator-confirmation-required", inspection };
    const job = await loadDesktopJob(config.projectDesktopStateRoot, input.jobId);
    if (!job) return { status: "rejected" as const, reason: "job-not-found" };
    const approval = await issueDesktopJobContainmentApproval({
      root: config.projectDesktopStateRoot, requestId: input.requestId, jobId: input.jobId, runId: job.runId,
      revision: input.expectedRevision, issuedAt: input.at, expiresAt: input.expiresAt, issuedBy: input.operatorId,
    });
    const containment = await containDesktopJobAsOperator({
      root: config.projectDesktopStateRoot, jobId: input.jobId, expectedRevision: input.expectedRevision,
      operationId: input.operationId, approvalId: approval.approvalId, at: input.at, actor: "operator",
    });
    return { ...containment, approvalId: approval.approvalId };
  } finally {
    await release();
  }
}

export type RuntimeMaintenanceBatchJob = {
  projectId: string;
  jobId: string;
  expectedRevision: string;
  requestId: string;
  operationId: string;
  confirmation: string;
  expiresAt: string;
};

type RuntimeMaintenanceBatchInput = {
  jobs: RuntimeMaintenanceBatchJob[];
  operatorToken: string;
  configuredOperatorToken: string;
  operatorId: string;
  at: string;
  operatorCredentialVerified?: boolean;
};

async function runRuntimeMaintenanceJobs(config: IseolRuntimeHostConfig, input: RuntimeMaintenanceBatchInput): Promise<{ status: "completed" | "partial" | "rejected"; results: Array<Record<string, unknown>> }> {
  if (!config.projectRunRoot || !config.projectDesktopStateRoot) throw new Error("Project Desktop maintenance roots are not configured");
  if (input.jobs.length === 0) return { status: "rejected", results: [{ status: "rejected", reason: "no-jobs" }] };
  if (!input.operatorId || (!input.operatorCredentialVerified && (!input.configuredOperatorToken || !equalSecret(input.operatorToken, input.configuredOperatorToken)))) {
    return { status: "rejected", results: input.jobs.map(() => ({ status: "rejected", reason: "operator-authentication-failed" })) };
  }
  const results: Array<Record<string, unknown>> = [];
  for (const jobInput of input.jobs) {
      const activeLease = (await listDesktopJobs(config.projectDesktopStateRoot)).find((job) => job.lease && Date.parse(job.lease.expiresAt) > Date.parse(input.at));
      if (activeLease) {
        results.push({ status: "rejected", reason: "active-desktop-lease", jobId: jobInput.jobId });
        continue;
      }
      const inspection = await inspectRuntimeMaintenanceJob(config, { projectId: jobInput.projectId, jobId: jobInput.jobId, now: input.at });
      if (!inspection) {
        results.push({ status: "rejected", reason: "job-not-found", jobId: jobInput.jobId });
        continue;
      }
      if (inspection.revision !== jobInput.expectedRevision) {
        results.push({ status: "rejected", reason: "job-revision-mismatch", jobId: jobInput.jobId, inspection });
        continue;
      }
      if (inspection.contained) {
        results.push({ status: "already-contained", jobId: jobInput.jobId, inspection });
        continue;
      }
      if (!inspection.canContain) {
        results.push({ status: "rejected", reason: inspection.blockers.join(","), jobId: jobInput.jobId, inspection });
        continue;
      }
      const expectedConfirmation = `I approve containment of ${jobInput.jobId} at revision ${jobInput.expectedRevision}`;
      if (jobInput.confirmation !== expectedConfirmation) {
        results.push({ status: "rejected", reason: "operator-confirmation-required", jobId: jobInput.jobId, inspection });
        continue;
      }
      const job = await loadDesktopJob(config.projectDesktopStateRoot, jobInput.jobId);
      if (!job) {
        results.push({ status: "rejected", reason: "job-not-found", jobId: jobInput.jobId });
        continue;
      }
      const approval = await issueDesktopJobContainmentApproval({
        root: config.projectDesktopStateRoot, requestId: jobInput.requestId, jobId: jobInput.jobId, runId: job.runId,
        revision: jobInput.expectedRevision, issuedAt: input.at, expiresAt: jobInput.expiresAt, issuedBy: input.operatorId,
      });
      const containment = await containDesktopJobAsOperator({
        root: config.projectDesktopStateRoot, jobId: jobInput.jobId, expectedRevision: jobInput.expectedRevision,
        operationId: jobInput.operationId, approvalId: approval.approvalId, at: input.at, actor: "operator",
      });
      results.push({ ...containment, approvalId: approval.approvalId, jobId: jobInput.jobId });
  }
  return { status: results.every((result) => result.status === "contained" || result.status === "already-contained") ? "completed" : results.some((result) => result.status === "contained" || result.status === "already-contained") ? "partial" : "rejected", results };
}

export async function approveAndContainRuntimeMaintenanceJobs(config: IseolRuntimeHostConfig, input: RuntimeMaintenanceBatchInput): Promise<{ status: "completed" | "partial" | "rejected"; results: Array<Record<string, unknown>> }> {
  const release = await acquireRuntimeMaintenanceLock(config.lockPath, runtimeMaintenanceLockPath(config.lockPath), { dataRoot: config.dataRoot, ...(config.codeVersion ? { codeVersion: config.codeVersion } : {}) });
  try { return await runRuntimeMaintenanceJobs(config, input); }
  finally { await release(); }
}

export async function recoverStaleRuntimeLockAndContainRuntimeMaintenanceJobs(config: IseolRuntimeHostConfig, input: RuntimeMaintenanceBatchInput & {
  expectedFingerprint: string;
  recoveryConfirmation: string;
  legacyOwnerConfirmation?: string;
  probe?: RuntimeLockOwnerProbe;
}): Promise<{ recovery: "recovered" | "rejected"; recoveryReason?: string; maintenance?: { status: "completed" | "partial" | "rejected"; results: Array<Record<string, unknown>> } }> {
  const recovered = await recoverStaleRuntimeLock(config, {
    expectedFingerprint: input.expectedFingerprint,
    operatorToken: input.operatorToken,
    configuredOperatorToken: input.configuredOperatorToken,
    operatorId: input.operatorId,
    operatorCredentialVerified: input.operatorCredentialVerified,
    confirmation: input.recoveryConfirmation,
    legacyOwnerConfirmation: input.legacyOwnerConfirmation,
    at: input.at,
    probe: input.probe,
  });
  if (recovered.status !== "recovered") return { recovery: "rejected", recoveryReason: recovered.reason };
  try {
    return { recovery: "recovered", maintenance: await runRuntimeMaintenanceJobs(config, input) };
  } finally {
    await recovered.releaseMaintenance();
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "start";
  const config = loadRuntimeHostConfig();
  if (command === "operator-bootstrap" || command === "operator-rotate") {
    const input = readRuntimeHostStdin<{ operatorId?: unknown }>();
    const operatorId = typeof input.operatorId === "string" ? input.operatorId : "";
    const result = command === "operator-bootstrap"
      ? await bootstrapOperatorCredential({ path: config.operatorCredentialPath!, operatorId })
      : await rotateOperatorCredential({ path: config.operatorCredentialPath!, operatorId });
    process.stdout.write(JSON.stringify({ status: "configured", operatorId: result.operatorId }));
    return;
  }
  const storedCredential = await readOperatorCredential(config.operatorCredentialPath!);
  const configuredOperatorId = resolveConfiguredRuntimeOperatorId(storedCredential?.operatorId, process.env.ISEOL_OPERATOR_ID);
  const verifyCliOperator = async (operatorToken: string): Promise<boolean> => storedCredential
    ? verifyOperatorCredential({ path: config.operatorCredentialPath!, operatorId: configuredOperatorId, token: operatorToken || undefined })
    : false;
  if (command === "status") {
    process.stdout.write(JSON.stringify(await readRuntimeHostStatus(config)));
    return;
  }
  if (command === "stop") {
    if (!(await readFile(config.lockPath, "utf8").catch(() => ""))) { process.stdout.write(JSON.stringify({ state: "stopped" })); return; }
    const operatorCredentialVerified = await verifyCliOperator("");
    process.stdout.write(JSON.stringify(await requestRuntimeStop({ ...config, operatorId: configuredOperatorId, operatorCredentialVerified })));
    return;
  }
  if (command === "operator-stop") {
    const input = readRuntimeHostStdin<{ expectedPid?: unknown; expectedCreatedAt?: unknown; expectedExecutable?: unknown; expectedCommandLine?: unknown; expectedFingerprint?: unknown; confirmation?: unknown }>();
    const operatorCredentialVerified = await verifyCliOperator("");
    const desktopAgentPort = resolveConfiguredRuntimeDesktopAgentPort(process.env.ISEOL_DESKTOP_AGENT_PORT);
    const expectedPid = Number.isInteger(input.expectedPid) ? input.expectedPid as number : 0;
    const result = await requestControlledRuntimeStop(config, {
      expectedPid,
      expectedCreatedAt: typeof input.expectedCreatedAt === "string" ? input.expectedCreatedAt : "",
      expectedExecutable: typeof input.expectedExecutable === "string" ? input.expectedExecutable : "",
      expectedCommandLine: typeof input.expectedCommandLine === "string" ? input.expectedCommandLine : "",
      expectedFingerprint: typeof input.expectedFingerprint === "string" ? input.expectedFingerprint : "",
      desktopAgentPort,
      confirmation: typeof input.confirmation === "string" ? input.confirmation : "",
      operatorId: configuredOperatorId,
      operatorCredentialVerified,
      projectDesktopStateRoot: config.projectDesktopStateRoot,
      dataRoot: config.dataRoot,
      lockPath: config.lockPath,
    });
    process.stdout.write(JSON.stringify(result));
    return;
  }
  if (command === "maintenance-status") {
    const runtime = await readRuntimeHostStatus(config);
    let maintenance: Record<string, unknown> = { state: "stopped" };
    let recovery: Record<string, unknown> = { state: "stopped" };
    try { maintenance = JSON.parse(await readFile(runtimeMaintenanceLockPath(config.lockPath), "utf8")) as Record<string, unknown>; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    try { recovery = JSON.parse(await readFile(runtimeRecoveryLockPath(config.lockPath), "utf8")) as Record<string, unknown>; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    process.stdout.write(JSON.stringify({ runtime, maintenance, recovery }));
    return;
  }
  if (command === "runtime-recover-stale") {
    process.stdout.write(JSON.stringify({ status: "rejected", reason: "use maintenance-recover-stale-contain-batch to preserve ownership continuity" }));
    return;
  }
  if (command === "maintenance-recover-stale-lock") {
    const input = readRuntimeHostStdin<{ expectedFingerprint?: unknown; recoveryConfirmation?: unknown; legacyOwnerConfirmation?: unknown }>();
    const recoveryInput = normalizeRuntimeLockRecoveryInput(input);
    const operatorToken = "";
    const operatorCredentialVerified = await verifyCliOperator("");
    const result = await recoverStaleRuntimeLockOnly(config, {
      ...recoveryInput, operatorToken,
      configuredOperatorToken: "", operatorId: configuredOperatorId, operatorCredentialVerified,
      at: new Date().toISOString(),
    });
    process.stdout.write(JSON.stringify(result));
    return;
  }
  if (command === "maintenance-recover-stale-contain-batch") {
    const input = readRuntimeHostStdin<{ expectedFingerprint?: unknown; recoveryConfirmation?: unknown; legacyOwnerConfirmation?: unknown; operatorToken?: unknown; jobs?: unknown }>();
    const expectedFingerprint = typeof input.expectedFingerprint === "string" ? input.expectedFingerprint : "";
    const recoveryConfirmation = typeof input.recoveryConfirmation === "string" ? input.recoveryConfirmation : "";
    const legacyOwnerConfirmation = typeof input.legacyOwnerConfirmation === "string" ? input.legacyOwnerConfirmation : undefined;
    const operatorToken = typeof input.operatorToken === "string" ? input.operatorToken : "";
    const jobs = Array.isArray(input.jobs) ? input.jobs as RuntimeMaintenanceBatchJob[] : [];
    const operatorCredentialVerified = await verifyCliOperator(operatorToken);
    const result = await recoverStaleRuntimeLockAndContainRuntimeMaintenanceJobs(config, { expectedFingerprint, recoveryConfirmation, legacyOwnerConfirmation, operatorToken, configuredOperatorToken: "", operatorId: configuredOperatorId, operatorCredentialVerified, jobs, at: new Date().toISOString() });
    process.stdout.write(JSON.stringify(result));
    return;
  }
  if (command === "maintenance-inspect") {
    const [projectId, jobId] = process.argv.slice(3);
    if (!projectId || !jobId) throw new Error("maintenance-inspect requires projectId and jobId");
    process.stdout.write(JSON.stringify(await inspectRuntimeMaintenanceJob(config, { projectId, jobId, now: new Date().toISOString() })));
    return;
  }
  if (command === "maintenance-contain") {
    const [projectId, jobId, expectedRevision, operationId, approvalId] = process.argv.slice(3);
    if (!projectId || !jobId || !expectedRevision || !operationId || !approvalId) throw new Error("maintenance-contain requires projectId, jobId, expectedRevision, operationId and approvalId");
    process.stdout.write(JSON.stringify(await containRuntimeMaintenanceJob(config, { projectId, jobId, expectedRevision, operationId, approvalId, at: new Date().toISOString() })));
    return;
  }
  if (command === "maintenance-approve-contain") {
    const [projectId, jobId, expectedRevision, requestId, operationId, expiresAt] = process.argv.slice(3);
    if (!projectId || !jobId || !expectedRevision || !requestId || !operationId || !expiresAt) {
      throw new Error("maintenance-approve-contain requires projectId, jobId, expectedRevision, requestId, operationId and expiresAt");
    }
    const inspection = await inspectRuntimeMaintenanceJob(config, { projectId, jobId, now: new Date().toISOString() });
    process.stderr.write(`${JSON.stringify(inspection)}\n`);
    const input = readRuntimeHostStdin<{ operatorToken?: unknown; confirmation?: unknown }>();
    const operatorToken = typeof input.operatorToken === "string" ? input.operatorToken : "";
    const confirmation = typeof input.confirmation === "string" ? input.confirmation : "";
    const operatorCredentialVerified = await verifyCliOperator(operatorToken);
    process.stdout.write(JSON.stringify(await approveAndContainRuntimeMaintenanceJob(config, {
      projectId, jobId, expectedRevision, requestId, operationId, expiresAt,
      operatorToken, configuredOperatorToken: "", operatorId: configuredOperatorId, operatorCredentialVerified, confirmation, at: new Date().toISOString(),
    })));
    return;
  }
  if (command === "maintenance-approve-contain-batch") {
    const input = readRuntimeHostStdin<{ operatorToken?: unknown; jobs?: unknown }>();
    const operatorToken = typeof input.operatorToken === "string" ? input.operatorToken : "";
    const jobs = Array.isArray(input.jobs) ? input.jobs as RuntimeMaintenanceBatchJob[] : [];
    const operatorCredentialVerified = await verifyCliOperator(operatorToken);
    process.stdout.write(JSON.stringify(await approveAndContainRuntimeMaintenanceJobs(config, {
      jobs, operatorToken, configuredOperatorToken: "", operatorId: configuredOperatorId, operatorCredentialVerified, at: new Date().toISOString(),
    })));
    return;
  }
  if (command !== "start") throw new Error(`unsupported runtime host command: ${command}`);
  const runtimeCodeVersion = await resolveRuntimeCodeVersion(config);
  const release = await acquireRuntimeLock(config.lockPath, { dataRoot: config.dataRoot, codeVersion: runtimeCodeVersion.codeVersion, codeVersionSource: runtimeCodeVersion.source });
  let services: IseolRuntimeServices | undefined;
  let stopping = false;
  let stopPromise: Promise<RuntimeShutdownResponse> | undefined;
  let shutdownServer: { close: () => Promise<void> } | undefined;
  const stop = (): Promise<RuntimeShutdownResponse> => {
    if (stopPromise) return stopPromise;
    stopping = true;
    stopPromise = runRuntimeStopLifecycle({
      pid: process.pid,
      dispose: async () => { await services?.dispose(); },
      release,
      close: () => { if (shutdownServer) void shutdownServer.close().catch(() => undefined); },
    });
    return stopPromise;
  };
  const stopFromSignal = (exitCode: number) => {
    void stop().then((result) => {
      if (result.status === "stopped") process.exit(exitCode);
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", () => stopFromSignal(130));
  process.once("SIGTERM", () => stopFromSignal(143));
  try {
    const env = {
      ...process.env,
      ISEOL_MODEL_ROOT: config.modelRoot,
      ISEOL_RUN_ROOT: config.runRoot,
      ISEOL_CHATGPT_WEB_ROOT: config.webWorkerRoot,
      ISEOL_CHATGPT_BROWSER_PROFILE_ROOT: config.browserProfileRoot,
      ...(config.projectRuntimeEnabled === undefined ? {} : { ISEOL_PROJECT_RUNTIME_ENABLED: String(config.projectRuntimeEnabled) }),
      ...(config.desktopAgentId ? { ISEOL_PROJECT_AGENT_ID: config.desktopAgentId } : {}),
      ...(config.projectModelRoot ? { ISEOL_PROJECT_MODEL_ROOT: config.projectModelRoot } : {}),
      ...(config.projectRunRoot ? { ISEOL_PROJECT_RUN_ROOT: config.projectRunRoot } : {}),
      ...(config.projectWebWorkerRoot ? { ISEOL_PROJECT_WEB_WORKER_ROOT: config.projectWebWorkerRoot } : {}),
      ...(config.projectDesktopStateRoot ? { ISEOL_PROJECT_DESKTOP_STATE_ROOT: config.projectDesktopStateRoot } : {}),
    };
    services = await startIseolRuntimeServices({ env, roots: {
      iseolRoot: config.dataRoot,
      modelRoot: config.modelRoot,
      runRoot: config.runRoot,
      webRoot: config.dataRoot,
      webWorkerRoot: config.webWorkerRoot,
      browserProfileRoot: config.browserProfileRoot,
      ...(config.projectModelRoot ? { projectModelRoot: config.projectModelRoot } : {}),
      ...(config.projectRunRoot ? { projectRunRoot: config.projectRunRoot } : {}),
      ...(config.projectWebWorkerRoot ? { projectWebWorkerRoot: config.projectWebWorkerRoot } : {}),
      ...(config.projectDesktopStateRoot ? { projectDesktopStateRoot: config.projectDesktopStateRoot } : {}),
    }, shutdownDiagnosticsRoot: resolve(config.dataRoot, "runtime") });
    shutdownServer = await createRuntimeShutdownServer(runtimeShutdownEndpoint(config.lockPath), async (request) => {
      if (request.expectedPid !== process.pid) return { status: "rejected", reason: "Runtime PID mismatch" };
      if (!configuredOperatorId || request.operatorId !== configuredOperatorId) return { status: "rejected", reason: "operator identity mismatch" };
      let raw: string;
      try { raw = await readFile(config.lockPath, "utf8"); }
      catch { return { status: "rejected", reason: "Runtime lock unavailable" }; }
      if (lockFingerprint(raw) !== request.expectedFingerprint) return { status: "rejected", reason: "Runtime lock fingerprint mismatch" };
      let lock: Record<string, unknown>;
      try { lock = JSON.parse(raw) as Record<string, unknown>; }
      catch { return { status: "rejected", reason: "Runtime lock unreadable" }; }
      if (lock.pid !== process.pid || lock.ownerIdentity !== request.expectedOwnerIdentity) return { status: "rejected", reason: "Runtime owner identity mismatch" };
      return stop();
    }, (response) => {
      if (response.status === "stopped") setImmediate(() => process.exit(0));
    });
    process.stdout.write(JSON.stringify({ state: "running", pid: process.pid, dataRoot: config.dataRoot }) + "\n");
    await new Promise<void>(() => undefined);
  } finally {
    if (!stopping) {
      const result = await stop();
      if (result.status !== "stopped") throw new Error(result.reason);
    }
  }
}

if (process.argv[1]?.endsWith("iseol-runtime-host.ts")) void main().catch((error) => { console.error(error instanceof Error ? error.message : "runtime host failed"); process.exitCode = 1; });
import "dotenv/config";
