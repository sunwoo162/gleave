import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveDesktopAgentCoreConfig,
  startDesktopAgentCoreService,
} from "../src/desktop-agent/core-service.js";
import {
  resolveDesktopAgentClientConfig,
  runPersistentDesktopAgent,
} from "../src/desktop-agent/agent-service.js";

test("Core desktop service is opt-in and loopback-only", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "iseol-desktop-core-"));
  const disabled = resolveDesktopAgentCoreConfig({}, cwd);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.host, "127.0.0.1");
  assert.equal(disabled.port, 8791);

  assert.throws(
    () => resolveDesktopAgentCoreConfig({ ISEOL_DESKTOP_AGENT_HOST: "0.0.0.0" }, cwd),
    /token.*required/i,
  );
  assert.throws(
    () => resolveDesktopAgentCoreConfig({
      ISEOL_DESKTOP_AGENT_HOST: "0.0.0.0",
      ISEOL_DESKTOP_AGENT_TOKEN: "secret",
    }, cwd),
    /loopback.*tls reverse proxy/i,
  );
});

test("enabled Core desktop service starts an authenticated loopback transport", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "iseol-desktop-core-live-"));
  const config = resolveDesktopAgentCoreConfig({
    ISEOL_DESKTOP_AGENT_TOKEN: "secret-token",
    ISEOL_DESKTOP_AGENT_PORT: "0",
  }, cwd, { allowEphemeralPort: true });
  const service = await startDesktopAgentCoreService(config);
  try {
    assert.equal(service.config.enabled, true);
    assert.match(service.url, /^ws:\/\/127\.0\.0\.1:/);
  } finally {
    await service.close();
  }
});

test("Agent client config requires secure public transport and explicit roots", () => {
  assert.throws(() => resolveDesktopAgentClientConfig({}), /url.*required/i);
  assert.throws(() => resolveDesktopAgentClientConfig({
    ISEOL_DESKTOP_AGENT_URL: "ws://example.com/desktop",
    ISEOL_DESKTOP_AGENT_TOKEN: "secret",
    ISEOL_DESKTOP_AGENT_ID: "agent-001",
    ISEOL_DESKTOP_AGENT_WORKSPACE_ROOTS: "C:\\Users\\user\\Documents",
  }), /wss.*public/i);
  const config = resolveDesktopAgentClientConfig({
    ISEOL_DESKTOP_AGENT_URL: "wss://iseol.example.com/desktop",
    ISEOL_DESKTOP_AGENT_TOKEN: "secret",
    ISEOL_DESKTOP_AGENT_ID: "agent-001",
    ISEOL_DESKTOP_AGENT_WORKSPACE_ROOTS: "C:\\A;C:\\B",
    ISEOL_DESKTOP_AGENT_REQUIRED_OS_USER: "IseolRunner",
  });
  assert.deepEqual(config.workspaceRoots, ["C:\\A", "C:\\B"]);

  const base = {
    ISEOL_DESKTOP_AGENT_TOKEN: "secret",
    ISEOL_DESKTOP_AGENT_ID: "agent-001",
    ISEOL_DESKTOP_AGENT_WORKSPACE_ROOTS: "C:\\A",
    ISEOL_DESKTOP_AGENT_REQUIRED_OS_USER: "IseolRunner",
  };
  assert.doesNotThrow(() => resolveDesktopAgentClientConfig({ ...base, ISEOL_DESKTOP_AGENT_URL: "ws://[::1]:8791" }));
  for (const url of [
    "wss://user:password@iseol.example.com/desktop",
    "wss://@iseol.example.com/desktop",
    "wss://:@iseol.example.com/desktop",
    "wss://iseol.example.com\\@attacker.example.com/desktop",
    "wss://iseol.example.com/%5Cdesktop",
    "wss://iseol.example.com/desktop\n",
    "wss://iseol.example.com/desktop\t",
    " wss://iseol.example.com/desktop ",
  ]) {
    assert.throws(() => resolveDesktopAgentClientConfig({ ...base, ISEOL_DESKTOP_AGENT_URL: url }), /Desktop Agent/);
  }
});

test("persistent Agent reconnect uses bounded exponential backoff", async () => {
  const abort = new AbortController();
  const delays: number[] = [];
  let attempts = 0;
  await runPersistentDesktopAgent({
    url: "ws://127.0.0.1:8791",
    token: "secret",
    agentId: "agent-001",
    workspaceRoots: [process.cwd()],
    requiredOsUser: "test-user",
    heartbeatIntervalMs: 1_000,
    reconnectBaseMs: 10,
    reconnectMaxMs: 25,
  }, {
    signal: abort.signal,
    connect: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("offline");
      abort.abort();
      return { close: async () => undefined, closed: Promise.resolve() };
    },
    sleep: async (ms) => { delays.push(ms); },
    random: () => 0,
    currentOsUser: () => "test-user",
  });
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [10, 20]);
});

