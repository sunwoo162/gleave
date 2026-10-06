import assert from "node:assert/strict";
import test from "node:test";
import WebSocket from "ws";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DesktopAgentHello, DesktopJobResult, DesktopTaskPack } from "../src/desktop-agent/contracts.js";
import {
  createDesktopAgentTransport,
  type DesktopAgentWire,
} from "../src/desktop-agent/transport.js";
import { startDesktopAgentWebSocketServer } from "../src/desktop-agent/ws-server.js";
import { connectDesktopAgentWebSocketClient } from "../src/desktop-agent/ws-client.js";
import { loadCompletedDesktopResults, persistCompletedDesktopResult } from "../src/desktop-agent/result-store.js";
import { withDurableDesktopJobLock } from "../src/desktop-agent/job-lock.js";

test("Desktop Agent WebSocket close reasons redact credential-shaped transport errors", async () => {
  const server = await startDesktopAgentWebSocketServer({
    host: "127.0.0.1",
    port: 0,
    transport: {
      acceptHello: async () => undefined,
      handleMessage: async () => { throw new Error("transport token=desktop-secret"); },
      disconnect: () => undefined,
    } as any,
  });
  const socket = new WebSocket(server.url);
  try {
    await new Promise<void>((resolve, reject) => { socket.once("open", () => resolve()); socket.once("error", reject); });
    socket.send(JSON.stringify({ version: 1, type: "hello", hello }));
    await new Promise<void>((resolve, reject) => { socket.once("message", () => resolve()); socket.once("error", reject); });
    const closed = new Promise<{ code: number; reason: string }>((resolve) => socket.once("close", (code, reason) => resolve({ code, reason: reason.toString() })));
    socket.send(JSON.stringify({ version: 1, type: "heartbeat", at: "2026-09-08T02:00:00.000Z" }));
    const result = await closed;
    assert.equal(result.code, 4001);
    assert.equal(result.reason.includes("desktop-secret"), false);
    assert.match(result.reason, /\[redacted\]/i);
  } finally {
    if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
    await server.close();
  }
});

test("Desktop Agent WebSocket close reasons stay within the UTF-8 byte limit", async () => {
  const server = await startDesktopAgentWebSocketServer({
    host: "127.0.0.1",
    port: 0,
    transport: {
      acceptHello: async () => undefined,
      handleMessage: async () => { throw new Error("가".repeat(120)); },
      disconnect: () => undefined,
    } as any,
  });
  const socket = new WebSocket(server.url);
  try {
    await new Promise<void>((resolve, reject) => { socket.once("open", () => resolve()); socket.once("error", reject); });
    socket.send(JSON.stringify({ version: 1, type: "hello", hello }));
    await new Promise<void>((resolve, reject) => { socket.once("message", () => resolve()); socket.once("error", reject); });
    const closed = new Promise<{ code: number; reason: string }>((resolve) => socket.once("close", (code, reason) => resolve({ code, reason: reason.toString() })));
    socket.send(JSON.stringify({ version: 1, type: "heartbeat", at: "2026-09-08T02:00:00.000Z" }));
    const result = await closed;
    assert.equal(result.code, 4001);
    assert.ok(Buffer.byteLength(result.reason, "utf8") <= 123);
  } finally {
    if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
    await server.close();
  }
});

test("Desktop Agent wire close reasons redact caller-supplied credentials", async () => {
  const server = await startDesktopAgentWebSocketServer({
    host: "127.0.0.1",
    port: 0,
    transport: {
      acceptHello: async (_sessionId: string, _agentHello: DesktopAgentHello, wire: DesktopAgentWire) => {
        wire.close(`token=wire-secret ${"가".repeat(100)}`);
      },
      handleMessage: async () => undefined,
      disconnect: () => undefined,
    } as any,
  });
  const socket = new WebSocket(server.url);
  try {
    await new Promise<void>((resolve, reject) => { socket.once("open", () => resolve()); socket.once("error", reject); });
    const closed = new Promise<{ code: number; reason: string }>((resolve) => socket.once("close", (code, reason) => resolve({ code, reason: reason.toString() })));
    socket.send(JSON.stringify({ version: 1, type: "hello", hello }));
    const result = await closed;
    assert.equal(result.code, 4000);
    assert.equal(result.reason.includes("wire-secret"), false);
    assert.match(result.reason, /\[redacted\]/i);
    assert.ok(Buffer.byteLength(result.reason, "utf8") <= 123);
  } finally {
    if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
    await server.close();
  }
});

