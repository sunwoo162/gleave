import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";

import { resolveIdeaLabRuntimeConfig, type IdeaLabRuntimeRoots } from "../src/idea-lab/runtime-config.js";

const roots: IdeaLabRuntimeRoots = {
  iseolRoot: resolve("C:/iseol"),
  modelRoot: resolve("C:/iseol/model"),
  runRoot: resolve("C:/iseol/runs"),
  webRoot: resolve("C:/iseol/web"),
  browserProfileRoot: resolve("C:/profiles/chatgpt"),
};

function enabledEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    ISEOL_IDEA_LAB_RUNTIME_ENABLED: "true",
    ISEOL_IDEA_LAB_REPOSITORY_ROOT: "C:/sandbox/repository",
    ISEOL_IDEA_LAB_REPOSITORY_URL: "https://github.com/example/idea-lab.git",
    ISEOL_IDEA_LAB_BASE_REF: "main",
    ISEOL_IDEA_LAB_SANDBOX_ROOT: "C:/sandbox",
    ISEOL_IDEA_LAB_AGENT_ID: "idea-lab-agent",
    ISEOL_IDEA_LAB_TEST_EXECUTABLE: "npm",
    ISEOL_IDEA_LAB_TEST_ARGS_JSON: '["test", "--", "--runInBand"]',
    ISEOL_IDEA_LAB_TEST_TIMEOUT_MS: "60000",
    ...overrides,
  };
}

test("runtime is disabled by default", () => {
  assert.deepEqual(resolveIdeaLabRuntimeConfig({}, roots), { enabled: false });
});

test("runtime enabled flag accepts only strict booleans", () => {
  assert.throws(() => resolveIdeaLabRuntimeConfig({ ISEOL_IDEA_LAB_RUNTIME_ENABLED: " true " }, roots), /true or false/i);
  assert.throws(() => resolveIdeaLabRuntimeConfig({ ISEOL_IDEA_LAB_RUNTIME_ENABLED: "true" }, roots), /repository/i);
  assert.throws(() => resolveIdeaLabRuntimeConfig({ ISEOL_IDEA_LAB_RUNTIME_ENABLED: "yes" }, roots), /true or false/i);
  assert.deepEqual(resolveIdeaLabRuntimeConfig({ ISEOL_IDEA_LAB_RUNTIME_ENABLED: "false" }, roots), { enabled: false });
});

test("enabled runtime requires every field and parses test args and timeout", () => {
  const config = resolveIdeaLabRuntimeConfig(enabledEnv(), roots);
  assert.equal(config.enabled, true);
  if (config.enabled) {
    assert.equal(config.repositoryRoot, resolve("C:/sandbox/repository"));
    assert.deepEqual(config.testArgs, ["test", "--", "--runInBand"]);
    assert.equal(config.testTimeoutMs, 60000);
  }
  for (const key of Object.keys(enabledEnv())) {
    if (key === "ISEOL_IDEA_LAB_RUNTIME_ENABLED" || key === "ISEOL_IDEA_LAB_TEST_TIMEOUT_MS") continue;
    assert.throws(() => resolveIdeaLabRuntimeConfig(enabledEnv({ [key]: "" }), roots), new RegExp(key.replaceAll("_", "[_]?"), "i"));
  }
});

test("runtime defaults optional test timeout to 120000", () => {
  const env = enabledEnv();
  delete env.ISEOL_IDEA_LAB_TEST_TIMEOUT_MS;
  const config = resolveIdeaLabRuntimeConfig(env, roots);
  assert.equal(config.enabled, true);
  if (config.enabled) assert.equal(config.testTimeoutMs, 120000);
});

