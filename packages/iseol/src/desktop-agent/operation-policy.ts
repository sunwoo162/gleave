import { assertBoundedProcessRequest } from "./process-policy.js";

const OPERATION_KEYS: Record<string, readonly string[]> = {
  READ_FILE: ["id", "type", "path"],
  LIST_DIRECTORY: ["id", "type", "path"],
  APPLY_PATCH: ["id", "type", "path", "patch"],
  RUN_PROCESS: ["id", "type", "purpose", "cwd", "executable", "args", "timeoutMs"],
  GIT_STATUS: ["id", "type", "cwd"],
  GIT_DIFF: ["id", "type", "cwd"],
  GIT_BRANCH: ["id", "type", "cwd"],
  GIT_INIT: ["id", "type", "cwd", "initialBranch"],
  GIT_INSPECT: ["id", "type", "cwd", "includeRemote"],
  GIT_WORKTREE_CREATE: ["id", "type", "cwd", "branch", "worktreePath", "baseRef"],
  GIT_COMMIT: ["id", "type", "cwd", "message", "expectedHead", "publish"],
  CHECK_HTTP: ["id", "type", "url", "timeoutMs"],
};

const UNSUPPORTED_GIT_PROCESS_COMMANDS = new Set([
  "reset", "clean", "checkout", "switch", "restore", "rm", "rebase",
  "merge", "cherry-pick", "revert", "commit", "push", "worktree", "tag",
]);

function executableName(value: string): string {
  return value.split(/[\\/]/).at(-1)?.toLowerCase() ?? value.toLowerCase();
}

const GIT_GLOBAL_OPTIONS_WITH_VALUE = new Set([
  "-c", "-C", "--config-env", "--git-dir", "--namespace", "--super-prefix", "--work-tree",
]);
const GIT_GLOBAL_OPTIONS_WITH_ATTACHED_VALUE = [
  "-c", "-C", "--config-env=", "--git-dir=", "--namespace=", "--super-prefix=", "--work-tree=",
];

function gitSubcommand(args: unknown[]): string {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (typeof arg !== "string") return "";
    if (GIT_GLOBAL_OPTIONS_WITH_VALUE.has(arg)) {
      index += 1;
      continue;
    }
    if (GIT_GLOBAL_OPTIONS_WITH_ATTACHED_VALUE.some((option) => arg.startsWith(option) && arg !== option)) continue;
    if (arg.startsWith("-")) continue;
    return arg.toLowerCase();
  }
  return "";
}
export function assertDesktopOperationPolicy(operation: Record<string, unknown>): void {
  const type = String(operation.type);
  const allowedKeys = OPERATION_KEYS[type];
  if (!allowedKeys) return;
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(operation).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`Desktop ${type} operation has unknown field: ${unknown}`);

  if (type !== "RUN_PROCESS") return;
  if (operation.purpose !== "test" && operation.purpose !== "build") {
    throw new Error("Desktop RUN_PROCESS purpose must be test or build");
  }
  if (typeof operation.executable !== "string" || !Array.isArray(operation.args)
      || operation.args.some((arg) => typeof arg !== "string")) {
    throw new Error("Desktop RUN_PROCESS executable and args are required");
  }
  const name = executableName(operation.executable);
  const firstArg = gitSubcommand(operation.args);
  if (name === "git" || name === "git.exe") {
    if (UNSUPPORTED_GIT_PROCESS_COMMANDS.has(firstArg)) {
      throw new Error(`Desktop destructive Git process is not allowed: git ${firstArg}`);
    }
    throw new Error("Desktop Git is not allowed through RUN_PROCESS");
  }
  assertBoundedProcessRequest(operation.purpose, operation.executable, operation.args);
}
