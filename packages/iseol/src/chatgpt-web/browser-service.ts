import type { ChatGptWebBrowserAdapter } from "./browser-adapter.js";
import {
  createPlaywrightChatGptBrowserDriver,
} from "./playwright-browser-driver.js";
import {
  resolvePlaywrightBrowserDriverConfig,
  type PlaywrightBrowserDriverConfig,
  type PlaywrightBrowserRoots,
} from "./playwright-browser-config.js";
import { createProductionChatGptWebAdapter, type ChatGptBrowserDriver } from "./production-browser-adapter.js";

export type ChatGptWebBridgeConfig = {
  enabled: boolean;
  workerRoot: string;
};

export function resolveChatGptWebBridgeConfig(env: Record<string, string | undefined>): ChatGptWebBridgeConfig {
  const raw = env.ISEOL_CHATGPT_WEB_ENABLED?.trim().toLowerCase() ?? "";
  if (raw && raw !== "true" && raw !== "false") throw new Error("ISEOL_CHATGPT_WEB_ENABLED must be true or false");
  return {
    enabled: raw === "true",
    workerRoot: env.ISEOL_CHATGPT_WEB_ROOT?.trim() || "data/runs",
  };
}

type EnabledBrowserConfig = Extract<PlaywrightBrowserDriverConfig, { enabled: true }>;
type BrowserDriverFactory = (config: EnabledBrowserConfig) => Promise<ChatGptBrowserDriver>;

export async function resolveProductionChatGptBrowserDriver(
  env: Record<string, string | undefined>,
  roots: PlaywrightBrowserRoots,
  deps?: { createDriver?: BrowserDriverFactory },
): Promise<ChatGptBrowserDriver | null> {
  const browserConfig = resolvePlaywrightBrowserDriverConfig(env, roots);
  if (!browserConfig.enabled) return null;
  const createDriver = deps?.createDriver ?? createPlaywrightChatGptBrowserDriver;
  return createDriver(browserConfig);
}

export async function resolveChatGptWebBridgeRuntime(
  env: Record<string, string | undefined>,
  roots: PlaywrightBrowserRoots,
  deps?: { createDriver?: BrowserDriverFactory },
): Promise<{ config: ChatGptWebBridgeConfig; driver: ChatGptBrowserDriver | null }> {
  const config = resolveChatGptWebBridgeConfig(env);
  if (!config.enabled) return { config, driver: null };
  const driver = await resolveProductionChatGptBrowserDriver(env, roots, deps);
  return { config, driver };
}

export type ChatGptWebBridgeService =
  | { enabled: false }
  | { enabled: true; workerRoot: string; adapter: ChatGptWebBrowserAdapter; dispose(): Promise<void> };

export async function startChatGptWebBridgeService(
  config: ChatGptWebBridgeConfig,
  driver?: ChatGptBrowserDriver,
  options: { ownsDriver?: boolean } = {},
): Promise<ChatGptWebBridgeService> {
  if (!config.enabled) return { enabled: false };
  if (!driver) throw new Error("ChatGPT Web browser driver is required when the bridge is enabled");
  return {
    enabled: true,
    workerRoot: config.workerRoot,
    adapter: createProductionChatGptWebAdapter(driver),
    async dispose() { if (options.ownsDriver ?? true) await driver.dispose?.(); },
  };
}
