import type { HarnessRunStage } from "../harness/contracts.js";
import { assertDesktopOperationPolicy } from "./operation-policy.js";

export const ISEOL_DESKTOP_PROTOCOL_VERSION = 1 as const;

export type DesktopPolicySource = {
  kind: string;
  path: string;
  sha256: string;
  required: boolean;
};

export type DesktopAgentHello = {
  version: 1;
  agentId: string;
  agentVersion: string;
  os: string;
  capabilities: string[];
  workspaceRoots: string[];
  token: string;
};

export type DesktopAgentPresence = Omit<DesktopAgentHello, "token"> & {
  /** Runtime connection instance that most recently registered this presence. */
  connectionId?: string;
  registeredAt: string;
  lastHeartbeatAt: string;
};

export type ReadFileOperation = { id: string; type: "READ_FILE"; path: string };
export type ListDirectoryOperation = { id: string; type: "LIST_DIRECTORY"; path: string };
export type ApplyPatchOperation = { id: string; type: "APPLY_PATCH"; path: string; patch: string };
export type RunProcessOperation = {
  id: string;
  type: "RUN_PROCESS";
  purpose: import("./process-policy.js").RunProcessPurpose;
  cwd: string;
  executable: string;
  args: string[];
  timeoutMs: number;
};

export type GitStatusOperation = { id: string; type: "GIT_STATUS"; cwd: string };
export type GitDiffOperation = { id: string; type: "GIT_DIFF"; cwd: string };
export type GitBranchOperation = { id: string; type: "GIT_BRANCH"; cwd: string };
export type GitInspectOperation = { id: string; type: "GIT_INSPECT"; cwd: string; includeRemote?: boolean };
/** Initializes an empty project workspace without reinitializing an existing repository. */
export type GitInitOperation = { id: string; type: "GIT_INIT"; cwd: string; initialBranch?: string };
export type GitWorktreeCreateOperation = { id: string; type: "GIT_WORKTREE_CREATE"; cwd: string; branch: string; worktreePath: string; baseRef: string };
export type GitCommitOperation = { id: string; type: "GIT_COMMIT"; cwd: string; message: string; expectedHead?: string; publish?: boolean };
export type CheckHttpOperation = { id: string; type: "CHECK_HTTP"; url: string; timeoutMs: number };

export type DesktopOperation =
  | ReadFileOperation
  | ListDirectoryOperation
  | ApplyPatchOperation
  | RunProcessOperation
  | GitStatusOperation
  | GitDiffOperation
  | GitBranchOperation
  | GitInitOperation
  | GitInspectOperation
  | GitWorktreeCreateOperation
  | GitCommitOperation
  | CheckHttpOperation;

/** Capability token advertised by an Agent for a concrete wire operation. */
export function desktopOperationCapability(type: DesktopOperation["type"]): string {
  return `operation:${type}`;
}

export type DesktopTaskPack = {
  version: 1;
  jobId: string;
  runId: string;
  stage: HarnessRunStage;
  attempt: number;
  agentId: string;
  workspaceRoot: string;
  policyDigest?: string;
  policySources?: DesktopPolicySource[];
  idempotencyKey: string;
  leaseUntil: string;
  operations: DesktopOperation[];
};

/** Maximum delay accepted by Node's timer APIs without overflow/clamping. */
export const MAX_DESKTOP_TIMEOUT_MS = 2_147_483_647;

export type DesktopOperationResult = {
  operationId: string;
  ok: boolean;
  summary: string;
  stdout?: string;
  stderr?: string;
  reference?: string;
};

export type DesktopJobResult = {
  version: 1;
  jobId: string;
  runId: string;
  agentId: string;
  status: "completed" | "retryable-failure" | "blocked-user" | "final-failure";
  completedAt: string;
  operations: DesktopOperationResult[];
};

export type DesktopJobReceipt = {
  version: 1;
  jobId: string;
  runId: string;
  idempotencyKey: string;
  agentId: string;
  result: DesktopJobResult;
};
const OPERATION_TYPES = new Set<DesktopOperation["type"]>([
  "READ_FILE",
  "LIST_DIRECTORY",
  "APPLY_PATCH",
  "RUN_PROCESS",
  "GIT_STATUS",
  "GIT_DIFF",
  "GIT_BRANCH",
  "GIT_INIT",
  "GIT_INSPECT",
  "GIT_WORKTREE_CREATE",
  "GIT_COMMIT",
  "CHECK_HTTP",
]);