const hello: DesktopAgentHello = {
  version: 1,
  agentId: "agent-001",
  agentVersion: "0.1.0",
  os: "win32",
  capabilities: ["process", "git"],
  workspaceRoots: ["C:/Users/user/Documents"],
  token: "secret-token",
};

async function root() {
  return mkdtemp(join(tmpdir(), "iseol-desktop-transport-"));
}

function task(jobId = "job-001"): DesktopTaskPack {
  return {
    version: 1,
    jobId,
    runId: "run-001",
    stage: "TEST",
    attempt: 1,
    agentId: "agent-001",
    workspaceRoot: "C:/repo",
    idempotencyKey: `test:${jobId}`,
    leaseUntil: "2026-09-08T03:00:00.000Z",
    operations: [{ id: "op-1", type: "READ_FILE", path: "README.md" }],
  };
}

function result(jobId = "job-001"): DesktopJobResult {
  return {
    version: 1,
    jobId,
    runId: "run-001",
    agentId: "agent-001",
    status: "completed",
    completedAt: "2026-09-08T02:00:00.000Z",
    operations: [{ operationId: "op-1", ok: true, summary: "done" }],
  };
}

class FakeWire implements DesktopAgentWire {
  messages: unknown[] = [];
  closed = false;
  send(message: unknown) { this.messages.push(message); }
  close() { this.closed = true; }
}

test("hello authentication is strict and duplicate live identity replacement protects capabilities", async () => {
  const registryRoot = await root();
  const transport = createDesktopAgentTransport({ registryRoot, expectedToken: "secret-token" });
  const first = new FakeWire();
  await transport.acceptHello("session-1", hello, first);
  assert.equal(transport.isAgentConnected("agent-001"), true);

  await assert.rejects(
    transport.acceptHello("session-bad", { ...hello, token: "wrong" }, new FakeWire()),
    /authentication failed/i,
  );

  const second = new FakeWire();
  await transport.acceptHello("session-2", hello, second);
  assert.equal(first.closed, true);
  assert.equal(second.closed, false);
  assert.equal(transport.isAgentConnected("agent-001"), true);
});

test("older capability reconnect cannot replace a newer capable session", async () => {
  const registryRoot = await root();
  const transport = createDesktopAgentTransport({ registryRoot, expectedToken: "secret-token" });
  const capable = new FakeWire();
  await transport.acceptHello("session-capable", { ...hello, capabilities: ["git", "operation:GIT_INIT"] }, capable);
  await assert.rejects(
    transport.acceptHello("session-legacy", hello, new FakeWire()),
    /more capable session/i,
  );
  assert.equal(capable.closed, false);
  assert.equal(transport.getAgentSessionId("agent-001"), "session-capable");
});

test("task/result correlation rejects unknown results and disconnect only drops session", async () => {
  const registryRoot = await root();
  const transport = createDesktopAgentTransport({ registryRoot, expectedToken: "secret-token" });
  const wire = new FakeWire();
  await transport.acceptHello("session-1", hello, wire);
  transport.sendTask("agent-001", task());
  const waiting = transport.awaitResult("job-001", 1_000);
  await transport.handleMessage("session-1", { version: 1, type: "result", result: result() });
  assert.deepEqual(await waiting, result());
  await assert.rejects(
    transport.handleMessage("session-1", { version: 1, type: "result", result: result("job-unknown") }),
    /unknown desktop job result/i,
  );
  transport.disconnect("session-1");
  assert.equal(transport.isAgentConnected("agent-001"), false);
});

test("duplicate dispatch joins the existing pending logical job", async () => {
  const registryRoot = await root();
  const transport = createDesktopAgentTransport({ registryRoot, expectedToken: "secret-token" });
  const wire = new FakeWire();
  await transport.acceptHello("session-1", hello, wire);
  transport.sendTask("agent-001", task("job-join"));
  assert.doesNotThrow(() => transport.sendTask("agent-001", task("job-join")));
  const first = transport.awaitResult("job-join", 1_000);
  const second = transport.awaitResult("job-join", 1_000);
  await transport.handleMessage("session-1", { version: 1, type: "result", result: result("job-join") });
  assert.equal((await first).jobId, "job-join");
  assert.equal((await second).jobId, "job-join");
  assert.equal(wire.messages.length, 1);
});

