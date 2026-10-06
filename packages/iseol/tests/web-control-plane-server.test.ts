import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { createConnection } from "node:net";
import type { AddressInfo } from "node:net";
import type { PrototypeCandidate } from "../src/project-model/contracts.js";
import { savePrototypeCandidate } from "../src/project-model/prototype-store.js";
import { saveProjectWorkspace } from "../src/project-model/workspace-store.js";
import {
  resolveWebControlPlaneConfig,
  startWebControlPlaneServer,
} from "../src/web-control-plane/server.js";
import { WebProductEventBus } from "../src/web-control-plane/event-bus.js";

type SseReaderState = { buffer: string };

async function readSseFrame(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  state: SseReaderState,
): Promise<string> {
  for (;;) {
    const end = state.buffer.indexOf("\n\n");
    if (end >= 0) {
      const frame = state.buffer.slice(0, end);
      state.buffer = state.buffer.slice(end + 2);
      return frame;
    }
    const next = await reader.read();
    if (next.done) throw new Error("SSE stream ended before a complete frame");
    state.buffer += new TextDecoder().decode(next.value);
  }
}

async function readOptionalSseFrame(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  state: SseReaderState,
  timeoutMs = 100,
): Promise<string | null> {
  const pending = readSseFrame(reader, state);
  return await Promise.race([
    pending,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

function sseData(frame: string): Record<string, unknown> {
  const line = frame.split("\n").find((item) => item.startsWith("data: "));
  if (!line) throw new Error(`SSE frame has no data: ${frame}`);
  return JSON.parse(line.slice("data: ".length)) as Record<string, unknown>;
}

function candidate(): PrototypeCandidate {
  return {
    version: 1,
    id: "prototype-001",
    title: "Study Race",
    concept: "Compete on study time",
    repository: { url: "https://github.com/example/repo", branch: "main", commitSha: "abc123" },
    deployment: { url: "https://study.example.com" },
    runIds: [],
    status: "candidate",
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
  };
}

test("control plane config defaults to loopback and rejects unauthenticated public bind", () => {
  const local = resolveWebControlPlaneConfig({});
  assert.equal(local.host, "127.0.0.1");
  assert.equal(local.port > 0, true);
  assert.equal(local.eventJournalRoot, join(local.platformRoot!, "web-events"));
  assert.throws(
    () => resolveWebControlPlaneConfig({ ISEOL_WEB_HOST: "0.0.0.0" }),
    /ISEOL_WEB_TOKEN/,
  );
});

test("control plane config accepts authenticated public bind", () => {
  const config = resolveWebControlPlaneConfig({
    ISEOL_WEB_HOST: "0.0.0.0",
    ISEOL_WEB_PORT: "8899",
    ISEOL_WEB_TOKEN: "secret-token",
    ISEOL_MODEL_ROOT: "C:/iseol/model",
    ISEOL_RUN_ROOT: "C:/iseol/runs",
    ISEOL_WEB_EVENT_JOURNAL_ROOT: "C:/iseol/web-events",
  });
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, 8899);
  assert.equal(config.token, "secret-token");
  assert.equal(config.modelRoot, "C:/iseol/model");
  assert.equal(config.harnessRoot, "C:/iseol/runs");
  assert.equal(config.eventJournalRoot, "C:/iseol/web-events");
});

async function startFixture() {
  const root = await mkdtemp(join(tmpdir(), "iseol-web-server-"));
  const modelRoot = join(root, "model");
  const harnessRoot = join(root, "runs");
  const webRoot = join(root, "web");
  await mkdir(webRoot, { recursive: true });
  await writeFile(join(webRoot, "index.html"), "<h1>Iseol</h1>", "utf8");
  await writeFile(join(webRoot, "app.js"), "console.log('iseol')", "utf8");
  await savePrototypeCandidate(modelRoot, candidate());
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1",
    port: 0,
    token: "secret-token",
    modelRoot,
    harnessRoot,
    webRoot,
  });
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}`, modelRoot };
}

test("server delegates API requests and serves static content types", async () => {
  const { server, baseUrl } = await startFixture();
  try {
    const idea = await fetch(`${baseUrl}/api/idea-lab`);
    assert.equal(idea.status, 200);
    assert.equal((await idea.json() as any).prototypes[0].id, "prototype-001");

    const html = await fetch(`${baseUrl}/`);
    assert.equal(html.status, 200);
    assert.match(html.headers.get("content-type") ?? "", /text\/html/);
    assert.equal(await html.text(), "<h1>Iseol</h1>");

    const script = await fetch(`${baseUrl}/app.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get("content-type") ?? "", /javascript/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
  }
});