test("production entrypoints wire Core startup and Desktop Agent scripts", async () => {
  const index = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../src/runtime/iseol-runtime-services.ts", import.meta.url), "utf8");
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(index, /startIseolRuntimeServices/);
  assert.match(runtime, /startDesktopAgentCoreService/);
  assert.match(runtime, /resolveDesktopAgentCoreConfig/);
  assert.equal(pkg.scripts["desktop:agent"], "tsx src/desktop-agent/main.ts");
  assert.equal(pkg.scripts["desktop:agent:start"], "node dist/desktop-agent/main.js");
});


test("Agent policy roots stay separate from writable workspace roots", () => {
  const config = resolveDesktopAgentClientConfig({
    ISEOL_DESKTOP_AGENT_URL: "ws://127.0.0.1:8791",
    ISEOL_DESKTOP_AGENT_TOKEN: "secret",
    ISEOL_DESKTOP_AGENT_ID: "agent-001",
    ISEOL_DESKTOP_AGENT_WORKSPACE_ROOTS: "C:\\Sandbox",
    ISEOL_DESKTOP_AGENT_POLICY_ROOTS: "C:\\Policy;C:\\Policy2",
    ISEOL_DESKTOP_AGENT_REQUIRED_OS_USER: "IseolRunner",
  });
  assert.deepEqual(config.workspaceRoots, ["C:\\Sandbox"]);
  assert.deepEqual(config.policyRoots, ["C:\\Policy", "C:\\Policy2"]);
});

test("Agent client config requires an explicit least-privilege OS identity", () => {
  assert.throws(() => resolveDesktopAgentClientConfig({
    ISEOL_DESKTOP_AGENT_URL: "ws://127.0.0.1:8791",
    ISEOL_DESKTOP_AGENT_TOKEN: "secret",
    ISEOL_DESKTOP_AGENT_ID: "agent-001",
    ISEOL_DESKTOP_AGENT_WORKSPACE_ROOTS: "C:\\Sandbox",
  }), /required.*os.*user|os.*user.*required/i);
});

test("persistent Agent fails closed before connecting under the wrong OS user", async () => {
  let connects = 0;
  await assert.rejects(runPersistentDesktopAgent({
    url: "ws://127.0.0.1:8791", token: "secret", agentId: "agent-001",
    workspaceRoots: [process.cwd()], requiredOsUser: "IseolRunner",
    heartbeatIntervalMs: 1_000, reconnectBaseMs: 10, reconnectMaxMs: 25,
  }, {
    currentOsUser: () => "user",
    connect: async () => { connects += 1; throw new Error("must not connect"); },
  }), /IseolRunner|OS identity|least-privilege/i);
  assert.equal(connects, 0);
});

test("persistent Agent advertises typed execution capabilities without generic process", async () => {
  const abort = new AbortController();
  let hello: { capabilities: string[] } | undefined;
  await runPersistentDesktopAgent({
    url: "ws://127.0.0.1:8791", token: "secret", agentId: "agent-001",
    workspaceRoots: [process.cwd()], requiredOsUser: "IseolRunner",
    heartbeatIntervalMs: 1_000, reconnectBaseMs: 10, reconnectMaxMs: 25,
  }, {
    signal: abort.signal,
    currentOsUser: () => "IseolRunner",
    connect: async (input) => {
      hello = { capabilities: [...input.hello.capabilities] };
      abort.abort();
      return { close: async () => undefined, closed: Promise.resolve() };
    },
  });
  assert.ok(hello);
  assert.deepEqual(hello.capabilities, ["files", "test", "build", "git", "http", "operation:GIT_INIT", "operation:GIT_INSPECT"]);
  assert.equal(hello.capabilities.includes("process"), false);
});

test("Windows runner provisioning keeps the whole user profile default-deny and stays non-admin", async () => {
  const script = await readFile(new URL("../scripts/windows/provision-iseol-runner.ps1", import.meta.url), "utf8");
  assert.match(script, /ProtectedProfileRoot/);
  assert.match(script, /WorkspaceRoot must be outside the protected user profile/i);
  assert.match(script, /unsafeProfileSids/);
  for (const sid of ["S-1-5-32-544", "S-1-5-32-547", "S-1-5-32-551"]) assert.match(script, new RegExp(sid));
  assert.match(script, /Remove-LocalGroupMember/);
  assert.match(script, /RunLevel Limited/i);
  assert.doesNotMatch(script, /icacls\.exe[\s\S]*\/deny/i);
});
