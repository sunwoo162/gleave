import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendDiagnosticLine } from "../src/chatgpt-web/request-diagnostics.js";
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

async function assertDiagnosticAppendWaits(file: string, eventId: string): Promise<void> {
  const release = await holdLock(file);
  let settled = false;
  const append = appendDiagnosticLine(file, { version: 1, eventId }).then(() => { settled = true; });
  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  assert.equal(settled, false);
  release();
  await append;
  assert.match(await readFile(file, "utf8"), new RegExp(eventId));
}

test("browser parser diagnostics append waits for the durable file lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-browser-parser-diagnostics-lock-"));
  try {
    await assertDiagnosticAppendWaits(join(root, "parser-diagnostics.jsonl"), "parser-1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("browser operation diagnostics append waits for the durable file lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-browser-operation-diagnostics-lock-"));
  try {
    await assertDiagnosticAppendWaits(join(root, "operation-diagnostics.jsonl"), "operation-1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