test("higher read-only retry attempt redispatches a pending logical job", async () => {
  const registryRoot = await root();
  const transport = createDesktopAgentTransport({
    registryRoot,
    expectedToken: "secret-token",
  });
  const wire = new FakeWire();

  await transport.acceptHello("session-1", hello, wire);

  const first = task("job-retry");
  transport.sendTask("agent-001", first);

  transport.sendTask("agent-001", {
    ...first,
    attempt: first.attempt + 1,
  });

  assert.equal(wire.messages.length, 2);

  const waiting = transport.awaitResult("job-retry", 1_000);
  await transport.handleMessage("session-1", {
    version: 1,
    type: "result",
    result: result("job-retry"),
  });

  assert.equal((await waiting).jobId, "job-retry");
});


async function waitFor(predicate: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
  }
  throw new Error("condition timeout");
}

test("loopback WebSocket supports outbound connect task result disconnect and reconnect", async () => {
  const registryRoot = await root();
  const transport = createDesktopAgentTransport({ registryRoot, expectedToken: "secret-token" });
  const server = await startDesktopAgentWebSocketServer({ host: "127.0.0.1", port: 0, transport });
  const onTask = async (pack: DesktopTaskPack) => result(pack.jobId);
  const client = await connectDesktopAgentWebSocketClient({
    url: server.url,
    hello,
    heartbeatIntervalMs: 25,
    onTask,
  });
  try {
    await waitFor(() => transport.isAgentConnected("agent-001"));
    transport.sendTask("agent-001", task("job-live-1"));
    assert.equal((await transport.awaitResult("job-live-1", 1_000)).jobId, "job-live-1");

    await client.close();
    await waitFor(() => !transport.isAgentConnected("agent-001"));
    const second = await connectDesktopAgentWebSocketClient({
      url: server.url,
      hello,
      heartbeatIntervalMs: 25,
      onTask,
    });
    try {
      await waitFor(() => transport.isAgentConnected("agent-001"));
      transport.sendTask("agent-001", task("job-live-2"));
      assert.equal((await transport.awaitResult("job-live-2", 1_000)).jobId, "job-live-2");
    } finally {
      await second.close();
    }
  } finally {
    await server.close();
  }
});

test("late result after await timeout remains recoverable", async () => {
  const registryRoot = await root();
  const transport = createDesktopAgentTransport({ registryRoot, expectedToken: "secret-token" });
  const wire = new FakeWire();
  await transport.acceptHello("session-late", hello, wire);
  transport.sendTask("agent-001", task("job-late"));

  await assert.rejects(transport.awaitResult("job-late", 1), /result timeout/i);
  await transport.handleMessage("session-late", { version: 1, type: "result", result: result("job-late") });
  assert.equal((await transport.awaitResult("job-late", 1_000)).jobId, "job-late");
  await transport.handleMessage("session-late", { version: 1, type: "result", result: result("job-late") });
  await assert.rejects(
    transport.handleMessage("session-late", { version: 1, type: "result", result: { ...result("job-late"), completedAt: "different" } }),
    /immutable|conflict/i,
  );
});

test("completed result is replayed after disconnect before delivery", async () => {
  const registryRoot = await root();
  const resultRoot = await root();
  const transport = createDesktopAgentTransport({ registryRoot, expectedToken: "secret-token" });
  const server = await startDesktopAgentWebSocketServer({ host: "127.0.0.1", port: 0, transport });
  const completedResults = new Map<string, DesktopJobResult>();
  let first!: Awaited<ReturnType<typeof connectDesktopAgentWebSocketClient>>;
  let taskSeen!: () => void;
  const seen = new Promise<void>((resolve) => { taskSeen = resolve; });
  let release!: () => void;
  const releaseTask = new Promise<void>((resolve) => { release = resolve; });
  let persisted!: () => void;
  const persistedResult = new Promise<void>((resolve) => { persisted = resolve; });
  let executions = 0;
  try {
    first = await connectDesktopAgentWebSocketClient({
      url: server.url,
      hello,
      heartbeatIntervalMs: 25,
      completedResults,
      onTask: async (pack) => {
        executions += 1;
        taskSeen();
        await releaseTask;
        return {
          ...result(pack.jobId),
          operations: [{ operationId: "op-1", ok: true, summary: "preview https://preview.example/?access_token=replay-secret", stdout: "REPLAY_STDOUT_SENTINEL" }],
        };
      },
      persistResult: async (value) => {
        await persistCompletedDesktopResult(resultRoot, value);
        persisted();
      },
    } as any);
    transport.sendTask("agent-001", task("job-replay"));
    await seen;
    await first.close();
    release();
    await persistedResult;

    const restartedResults = await loadCompletedDesktopResults(resultRoot);
    const second = await connectDesktopAgentWebSocketClient({
      url: server.url,
      hello,
      heartbeatIntervalMs: 25,
      completedResults: restartedResults,
      onTask: async (pack) => result(pack.jobId),
    } as any);
    try {
      const replayed = await transport.awaitResult("job-replay", 1_000);
      assert.equal(replayed.jobId, "job-replay");
      assert.equal(replayed.operations[0]?.summary, "preview [redacted-url]");
      assert.equal("stdout" in (replayed.operations[0] ?? {}), false);
      assert.equal(executions, 1);
      assert.equal(restartedResults.size, 1);
    } finally {
      await second.close();
    }
  } finally {
    if (first) await first.close();
    await server.close();
  }
});

