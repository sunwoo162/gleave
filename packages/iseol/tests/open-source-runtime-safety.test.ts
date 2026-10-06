import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sanitizeCredentialText } from "../src/security/text-safety.js";
import { describeSelfHostedIntegrations } from "../src/security/runtime-safety.js";

test("empty optional integrations are reported as disabled", () => {
  const result = describeSelfHostedIntegrations({});
  assert.equal(result.discord, "disabled");
  assert.equal(result.github, "disabled");
  assert.equal(result.ai, "disabled");
});

test("configured integrations are reported without exposing credential values", () => {
  const result = describeSelfHostedIntegrations({
    DISCORD_TOKEN: "discord-secret-value",
    DISCORD_CLIENT_ID: "discord-client-secret-value",
    GITHUB_TOKEN: "github-secret-value",
    GEMINI_API_KEY: "gemini-secret-value",
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.discord, "configured");
  assert.equal(result.github, "configured");
  assert.equal(result.ai, "configured");
  assert.doesNotMatch(serialized, /secret-value/);
});

test("credential-shaped diagnostics remain redacted", () => {
  const message = sanitizeCredentialText("Authorization: Bearer live-secret token=live-secret");
  assert.match(message, /\[redacted\]/i);
  assert.doesNotMatch(message, /live-secret/);
});

test("env example documents the safe default", async () => {
  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(envExample, /external integrations are disabled by default/i);
});
