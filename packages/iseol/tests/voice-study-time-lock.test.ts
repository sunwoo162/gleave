import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { VoiceStudyStore } from "../src/services/voice-time.js";

test("voice study state preserves concurrent starts from independent stores", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-voice-study-lock-"));
  const file = join(dir, "voice-study-time.json");
  const first = new VoiceStudyStore(file);
  const second = new VoiceStudyStore(file);

  await Promise.all([
    first.startSession("guild-a", "user-a", "channel-a"),
    second.startSession("guild-b", "user-b", "channel-b"),
  ]);

  assert.ok(await new VoiceStudyStore(file).getActiveStudySession("guild-a", "user-a"));
  assert.ok(await new VoiceStudyStore(file).getActiveStudySession("guild-b", "user-b"));
  await rm(dir, { recursive: true, force: true });
});

test("voice study state preserves concurrent stops from independent stores", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-voice-study-stop-lock-"));
  const file = join(dir, "voice-study-time.json");
  const first = new VoiceStudyStore(file);
  const second = new VoiceStudyStore(file);
  await first.startSession("guild-a", "user-a", "channel-a");
  await first.startSession("guild-b", "user-b", "channel-b");

  const stopped = await Promise.all([
    first.stopSession("guild-a", "user-a"),
    second.stopSession("guild-b", "user-b"),
  ]);

  assert.ok(stopped[0]);
  assert.ok(stopped[1]);
  const result = new VoiceStudyStore(file);
  assert.equal(await result.getActiveStudySession("guild-a", "user-a"), null);
  assert.equal(await result.getActiveStudySession("guild-b", "user-b"), null);
  await rm(dir, { recursive: true, force: true });
});