test("live Desktop results keep command output while durable copies omit it", async () => {
  const registryRoot = await root();
  const resultRoot = await root();
  const transport = createDesktopAgentTransport({ registryRoot, expectedToken: "secret-token" });
  const server = await startDesktopAgentWebSocketServer({ host: "127.0.0.1", port: 0, transport });
  const completedResults = new Map<string, DesktopJobResult>();
  let taskSeen!: () => void;
  const seen = new Promise<void>((resolve) => { taskSeen = resolve; });
  let release!: () => void;
  const releaseTask = new Promise<void>((resolve) => { release = resolve; });
  let client!: Awaited<ReturnType<typeof connectDesktopAgentWebSocketClient>>;
  try {
    client = await connectDesktopAgentWebSocketClient({
      url: server.url,
      hello,
      heartbeatIntervalMs: 25,
      completedResults,
      onTask: async (pack) => {
        taskSeen();
        await releaseTask;
        return {
          ...result(pack.jobId),
          operations: [{ operationId: "op-1", ok: true, summary: "live output", stdout: "LIVE_STDOUT_SENTINEL", stderr: "LIVE_STDERR_SENTINEL" }],
        };
      },
      persistResult: (value) => persistCompletedDesktopResult(resultRoot, value),
    } as any);
    transport.sendTask("agent-001", task("job-live-output"));
    await seen;
    release();
    const live = await transport.awaitResult("job-live-output", 1_000);
    assert.equal(live.operations[0]?.stdout, "LIVE_STDOUT_SENTINEL");
    assert.equal(live.operations[0]?.stderr, "LIVE_STDERR_SENTINEL");
    const durable = (await loadCompletedDesktopResults(resultRoot)).get("job-live-output");
    assert.equal("stdout" in (durable?.operations[0] ?? {}), false);
    assert.equal("stderr" in (durable?.operations[0] ?? {}), false);
    await client.close();
    client = await connectDesktopAgentWebSocketClient({
      url: server.url,
      hello,
      heartbeatIntervalMs: 25,
      completedResults,
      onTask: async (pack) => result(pack.jobId),
    } as any);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(transport.isAgentConnected("agent-001"), true);
  } finally {
    if (client) await client.close();
    await server.close();
  }
});

test("legacy Desktop result files are sanitized before replay", async () => {
  const resultRoot = await root();
  const legacy = {
    ...result("job-legacy"),
    operations: [{
      operationId: "op-1",
      ok: true,
      summary: "preview https://preview.example/?access_token=legacy-secret",
      stdout: "LEGACY_STDOUT_SENTINEL",
      stderr: "LEGACY_STDERR_SENTINEL",
    }],
  };
  await writeFile(join(resultRoot, "job-legacy.json"), JSON.stringify(legacy), "utf8");

  const loaded = await loadCompletedDesktopResults(resultRoot);
  const recovered = loaded.get("job-legacy");
  assert.equal(recovered?.operations[0]?.summary, "preview [redacted-url]");
  assert.equal("stdout" in (recovered?.operations[0] ?? {}), false);
  assert.equal("stderr" in (recovered?.operations[0] ?? {}), false);
});

