import assert from "node:assert/strict";
import test from "node:test";

process.env.DISCORD_TOKEN = "discord";
process.env.DISCORD_CLIENT_ID = "client";
process.env.GITHUB_TOKEN = "github";
process.env.FIGMA_TOKEN = "figma";
process.env.NOTION_TOKEN = "notion";
process.env.GOOGLE_CLIENT_ID = "";
process.env.GOOGLE_CLIENT_SECRET = "";
process.env.GOOGLE_REFRESH_TOKEN = "";
process.env.GOOGLE_REDIRECT_URI = "";
process.env.GEMINI_API_KEY = "";
process.env.GITHUB_WEBHOOK_SECRET = "";
process.env.ISEOL_WEB_HOST = "";
process.env.ISEOL_WEB_PORT = "";
process.env.ISEOL_WEB_TOKEN = "";
process.env.ISEOL_MODEL_ROOT = "";
process.env.ISEOL_RUN_ROOT = "";
process.env.ISEOL_CHATGPT_WEB_ENABLED = "";
process.env.ISEOL_CHATGPT_WEB_ROOT = "";
process.env.ISEOL_CHATGPT_BROWSER_ENABLED = "";
process.env.ISEOL_CHATGPT_BROWSER_PROFILE_ROOT = "";
process.env.ISEOL_CHATGPT_BROWSER_EXECUTABLE = "";
process.env.ISEOL_CHATGPT_BROWSER_HEADLESS = "";

const { config } = await import("../src/config.js");

test("optional calendar review web and chatgpt bridge settings default to empty strings", () => {
  assert.equal(config.googleClientId, "");
  assert.equal(config.googleClientSecret, "");
  assert.equal(config.googleRefreshToken, "");
  assert.equal(config.googleRedirectUri, "");
  assert.equal(config.geminiApiKey, "");
  assert.equal(config.githubWebhookSecret, "");
  assert.equal(config.iseolWebHost, "");
  assert.equal(config.iseolWebPort, "");
  assert.equal(config.iseolWebToken, "");
  assert.equal(config.iseolModelRoot, "");
  assert.equal(config.iseolRunRoot, "");
  assert.equal(config.iseolChatGptWebEnabled, "");
  assert.equal(config.iseolChatGptWebRoot, "");
  assert.equal(config.iseolChatGptBrowserEnabled, "");
  assert.equal(config.iseolChatGptBrowserProfileRoot, "");
  assert.equal(config.iseolChatGptBrowserExecutable, "");
  assert.equal(config.iseolChatGptBrowserHeadless, "");
});

test("missing required environment reports a readable configuration error", async () => {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(process.execPath, ["--import", "tsx", "-e", "import('./src/config.ts')"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DISCORD_TOKEN: "",
      DISCORD_CLIENT_ID: "client",
      GITHUB_TOKEN: "github",
      FIGMA_TOKEN: "figma",
      NOTION_TOKEN: "notion",
    },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /DISCORD_TOKEN 환경변수가 필요합니다\./);
});