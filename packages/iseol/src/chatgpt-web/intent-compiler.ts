import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import { assertBoundedProcessRequest } from "../desktop-agent/process-policy.js";
import type { HarnessRuntimeRunEnvelope, HarnessRunStage } from "../harness/contracts.js";
import type { DesktopTaskPack, DesktopOperation } from "../desktop-agent/contracts.js";
import { assertDesktopTaskPack } from "../desktop-agent/contracts.js";
import type { DesktopIntent, WebWorkerSession } from "./contracts.js";
import { assertDesktopIntent } from "./contracts.js";

export type DesktopIntentCompilerContext = {
  run: HarnessRuntimeRunEnvelope;
  session: WebWorkerSession;
  resultGeneration: number;
  commitAuthorized?: boolean;
  leaseDurationMs?: number;
};

const REASONING_STAGES = new Set<HarnessRunStage>(["ANALYZE", "PLAN", "IMPLEMENT", "SELF_REVIEW"]);

function samePath(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

function assertRelativeWorkspacePath(root: string, input: string, field: string): void {
  if (isAbsolute(input)) {
    const hint = field === "Desktop intent cwd" ? '; use "." for the workspace root instead of workspaceRoot' : "";
    throw new Error(`${field} must be workspace-relative${hint}`);
  }
  const target = resolve(root, input);
  const rel = relative(resolve(root), target);
  if (rel === ".." || rel.startsWith(`..\\`) || rel.startsWith("../") || isAbsolute(rel)) {
    throw new Error(`${field} is outside the Run workspace`);
  }
}
function assertProcessIntent(intent: Extract<DesktopIntent, { kind: "RUN_TEST" | "RUN_BUILD" }>): void {
  assertBoundedProcessRequest(intent.kind === "RUN_TEST" ? "test" : "build", intent.executable, intent.args);
}

export function validatePatchTarget(root: string, input: string): { path: string; patch: string } {
  const patch = input.replaceAll("\r\n", "\n");
  const lines = patch.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines[0]?.startsWith("diff --git ") !== true) throw new Error("Patch must start with one unified diff header");
  const diffHeaders = lines.filter((line) => line.startsWith("diff --git "));
  const oldHeaders = lines.filter((line) => line.startsWith("--- "));
  const newHeaders = lines.filter((line) => line.startsWith("+++ "));
  if (diffHeaders.length !== 1 || oldHeaders.length !== 1 || newHeaders.length !== 1) {
    throw new Error("Patch must contain exactly one file diff and header pair");
  }
  const headerPath = (line: string) => line.slice(4).split("\t", 1)[0] ?? "";
  const oldPath = headerPath(oldHeaders[0]!);
  const newPath = headerPath(newHeaders[0]!);
  const oldTarget = oldPath === "/dev/null" ? null : oldPath.startsWith("a/") ? oldPath.slice(2) : null;
  const newTarget = newPath === "/dev/null" ? null : newPath.startsWith("b/") ? newPath.slice(2) : null;
  if ((!oldTarget && !newTarget) || (oldPath !== "/dev/null" && !oldTarget) || (newPath !== "/dev/null" && !newTarget)) {
    throw new Error("Patch file path is invalid");
  }
  if (oldTarget && newTarget && oldTarget !== newTarget) throw new Error("Patch file paths do not match");
  const path = oldTarget ?? newTarget!;
  assertRelativeWorkspacePath(root, path, "Patch file path");
  if (diffHeaders[0] !== `diff --git a/${path} b/${path}`) throw new Error("Patch diff header does not match its guarded path");

  let hunks = 0;
  for (let index = 0; index < lines.length;) {
    const header = lines[index]!;
    if (!header.startsWith("@@ ")) { index += 1; continue; }
    const match = header.match(/^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@(?: .*)?$/);
    if (!match) throw new Error("Patch hunk header is invalid");
    const expectedOld = match[1] === undefined ? 1 : Number.parseInt(match[1], 10);
    const expectedNew = match[2] === undefined ? 1 : Number.parseInt(match[2], 10);
    let seenOld = 0;
    let seenNew = 0;
    hunks += 1;
    index += 1;
    while (index < lines.length && !lines[index]!.startsWith("@@ ")) {
      const line = lines[index]!;
      if (line === "\\ No newline at end of file") { index += 1; continue; }
      if (line.startsWith("diff --git ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
        throw new Error("Patch must contain exactly one file diff");
      }
      if (line.startsWith(" ")) { seenOld += 1; seenNew += 1; }
      else if (line.startsWith("-")) seenOld += 1;
      else if (line.startsWith("+")) seenNew += 1;
      else throw new Error("Patch hunk body line is invalid");
      index += 1;
    }
    if (seenOld !== expectedOld || seenNew !== expectedNew) throw new Error("Patch hunk line counts do not match the hunk header");
  }
  if (hunks === 0) throw new Error("Patch must include at least one hunk");
  return { path, patch };
}

export function buildValidatedPatchIntent(
  context: DesktopIntentCompilerContext,
  payload: string,
): Extract<DesktopIntent, { kind: "PROPOSE_PATCH" }> {
  const validated = validatePatchTarget(context.run.request.targetRoot, payload);
  const digest = createHash("sha256").update(`${context.run.request.runId}\n${context.run.state.stage}\n${context.resultGeneration}\n${validated.patch}`, "utf8").digest("hex").slice(0, 24);
  const intent: Extract<DesktopIntent, { kind: "PROPOSE_PATCH" }> = {
    version: 1,
    intentId: `implement-patch-${digest}`,
    runId: context.run.request.runId,
    stage: context.run.state.stage,
    workspaceRoot: context.run.request.targetRoot,
    policySha256: context.run.preflight.policy?.effectiveSha256 ?? "",
    kind: "PROPOSE_PATCH",
    path: validated.path,
    patch: validated.patch,
  };
  validateDesktopIntent(context, intent);
  return intent;
}

export function validateDesktopIntent(
  context: DesktopIntentCompilerContext,
  intent: DesktopIntent,
): void {
  assertDesktopIntent(intent);
  const { run, session } = context;
  const policy = run.preflight.policy;
  if (run.preflight.status !== "ready" || !policy) throw new Error("Run policy is not ready");
  if (!REASONING_STAGES.has(run.state.stage)) throw new Error(`Stage is not Web-reasoning owned: ${run.state.stage}`);
  if (session.status === "lost" || session.status === "closed") throw new Error("Web worker session is not active");
  if (session.runId !== run.request.runId || intent.runId !== run.request.runId) throw new Error("Desktop intent Run mismatch");
  if (session.stage !== run.state.stage || intent.stage !== run.state.stage) throw new Error("Desktop intent stage mismatch");
  if (context.resultGeneration !== session.generation) throw new Error("Desktop intent generation mismatch");
  if (session.policySha256 !== policy.effectiveSha256 || intent.policySha256 !== policy.effectiveSha256) {
    throw new Error("Desktop intent policy mismatch");
  }
  if (!samePath(intent.workspaceRoot, run.request.targetRoot)) throw new Error("Desktop intent workspace mismatch");

  if (intent.kind === "READ_CONTEXT" || intent.kind === "PROPOSE_PATCH") {
    assertRelativeWorkspacePath(run.request.targetRoot, intent.path, "Desktop intent path");
  }
  if (intent.kind === "RUN_TEST" || intent.kind === "RUN_BUILD") {
    assertRelativeWorkspacePath(run.request.targetRoot, intent.cwd, "Desktop intent cwd");
    assertProcessIntent(intent);
  }
  if (intent.kind === "GIT_INSPECT" || intent.kind === "REQUEST_COMMIT") {
    assertRelativeWorkspacePath(run.request.targetRoot, intent.cwd, "Desktop intent cwd");
  }
  if (intent.kind === "REQUEST_COMMIT" && !context.commitAuthorized) {
    throw new Error("Desktop commit is not explicitly authorized");
  }
}
function operationForIntent(intent: DesktopIntent): DesktopOperation {
  if (intent.kind === "READ_CONTEXT") return { id: intent.intentId, type: "READ_FILE", path: intent.path };
  if (intent.kind === "PROPOSE_PATCH") return { id: intent.intentId, type: "APPLY_PATCH", path: intent.path, patch: intent.patch };
  if (intent.kind === "RUN_TEST" || intent.kind === "RUN_BUILD") {
    return { id: intent.intentId, type: "RUN_PROCESS", purpose: intent.kind === "RUN_TEST" ? "test" : "build", cwd: intent.cwd, executable: intent.executable, args: [...intent.args], timeoutMs: intent.timeoutMs };
  }
  if (intent.kind === "GIT_INSPECT") return { id: intent.intentId, type: "GIT_INSPECT", cwd: intent.cwd };
  if (intent.kind === "REQUEST_COMMIT") {
    return { id: intent.intentId, type: "GIT_COMMIT", cwd: intent.cwd, message: intent.message, ...(intent.expectedHead ? { expectedHead: intent.expectedHead } : {}) };
  }
  if ("url" in intent) return { id: intent.intentId, type: "CHECK_HTTP", url: intent.url, timeoutMs: intent.timeoutMs };
  throw new Error(`Unsupported Desktop intent kind: ${intent.kind}`);
}

function stableJobId(runId: string, intentId: string): string {
  const digest = createHash("sha256").update(`${runId}\n${intentId}`, "utf8").digest("hex").slice(0, 24);
  return `web-${digest}`;
}

export function compileDesktopIntentToTaskPack(
  context: DesktopIntentCompilerContext,
  intent: DesktopIntent,
  agentId: string,
  now: string,
): DesktopTaskPack {
  validateDesktopIntent(context, intent);
  const policy = context.run.preflight.policy!;
  const nowMs = Date.parse(now);
  if (Number.isNaN(nowMs)) throw new Error("Desktop Task Pack compile time must be an ISO timestamp");
  const leaseDurationMs = context.leaseDurationMs ?? 60_000;
  if (!Number.isFinite(leaseDurationMs) || leaseDurationMs <= 0) throw new Error("Desktop Task Pack lease duration must be positive");
  const pack: DesktopTaskPack = {
    version: 1,
    jobId: stableJobId(context.run.request.runId, intent.intentId),
    runId: context.run.request.runId,
    stage: context.run.state.stage,
    attempt: 0,
    agentId,
    workspaceRoot: context.run.request.targetRoot,
    policyDigest: policy.effectiveSha256,
    policySources: policy.sources.map((source) => ({ kind: source.kind, path: source.path, sha256: source.sha256, required: true })),
    idempotencyKey: `web-intent:${context.run.request.runId}:${intent.intentId}`,
    leaseUntil: new Date(nowMs + leaseDurationMs).toISOString(),
    operations: [operationForIntent(intent)],
  };
  assertDesktopTaskPack(pack);
  return pack;
}
