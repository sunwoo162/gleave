import { spawn } from "node:child_process";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import type {
  DesktopJobResult,
  DesktopOperation,
  DesktopOperationResult,
  DesktopTaskPack,
} from "./contracts.js";
import {
  assertDesktopTaskPack,
  desktopOperationMutates,
} from "./contracts.js";
import { assertWorkspaceAccess, verifyDesktopTaskPolicy } from "./workspace-guard.js";
import { formatUserFacingError } from "../security/user-error.js";
import {
  assertBoundedProcessRequest,
  assertOwnedProcessTemp,
  createSandboxedProcessEnv,
  processJobTempRoot,
} from "./process-policy.js";

export type DesktopRuntimeDependencies = {
  allowedRoots: string[];
  policyRoots?: string[];
  maxOutputBytes?: number;
  allowedExecutables?: string[];
  processEnv?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => string;
};

type CommandResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

const DEFAULT_EXECUTABLES = new Set([
  "node", "node.exe", "npm", "npm.cmd", "pnpm", "pnpm.cmd",
  "yarn", "yarn.cmd", "git", "git.exe", "dotnet", "dotnet.exe",
  "java", "java.exe", "mvn", "mvn.cmd", "gradle", "gradle.bat",
]);

function resolveProcessInvocation(executable: string, args: string[]): { executable: string; args: string[] } {
  const name = basename(executable).toLowerCase();
  if (process.platform === "win32" && (name === "npm" || name === "npm.cmd")) {
    const npmCli = process.env.npm_execpath?.trim();
    const nodeExecutable = process.env.npm_node_execpath?.trim() || process.execPath;
    if (npmCli && isAbsolute(npmCli)) return { executable: nodeExecutable, args: [npmCli, ...args] };
    const localNpmCli = resolve(dirname(nodeExecutable), "node_modules", "npm", "bin", "npm-cli.js");
    return { executable: nodeExecutable, args: [localNpmCli, ...args] };
  }
  return { executable, args };
}

function capOutput(value: Buffer, maxBytes: number): string {
  return value.subarray(0, Math.max(0, maxBytes)).toString("utf8");
}

async function runCommand(input: {
  executable: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
}): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const invocation = resolveProcessInvocation(input.executable, input.args);
    const child = spawn(invocation.executable, invocation.args, {
      cwd: input.cwd,
      shell: false,
      windowsHide: true,
      ...(input.env ? { env: input.env } : {}),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, input.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveResult({
        code,
        stdout: capOutput(Buffer.concat(stdout), input.maxOutputBytes),
        stderr: capOutput(Buffer.concat(stderr), input.maxOutputBytes),
        timedOut,
      });
    });
    if (input.stdin !== undefined) child.stdin.end(input.stdin);
    else child.stdin.end();
  });
}

function executableAllowed(executable: string, configured?: string[]): boolean {
  const name = basename(executable).toLowerCase();
  if (configured?.length) {
    return configured.some((item) => item === executable || item.toLowerCase() === name);
  }
  return DEFAULT_EXECUTABLES.has(name);
}

function assertProcessRequest(
  purpose: "test" | "build",
  executable: string,
  args: string[],
  configured?: string[],
): void {
  if (!executableAllowed(executable, configured)) {
    throw new Error(`Desktop executable is not allowed: ${executable}`);
  }
  assertBoundedProcessRequest(purpose, executable, args);
}

function commandOperationResult(
  operationId: string,
  command: CommandResult,
  successSummary: string,
): DesktopOperationResult {
  if (command.timedOut) {
    return {
      operationId,
      ok: false,
      summary: `${successSummary} timed out`,
      ...(command.stdout ? { stdout: command.stdout } : {}),
      ...(command.stderr ? { stderr: command.stderr } : {}),
    };
  }
  return {
    operationId,
    ok: command.code === 0,
    summary: command.code === 0 ? successSummary : `${successSummary} exited with code ${command.code}`,
    ...(command.stdout ? { stdout: command.stdout } : {}),
    ...(command.stderr ? { stderr: command.stderr } : {}),
  };
}

