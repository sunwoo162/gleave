import { createHash } from "node:crypto";
import { basename, delimiter, isAbsolute, join, relative, resolve } from "node:path";

export type RunProcessPurpose = "test" | "build";

const SHELL_EXECUTABLES = new Set([
  "cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "pwsh.exe", "bash", "sh", "zsh",
]);
const PACKAGE_MANAGERS = new Set([
  "npm", "npm.cmd", "pnpm", "pnpm.cmd", "yarn", "yarn.cmd",
]);
const LOCATION_SWITCHES = new Set([
  "--prefix", "--global", "-g", "--cwd", "--dir", "--workspace-root", "--global-dir",
]);

function executableName(value: string): string {
  return basename(value).toLowerCase();
}

function assertSafeProcessArgs(args: string[]): void {
  for (const arg of args) {
    if (arg.includes("\0")) throw new Error("Desktop process argument contains NUL");
    if (isAbsolute(arg) || /^[A-Za-z]:[\\/]/.test(arg)) {
      throw new Error(`Desktop process absolute path argument is not allowed: ${arg}`);
    }
    if (arg.split(/[\\/]+/).includes("..")) {
      throw new Error(`Desktop process parent path argument is not allowed: ${arg}`);
    }
    if (LOCATION_SWITCHES.has(arg.toLowerCase())) {
      throw new Error(`Desktop process location switch is not allowed: ${arg}`);
    }
  }
}
function packageScriptAllowed(purpose: RunProcessPurpose, args: string[]): boolean {
  const expected = purpose;
  if (args[0]?.toLowerCase() === expected) return true;
  return args[0]?.toLowerCase() === "run" && args[1]?.toLowerCase() === expected;
}

function toolVerbAllowed(name: string, purpose: RunProcessPurpose, args: string[]): boolean {
  const first = args[0]?.toLowerCase() ?? "";
  if (PACKAGE_MANAGERS.has(name)) return packageScriptAllowed(purpose, args);
  if (name === "node" || name === "node.exe") {
    return purpose === "test" && first === "--test";
  }
  if (name === "dotnet" || name === "dotnet.exe") return first === purpose;
  if (["mvn", "mvn.cmd"].includes(name)) {
    const goals = new Set(args.filter((arg) => !arg.startsWith("-"))).keys();
    const values = [...goals];
    return purpose === "test" ? values.includes("test") : values.some((value) => value === "package" || value === "verify");
  }
  if (["gradle", "gradle.bat"].includes(name)) {
    const tasks = args.filter((arg) => !arg.startsWith("-")).map((arg) => arg.toLowerCase());
    return purpose === "test" ? tasks.includes("test") : tasks.some((task) => task === "build" || task === "assemble");
  }
  return false;
}

export function assertBoundedProcessRequest(
  purpose: RunProcessPurpose,
  executable: string,
  args: string[],
): void {
  const name = executableName(executable);
  if (SHELL_EXECUTABLES.has(name)) throw new Error(`Desktop shell executable is not allowed: ${executable}`);
  if (executable !== basename(executable)) throw new Error("Desktop process executable must be a bounded executable name");
  assertSafeProcessArgs(args);
  if ((name === "node" || name === "node.exe")
      && args.some((arg) => ["-e", "--eval", "-p", "--print"].includes(arg))) {
    throw new Error("Desktop Node inline evaluation is not allowed");
  }
  if (!toolVerbAllowed(name, purpose, args)) {
    throw new Error(`Desktop ${purpose} process command is not allowed: ${name} ${args.join(" ")}`.trim());
  }
}

const ENV_PASSTHROUGH = new Set([
  "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "OS",
  "PROCESSOR_ARCHITECTURE", "PROCESSOR_IDENTIFIER", "NUMBER_OF_PROCESSORS",
  "JAVA_HOME", "DOTNET_ROOT",
]);

export function processJobTempRoot(workspace: string, jobId: string): string {
  const digest = createHash("sha256").update(jobId, "utf8").digest("hex").slice(0, 24);
  return join(resolve(workspace), ".iseol", "jobs", digest);
}

export function assertOwnedProcessTemp(workspace: string, candidate: string): string {
  const root = resolve(workspace, ".iseol", "jobs");
  const target = resolve(candidate);
  const rel = relative(root, target).replaceAll("\\", "/");
  if (!/^[0-9a-f]{24}$/i.test(rel)) {
    throw new Error(`Desktop owned process temp is outside the job temp root: ${candidate}`);
  }
  return target;
}

export function createSandboxedProcessEnv(
  baseEnv: NodeJS.ProcessEnv,
  tempRoot: string,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value !== undefined && ENV_PASSTHROUGH.has(key.toUpperCase())) env[key] = value;
  }
  const sensitiveRoots = ["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP"]
    .map((wanted) => Object.entries(baseEnv).find(([key]) => key.toUpperCase() === wanted)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => resolve(value));
  const pathEntry = Object.entries(baseEnv).find(([key]) => key.toUpperCase() === "PATH");
  if (pathEntry?.[1]) {
    env[pathEntry[0]] = pathEntry[1].split(delimiter).map((item) => item.trim()).filter(Boolean)
      .filter((item) => isAbsolute(item))
      .filter((item) => !sensitiveRoots.some((root) => {
        const rel = relative(root, resolve(item));
        return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
      })).join(delimiter);
  }
  const systemRoot = Object.entries(baseEnv)
    .find(([key]) => key.toUpperCase() === "SYSTEMROOT" || key.toUpperCase() === "WINDIR")?.[1];
  if (process.platform === "win32" && systemRoot
      && !Object.keys(env).some((key) => key.toUpperCase() === "COMSPEC")) {
    env.COMSPEC = join(systemRoot, "System32", "cmd.exe");
  }
  const home = resolve(tempRoot);
  const roaming = join(home, "appdata", "roaming");
  const local = join(home, "appdata", "local");
  Object.assign(env, {
    HOME: home, USERPROFILE: home, APPDATA: roaming, LOCALAPPDATA: local,
    TEMP: join(home, "temp"), TMP: join(home, "temp"),
    npm_config_cache: join(home, "npm-cache"), NPM_CONFIG_CACHE: join(home, "npm-cache"),
    GRADLE_USER_HOME: join(home, "gradle"), DOTNET_CLI_HOME: join(home, "dotnet"),
  });
  return env;
}