test("local-preview mode requires a trusted executable and preview settings", () => {
  const env = enabledEnv({
    ISEOL_IDEA_LAB_DEPLOYMENT_MODE: "local-preview",
    ISEOL_IDEA_LAB_PREVIEW_EXECUTABLE: process.execPath,
    ISEOL_IDEA_LAB_PREVIEW_ARGS_JSON: '["-e","require(\\\"http\\\").createServer((_,res)=>res.end(\\\"ok\\\")).listen(Number(process.env.PORT),\\\"127.0.0.1\\\")"]',
    ISEOL_IDEA_LAB_PREVIEW_HOST: "127.0.0.1",
    ISEOL_IDEA_LAB_PREVIEW_PORT: "18991",
    ISEOL_IDEA_LAB_PREVIEW_TIMEOUT_MS: "5000",
    ISEOL_IDEA_LAB_EXTERNAL_REQUEST_BUDGET: "4",
  });
  const config = resolveIdeaLabRuntimeConfig(env, roots);
  assert.equal(config.enabled, true);
  if (config.enabled) {
    assert.equal(config.deploymentMode, "local-preview");
    assert.equal(config.previewExecutable, process.execPath);
    assert.equal(config.previewHost, "127.0.0.1");
    assert.equal(config.previewPort, 18991);
    assert.equal(config.previewTimeoutMs, 5000);
    assert.equal(config.externalRequestBudget, 4);
  }
  assert.throws(() => resolveIdeaLabRuntimeConfig({ ...env, ISEOL_IDEA_LAB_PREVIEW_PORT: "80" }, roots), /preview port/i);
  assert.throws(() => resolveIdeaLabRuntimeConfig({ ...env, ISEOL_IDEA_LAB_PREVIEW_HOST: "0.0.0.0" }, roots), /loopback/i);
});

test("enabled runtime preserves Vercel as the explicit default mode", () => {
  const config = resolveIdeaLabRuntimeConfig(enabledEnv(), roots);
  assert.equal(config.enabled, true);
  if (config.enabled) assert.equal(config.deploymentMode, "vercel");
});
test("rejects unsafe sandbox paths, malformed args, non-positive timeout, and unsupported URLs", () => {
  assert.throws(() => resolveIdeaLabRuntimeConfig(enabledEnv({ ISEOL_IDEA_LAB_SANDBOX_ROOT: roots.modelRoot }), roots), /sandbox/i);
  assert.throws(() => resolveIdeaLabRuntimeConfig(enabledEnv({ ISEOL_IDEA_LAB_SANDBOX_ROOT: "C:/iseol/new-sandbox", ISEOL_IDEA_LAB_REPOSITORY_ROOT: "C:/iseol/new-sandbox/repository" }), roots), /outside/i);
  assert.throws(() => resolveIdeaLabRuntimeConfig(enabledEnv({ ISEOL_IDEA_LAB_TEST_ARGS_JSON: "{}" }), roots), /string array/i);
  assert.throws(() => resolveIdeaLabRuntimeConfig(enabledEnv({ ISEOL_IDEA_LAB_TEST_TIMEOUT_MS: "0" }), roots), /timeout/i);
  assert.throws(() => resolveIdeaLabRuntimeConfig(enabledEnv({ ISEOL_IDEA_LAB_REPOSITORY_URL: "git@github.com:example/repo.git" }), roots), /repository url/i);
  assert.throws(() => resolveIdeaLabRuntimeConfig(enabledEnv({ ISEOL_IDEA_LAB_REPOSITORY_URL: "https://example.com/repo.git" }), roots), /repository url/i);
});

test("runtime config enforces canonical GitHub repository identities and preserves valid scheme/suffix casing", () => {
  for (const repositoryUrl of [
    "https://github.com/example/repo?redirect=private",
    "https://github.com/example/repo#private",
    "https://github.com/example/repo%5C.git",
    "https://github.com/example/repo%2Fextra",
    "https://github.com/example/.git",
    "https://github.com/example/repo\\git",
  ]) {
    assert.throws(
      () => resolveIdeaLabRuntimeConfig(enabledEnv({ ISEOL_IDEA_LAB_REPOSITORY_URL: repositoryUrl }), roots),
      /repository url|GitHub 저장소/i,
    );
  }

  const config = resolveIdeaLabRuntimeConfig(
    enabledEnv({ ISEOL_IDEA_LAB_REPOSITORY_URL: "HTTPS://github.com/example/repo.GIT" }),
    roots,
  );
  assert.equal(config.enabled, true);
  if (config.enabled) assert.equal(config.repositoryUrl, "HTTPS://github.com/example/repo.GIT");
});