function validatePatchTarget(workspace: string, target: string, patch: string): void {
  const rel = relative(workspace, target).replaceAll("\\", "/");
  const lines = patch.split(/\r?\n/);
  const oldHeaders = lines.filter((line) => line.startsWith("--- "));
  const newHeaders = lines.filter((line) => line.startsWith("+++ "));
  if (oldHeaders.length !== 1 || newHeaders.length !== 1) {
    throw new Error("Desktop patch must contain exactly one file header pair");
  }
  const headerPath = (line: string) => line.slice(4).split("\t", 1)[0] ?? "";
  const oldPath = headerPath(oldHeaders[0]!);
  const newPath = headerPath(newHeaders[0]!);
  if (oldPath !== "/dev/null" && oldPath !== `a/${rel}`) {
    throw new Error(`Desktop patch old path does not match guarded target: ${oldPath}`);
  }
  if (newPath !== "/dev/null" && newPath !== `b/${rel}`) {
    throw new Error(`Desktop patch new path does not match guarded target: ${newPath}`);
  }
  for (const line of lines.filter((item) => item.startsWith("diff --git "))) {
    if (line !== `diff --git a/${rel} b/${rel}`) {
      throw new Error(`Desktop patch diff header escapes guarded target: ${line}`);
    }
  }
}

export function gitSafeDirectoryConfig(workspace: string, cwd: string): string[] {
  const seen = new Set<string>();
  const trusted: string[] = [];
  for (const candidate of [workspace, cwd]) {
    const normalized = resolve(candidate).replaceAll("\\", "/");
    const identity = process.platform === "win32" ? normalized.toLowerCase() : normalized;
    if (seen.has(identity)) continue;
    seen.add(identity);
    trusted.push(normalized);
  }
  return trusted.flatMap((path) => ["-c", `safe.directory=${path}`]);
}
async function gitCommand(
  workspace: string,
  cwd: string,
  args: string[],
  maxOutputBytes: number,
): Promise<CommandResult> {
  const gitRuntimeRoot = join(resolve(workspace), ".iseol", "git-runtime");
  const hooksRoot = join(gitRuntimeRoot, "hooks-disabled");
  await mkdir(hooksRoot, { recursive: true });
  const env = createSandboxedProcessEnv(process.env, gitRuntimeRoot);
  env.GIT_TERMINAL_PROMPT = "0";
  return runCommand({
    executable: "git",
    args: [...gitSafeDirectoryConfig(workspace, cwd), "-c", `core.hooksPath=${hooksRoot}`, ...args],
    cwd,
    timeoutMs: 30_000,
    maxOutputBytes,
    env,
  });
}
type GitWorktreeEntry = { path: string; branch?: string };

function parseGitWorktrees(output: string): GitWorktreeEntry[] {
  return output.trim().split(/\r?\n\r?\n/).filter(Boolean).map((block) => {
    const lines = block.split(/\r?\n/);
    const path = lines.find((line) => line.startsWith("worktree "))?.slice(9) ?? "";
    const branch = lines.find((line) => line.startsWith("branch "))?.slice(7);
    return { path, ...(branch ? { branch } : {}) };
  }).filter((entry) => entry.path);
}

