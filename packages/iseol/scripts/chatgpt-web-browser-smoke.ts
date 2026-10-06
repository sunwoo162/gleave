import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ChatGptWebAuthenticationRequiredError } from "../src/chatgpt-web/browser-adapter.js";
import { resolveProductionChatGptBrowserDriver } from "../src/chatgpt-web/browser-service.js";
import type { PlaywrightBrowserRoots } from "../src/chatgpt-web/playwright-browser-config.js";
import type { ChatGptBrowserDriver } from "../src/chatgpt-web/production-browser-adapter.js";
import { runChatGptWebControlledSmoke } from "../src/chatgpt-web/smoke.js";

type SmokeResult = Awaited<ReturnType<typeof runChatGptWebControlledSmoke>>;
type ResolveDriver = (
  env: Record<string, string | undefined>, roots: PlaywrightBrowserRoots,
) => Promise<ChatGptBrowserDriver | null>;

type CliDeps = {
  roots?: PlaywrightBrowserRoots;
  resolveDriver?: ResolveDriver;
  runSmoke?: (input: { driver: ChatGptBrowserDriver; timeoutMs?: number }) => Promise<SmokeResult>;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  cwd?: string;
};
function defaultRoots(env: Record<string, string | undefined>, cwd: string): PlaywrightBrowserRoots {
  return {
    repositoryRoot: cwd,
    modelRoot: resolve(env.ISEOL_MODEL_ROOT?.trim() || resolve(cwd, "data", "iseol")),
    runRoot: resolve(env.ISEOL_RUN_ROOT?.trim() || resolve(cwd, "data", "runs")),
    webRoot: resolve(cwd, "web"),
    chatGptWebRoot: resolve(env.ISEOL_CHATGPT_WEB_ROOT?.trim() || resolve(cwd, "data", "runs")),
  };
}

function isExternalBlocker(error: unknown): boolean {
  if (error instanceof ChatGptWebAuthenticationRequiredError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /PROFILE_ROOT is required|executable.*doesn.t exist|browser.*not (?:found|installed)|cannot find.*(?:chrome|chromium)|ENOENT/i.test(message);
}

export async function runChatGptWebBrowserSmokeCli(
  env: Record<string, string | undefined> = process.env,
  deps: CliDeps = {},
): Promise<number> {
  const stdout = deps.stdout ?? console.log;
  const stderr = deps.stderr ?? console.error;
  const enabled = env.ISEOL_CHATGPT_BROWSER_ENABLED?.trim().toLowerCase() ?? "";
  if (!enabled || enabled === "false") {
    stderr("ChatGPT browser smoke blocked-external: browser capability is not configured.");
    return 2;
  }
  if (enabled !== "true") {
    stderr("ChatGPT browser smoke failed: ISEOL_CHATGPT_BROWSER_ENABLED must be true or false.");
    return 1;
  }
  const roots = deps.roots ?? defaultRoots(env, deps.cwd ?? process.cwd());
  const resolveDriver = deps.resolveDriver ?? resolveProductionChatGptBrowserDriver;
  let driver: ChatGptBrowserDriver | null;
  try {
    driver = await resolveDriver(env, roots);
  } catch (error) {
    if (isExternalBlocker(error)) {
      stderr("ChatGPT browser smoke blocked-external: browser/profile prerequisite is unavailable.");
      return 2;
    }
    stderr("ChatGPT browser smoke failed during driver resolution.");
    return 1;
  }
  if (!driver) {
    stderr("ChatGPT browser smoke blocked-external: no production browser driver was resolved.");
    return 2;
  }

  let result: SmokeResult | undefined;
  let resultCode = 1;
  try {
    result = await (deps.runSmoke ?? runChatGptWebControlledSmoke)({ driver });
    resultCode = 0;
  } catch (error) {
    if (isExternalBlocker(error)) {
      stderr("ChatGPT browser smoke blocked-external: authentication or browser prerequisite is unavailable.");
      resultCode = 2;
    } else {
      stderr("ChatGPT browser smoke failed.");
    }
  }

  try {
    await driver.dispose?.();
  } catch {
    stderr("ChatGPT browser smoke failed during driver disposal.");
    return 1;
  }
  if (result) {
    stdout(`ChatGPT browser smoke passed: outcome=${result.outcome}; conversation=${result.conversationRef ?? "none"}`);
  }
  return resultCode;
}

const cliPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (cliPath && import.meta.url === cliPath) {
  process.exitCode = await runChatGptWebBrowserSmokeCli();
}
