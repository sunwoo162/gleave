import { isAbsolute, relative, resolve, sep } from "node:path";
import { parseGitHubRepository } from "../services/github.js";

type EnvLike = Record<string, string | undefined>;

export type IdeaLabRuntimeRoots = {
  iseolRoot: string;
  modelRoot: string;
  runRoot: string;
  webRoot: string;
  webWorkerRoot?: string;
  browserProfileRoot: string;
  projectModelRoot?: string;
  projectRunRoot?: string;
  projectWebWorkerRoot?: string;
  projectDesktopStateRoot?: string;
};

export type IdeaLabRuntimeConfig =
  | { enabled: false }
  | {
      enabled: true;
      deploymentMode: "vercel" | "local-preview";
      repositoryRoot: string;
      repositoryUrl: string;
      baseRef: string;
      sandboxRoot: string;
      agentId: string;
      testExecutable: string;
      testArgs: string[];
      testTimeoutMs: number;
      externalRequestBudget?: number;
      previewExecutable?: string;
      previewArgs?: string[];
      previewHost?: "127.0.0.1" | "::1";
      previewPort?: number;
      previewTimeoutMs?: number;
    };

function strictBoolean(value: string | undefined): boolean {
  if (value === undefined || value.trim() === "") return false;
  if (value === "false") return false;
  if (value === "true") return true;
  throw new Error("ISEOL_IDEA_LAB_RUNTIME_ENABLED must be true or false");
}

function required(env: EnvLike, name: string): string {
  const value = env[name]?.trim() ?? "";
  if (!value) throw new Error(`${name} is required when Idea Lab runtime is enabled`);
  return value;
}

function insideOrEqual(root: string, target: string): boolean {
  const relation = relative(resolve(root), resolve(target));
  return relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}

export function resolveIdeaLabRuntimeConfig(env: EnvLike, roots: IdeaLabRuntimeRoots): IdeaLabRuntimeConfig {
  if (!strictBoolean(env.ISEOL_IDEA_LAB_RUNTIME_ENABLED)) return { enabled: false };
  const repositoryRoot = resolve(required(env, "ISEOL_IDEA_LAB_REPOSITORY_ROOT"));
  const sandboxRoot = resolve(required(env, "ISEOL_IDEA_LAB_SANDBOX_ROOT"));
  const repositoryUrl = required(env, "ISEOL_IDEA_LAB_REPOSITORY_URL");
  const deploymentMode = (env.ISEOL_IDEA_LAB_DEPLOYMENT_MODE?.trim() || "vercel") as "vercel" | "local-preview";
  if (deploymentMode !== "vercel" && deploymentMode !== "local-preview") {
    throw new Error("ISEOL_IDEA_LAB_DEPLOYMENT_MODE must be vercel or local-preview");
  }
  if (!/^https:\/\//i.test(repositoryUrl)) {
    throw new Error("ISEOL_IDEA_LAB_REPOSITORY_URL must be a GitHub HTTPS repository URL");
  }
  try {
    parseGitHubRepository(repositoryUrl);
  } catch {
    throw new Error("ISEOL_IDEA_LAB_REPOSITORY_URL must be a GitHub HTTPS repository URL");
  }
  if (!insideOrEqual(sandboxRoot, repositoryRoot)) throw new Error("repositoryRoot must be inside sandboxRoot");
  for (const [label, root] of Object.entries(roots)) {
    if (insideOrEqual(root, sandboxRoot)) throw new Error(`sandboxRoot must be outside ${label}`);
  }
  let testArgs: unknown;
  try { testArgs = JSON.parse(required(env, "ISEOL_IDEA_LAB_TEST_ARGS_JSON")); } catch { throw new Error("ISEOL_IDEA_LAB_TEST_ARGS_JSON must be valid JSON string array"); }
  if (!Array.isArray(testArgs) || testArgs.some((arg) => typeof arg !== "string")) throw new Error("ISEOL_IDEA_LAB_TEST_ARGS_JSON must be a string array");
  const timeoutText = env.ISEOL_IDEA_LAB_TEST_TIMEOUT_MS?.trim() || "120000";
  const testTimeoutMs = Number(timeoutText);
  if (!Number.isInteger(testTimeoutMs) || testTimeoutMs <= 0) throw new Error("ISEOL_IDEA_LAB_TEST_TIMEOUT_MS must be positive");
  if (deploymentMode === "vercel") {
    const externalRequestBudget = Number(env.ISEOL_IDEA_LAB_EXTERNAL_REQUEST_BUDGET?.trim() || "64");
    if (!Number.isInteger(externalRequestBudget) || externalRequestBudget <= 0) throw new Error("Idea Lab external request budget must be positive");
    return { enabled: true, deploymentMode, repositoryRoot, repositoryUrl, baseRef: required(env, "ISEOL_IDEA_LAB_BASE_REF"), sandboxRoot, agentId: required(env, "ISEOL_IDEA_LAB_AGENT_ID"), testExecutable: required(env, "ISEOL_IDEA_LAB_TEST_EXECUTABLE"), testArgs, testTimeoutMs, externalRequestBudget };
  }
  const previewExecutable = resolve(required(env, "ISEOL_IDEA_LAB_PREVIEW_EXECUTABLE"));
  let previewArgs: unknown;
  try { previewArgs = JSON.parse(required(env, "ISEOL_IDEA_LAB_PREVIEW_ARGS_JSON")); } catch { throw new Error("ISEOL_IDEA_LAB_PREVIEW_ARGS_JSON must be valid JSON string array"); }
  if (!Array.isArray(previewArgs) || previewArgs.some((arg) => typeof arg !== "string")) throw new Error("ISEOL_IDEA_LAB_PREVIEW_ARGS_JSON must be a string array");
  const previewHost = (env.ISEOL_IDEA_LAB_PREVIEW_HOST?.trim() || "127.0.0.1") as "127.0.0.1" | "::1";
  if (previewHost !== "127.0.0.1" && previewHost !== "::1") throw new Error("ISEOL_IDEA_LAB_PREVIEW_HOST must be a loopback host");
  const previewPort = Number(env.ISEOL_IDEA_LAB_PREVIEW_PORT?.trim() || "0");
  if (!Number.isInteger(previewPort) || previewPort < 1024 || previewPort > 65535) throw new Error("Idea Lab preview port must be between 1024 and 65535");
  const previewTimeoutMs = Number(env.ISEOL_IDEA_LAB_PREVIEW_TIMEOUT_MS?.trim() || "30000");
  if (!Number.isInteger(previewTimeoutMs) || previewTimeoutMs <= 0) throw new Error("ISEOL_IDEA_LAB_PREVIEW_TIMEOUT_MS must be positive");
  const externalRequestBudget = Number(required(env, "ISEOL_IDEA_LAB_EXTERNAL_REQUEST_BUDGET"));
  if (!Number.isInteger(externalRequestBudget) || externalRequestBudget <= 0) throw new Error("Idea Lab external request budget must be positive");
  return { enabled: true, deploymentMode, repositoryRoot, repositoryUrl, baseRef: required(env, "ISEOL_IDEA_LAB_BASE_REF"), sandboxRoot, agentId: required(env, "ISEOL_IDEA_LAB_AGENT_ID"), testExecutable: required(env, "ISEOL_IDEA_LAB_TEST_EXECUTABLE"), testArgs, testTimeoutMs, externalRequestBudget, previewExecutable, previewArgs, previewHost, previewPort, previewTimeoutMs };
}
