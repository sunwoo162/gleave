import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebProductEventBus } from "../src/web-control-plane/event-bus.js";
import { connectProgressEventBridge } from "../src/discord-project/progress-event-bridge.js";

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("Web Product events become one bounded durable Discord delivery", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-progress-bridge-"));
  const bus = new WebProductEventBus();
  let sends = 0;
  const results: string[] = [];
  const disconnect = connectProgressEventBridge({
    eventBus: bus,
    durableRoot: root,
    adapter: { send: async (notification) => { sends += 1; assert.equal(notification.projectId, "project-1"); return { accepted: true, messageId: "message-1" }; } },
    onResult: (_event, result) => results.push(result.status),
  });
  bus.publish({ type: "work-request.updated", scope: { projectId: "project-1" }, payload: { projectId: "project-1", status: "running", blocker: "bounded" } });
  await waitFor(() => sends === 1 && results.length === 1);
  disconnect();
  assert.equal(sends, 1);
  assert.deepEqual(results, ["accepted"]);
  const content = await readFile(join(root, "discord-notifications", "project-1", "delivered.jsonl"), "utf8");
  assert.match(content, /message-1/);
});

test("bridge disconnect prevents later events from dispatching", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-progress-bridge-stop-"));
  const bus = new WebProductEventBus();
  let sends = 0;
  const disconnect = connectProgressEventBridge({ eventBus: bus, durableRoot: root, adapter: { send: async () => { sends += 1; return { accepted: true }; } } });
  disconnect();
  bus.publish({ type: "project.updated", scope: { projectId: "project-1" }, payload: { projectId: "project-1", status: "done" } });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(sends, 0);
});

test("bridge replays durable progress events after a restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-progress-bridge-replay-"));
  const journalRoot = join(root, "event-journal");
  const firstBus = new WebProductEventBus({ journalRoot });
  firstBus.publish({
    type: "run.updated",
    scope: { projectId: "project-replay" },
    payload: { status: "completed", change: "restarted" },
    occurredAt: "2026-09-30T00:00:00.000Z",
  });

  const restartedBus = new WebProductEventBus({ journalRoot });
  let sends = 0;
  const disconnect = connectProgressEventBridge({
    eventBus: restartedBus,
    durableRoot: join(root, "deliveries"),
    adapter: { send: async (notification) => { sends += 1; assert.equal(notification.projectId, "project-replay"); return { accepted: true }; } },
  });

  await waitFor(() => sends === 1);
  disconnect();
  assert.equal(sends, 1);
});

test("bridge replay reuses durable delivery state without sending duplicates", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-progress-bridge-replay-dedupe-"));
  const journalRoot = join(root, "event-journal");
  const firstBus = new WebProductEventBus({ journalRoot });
  firstBus.publish({ type: "run.updated", scope: { projectId: "project-replay-dedupe" }, payload: { status: "completed" } });

  let sends = 0;
  const adapter = { send: async () => { sends += 1; return { accepted: true }; } };
  const firstDisconnect = connectProgressEventBridge({ eventBus: new WebProductEventBus({ journalRoot }), durableRoot: join(root, "deliveries"), adapter });
  await waitFor(() => sends === 1);
  firstDisconnect();

  const secondDisconnect = connectProgressEventBridge({ eventBus: new WebProductEventBus({ journalRoot }), durableRoot: join(root, "deliveries"), adapter });
  await new Promise((resolve) => setTimeout(resolve, 30));
  secondDisconnect();
  assert.equal(sends, 1);
});

test("bridge subscribes before replay so a live race event is delivered once", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-progress-bridge-replay-race-"));
  const journalRoot = join(root, "event-journal");
  const seedBus = new WebProductEventBus({ journalRoot });
  seedBus.publish({ type: "run.updated", scope: { projectId: "project-replay-race" }, payload: { status: "queued" }, occurredAt: "2026-09-30T00:00:00.000Z" });

  let releaseReplay!: () => void;
  let replayStarted!: () => void;
  const replayGate = new Promise<void>((resolve) => { releaseReplay = resolve; });
  const replayReady = new Promise<void>((resolve) => { replayStarted = resolve; });
  class GatedEventBus extends WebProductEventBus {
    override async replayAll() {
      replayStarted();
      await replayGate;
      return super.replayAll();
    }
  }

  const bus = new GatedEventBus({ journalRoot });
  let sends = 0;
  const disconnect = connectProgressEventBridge({
    eventBus: bus,
    durableRoot: join(root, "deliveries"),
    adapter: { send: async () => { sends += 1; return { accepted: true }; } },
  });
  await replayReady;
  bus.publish({ type: "run.updated", scope: { projectId: "project-replay-race" }, payload: { status: "running" }, occurredAt: "2026-09-30T00:00:01.000Z" });
  releaseReplay();

  await waitFor(() => sends === 2);
  disconnect();
  assert.equal(sends, 2);
});