function sameFilesystemPath(left: string, right: string): boolean {
  const a = resolve(left);
  const b = resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

async function executeOperation(
  pack: DesktopTaskPack,
  operation: DesktopOperation,
  deps: DesktopRuntimeDependencies,
  maxOutputBytes: number,
): Promise<DesktopOperationResult> {
  const workspace = await assertWorkspaceAccess(deps.allowedRoots, pack.workspaceRoot, pack.workspaceRoot);

  if (operation.type === "READ_FILE") {
    const path = await assertWorkspaceAccess(deps.allowedRoots, workspace, operation.path);
    const content = await readFile(path, "utf8");
    return { operationId: operation.id, ok: true, summary: `Read ${operation.path}`, stdout: content };
  }
  if (operation.type === "LIST_DIRECTORY") {
    const path = await assertWorkspaceAccess(deps.allowedRoots, workspace, operation.path);
    const entries = await readdir(path, { withFileTypes: true });
    const output = entries
      .map((entry) => `${entry.isDirectory() ? "D" : "F"} ${entry.name}`)
      .sort()
      .join("\n");
    return { operationId: operation.id, ok: true, summary: `Listed ${entries.length} entries`, stdout: output };
  }

  if (operation.type === "APPLY_PATCH") {
    const target = await assertWorkspaceAccess(deps.allowedRoots, workspace, operation.path);
    validatePatchTarget(workspace, target, operation.patch);
    const command = await runCommand({
      executable: "git",
      args: ["apply", "--whitespace=nowarn", "-"],
      cwd: workspace,
      timeoutMs: 30_000,
      maxOutputBytes,
      stdin: operation.patch,
    });
    return commandOperationResult(operation.id, command, `Applied patch to ${operation.path}`);
  }

  if (operation.type === "RUN_PROCESS") {
    const cwd = await assertWorkspaceAccess(deps.allowedRoots, workspace, operation.cwd);
    assertProcessRequest(operation.purpose, operation.executable, operation.args, deps.allowedExecutables);
    const tempRoot = assertOwnedProcessTemp(workspace, processJobTempRoot(workspace, pack.jobId));
    const env = createSandboxedProcessEnv(deps.processEnv ?? process.env, tempRoot);
    await mkdir(tempRoot, { recursive: true });
    await mkdir(env.TEMP ?? join(tempRoot, "temp"), { recursive: true });
    try {
      const command = await runCommand({
        executable: operation.executable,
        args: operation.args,
        cwd,
        timeoutMs: operation.timeoutMs,
        maxOutputBytes,
        env,
      });
      return commandOperationResult(operation.id, command, `Ran ${basename(operation.executable)}`);
    } finally {
      await rm(assertOwnedProcessTemp(workspace, tempRoot), { recursive: true, force: true });
    }
  }

  if (operation.type === "GIT_WORKTREE_CREATE") {
    const cwd = await assertWorkspaceAccess(deps.allowedRoots, workspace, operation.cwd);
    const target = await assertWorkspaceAccess(deps.allowedRoots, workspace, operation.worktreePath);
    const listed = await gitCommand(workspace, cwd, ["worktree", "list", "--porcelain"], maxOutputBytes);
    if (listed.code !== 0) return commandOperationResult(operation.id, listed, "Inspect Git worktrees");
    const existing = parseGitWorktrees(listed.stdout).find((entry) => sameFilesystemPath(entry.path, target));
    const expectedBranch = `refs/heads/${operation.branch}`;
    if (existing) {
      if (existing.branch !== expectedBranch) {
        throw new Error(`Desktop worktree identity mismatch at ${operation.worktreePath}`);
      }
      return { operationId: operation.id, ok: true, summary: `Reused Git worktree ${operation.branch}`, reference: target };
    }
    await mkdir(dirname(target), { recursive: true });
    const created = await gitCommand(
      workspace,
      cwd,
      ["worktree", "add", "-b", operation.branch, target, operation.baseRef],
      maxOutputBytes,
    );
    const result = commandOperationResult(operation.id, created, `Created Git worktree ${operation.branch}`);
    if (result.ok) result.reference = target;
    return result;
  }

  if (operation.type === "GIT_STATUS") {
    const cwd = await assertWorkspaceAccess(deps.allowedRoots, workspace, operation.cwd);
    const command = await gitCommand(workspace, cwd, ["status", "--short"], maxOutputBytes);
    return commandOperationResult(operation.id, command, "Read Git status");
  }
  if (operation.type === "GIT_DIFF") {
    const cwd = await assertWorkspaceAccess(deps.allowedRoots, workspace, operation.cwd);
    const command = await gitCommand(workspace, cwd, ["diff", "--"], maxOutputBytes);
    return commandOperationResult(operation.id, command, "Read Git diff");
  }

  if (operation.type === "GIT_BRANCH") {
    const cwd = await assertWorkspaceAccess(deps.allowedRoots, workspace, operation.cwd);
    const command = await gitCommand(workspace, cwd, ["branch", "--show-current"], maxOutputBytes);
    return commandOperationResult(operation.id, command, "Read Git branch");
  }

  if (operation.type === "GIT_INIT") {
    const cwd = await assertWorkspaceAccess(deps.allowedRoots, workspace, operation.cwd);
    const existingRoot = await gitCommand(workspace, cwd, ["rev-parse", "--show-toplevel"], maxOutputBytes);
    if (existingRoot.code === 0) {
      const root = existingRoot.stdout.trim();
      if (!sameFilesystemPath(root, workspace)) {
        return { operationId: operation.id, ok: false, summary: "Git repository root does not match the project workspace" };
      }
      return { operationId: operation.id, ok: true, summary: "Git repository already initialized", reference: root };
    }
    try {
      await stat(join(cwd, ".git"));
      return { operationId: operation.id, ok: false, summary: "Git repository metadata is invalid or unreadable" };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const initialized = await gitCommand(
      workspace,
      cwd,
      ["init", ...(operation.initialBranch ? ["--initial-branch", operation.initialBranch] : [])],
      maxOutputBytes,
    );
    return commandOperationResult(operation.id, initialized, "Initialized Git repository");
  }

  if (operation.type === "GIT_INSPECT") {
    const cwd = await assertWorkspaceAccess(deps.allowedRoots, workspace, operation.cwd);
    const head = await gitCommand(workspace, cwd, ["rev-parse", "HEAD"], maxOutputBytes);
    if (head.code !== 0) {
      const inside = await gitCommand(workspace, cwd, ["rev-parse", "--is-inside-work-tree"], maxOutputBytes);
      const branch = await gitCommand(workspace, cwd, ["branch", "--show-current"], maxOutputBytes);
      const status = await gitCommand(workspace, cwd, ["status", "--short"], maxOutputBytes);
      if (inside.code !== 0 || inside.stdout.trim() !== "true" || branch.code !== 0 || !branch.stdout.trim() || status.code !== 0) {
        return commandOperationResult(operation.id, head, "Inspect Git HEAD");
      }
      const identity = { head: "", parent: "", subject: "", branch: branch.stdout.trim(), status: status.stdout, initial: true };
      return { operationId: operation.id, ok: true, summary: "Inspected Git identity (unborn HEAD)", stdout: JSON.stringify(identity), reference: branch.stdout.trim() };
    }
    const parent = await gitCommand(workspace, cwd, ["rev-parse", "HEAD^"], maxOutputBytes);
    const subject = await gitCommand(workspace, cwd, ["show", "-s", "--format=%s", "HEAD"], maxOutputBytes);
    const branch = await gitCommand(workspace, cwd, ["branch", "--show-current"], maxOutputBytes);
    const status = await gitCommand(workspace, cwd, ["status", "--short"], maxOutputBytes);
    if (subject.code !== 0 || branch.code !== 0 || status.code !== 0) {
      const failed = subject.code !== 0 ? subject : branch.code !== 0 ? branch : status;
      return commandOperationResult(operation.id, failed, "Inspect Git identity");
    }
    const branchName = branch.stdout.trim();
    let remoteHead = "";
    if (operation.includeRemote) {
      const remote = await gitCommand(workspace, cwd, ["ls-remote", "--heads", "origin", `refs/heads/${branchName}`], maxOutputBytes);
      if (remote.code !== 0) return commandOperationResult(operation.id, remote, "Inspect Git remote identity");
      remoteHead = remote.stdout.trim().split(/\s+/, 1)[0] ?? "";
    }
    const identity = {
      head: head.stdout.trim(),
      parent: parent.code === 0 ? parent.stdout.trim() : "",
      subject: subject.stdout.trim(),
      branch: branchName,
      status: status.stdout,
      ...(operation.includeRemote ? { remoteHead } : {}),
    };
    return { operationId: operation.id, ok: true, summary: "Inspected Git identity", stdout: JSON.stringify(identity), reference: identity.head };
  }

  if (operation.type === "GIT_COMMIT") {
    const cwd = await assertWorkspaceAccess(deps.allowedRoots, workspace, operation.cwd);
    const headBefore = await gitCommand(workspace, cwd, ["rev-parse", "HEAD"], maxOutputBytes);
    const initial = headBefore.code !== 0 && !operation.expectedHead;
    if (headBefore.code !== 0 && !initial) {
      return { operationId: operation.id, ok: false, summary: "Git HEAD does not match expected commit base", reference: "" };
    }
    if (initial) {
      const inside = await gitCommand(workspace, cwd, ["rev-parse", "--is-inside-work-tree"], maxOutputBytes);
      const branch = await gitCommand(workspace, cwd, ["branch", "--show-current"], maxOutputBytes);
      if (inside.code !== 0 || inside.stdout.trim() !== "true" || branch.code !== 0 || !branch.stdout.trim()) {
        const failed = inside.code !== 0 ? inside : branch;
        return commandOperationResult(operation.id, failed, "Inspect initial Git workspace");
      }
    }
    const parent = initial ? null : await gitCommand(workspace, cwd, ["rev-parse", "HEAD^"], maxOutputBytes);
    const subject = initial ? null : await gitCommand(workspace, cwd, ["show", "-s", "--format=%s", "HEAD"], maxOutputBytes);
    const status = await gitCommand(workspace, cwd, ["status", "--short"], maxOutputBytes);
    const recovered = Boolean(operation.expectedHead)
      && !initial
      && parent?.code === 0
      && parent.stdout.trim() === operation.expectedHead
      && subject?.code === 0
      && subject.stdout.trim() === operation.message
      && status.code === 0
      && status.stdout.trim() === "";
    let commitHead = initial ? "" : headBefore.stdout.trim();
    if (!recovered) {
      if (operation.expectedHead && commitHead !== operation.expectedHead) {
        return { operationId: operation.id, ok: false, summary: "Git HEAD does not match expected commit base", reference: commitHead };
      }
      const add = await gitCommand(workspace, cwd, ["add", "-A"], maxOutputBytes);
      if (add.code !== 0) return commandOperationResult(operation.id, add, "Stage Git changes");
      const staged = await gitCommand(workspace, cwd, ["diff", "--cached", "--quiet"], maxOutputBytes);
      if (staged.code === 0) return { operationId: operation.id, ok: false, summary: "Git commit has no staged changes" };
      if (staged.code !== 1) return commandOperationResult(operation.id, staged, "Inspect staged Git changes");
      const userName = await gitCommand(workspace, cwd, ["config", "--get", "user.name"], maxOutputBytes);
      const userEmail = await gitCommand(workspace, cwd, ["config", "--get", "user.email"], maxOutputBytes);
      const commitIdentity = [
        ...(userName.code === 0 && userName.stdout.trim() ? [] : ["-c", "user.name=ISEOL Desktop Agent"]),
        ...(userEmail.code === 0 && userEmail.stdout.trim() ? [] : ["-c", "user.email=iseol-desktop-agent@localhost"]),
      ];
      const commit = await gitCommand(workspace, cwd, [...commitIdentity, "commit", "-m", operation.message], maxOutputBytes);
      const result = commandOperationResult(operation.id, commit, "Created Git commit");
      if (!result.ok) return result;
      const head = await gitCommand(workspace, cwd, ["rev-parse", "HEAD"], maxOutputBytes);
      if (head.code !== 0) return commandOperationResult(operation.id, head, "Inspect committed Git HEAD");
      commitHead = head.stdout.trim();
    }
    if (!operation.publish) {
      return { operationId: operation.id, ok: true, summary: recovered ? "Reused Git commit" : "Created Git commit", reference: commitHead };
    }
    const branch = await gitCommand(workspace, cwd, ["branch", "--show-current"], maxOutputBytes);
    if (branch.code !== 0) return commandOperationResult(operation.id, branch, "Inspect Git branch for publish");
    const branchName = branch.stdout.trim();
    if (!branchName) return { operationId: operation.id, ok: false, summary: "Git publish requires a named branch", reference: commitHead };
    const push = await gitCommand(workspace, cwd, ["push", "origin", `HEAD:refs/heads/${branchName}`], maxOutputBytes);
    const pushResult = commandOperationResult(operation.id, push, "Published Git commit");
    pushResult.reference = commitHead;
    if (!pushResult.ok) return pushResult;
    const remote = await gitCommand(workspace, cwd, ["ls-remote", "--heads", "origin", `refs/heads/${branchName}`], maxOutputBytes);
    if (remote.code !== 0) {
      const remoteResult = commandOperationResult(operation.id, remote, "Verify published Git commit");
      remoteResult.reference = commitHead;
      return remoteResult;
    }
    const remoteHead = remote.stdout.trim().split(/\s+/, 1)[0] ?? "";
    if (remoteHead !== commitHead) return { operationId: operation.id, ok: false, summary: "Published Git commit identity mismatch", reference: commitHead };
    return { operationId: operation.id, ok: true, summary: recovered ? "Reused and published Git commit" : "Created and published Git commit", reference: commitHead };
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), operation.timeoutMs);
  try {
    const response = await fetchImpl(operation.url, { redirect: "manual", signal: controller.signal });
    return {
      operationId: operation.id,
      ok: response.ok,
      summary: `HTTP ${response.status} ${operation.url}`,
      reference: operation.url,
    };
  } finally {
    clearTimeout(timer);
  }
}

function failureResult(
  pack: DesktopTaskPack,
  status: DesktopJobResult["status"],
  completedAt: string,
  operations: DesktopOperationResult[],
): DesktopJobResult {
  return {
    version: 1,
    jobId: pack.jobId,
    runId: pack.runId,
    agentId: pack.agentId,
    status,
    completedAt,
    operations,
  };
}

export async function executeDesktopTaskPack(
  pack: DesktopTaskPack,
  deps: DesktopRuntimeDependencies,
): Promise<DesktopJobResult> {
  assertDesktopTaskPack(pack);
  const now = deps.now ?? (() => new Date().toISOString());
  const maxOutputBytes = deps.maxOutputBytes ?? 64 * 1024;
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    throw new Error(`Desktop maxOutputBytes must be positive: ${maxOutputBytes}`);
  }

  const results: DesktopOperationResult[] = [];
  let policyVerified = false;
  for (const operation of pack.operations) {
    if (desktopOperationMutates(operation) && !policyVerified) {
      try {
        await verifyDesktopTaskPolicy(pack, [
          ...deps.allowedRoots,
          ...(deps.policyRoots ?? []),
        ]);
        policyVerified = true;
      } catch (error) {
        const summary = formatUserFacingError(error);
        results.push({ operationId: operation.id, ok: false, summary });
        return failureResult(pack, "retryable-failure", now(), results);
      }
    }

    let result: DesktopOperationResult;
    try {
      result = await executeOperation(pack, operation, deps, maxOutputBytes);
    } catch (error) {
      const rawSummary = error instanceof Error ? error.message : String(error);
      const summary = formatUserFacingError(error);
      results.push({ operationId: operation.id, ok: false, summary });
      const protectedFailure = /outside Desktop|not allowed|inline evaluation|patch .*target/i.test(rawSummary);
      return failureResult(pack, protectedFailure ? "final-failure" : "retryable-failure", now(), results);
    }
    results.push(result);
    if (!result.ok) return failureResult(pack, "retryable-failure", now(), results);
  }
  return failureResult(pack, "completed", now(), results);
}
