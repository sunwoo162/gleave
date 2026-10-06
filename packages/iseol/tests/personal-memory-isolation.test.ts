import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Principal } from "../src/identity/contracts.js";
import { withDurableMemoryLock } from "../src/memory/memory-lock.js";
import { createMemoryService } from "../src/memory/service.js";
import { loadMemory, saveMemory, saveMemoryUnlocked } from "../src/memory/store.js";

const at = "2026-09-25T12:00:00.000Z";

function principal(userId: string): Principal {
  return { userId, sessionId: `${userId}-session`, roles: ["user"] };
}

test("private memories persist and remain scoped to the owner", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-private-memory-"));
  const service = createMemoryService(root, { now: () => at });
  const memory = await service.appendPrivateMemory(principal("user-a"), {
    kind: "learning-note",
    content: "useEffect dependencies need deliberate review",
    source: "learning-session-1",
  });

  const restarted = createMemoryService(root, { now: () => at });
  assert.deepEqual(await restarted.listPrivateMemories(principal("user-a"), {}), [memory]);
  assert.deepEqual(await restarted.listPrivateMemories(principal("user-b"), {}), []);
  assert.match(await readFile(join(root, "users", "user-a", "memories", `${memory.id}.json`), "utf8"), /useEffect/);
});

test("memory deletion is owner-bound and unknown records are not exposed", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-private-memory-delete-"));
  const service = createMemoryService(root, { now: () => at });
  const memory = await service.appendPrivateMemory(principal("user-a"), { kind: "note", content: "private" });
  assert.equal(await service.deletePrivateMemory(principal("user-b"), memory.id), false);
  assert.equal((await service.listPrivateMemories(principal("user-a"), {})).length, 1);
  assert.equal(await service.deletePrivateMemory(principal("user-a"), memory.id), true);
  assert.deepEqual(await service.listPrivateMemories(principal("user-a"), {}), []);
});

test("memory edits remain owner-bound and survive a service restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-private-memory-update-"));
  const service = createMemoryService(root, { now: () => at });
  const memory = await service.appendPrivateMemory(principal("user-a"), { kind: "note", content: "old content", source: "old-source" });

  assert.equal(await service.updatePrivateMemory(principal("user-b"), memory.id, { content: "foreign edit" }), null);
  const updated = await service.updatePrivateMemory(principal("user-a"), memory.id, { kind: "learning-note", content: "new content", source: null });
  assert.equal(updated?.kind, "learning-note");
  assert.equal(updated?.content, "new content");
  assert.equal(updated?.source, undefined);
  assert.equal(updated?.userId, "user-a");
  assert.deepEqual((await createMemoryService(root, { now: () => at }).listPrivateMemories(principal("user-a"), {}))[0], updated);
});

test("memory mutations across service instances preserve both patches", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-private-memory-concurrent-"));
  const firstService = createMemoryService(root, { now: () => "2026-09-25T12:00:00.000Z" });
  const secondService = createMemoryService(root, { now: () => "2026-09-25T12:00:01.000Z" });
  const owner = principal("user-concurrent");
  const memory = await firstService.appendPrivateMemory(owner, { kind: "note", content: "original", source: "source" });

  await Promise.all([
    firstService.updatePrivateMemory(owner, memory.id, { kind: "learning-note" }),
    secondService.updatePrivateMemory(owner, memory.id, { source: "updated-source" }),
  ]);

  const persisted = await createMemoryService(root).listPrivateMemories(owner, {});
  assert.equal(persisted[0]?.kind, "learning-note");
  assert.equal(persisted[0]?.source, "updated-source");
});

test("private memory lists wait for the durable memory lock and reload current content", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-private-memory-read-lock-"));
  const service = createMemoryService(root, { now: () => at });
  const owner = principal("memory-read-lock-owner");
  const memory = await service.appendPrivateMemory(owner, { kind: "note", content: "before read lock" });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableMemoryLock(root, owner.userId, memory.id, async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  let settled = false;
  const listing = service.listPrivateMemories(owner, {}).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await saveMemoryUnlocked(root, { ...memory, content: "after read lock", updatedAt: at });
  release();
  assert.equal((await listing)[0]?.content, "after read lock");
  await holder;

  let releaseWrite!: () => void;
  const writeHolderAcquired = new Promise<void>((resolve) => {
    void withDurableMemoryLock(root, owner.userId, memory.id, async () => {
      resolve();
      await new Promise<void>((release) => { releaseWrite = release; });
    }, { waitForMs: 0 });
  });
  await writeHolderAcquired;
  let writeSettled = false;
  const writing = saveMemory(root, { ...memory, content: "after public write lock", updatedAt: at }).then(() => { writeSettled = true; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(writeSettled, false);
  releaseWrite();
  await writing;

  let releaseRead!: () => void;
  const readHolderAcquired = new Promise<void>((resolve) => {
    void withDurableMemoryLock(root, owner.userId, memory.id, async () => {
      resolve();
      await new Promise<void>((release) => { releaseRead = release; });
    }, { waitForMs: 0 });
  });
  await readHolderAcquired;
  let directReadSettled = false;
  const directRead = loadMemory(root, owner.userId, memory.id).then((value) => { directReadSettled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(directReadSettled, false);
  releaseRead();
  assert.equal((await directRead)?.content, "after public write lock");
});
