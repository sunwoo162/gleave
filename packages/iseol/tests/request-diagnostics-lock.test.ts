import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createRequestDiagnosticStore,
  createResponseReadDiagnosticStore,
  readRequestDiagnosticEvents,
} from "../src/chatgpt-web/request-diagnostics.js";
import { withDurableFileStateLock } from "../src/services/file-state-lock.js";

async function holdLock(file: string): Promise<() => void> {
  let release!: () => void;
  const started = new Promise<void>((resolveStarted) => {
    void withDurableFileStateLock(file, async () => {
      resolveStarted();
      await new Promise<void>((resolveRelease) => { release = resolveRelease; });
    }, { waitForMs: 2_000 });
  });
  await started;
  return release;
}

test("request diagnostic append waits for the durable file lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-request-diagnostics-lock-"));
  const file = join(root, "web-workers", "request-diagnostics.jsonl");
  const release = await holdLock(file);
  let settled = false;
  const record = createRequestDiagnosticStore(root).record({
    requestId: "request-1",
    stage: "request-reserved",
    at: "2026-01-01T00:00:00.000Z",
    ok: true,
    elapsedMs: 1,
  }).then(() => { settled = true; });

  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  assert.equal(settled, false);
  release();
  await record;
  assert.match(await readFile(file, "utf8"), /request-1/);
  await rm(root, { recursive: true, force: true });
});

test("response-read diagnostic append waits for the durable file lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-response-diagnostics-lock-"));
  const file = join(root, "web-workers", "response-read-diagnostics.jsonl");
  const release = await holdLock(file);
  let settled = false;
  const record = createResponseReadDiagnosticStore(root).record({
    requestId: "request-2",
    stage: "pending-submission",
    phase: "start",
    at: "2026-01-01T00:00:00.000Z",
    ok: true,
    elapsedMs: 1,
  }).then(() => { settled = true; });

  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  assert.equal(settled, false);
  release();
  await record;
  assert.match(await readFile(file, "utf8"), /request-2/);
  await rm(root, { recursive: true, force: true });
});

test("request diagnostic reads wait for the same durable file lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-request-diagnostics-read-lock-"));
  const file = join(root, "web-workers", "request-diagnostics.jsonl");
  const store = createRequestDiagnosticStore(root);
  await store.record({
    requestId: "request-3",
    stage: "request-reserved",
    at: "2026-01-01T00:00:00.000Z",
    ok: true,
    elapsedMs: 1,
  });
  const release = await holdLock(file);
  let settled = false;
  const reading = readRequestDiagnosticEvents(root).then((events) => {
    settled = true;
    return events;
  });

  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  assert.equal(settled, false);
  release();
  assert.equal((await reading)[0]?.requestId, "request-3");
  await rm(root, { recursive: true, force: true });
});
