import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPlaywrightBrowserBackend } from "../src/chatgpt-web/playwright-browser-backend.js";
import { withDurableFileStateLock } from "../src/services/file-state-lock.js";

const config = {
  enabled: true as const,
  profileRoot: "C:\\temp\\chatgpt-profile",
  headless: true,
};

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

test("browser lifecycle journal waits for the durable file lock before read-trim-write", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-browser-lifecycle-lock-"));
  const file = join(root, "web-workers", "lifecycle.jsonl");
  const release = await holdLock(file);
  const page = {
    isClosed: () => false,
    async close() {},
  };
  const context = {
    async newPage() { return page; },
    async close() {},
  };
  const backend = await createPlaywrightBrowserBackend({ ...config, lifecycleRoot: root }, {
    launchPersistentContext: async () => context as any,
  });

  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  await assert.rejects(() => readFile(file, "utf8"), (error: NodeJS.ErrnoException) => error.code === "ENOENT");

  release();
  await backend.dispose();
  const events = (await readFile(file, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { type: string });
  assert.ok(events.some((event) => event.type === "context-created"));
  await rm(root, { recursive: true, force: true });
});