const MUTATION_TYPES = new Set<DesktopOperation["type"]>([
  "APPLY_PATCH",
  "RUN_PROCESS",
  "GIT_INIT",
  "GIT_WORKTREE_CREATE",
  "GIT_COMMIT",
]);
const SENSITIVE_HTTP_QUERY_KEYS = new Set([
  "access_token", "accesstoken", "api_key", "apikey", "auth", "authorization", "bearer",
  "cookie", "credential", "password", "passwd", "private_key", "privatekey", "refresh_token",
  "refreshtoken", "secret", "session", "session_id", "sessionid", "sig", "signature", "token",
  "apitoken", "authtoken", "bearertoken", "clientsecret", "idtoken", "jwt", "oauthtoken",
  "authorizationtoken", "csrftoken", "oauth2token", "oauthaccesstoken", "secretkey", "sessiontoken",
  "xaccesstoken", "xapikey", "xapitoken", "xauthtoken", "xoauthtoken",
]);

export function isSensitiveHttpCredentialKey(key: string): boolean {
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SENSITIVE_HTTP_QUERY_KEYS.has(normalizedKey) || SENSITIVE_HTTP_QUERY_KEYS.has(key.toLowerCase());
}

function assertSafeHttpFragment(fragment: string): void {
  let decodedFragment = fragment;
  try {
    decodedFragment = decodeURIComponent(fragment);
  } catch {
    throw new Error("Desktop CHECK_HTTP URL fragment must use valid percent-encoding");
  }
  for (const parameter of decodedFragment.split(/[?&#/]/)) {
    const rawKey = parameter.split("=", 1)[0];
    if (!rawKey) continue;
    let key = rawKey;
    try {
      key = decodeURIComponent(rawKey);
    } catch {
      throw new Error("Desktop CHECK_HTTP URL fragment must use valid percent-encoding");
    }
    if (isSensitiveHttpCredentialKey(key)) {
      throw new Error("Desktop CHECK_HTTP URL must not include credential-shaped fragment parameters");
    }
  }
}

function requireText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Desktop Task Pack ${field} is required`);
  }
}

export function assertDesktopProtocolVersion(version: number): asserts version is 1 {
  if (version !== ISEOL_DESKTOP_PROTOCOL_VERSION) {
    throw new Error(`Unsupported Iseol Desktop protocol version: ${version}`);
  }
}

function assertRelativeWorktreePath(value: unknown, field: string): asserts value is string {
  requireText(value, field);
  if (/^(?:[A-Za-z]:[\\/]|[\\/])/.test(value) || value.split(/[\\/]+/).includes("..")) {
    throw new Error(`Desktop worktree ${field} must be a relative path inside the workspace`);
  }
}

function assertGitRef(value: unknown, field: string): asserts value is string {
  requireText(value, field);
  if (value.startsWith("-") || value.includes("..") || value.includes("//") || value.includes("@{")
      || /[\\~^:?*\[\]\s]/.test(value) || value.endsWith("/") || value.endsWith(".") || value.endsWith(".lock")) {
    throw new Error(`Desktop worktree ${field} is unsafe: ${value}`);
  }
}

function assertPositiveTimeout(value: unknown, field: string): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > MAX_DESKTOP_TIMEOUT_MS) {
    throw new Error(`Desktop ${field} must be a positive integer`);
  }
}

export function assertCheckHttpUrl(value: unknown): asserts value is string {
  requireText(value, "url");
  if (value !== value.trim()) {
    throw new Error("Desktop CHECK_HTTP URL must not have surrounding whitespace");
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("Desktop CHECK_HTTP URL contains a control character");
  }
  if (value.includes("\\") || /%5c/i.test(value)) {
    throw new Error("Desktop CHECK_HTTP URL must not contain backslashes");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Desktop CHECK_HTTP URL must be a valid absolute URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Desktop CHECK_HTTP URL must use http or https");
  }
  if (!parsed.hostname) {
    throw new Error("Desktop CHECK_HTTP URL must include a hostname");
  }
  for (const key of parsed.searchParams.keys()) {
    if (isSensitiveHttpCredentialKey(key)) {
      throw new Error("Desktop CHECK_HTTP URL must not include credential-shaped query parameters");
    }
  }
  assertSafeHttpFragment(parsed.hash.slice(1));
  const authority = /^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i.exec(value)?.[1] ?? "";
  if (authority.includes("@") || parsed.username || parsed.password) {
    throw new Error("Desktop CHECK_HTTP URL must not include credentials");
  }
}

function assertOperation(value: unknown): asserts value is DesktopOperation {
  if (!value || typeof value !== "object") throw new Error("Desktop operation must be an object");
  const operation = value as Record<string, unknown>;
  requireText(operation.id, "operation id");
  requireText(operation.type, "operation type");
  if (!OPERATION_TYPES.has(operation.type as DesktopOperation["type"])) {
    throw new Error(`Unsupported Desktop operation type: ${operation.type}`);
  }  assertDesktopOperationPolicy(operation);

  if (operation.type === "GIT_COMMIT" && "publish" in operation && typeof operation.publish !== "boolean") {
    throw new Error("Desktop Git commit publish must be a boolean");
  }
  if (operation.type === "GIT_INSPECT" && "includeRemote" in operation && typeof operation.includeRemote !== "boolean") {
    throw new Error("Desktop Git inspect includeRemote must be a boolean");
  }
  if (operation.type === "CHECK_HTTP") {
    assertCheckHttpUrl(operation.url);
    assertPositiveTimeout(operation.timeoutMs, "CHECK_HTTP timeoutMs");
  }

  if (operation.type === "GIT_WORKTREE_CREATE") {
    const allowed = new Set(["id", "type", "cwd", "branch", "worktreePath", "baseRef"]);
    const unknown = Object.keys(operation).filter((key) => !allowed.has(key));
    if (unknown.length) throw new Error(`Desktop worktree operation has unknown field: ${unknown[0]}`);
    assertRelativeWorktreePath(operation.cwd, "cwd");
    assertRelativeWorktreePath(operation.worktreePath, "worktreePath");
    assertGitRef(operation.branch, "branch");
    assertGitRef(operation.baseRef, "baseRef");
  }
  if (operation.type === "GIT_INIT") {
    const allowed = new Set(["id", "type", "cwd", "initialBranch"]);
    const unknown = Object.keys(operation).filter((key) => !allowed.has(key));
    if (unknown.length) throw new Error(`Desktop Git init operation has unknown field: ${unknown[0]}`);
    assertRelativeWorktreePath(operation.cwd, "cwd");
    if (operation.initialBranch !== undefined) assertGitRef(operation.initialBranch, "initialBranch");
  }
}

export function assertDesktopTaskPack(value: unknown): asserts value is DesktopTaskPack {
  if (!value || typeof value !== "object") throw new Error("Desktop Task Pack must be an object");
  const pack = value as Record<string, unknown>;
  if (typeof pack.version !== "number") throw new Error("Desktop Task Pack version is required");
  assertDesktopProtocolVersion(pack.version);
  for (const field of ["jobId", "runId", "workspaceRoot", "idempotencyKey", "agentId"] as const) {
    requireText(pack[field], field);
  }
  if (typeof pack.leaseUntil !== "string" || Number.isNaN(Date.parse(pack.leaseUntil))) {
    throw new Error("Desktop Task Pack leaseUntil must be an ISO timestamp");
  }
  if (!Array.isArray(pack.operations)) throw new Error("Desktop Task Pack operations are required");
  const seen = new Set<string>();
  let mutates = false;
  for (const item of pack.operations) {
    assertOperation(item);
    if (seen.has(item.id)) throw new Error(`Desktop Task Pack duplicate operation id: ${item.id}`);
    seen.add(item.id);
    if (MUTATION_TYPES.has(item.type)) mutates = true;
  }
  if (!mutates) return;
  requireText(pack.policyDigest, "policyDigest");
  if (!Array.isArray(pack.policySources) || pack.policySources.length === 0) {
    throw new Error("Desktop Task Pack policySources are required for mutation");
  }
}

export function desktopOperationMutates(operation: DesktopOperation): boolean {
  return MUTATION_TYPES.has(operation.type);
}

export function desktopTaskPackMutates(pack: DesktopTaskPack): boolean {
  return pack.operations.some(desktopOperationMutates);
}