test("durable Agent results are bounded and omit command output", async () => {
  const resultRoot = await root();
  for (const jobId of ["job-a", "job-b", "job-c"]) {
    await persistCompletedDesktopResult(resultRoot, {
      ...result(jobId),
      completedAt: `2026-09-08T02:00:0${jobId === "job-a" ? "1" : jobId === "job-b" ? "2" : "3"}.000Z`,
      operations: [{ operationId: "op-1", ok: true, summary: "preview https://preview.example/?access_token=desktop-secret", stdout: "ISEOL_SECRET_SENTINEL" }],
    }, 2);
  }
  const loaded = await loadCompletedDesktopResults(resultRoot);
  assert.deepEqual([...loaded.keys()], ["job-b", "job-c"]);
  assert.doesNotMatch(JSON.stringify([...loaded.values()]), /ISEOL_SECRET_SENTINEL/);
  assert.equal(loaded.get("job-b")?.operations[0]?.summary, "preview [redacted-url]");
});

test("durable Agent result persistence waits for the Job lock", async () => {
  const resultRoot = await root();
  let settled = false;
  let persistPromise: Promise<void> | undefined;
  const pending = withDurableDesktopJobLock(
    resultRoot,
    "job-lock",
    async () => {
      const store = await import("../src/desktop-agent/result-store.js?result-lock");
      persistPromise = store.persistCompletedDesktopResult(resultRoot, result("job-lock"));
      persistPromise.finally(() => { settled = true; }).catch(() => undefined);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
      assert.equal(settled, false);
    },
    { waitForMs: 2_000 },
  );
  await pending;
  await persistPromise;
  assert.equal((await loadCompletedDesktopResults(resultRoot)).get("job-lock")?.jobId, "job-lock");
});

test("transport frames require the supported protocol version", async () => {
  const registryRoot = await root();
  const transport = createDesktopAgentTransport({ registryRoot, expectedToken: "secret-token" });
  const wire = new FakeWire();
  await transport.acceptHello("session-1", hello, wire);

  await assert.rejects(
    transport.handleMessage("session-1", {
      version: 99,
      type: "heartbeat",
      at: "2026-09-08T02:00:00.000Z",
    } as any),
    /unsupported iseol desktop protocol version/i,
  );

  transport.sendTask("agent-001", task("job-versioned"));
  assert.equal((wire.messages[0] as any)?.version, 1);
});

test("accepted Desktop Agent hello notifies connection listeners", async () => {
  const registryRoot = await root();
  const transport = createDesktopAgentTransport({
    registryRoot,
    expectedToken: "secret-token",
  });

  const connected: string[] = [];

  const unsubscribe = (transport as any).onAgentConnected?.(
    (agentId: string) => {
      connected.push(agentId);
    },
  );

  assert.equal(
    typeof unsubscribe,
    "function",
    "transport must expose an Agent connection subscription",
  );

  await transport.acceptHello(
    "session-listener-1",
    hello,
    new FakeWire(),
  );

  transport.disconnect("session-listener-1");
  await transport.acceptHello("session-listener-2", hello, new FakeWire());

  assert.deepEqual(
    connected,
    ["agent-001", "agent-001"],
    "initial connect and an explicit reconnect after disconnect must both emit",
  );

  unsubscribe();
});

test("transport notifies only the active Agent session on disconnect", async () => {
  const registryRoot = await root();
  const transport = createDesktopAgentTransport({ registryRoot, expectedToken: "secret-token" });
  const disconnected: string[] = [];
  const unsubscribe = transport.onAgentDisconnected((agentId) => disconnected.push(agentId));

  await transport.acceptHello("session-disconnect-1", hello, new FakeWire());
  await transport.acceptHello("session-disconnect-2", { ...hello, agentId: "agent-002" }, new FakeWire());
  transport.disconnect("session-disconnect-1");
  assert.deepEqual(disconnected, ["agent-001"]);
  transport.disconnect("session-disconnect-2");
  assert.deepEqual(disconnected, ["agent-001", "agent-002"]);
  unsubscribe();
});

test("connection listener failure does not reject an accepted Desktop Agent hello", async () => {
  const registryRoot = await root();
  const transport = createDesktopAgentTransport({
    registryRoot,
    expectedToken: "secret-token",
  });

  const observed: string[] = [];

  transport.onAgentConnected(() => {
    throw new Error("listener failed");
  });

  transport.onAgentConnected((agentId) => {
    observed.push(agentId);
  });

  await transport.acceptHello(
    "session-listener-isolation",
    hello,
    new FakeWire(),
  );

  assert.equal(
    transport.isAgentConnected("agent-001"),
    true,
    "accepted hello must remain connected even if one listener fails",
  );

  assert.deepEqual(
    observed,
    ["agent-001"],
    "one failing listener must not prevent later listeners",
  );
});
