import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import {
  assertOwnedProcessTemp,
  createSandboxedProcessEnv,
  processJobTempRoot,
} from "../src/desktop-agent/process-policy.js";

const workspace = resolve("C:/sandbox/project");

test("sandboxed process env strips secrets and redirects profile/cache roots", () => {
  const tempRoot = processJobTempRoot(workspace, "job-123");
  const env = createSandboxedProcessEnv({
    PATH: "C:/tools",
    SystemRoot: "C:/Windows",
    JAVA_HOME: "C:/Java",
    NODE_OPTIONS: "--require C:/evil.js",
    DISCORD_TOKEN: "secret-discord",
    GITHUB_TOKEN: "secret-github",
    ISEOL_DESKTOP_AGENT_TOKEN: "secret-agent",
  }, tempRoot);

  assert.equal(env.PATH, "C:/tools");
  assert.equal(env.SystemRoot, "C:/Windows");
  assert.equal(env.JAVA_HOME, "C:/Java");
  for (const key of ["NODE_OPTIONS", "DISCORD_TOKEN", "GITHUB_TOKEN", "ISEOL_DESKTOP_AGENT_TOKEN"]) {
    assert.equal(env[key], undefined);
  }
  for (const key of [
    "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP",
    "npm_config_cache", "NPM_CONFIG_CACHE", "GRADLE_USER_HOME", "DOTNET_CLI_HOME",
  ]) {
    assert.ok(env[key]);
    assert.ok(resolve(env[key]!).toLowerCase().startsWith(resolve(tempRoot).toLowerCase()));
  }
});

test("job temp identity is deterministic and cleanup guard cannot escape", () => {
  const first = processJobTempRoot(workspace, "job-123");
  const second = processJobTempRoot(workspace, "job-123");
  const other = processJobTempRoot(workspace, "job-456");
  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.match(first.replaceAll("\\", "/"), /\/\.iseol\/jobs\/[0-9a-f]{24}$/);
  assert.doesNotThrow(() => assertOwnedProcessTemp(workspace, first));
  assert.throws(() => assertOwnedProcessTemp(workspace, workspace), /owned process temp/i);
  assert.throws(() => assertOwnedProcessTemp(workspace, resolve(workspace, "..", "outside")), /owned process temp/i);
});

test("sandboxed process env removes user profile PATH entries and restores Windows COMSPEC", () => {
  const tempRoot = processJobTempRoot(workspace, "job-path");
  const env = createSandboxedProcessEnv({
    Path: "C:\\Program Files\\nodejs;C:\\Users\\user\\AppData\\Roaming\\npm;C:\\Users\\user\\.cargo\\bin;C:\\Windows\\System32",
    SystemRoot: "C:\\Windows",
    USERPROFILE: "C:\\Users\\user",
    APPDATA: "C:\\Users\\user\\AppData\\Roaming",
    LOCALAPPDATA: "C:\\Users\\user\\AppData\\Local",
    TEMP: "C:\\Users\\user\\AppData\\Local\\Temp",
  }, tempRoot);
  assert.match(env.Path ?? "", /Program Files\\nodejs/i);
  assert.match(env.Path ?? "", /Windows\\System32/i);
  assert.doesNotMatch(env.Path ?? "", /C:\\Users\\user/i);
  if (process.platform === "win32") assert.equal(env.COMSPEC, "C:\\Windows\\System32\\cmd.exe");
});
