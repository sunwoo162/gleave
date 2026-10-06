import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CalendarStateStore } from "../src/services/calendar/calendar-state.js";
import { withDurableFileStateLock } from "../src/services/file-state-lock.js";

test("calendar state preserves concurrent upserts across independent store instances", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-calendar-lock-"));
  const file = join(dir, "state.json");
  const first = new CalendarStateStore(file);
  const second = new CalendarStateStore(file);
  await Promise.all([
    first.upsert({ externalKey: "project:a:issue:1", projectId: "project", calendarId: "calendar", eventId: "event-1", source: "issue" }),
    second.upsert({ externalKey: "project:a:issue:2", projectId: "project", calendarId: "calendar", eventId: "event-2", source: "issue" }),
  ]);

  const result = new CalendarStateStore(file);
  assert.equal((await result.find("project:a:issue:1"))?.eventId, "event-1");
  assert.equal((await result.find("project:a:issue:2"))?.eventId, "event-2");

  let release!: () => void;
  const holderStarted = new Promise<void>((resolveStarted) => {
    void withDurableFileStateLock(file, async () => {
      resolveStarted();
      await new Promise<void>((resolveRelease) => { release = resolveRelease; });
    }, { waitForMs: 2_000 });
  });
  await holderStarted;
  let settled = false;
  const reading = result.find("project:a:issue:1").then((value) => {
    settled = true;
    return value;
  });
  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  assert.equal(settled, false);
  release();
  assert.equal((await reading)?.eventId, "event-1");
  await rm(dir, { recursive: true, force: true });
});

test("calendar mapping side effect lock serializes the same external key across store instances", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-calendar-side-effect-lock-"));
  const file = join(dir, "state.json");
  const first = new CalendarStateStore(file);
  const second = new CalendarStateStore(file);
  let release!: () => void;
  const firstStarted = new Promise<void>((resolveStarted) => {
    void first.withMappingLock("project:owner/repo:milestone:3", async () => {
      resolveStarted();
      await new Promise<void>((resolveRelease) => { release = resolveRelease; });
    });
  });
  await firstStarted;

  let secondSettled = false;
  const secondRun = second.withMappingLock("project:owner/repo:milestone:3", async () => {
    secondSettled = true;
  });
  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  assert.equal(secondSettled, false);
  release();
  await secondRun;
  assert.equal(secondSettled, true);
  await rm(dir, { recursive: true, force: true });
});