test("server rejects raw backslash normalization for operator project routes", async () => {
  const { server, baseUrl, modelRoot } = await startFixture();
  await saveProjectWorkspace(modelRoot, {
    version: 1, id: "project-raw", name: "Raw path", status: "active",
    genesis: { prototypeId: "prototype-001", repository: candidate().repository, deployment: candidate().deployment, runs: [], promotedAt: "2026-09-07T00:00:00.000Z" },
    tree: [{ id: "root", kind: "root", title: "Raw path", status: "planned", runIds: [], createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" }],
    createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z",
  });
  try {
    const payload = JSON.stringify({ title: "Must not be created", objective: "Raw path boundary", idempotencyKey: "raw-path-server" });
    const status = await new Promise<number>((resolveStatus, reject) => {
      const request = httpRequest({ hostname: "127.0.0.1", port: new URL(baseUrl).port, method: "POST", path: "/api/projects\\project-raw/work-requests", headers: { authorization: "Bearer secret-token", "content-type": "application/json", "content-length": Buffer.byteLength(payload) } }, (response) => {
        response.resume();
        response.once("end", () => resolveStatus(response.statusCode ?? 0));
      });
      request.once("error", reject);
      request.end(payload);
    });
    assert.equal(status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("server rejects invalid and oversized JSON mutation bodies", async () => {
  const { server, baseUrl } = await startFixture();
  try {
    const invalid = await fetch(`${baseUrl}/api/prototypes/prototype-001/promote`, {
      method: "POST",
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json",
      },
      body: "{broken",
    });
    assert.equal(invalid.status, 400);

    const oversized = await fetch(`${baseUrl}/api/prototypes/prototype-001/promote`, {
      method: "POST",
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ padding: "x".repeat(70_000) }),
    });
    assert.equal(oversized.status, 413);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
  }
});


test("server passes ready Idea Lab runtime capability through to campaign creation", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-web-runtime-"));
  const modelRoot = join(root, "model");
  const harnessRoot = join(root, "runs");
  const webRoot = join(root, "web");
  await mkdir(webRoot, { recursive: true });
  await writeFile(join(webRoot, "index.html"), "<h1>Iseol</h1>", "utf8");
  const enqueued: string[] = [];
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "secret-token", modelRoot, harnessRoot, webRoot,
    ideaLabRuntime: { state: "ready", enqueue: (id: string) => enqueued.push(id) },
  });
  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/idea-lab/campaigns`, {
      method: "POST", headers: { authorization: "Bearer secret-token", "content-type": "application/json" },
      body: JSON.stringify({ seed: "server live runtime" }),
    });
    assert.equal(response.status, 201);
    const campaign = await response.json() as { id: string };
    assert.deepEqual(enqueued, [campaign.id]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("SSE event stream authenticates, emits a connection frame, and forwards bounded events", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-web-events-"));
  const modelRoot = join(root, "model");
  const harnessRoot = join(root, "runs");
  const webRoot = join(root, "web");
  await mkdir(webRoot, { recursive: true });
  const bus = new WebProductEventBus();
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "secret-token", modelRoot, harnessRoot, webRoot, eventBus: bus, sseConnectionLimit: 1,
  });
  const address = server.address() as AddressInfo;
  const controller = new AbortController();
  try {
    const denied = await fetch(`http://127.0.0.1:${address.port}/api/events`);
    assert.equal(denied.status, 401);
    const stream = await fetch(`http://127.0.0.1:${address.port}/api/events`, {
      headers: { authorization: "Bearer secret-token" }, signal: controller.signal,
    });
    assert.equal(stream.status, 200);
    assert.match(stream.headers.get("content-type") ?? "", /text\/event-stream/);
    const reader = stream.body!.getReader();
    const first = await reader.read();
    assert.match(new TextDecoder().decode(first.value), /event: connected/);
    bus.publish({ type: "campaign.updated", scope: { campaignId: "campaign-1" }, payload: { campaignId: "campaign-1", status: "producing" } });
    const second = await reader.read();
    const text = new TextDecoder().decode(second.value);
    assert.match(text, /event: campaign\.updated/);
    assert.match(text, /campaign-1/);
    const capacity = await fetch(`http://127.0.0.1:${address.port}/api/events`, { headers: { authorization: "Bearer secret-token" } });
    assert.equal(capacity.status, 429);
    controller.abort();
  } finally {
    controller.abort();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Control Plane event journal survives a bus restart and filters events after Last-Event-ID", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-web-event-replay-"));
  const modelRoot = join(root, "model");
  const harnessRoot = join(root, "runs");
  const webRoot = join(root, "web");
  const journalRoot = join(root, "event-journal");
  await mkdir(webRoot, { recursive: true });
  const firstBus = new WebProductEventBus({ journalRoot });
  const first = firstBus.publish({ type: "campaign.updated", scope: { campaignId: "campaign-1" }, payload: { status: "queued" }, occurredAt: "2026-09-28T00:00:00.000Z" });
  const second = firstBus.publish({ type: "campaign.updated", scope: { campaignId: "campaign-1" }, payload: { status: "producing" }, occurredAt: "2026-09-28T00:00:01.000Z" });
  const restartedBus = new WebProductEventBus({ journalRoot });
  assert.deepEqual((await restartedBus.replayAfter(first.id)).map((event) => event.id), [second.id]);

  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "secret-token", modelRoot, harnessRoot, webRoot,
    eventBus: restartedBus, sseConnectionLimit: 2,
  });
  const address = server.address() as AddressInfo;
  const controller = new AbortController();
  try {
    const stream = await fetch(`http://127.0.0.1:${address.port}/api/events`, {
      headers: { authorization: "Bearer secret-token", "last-event-id": first.id }, signal: controller.signal,
    });
    assert.equal(stream.status, 200);
    const reader = stream.body!.getReader();
    const state: SseReaderState = { buffer: "" };
    const connected = sseData(await readSseFrame(reader, state));
    assert.deepEqual(connected.payload, { replay: true });
    assert.equal(sseData(await readSseFrame(reader, state)).id, second.id);

    const third = restartedBus.publish({ type: "campaign.updated", scope: { campaignId: "campaign-1" }, payload: { status: "ready" } });
    assert.equal(sseData(await readSseFrame(reader, state)).id, third.id);
    controller.abort();
  } finally {
    controller.abort();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Control Plane event replay subscribes before reading and emits a live race event once", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-web-event-replay-race-"));
  const modelRoot = join(root, "model");
  const harnessRoot = join(root, "runs");
  const webRoot = join(root, "web");
  const journalRoot = join(root, "event-journal");
  await mkdir(webRoot, { recursive: true });
  let releaseReplay!: () => void;
  let replayStarted!: () => void;
  const replayGate = new Promise<void>((resolve) => { releaseReplay = resolve; });
  const replayReady = new Promise<void>((resolve) => { replayStarted = resolve; });
  class GatedEventBus extends WebProductEventBus {
    override async replayAfter(afterEventId?: string) {
      replayStarted();
      await replayGate;
      return super.replayAfter(afterEventId);
    }
  }
  const bus = new GatedEventBus({ journalRoot });
  const cursor = bus.publish({ type: "project.updated", scope: { projectId: "project-1" }, payload: { status: "queued" } });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "secret-token", modelRoot, harnessRoot, webRoot,
    eventBus: bus, sseConnectionLimit: 1,
  });
  const address = server.address() as AddressInfo;
  const controller = new AbortController();
  try {
    const stream = await fetch(`http://127.0.0.1:${address.port}/api/events`, {
      headers: { authorization: "Bearer secret-token", "last-event-id": cursor.id }, signal: controller.signal,
    });
    const reader = stream.body!.getReader();
    const state: SseReaderState = { buffer: "" };
    assert.deepEqual(sseData(await readSseFrame(reader, state)).payload, { replay: true });
    await replayReady;
    const live = bus.publish({ type: "project.updated", scope: { projectId: "project-1" }, payload: { status: "running" } });
    releaseReplay();
    assert.equal(sseData(await readSseFrame(reader, state)).id, live.id);
    const duplicate = await readOptionalSseFrame(reader, state);
    assert.equal(duplicate === null ? null : sseData(duplicate).id, null);
    controller.abort();
  } finally {
    controller.abort();
    releaseReplay();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("web server shutdown closes active SSE streams before waiting for close", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-web-shutdown-sse-"));
  const modelRoot = join(root, "model");
  const harnessRoot = join(root, "runs");
  const webRoot = join(root, "web");
  await mkdir(webRoot, { recursive: true });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "secret-token", modelRoot, harnessRoot, webRoot,
    eventBus: new WebProductEventBus(),
  });
  const address = server.address() as AddressInfo;
  const controller = new AbortController();
  try {
    const stream = await fetch(`http://127.0.0.1:${address.port}/api/events`, {
      headers: { authorization: "Bearer secret-token" }, signal: controller.signal,
    });
    assert.equal(stream.status, 200);
    const reader = stream.body!.getReader();
    await reader.read();
    const closeForShutdown = (server as typeof server & { closeForShutdown?: () => Promise<void> }).closeForShutdown;
    assert.equal(typeof closeForShutdown, "function");
    await assert.doesNotReject(closeForShutdown!());
  } finally {
    controller.abort();
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("web server shutdown closes idle keep-alive connections", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-web-shutdown-idle-"));
  const webRoot = join(root, "web");
  await mkdir(webRoot, { recursive: true });
  await writeFile(join(webRoot, "index.html"), "ok", "utf8");
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot,
  });
  const address = server.address() as AddressInfo;
  const socket = createConnection(address.port, "127.0.0.1");
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.once("connect", () => {
        socket.write("GET / HTTP/1.1\r\nHost: localhost\r\nConnection: keep-alive\r\n\r\n");
      });
      socket.once("data", () => resolve());
    });
    await assert.doesNotReject(server.closeForShutdown());
  } finally {
    socket.destroy();
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("web server shutdown does not force-close an in-flight mutation request", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-web-shutdown-inflight-"));
  const webRoot = join(root, "web");
  await mkdir(webRoot, { recursive: true });
  const server = await startWebControlPlaneServer({
    host: "127.0.0.1", port: 0, token: "", modelRoot: join(root, "model"), harnessRoot: join(root, "runs"), webRoot,
  });
  const address = server.address() as AddressInfo;
  const socket = createConnection(address.port, "127.0.0.1");
  let closePromise: Promise<void> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.once("connect", () => {
        socket.write("POST /api/idea-lab/campaigns HTTP/1.1\r\nHost: localhost\r\nContent-Length: 100\r\nContent-Type: application/json\r\n\r\n{}");
        setTimeout(resolve, 30);
      });
    });
    closePromise = server.closeForShutdown();
    const completedTooSoon = await Promise.race([
      closePromise.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
    ]);
    assert.equal(completedTooSoon, false);
    assert.equal(server.listening, false);
    socket.destroy();
    await assert.doesNotReject(closePromise);
  } finally {
    socket.destroy();
    server.closeAllConnections?.();
    if (!closePromise) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
